/**
 * Web App: doPost (receber relatório de impacto), doGet (resumo público mínimo).
 *
 * Deploy: Web App, "Execute as: me", "Who has access: Anyone".
 * Toda a defesa vive aqui — o frontend é público e pode ser falsificado.
 *
 * Domínio: Balanço Social IDR-Paraná 2025 (relatórios Ambitec-Agro).
 * Submissão é APPEND-ONLY: cada envio gera um protocolo e acrescenta uma linha.
 */

// Coeficientes obrigatórios escalares do relatório (espelha contrato-dados.md).
var CAMPOS_OBRIGATORIOS = [
  'email', 'responsavel', 'titulo',
  'diretoria_departamento', 'programa_projeto', 'coordenacao_equipe',
  'resumo', 'abrangencia_geografica', 'impactos_gerais',
  // Econômicos (6)
  'econ_produtividade', 'econ_reducao_custos', 'econ_expansao_area',
  'econ_agregacao_valor', 'econ_memoria_calculo', 'econ_fontes',
  // Sociais (4 descrições + conclusão)
  'social_emprego_desc', 'social_renda_desc', 'social_bemestar_desc',
  'social_gestao_desc', 'social_conclusao',
  // Ambientais (5 descrições + conclusão)
  'amb_eficiencia_desc', 'amb_conservacao_desc', 'amb_recuperacao_desc',
  'amb_bemestar_animal_desc', 'amb_qualidade_produto_desc', 'amb_conclusao'
];

function doPost(e) {
  try {
    var corpo = parseCorpo(e);
    var ipHash = hashIP(corpo._ip || '');

    // 1. Origem
    if (!validarOrigem(corpo.origin)) {
      return resposta(403, { erro: 'origem não permitida' });
    }

    // 2. Honeypot — qualquer valor no campo invisível derruba o envio.
    if (corpo.website_url) {
      registrarLogSeguro(ipHash, corpo.origin, 'honeypot', '', '');
      return resposta(400, { erro: 'requisição inválida' });
    }

    // 3. reCAPTCHA v3 — o score NÃO é devolvido ao cliente (evita calibragem de bot).
    var captcha = verificarRecaptcha(corpo.recaptcha_token, 'relatorio_bs');
    if (!captcha.ok) {
      registrarLogSeguro(ipHash, corpo.origin, 'recaptcha_baixo', '', String(captcha.score));
      return resposta(403, { erro: 'verificação anti-bot falhou' });
    }

    // 4. Campos escalares obrigatórios
    var faltando = exigirCampos(corpo, CAMPOS_OBRIGATORIOS);
    if (faltando.length) return resposta(400, { erro: 'campos obrigatórios faltando', campos: faltando });

    if (!validarEmail(corpo.email)) return resposta(400, { erro: 'e-mail inválido' });

    // 5. Listas obrigatórias: eixos e ODS validados contra conjunto FECHADO.
    if (!validarSubconjunto(corpo.eixos, EIXOS_PERMITIDOS)) {
      return resposta(400, { erro: 'eixos estratégicos inválidos ou ausentes' });
    }
    if (!validarSubconjunto(corpo.ods, ODS_PERMITIDOS)) {
      return resposta(400, { erro: 'ODS inválidos ou ausentes' });
    }

    // 6. Grades de impacto: completas, sem coeficientes desconhecidos/duplicados,
    //    e com valor na escala Ambitec (espelha a validação Zod do frontend).
    var erroGrade = validarGradeContra(corpo.grade_social, GRADE_SOCIAL_DEF, 'grade_social');
    if (erroGrade) return resposta(400, erroGrade);
    erroGrade = validarGradeContra(corpo.grade_ambiental, GRADE_AMBIENTAL_DEF, 'grade_ambiental');
    if (erroGrade) return resposta(400, erroGrade);

    // 7. Seção complementar: parcerias + impactos econômicos detalhados (opcional).
    var erroParc = validarParcerias(corpo.parcerias);
    if (erroParc) return resposta(400, erroParc);
    var erroEcon = validarEconDetalhe(corpo.econ_detalhe);
    if (erroEcon) return resposta(400, erroEcon);

    // Anexos agora são opcionais (a planilha é preenchida no próprio formulário).
    var anexos = Array.isArray(corpo.anexos) ? corpo.anexos : [];

    // 8. Anexos — soma e limite total (cálculo de bytes desconta padding base64).
    var totalBytes = 0;
    for (var j = 0; j < anexos.length; j++) {
      totalBytes += bytesDeBase64((anexos[j] && anexos[j].base64) || '');
    }
    if (totalBytes > LIMITS.MAX_TOTAL_BYTES) {
      return resposta(413, { erro: 'tamanho total dos anexos excede o limite' });
    }

    // 9. Lock para serializar escritas concorrentes E o rate-limit (o
    //    read-increment-write do CacheService não é atômico; sob lock vira-o).
    var lock = LockService.getScriptLock();
    try { lock.waitLock(15000); } catch (e) {
      return resposta(503, { erro: 'sistema ocupado, tente novamente em instantes' });
    }
    try {
      // Rate limit por e-mail (normalizado: Gmail plus/dot) e por IP.
      var chaveEmail = 'rl:email:' + hashIP(normalizarEmail(corpo.email));
      if (!checarRateLimit(chaveEmail, 1, LIMITS.RATE_PER_EMAIL_SECONDS)) {
        return resposta(429, { erro: 'aguarde antes de reenviar com este e-mail' });
      }
      // Só aplica o limite por IP quando há IP real. O Apps Script não expõe o IP
      // do cliente e o frontend não o envia, então hashIP('') seria constante —
      // sem este guard, o limite viraria um teto GLOBAL para toda a rede.
      if (corpo._ip) {
        if (!checarRateLimit('rl:ip:' + ipHash, LIMITS.RATE_PER_IP_HOURLY, 3600)) {
          return resposta(429, { erro: 'limite de envios por hora atingido' });
        }
      }

      var ss = abrirPlanilha();
      var protocolo = gerarProtocolo();

      // 11. Salva anexos antes de gravar na planilha (fail-fast em arquivos suspeitos).
      var pasta = pastaDoProtocolo(protocolo);
      var anexosSalvos = [];
      for (var k = 0; k < anexos.length; k++) {
        anexosSalvos.push(salvarAnexo(pasta, anexos[k]));
      }

      // 12. Calcula índices (grades) e impactos econômicos detalhados.
      var indiceSocial = calcularIndice(corpo.grade_social);
      var indiceAmbiental = calcularIndice(corpo.grade_ambiental);
      var econ = montarEconDetalhe(corpo.econ_detalhe);

      // 13. Registro principal (append-only).
      var registro = {
        protocolo: protocolo,
        email: corpo.email,
        responsavel: corpo.responsavel,
        titulo: corpo.titulo,
        diretoria_departamento: corpo.diretoria_departamento,
        programa_projeto: corpo.programa_projeto,
        coordenacao_equipe: corpo.coordenacao_equipe,
        ano_tecnologia: corpo.ano_tecnologia || '',
        resumo: corpo.resumo,
        abrangencia_geografica: corpo.abrangencia_geografica,
        impactos_gerais: corpo.impactos_gerais,
        econ_produtividade: corpo.econ_produtividade,
        econ_reducao_custos: corpo.econ_reducao_custos,
        econ_expansao_area: corpo.econ_expansao_area,
        econ_agregacao_valor: corpo.econ_agregacao_valor,
        econ_memoria_calculo: corpo.econ_memoria_calculo,
        econ_fontes: corpo.econ_fontes,
        social_emprego_desc: corpo.social_emprego_desc,
        social_renda_desc: corpo.social_renda_desc,
        social_bemestar_desc: corpo.social_bemestar_desc,
        social_gestao_desc: corpo.social_gestao_desc,
        social_conclusao: corpo.social_conclusao,
        amb_eficiencia_desc: corpo.amb_eficiencia_desc,
        amb_conservacao_desc: corpo.amb_conservacao_desc,
        amb_recuperacao_desc: corpo.amb_recuperacao_desc,
        amb_bemestar_animal_desc: corpo.amb_bemestar_animal_desc,
        amb_qualidade_produto_desc: corpo.amb_qualidade_produto_desc,
        amb_conclusao: corpo.amb_conclusao,
        publicacoes: corpo.publicacoes || '',
        beneficio_economico_total: econ.total,
        indice_social: indiceSocial,
        indice_ambiental: indiceAmbiental
        // criado_em e status são definidos por appendRelatorio.
      };
      appendRelatorio(ss, registro);

      // 14. Abas filhas (replace-all por protocolo).
      replaceFilhas(ss, 'eixos', protocolo, mapearEixos(corpo.eixos));
      replaceFilhas(ss, 'ods', protocolo, mapearOds(corpo.ods));
      replaceFilhas(ss, 'grade_social', protocolo, corpo.grade_social);
      replaceFilhas(ss, 'grade_ambiental', protocolo, corpo.grade_ambiental);
      replaceFilhas(ss, 'parcerias', protocolo, Array.isArray(corpo.parcerias) ? corpo.parcerias : []);
      replaceFilhas(ss, 'econ_detalhe', protocolo, econ.linhas);
      replaceFilhas(ss, 'anexos', protocolo, anexosSalvos);

      registrarLogSeguro(ipHash, corpo.origin, 'relatorio_ok', protocolo, mascararEmail(corpo.email));

      // Invalida cache do GET para refletir o novo total rapidamente.
      try { CacheService.getScriptCache().remove('publico:resumo'); } catch (e) {}

      return resposta(200, {
        ok: true,
        protocolo: protocolo,
        mensagem: 'Relatório recebido. Está em análise pela equipe.'
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Não vazar mensagens internas para o cliente.
    try { console.error(err && err.stack || err); } catch (e) {}
    return resposta(500, { erro: 'falha interna ao processar o relatório' });
  }
}

function doGet(e) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('publico:resumo');
    if (cached) return resposta(200, JSON.parse(cached));

    var dados = lerResumoPublico();
    cache.put('publico:resumo', JSON.stringify(dados), LIMITS.CACHE_GET_SECONDS);
    return resposta(200, dados);
  } catch (err) {
    try { console.error(err && err.stack || err); } catch (e) {}
    return resposta(500, { erro: 'falha ao consultar dados' });
  }
}

/**
 * Snapshot semanal — instalar como trigger time-based (Edit → Current project's triggers).
 */
function backupSemanal() {
  var origem = DriveApp.getFileById(cfg('SHEET_ID'));
  var destino = DriveApp.getFolderById(cfg('BACKUP_FOLDER_ID'));
  var nome = 'backup-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss');
  var copia = origem.makeCopy(nome, destino);
  // A cópia contém e-mails crus (coluna `email`). Garante não-compartilhamento (LGPD).
  try { copia.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
}

// ─── helpers ────────────────────────────────────────────────────────────────

function parseCorpo(e) {
  var corpo = {};
  if (e && e.postData && e.postData.contents) {
    try { corpo = JSON.parse(e.postData.contents); } catch (err) { corpo = {}; }
  }
  // Apps Script não expõe IP real de forma confiável; tenta cabeçalhos comuns.
  if (e && e.parameter) {
    corpo._ip = e.parameter.__ip || e.parameter.ip || '';
  }
  return corpo;
}

function resposta(status, payload) {
  // ContentService só permite JSON/Text. Status real é 200; o status semântico
  // vai no corpo para o cliente tratar.
  var body = Object.assign({}, payload, { _status: status });
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarLogSeguro(ipHash, origin, acao, ref, detalhe) {
  try {
    var ss = abrirPlanilha();
    registrarLog(ss, {
      ip_hash: ipHash,
      origin: origin || '',
      acao: acao,
      ref: ref || '',
      detalhe: detalhe || ''
    });
  } catch (e) { /* log nunca derruba o fluxo principal */ }
}

/** Protocolo: BS2025-yyyyMMdd-HHmmss-<rand4> */
function gerarProtocolo() {
  var ts = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss');
  var rand = Math.floor(1000 + Math.random() * 9000); // 4 dígitos
  return 'BS2025-' + ts + '-' + rand;
}

/** Mascara o e-mail para o log de auditoria (não logar e-mail cru). */
function mascararEmail(email) {
  var s = String(email || '');
  var at = s.indexOf('@');
  if (at <= 0) return '***';
  var usuario = s.substring(0, at);
  var dominio = s.substring(at + 1);
  var iniciais = usuario.substring(0, Math.min(2, usuario.length));
  return iniciais + '***@' + dominio;
}

/** Bytes reais a partir do comprimento de uma string base64 (desconta padding). */
function bytesDeBase64(b) {
  if (!b) return 0;
  var pad = 0;
  if (b.charAt(b.length - 1) === '=') pad++;
  if (b.charAt(b.length - 2) === '=') pad++;
  return Math.floor(b.length * 3 / 4) - pad;
}

/** Converte ['Eixo A', 'Eixo B'] em [{ eixo:'Eixo A' }, ...] para as abas filhas. */
function mapearEixos(eixos) {
  return (eixos || []).map(function (v) { return { eixo: String(v) }; });
}

/** Converte ['1. ...', '2. ...'] em [{ ods:'1. ...' }, ...] para as abas filhas. */
function mapearOds(ods) {
  return (ods || []).map(function (v) { return { ods: String(v) }; });
}
