'use strict';
/**
 * Harness de testes: carrega os .gs num contexto Node (vm) com mocks dos
 * serviços do Google Apps Script. Os .gs são ES5 puro, então rodam sem
 * transformação. Cada criarAmbiente() devolve um mundo isolado (planilha,
 * Drive, cache e propriedades em memória).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ARQUIVOS_GS = ['Config.gs', 'Dominio.gs', 'Validacao.gs', 'Sheets.gs', 'Drive.gs', 'Setup.gs', 'Code.gs'];
const CODIGO = ARQUIVOS_GS
  .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))
  .join('\n;\n');

const HOST_PADRAO = 'balanco-social-idrparana.github.io';
const ORIGIN_PADRAO = 'https://' + HOST_PADRAO;

function bytesAssinados(buffer) {
  return Array.from(buffer, (b) => (b > 127 ? b - 256 : b));
}

// ─── Planilha em memória ─────────────────────────────────────────────────────

class AbaMock {
  constructor(nome) {
    this.nome = nome;
    this.linhas = [];
    this.formatosTexto = new Set(); // colunas (1-based) com formato '@'
  }
  appendRow(row) { this.linhas.push(row.slice()); return this; }
  getLastRow() { return this.linhas.length; }
  getMaxRows() { return Math.max(this.linhas.length, 100); }
  maxCols() { return this.linhas.reduce((m, r) => Math.max(m, r.length), 1); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.linhas.length, 1), this.maxCols()); }
  getRange(row, col, numRows, numCols) {
    if (numRows === undefined) numRows = 1;
    if (numCols === undefined) numCols = 1;
    const aba = this;
    return {
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          const r = row - 1 + i;
          while (aba.linhas.length <= r) aba.linhas.push([]);
          for (let j = 0; j < numCols; j++) aba.linhas[r][col - 1 + j] = vals[i][j];
        }
        return this;
      },
      getValues() {
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const fonte = aba.linhas[row - 1 + i] || [];
          const linha = [];
          for (let j = 0; j < numCols; j++) {
            const v = fonte[col - 1 + j];
            linha.push(v === undefined ? '' : v);
          }
          out.push(linha);
        }
        return out;
      },
      setNumberFormat(fmt) {
        if (fmt === '@') for (let j = 0; j < numCols; j++) aba.formatosTexto.add(col + j);
        return this;
      },
    };
  }
  deleteRow(pos) { this.linhas.splice(pos - 1, 1); }
  deleteRows(pos, num) { this.linhas.splice(pos - 1, num); }
  setFrozenRows() { return this; }
  clear() { this.linhas = []; return this; }
}

class PlanilhaMock {
  constructor(id) { this.id = id; this.abas = {}; }
  getSheetByName(nome) { return this.abas[nome] || null; }
  insertSheet(nome) { this.abas[nome] = new AbaMock(nome); return this.abas[nome]; }
  getId() { return this.id; }
  getUrl() { return 'mock://planilha/' + this.id; }
}

// ─── Drive em memória ────────────────────────────────────────────────────────

function criarDrive() {
  let seq = 1;
  const drive = { files: {}, folders: {} };

  class ArquivoMock {
    constructor(nome, dados, mime) {
      this.id = 'file-' + seq++;
      this.nome = nome;
      this.dados = dados;
      this.mime = mime;
      this.trashed = false;
      this.criadoEm = new Date();
      drive.files[this.id] = this;
    }
    getId() { return this.id; }
    getName() { return this.nome; }
    setTrashed(v) { this.trashed = v; return this; }
    setSharing() { return this; }
    getDateCreated() { return this.criadoEm; }
    makeCopy(nome, pasta) {
      const copia = new ArquivoMock(nome, this.dados, this.mime);
      pasta.arquivos.push(copia);
      return copia;
    }
  }

  class PastaMock {
    constructor(nome) {
      this.id = 'folder-' + seq++;
      this.nome = nome;
      this.arquivos = [];
      this.pastas = [];
      drive.folders[this.id] = this;
    }
    getId() { return this.id; }
    getFoldersByName(nome) {
      const achadas = this.pastas.filter((p) => p.nome === nome);
      let i = 0;
      return { hasNext: () => i < achadas.length, next: () => achadas[i++] };
    }
    createFolder(nome) { const p = new PastaMock(nome); this.pastas.push(p); return p; }
    createFile(blob) {
      const f = new ArquivoMock(blob.nome, blob.bytes, blob.mime);
      this.arquivos.push(f);
      return f;
    }
    getFiles() {
      const arr = this.arquivos.slice();
      let i = 0;
      return { hasNext: () => i < arr.length, next: () => arr[i++] };
    }
    setSharing() { return this; }
  }

  drive.ArquivoMock = ArquivoMock;
  drive.PastaMock = PastaMock;
  return drive;
}

// ─── Ambiente completo ───────────────────────────────────────────────────────

function criarAmbiente(opcoes) {
  opcoes = opcoes || {};

  const drive = criarDrive();
  const pastaAnexos = new drive.PastaMock('Anexos');
  const pastaBackup = new drive.PastaMock('Backups');
  const planilha = new PlanilhaMock('sheet1');
  // A planilha também existe como "arquivo" no Drive (backupSemanal a copia).
  const arquivoPlanilha = new drive.ArquivoMock('Banco', null, 'application/vnd.google-apps.spreadsheet');
  drive.files['sheet1'] = arquivoPlanilha;
  arquivoPlanilha.id = 'sheet1';

  const props = Object.assign({
    SHEET_ID: 'sheet1',
    DRIVE_FOLDER_ID: pastaAnexos.getId(),
    BACKUP_FOLDER_ID: pastaBackup.getId(),
    RECAPTCHA_SECRET: 'segredo-teste',
    ALLOWED_ORIGIN: ORIGIN_PADRAO,
    IP_HASH_SALT: 'sal-teste',
  }, opcoes.props || {});

  const cacheDados = new Map();
  const cache = {
    get: (k) => {
      const e = cacheDados.get(k);
      if (!e) return null;
      if (e.expiraEm && e.expiraEm < Date.now()) { cacheDados.delete(k); return null; }
      return e.valor;
    },
    put: (k, v, ttlSeg) => {
      cacheDados.set(k, { valor: String(v), expiraEm: ttlSeg ? Date.now() + ttlSeg * 1000 : 0 });
    },
    remove: (k) => cacheDados.delete(k),
  };

  const sandbox = {
    console,
    Logger: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperties: (obj) => Object.assign(props, obj),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props),
      }),
    },
    CacheService: { getScriptCache: () => cache },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        if (id !== planilha.getId()) throw new Error('planilha não existe: ' + id);
        return planilha;
      },
      create: () => planilha,
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' },
      Permission: { NONE: 'NONE' },
      getFolderById: (id) => {
        if (!drive.folders[id]) throw new Error('pasta não existe: ' + id);
        return drive.folders[id];
      },
      getFileById: (id) => {
        if (!drive.files[id]) throw new Error('arquivo não existe: ' + id);
        return drive.files[id];
      },
      createFolder: (nome) => new drive.PastaMock(nome),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_alg, s) => bytesAssinados(crypto.createHash('sha256').update(String(s)).digest()),
      base64Decode: (b64) => bytesAssinados(Buffer.from(String(b64), 'base64')),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
      newBlob: (bytes, mime, nome) => ({ bytes, mime, nome }),
      getUuid: () => crypto.randomUUID(),
      formatDate: (data, _tz, formato) => {
        const p = (n, l) => String(n).padStart(l || 2, '0');
        return formato
          .replace('yyyy', String(data.getFullYear()))
          .replace('MM', p(data.getMonth() + 1))
          .replace('dd', p(data.getDate()))
          .replace('HH', p(data.getHours()))
          .replace('mm', p(data.getMinutes()))
          .replace('ss', p(data.getSeconds()));
      },
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({
        _conteudo: s,
        setMimeType() { return this; },
        getContent() { return this._conteudo; },
      }),
    },
    UrlFetchApp: {
      fetch: (url, params) => {
        if (sandbox.__fetchMock) return sandbox.__fetchMock(url, params);
        // Convenção dos testes: o token enviado É a action que o "cliente"
        // executou; o mock a devolve como action verificada pelo Google.
        const token = params && params.payload && params.payload.response;
        const corpo = {
          success: Boolean(token),
          score: 0.9,
          action: token,
          hostname: HOST_PADRAO,
        };
        return { getContentText: () => JSON.stringify(corpo) };
      },
    },
    __fetchMock: null,
  };

  vm.createContext(sandbox);
  vm.runInContext(CODIGO, sandbox, { filename: 'apps-script-concat.gs' });

  return {
    ctx: sandbox,
    planilha,
    drive,
    pastaAnexos,
    pastaBackup,
    props,
    cache,
    cacheDados,
    /** Limpa contadores de rate-limit (mantém o resto do cache). */
    zerarRateLimits() {
      for (const k of Array.from(cacheDados.keys())) {
        if (k.indexOf('rl:') === 0) cacheDados.delete(k);
      }
    },
    aba(nome) { return planilha.abas[nome] || null; },
    post(corpo, parameter) {
      const saida = sandbox.doPost({
        postData: { contents: JSON.stringify(corpo) },
        parameter: parameter || {},
      });
      return JSON.parse(saida.getContent());
    },
    get() {
      return JSON.parse(sandbox.doGet({}).getContent());
    },
  };
}

// ─── Fábricas de payload ─────────────────────────────────────────────────────

function gradeDe(definicao) {
  const itens = [];
  for (const aspecto of Object.keys(definicao)) {
    for (const coef of definicao[aspecto]) {
      itens.push({ aspecto, coeficiente: coef, valor: '0' });
    }
  }
  return itens;
}

function payloadValido(env, extras) {
  const base = {
    acao: 'enviar',
    origin: ORIGIN_PADRAO,
    recaptcha_token: 'relatorio_bs',
    email: 'servidor@idr.pr.gov.br',
    responsavel: 'Fulano de Tal',
    titulo: 'Tecnologia X',
    diretoria_departamento: 'DEX/DAT',
    programa_projeto: 'Programa Y',
    coordenacao_equipe: 'Coordenador Z e equipe',
    resumo: 'Resumo da ação.',
    abrangencia_geografica: 'Paraná',
    impactos_gerais: 'Impactos gerais.',
    econ_produtividade: 'Texto.',
    econ_reducao_custos: 'Texto.',
    econ_expansao_area: 'Texto.',
    econ_agregacao_valor: 'Texto.',
    econ_memoria_calculo: 'Texto.',
    econ_fontes: 'Texto.',
    social_emprego_desc: 'Texto.',
    social_renda_desc: 'Texto.',
    social_bemestar_desc: 'Texto.',
    social_gestao_desc: 'Texto.',
    social_conclusao: 'Texto.',
    amb_eficiencia_desc: 'Texto.',
    amb_conservacao_desc: 'Texto.',
    amb_recuperacao_desc: 'Texto.',
    amb_bemestar_animal_desc: 'Texto.',
    amb_qualidade_produto_desc: 'Texto.',
    amb_conclusao: 'Texto.',
    eixos: ['Competitividade e renda'],
    ods: ['1. Erradicação da pobreza'],
    grade_social: gradeDe(env.ctx.GRADE_SOCIAL_DEF),
    grade_ambiental: gradeDe(env.ctx.GRADE_AMBIENTAL_DEF),
    parcerias: [],
    econ_detalhe: {},
    anexos: [],
  };
  return Object.assign(base, extras || {});
}

function anexoPdf(nome) {
  return {
    tipo: 'foto_documento',
    nome: nome || 'doc.pdf',
    mime: 'application/pdf',
    base64: Buffer.from('%PDF-1.4 conteudo de teste valido').toString('base64'),
  };
}

function anexoPng(nome) {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
  return {
    tipo: 'foto_documento',
    nome: nome || 'foto.png',
    mime: 'image/png',
    base64: png.toString('base64'),
  };
}

module.exports = { criarAmbiente, payloadValido, gradeDe, anexoPdf, anexoPng, ORIGIN_PADRAO, HOST_PADRAO };
