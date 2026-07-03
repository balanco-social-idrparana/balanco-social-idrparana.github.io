/**
 * Validações server-side. Nunca confiar no cliente.
 *
 * Domínio Balanço Social: não há CNPJ/CPF/CEP/UF. As validações de identidade
 * fiscal/endereço da referência (gestaodeater) foram removidas.
 */

function validarEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) && email.length <= 254;
}

/** Formato do protocolo: BS2025-yyyyMMdd-HHmmss-<rand4>. */
function validarProtocolo(p) {
  return typeof p === 'string' && /^BS2025-\d{8}-\d{6}-\d{4}$/.test(p);
}

/**
 * Valor de impacto da metodologia Ambitec-Agro.
 * Aceita apenas a escala fechada: -3 | -1 | 0 | +1 | +3 | Não se aplica.
 * Espelha VALORES_IMPACTO em form/src/data/grades.ts.
 */
function validarValorImpacto(v) {
  return ['-3', '-1', '0', '1', '3', 'NA'].indexOf(String(v)) >= 0;
}

/**
 * Magic bytes — valida que o conteúdo do anexo bate com o MIME alegado.
 * Recebe os primeiros bytes já decodificados (unsigned: 0..255).
 *
 * .xlsx é um contêiner ZIP (assinatura "PK\x03\x04"); .xls legado usa o
 * formato OLE2 Compound File (assinatura D0 CF 11 E0).
 */
function checarMagicBytes(bytes, mime) {
  if (!bytes || bytes.length < 4) return false;
  if (mime === 'application/pdf') {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  if (mime === 'image/jpeg') {
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mime === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    // .xlsx → ZIP: 50 4B 03 04
    return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (mime === 'application/vnd.ms-excel') {
    // .xls legado → OLE2/CFB: D0 CF 11 E0
    return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
  }
  return false;
}

function sanitizarNomeArquivo(nome) {
  return String(nome || 'arquivo')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .substring(0, 120);
}

function exigirCampos(obj, campos) {
  var faltando = [];
  for (var i = 0; i < campos.length; i++) {
    var v = obj[campos[i]];
    if (v === undefined || v === null || String(v).trim() === '') faltando.push(campos[i]);
  }
  return faltando;
}

/**
 * Verifica reCAPTCHA v3 com a API do Google.
 * Retorna { ok: bool, score: number }. Exige `action` E `hostname` corretos:
 * um token sem eles foi emitido fora do fluxo/site legítimo.
 */
function verificarRecaptcha(token, expectedAction) {
  if (!token) return { ok: false, score: 0 };
  var secret = cfg('RECAPTCHA_SECRET');
  var resp;
  try {
    resp = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      payload: { secret: secret, response: token },
      muteHttpExceptions: true
    });
  } catch (e) {
    // Falha de rede na verificação não pode virar 500 genérico: reprova
    // de forma controlada (o cliente recebe 403 e pode tentar de novo).
    return { ok: false, score: 0 };
  }
  var json;
  try { json = JSON.parse(resp.getContentText()); } catch (e) { return { ok: false, score: 0 }; }
  if (!json.success) return { ok: false, score: 0 };
  if (expectedAction && json.action !== expectedAction) return { ok: false, score: json.score || 0 };
  if (!validarHostnameRecaptcha(json.hostname)) return { ok: false, score: json.score || 0 };
  return { ok: (json.score || 0) >= LIMITS.RECAPTCHA_MIN_SCORE, score: json.score || 0 };
}

/** O host onde o token foi emitido precisa ser o host do site oficial. */
function validarHostnameRecaptcha(hostname) {
  if (!hostname) return false;
  var host = cfg('ALLOWED_ORIGIN').replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  return String(hostname) === host;
}

/**
 * Origem da requisição. Apps Script não dá acesso confiável ao header Origin,
 * então o frontend envia `origin` no PRÓPRIO corpo — um chamador direto pode
 * forjá-lo. Isto é apenas uma fricção leve / dado de log, NÃO um controle de
 * segurança. A defesa real contra chamadores externos é o reCAPTCHA v3
 * (token + action + hostname) combinado aos rate-limits, inclusive globais.
 */
function validarOrigem(origin) {
  var allowed = cfg('ALLOWED_ORIGIN');
  if (!origin || !allowed) return false;
  return origin === allowed;
}

function hashIP(ip) {
  var salt = cfg('IP_HASH_SALT');
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(ip || 'unknown') + ':' + salt
  );
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('').substring(0, 16);
}

/**
 * Rate limit por chave usando CacheService (contador com TTL). O
 * read-increment-write não é atômico — chamar sempre SOB o ScriptLock.
 *
 * Dois modos de consumo:
 *  - checarRateLimit: checa E consome na hora. Para contadores de TENTATIVA
 *    (ex.: anti-enumeração do `carregar`), que devem contar mesmo em falha.
 *  - rateLimitEstourado + incrementarRateLimit: checagem antes, consumo só
 *    após a operação ter SUCESSO — uma falha 500 no meio do envio não pode
 *    travar o reenvio legítimo pelos próximos 5 minutos.
 */
function checarRateLimit(chave, limite, ttlSeg) {
  var cache = CacheService.getScriptCache();
  var atual = parseInt(cache.get(chave) || '0', 10);
  if (atual >= limite) return false;
  cache.put(chave, String(atual + 1), ttlSeg);
  return true;
}

/** true se a chave já atingiu o limite (não consome). */
function rateLimitEstourado(chave, limite) {
  var atual = parseInt(CacheService.getScriptCache().get(chave) || '0', 10);
  return atual >= limite;
}

/** Registra um consumo na chave (chamar após a operação ter sucesso). */
function incrementarRateLimit(chave, ttlSeg) {
  var cache = CacheService.getScriptCache();
  var atual = parseInt(cache.get(chave) || '0', 10);
  cache.put(chave, String(atual + 1), ttlSeg);
}

/**
 * Sufixo de janela horária fixa. O CacheService renova o TTL a cada put, então
 * uma chave "por hora" com TTL 3600 nunca zeraria sob tráfego contínuo (somaria
 * o dia inteiro). Anexar o bucket de hora ao nome faz cada hora usar uma chave
 * nova — janela real, independente do TTL.
 */
function bucketHora() {
  return Math.floor(Date.now() / 3600000);
}
