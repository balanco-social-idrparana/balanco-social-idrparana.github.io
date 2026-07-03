/**
 * Configuração — lê todos os segredos do PropertiesService.
 * NÃO coloque IDs ou chaves neste arquivo: ele é versionado.
 *
 * Definir em: Project Settings → Script Properties
 *   SHEET_ID            ID da planilha (banco)
 *   DRIVE_FOLDER_ID     Pasta-raiz dos anexos
 *   BACKUP_FOLDER_ID    Pasta de backups semanais
 *   RECAPTCHA_SECRET    Chave secreta do reCAPTCHA v3
 *   ALLOWED_ORIGIN      https://balanco-social-idrparana.github.io
 *   IP_HASH_SALT        Sal aleatório p/ hashear IPs no log de auditoria
 *   RECAPTCHA_MIN_SCORE (opcional) sobrescreve o corte do reCAPTCHA sem deploy
 *   RATE_GLOBAL_HOURLY  (opcional) teto global de envios/hora sem deploy
 *   RATE_GLOBAL_LOAD_HOURLY (opcional) teto global de consultas/hora sem deploy
 *   CONFIRMAR_LIMPEZA   (efêmera) guarda exigida por limparDadosDeTeste (Setup.gs)
 */

function cfg(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Configuração ausente: ' + key);
  return v;
}

/** Limite numérico opcional em Script Property, com valor padrão. */
function lerLimiteOpcional_(key, padrao) {
  var v = parseInt(PropertiesService.getScriptProperties().getProperty(key), 10);
  return isNaN(v) || v <= 0 ? padrao : v;
}

// Limites — podem virar Script Properties se precisar ajustar sem deploy.
var LIMITS = {
  MAX_FILE_BYTES: 10 * 1024 * 1024,       // 10 MB por anexo (fotos/planilha)
  // 32 MB decodificados no envio inteiro. O payload viaja como base64 em JSON
  // (~33% maior), então precisa caber no teto prático de ~50 MB por requisição
  // do Apps Script. Espelhado em form/src/lib/api.ts.
  MAX_TOTAL_BYTES: 32 * 1024 * 1024,
  MAX_ANEXOS: 10,                          // nº máximo de arquivos por envio
  MAX_TEXTO_CAMPO: 8000,                  // teto por campo de texto (célula do Sheets rejeita >50.000)
  RATE_PER_EMAIL_SECONDS: 300,            // 1 envio NOVO por e-mail a cada 5 min
  RATE_PER_IP_HOURLY: 20,                 // 20 envios/edições por IP por hora
  RATE_EDIT_PER_EMAIL_HOURLY: 30,         // 30 edições por e-mail por hora (sem trava de 5 min)
  RATE_LOAD_PER_EMAIL_HOURLY: 60,         // 60 carregamentos por e-mail por hora (anti-enumeração)
  RATE_LOAD_PER_IP_HOURLY: 120,           // 120 carregamentos por IP por hora
  // Tetos GLOBAIS por hora — o freio real contra spam: o limite por e-mail é
  // contornável (e-mail não é verificado) e o por IP depende de um IP que o
  // Apps Script não fornece. Dimensionados para o pico legítimo esperado
  // (centenas de servidores no período de coleta). Ajustáveis SEM deploy via
  // Script Properties 'RATE_GLOBAL_HOURLY' / 'RATE_GLOBAL_LOAD_HOURLY'
  // (ex.: subir na semana do prazo final se houver 429 legítimo).
  RATE_GLOBAL_HOURLY: lerLimiteOpcional_('RATE_GLOBAL_HOURLY', 150),
  RATE_GLOBAL_LOAD_HOURLY: lerLimiteOpcional_('RATE_GLOBAL_LOAD_HOURLY', 600),
  // reCAPTCHA v3: corte deliberadamente baixo (0.1) — em rede corporativa
  // (muitos usuários reais atrás de um mesmo IP/proxy) o v3 atribui notas
  // baixas e um corte alto reprovava pessoas REAIS. O score é tratado como
  // sinal fraco; as defesas efetivas são: token válido + action + hostname
  // verificados no servidor e os rate-limits (inclusive globais). Ajustável
  // sem deploy via Script Property 'RECAPTCHA_MIN_SCORE'.
  RECAPTCHA_MIN_SCORE: (function () {
    var v = parseFloat(PropertiesService.getScriptProperties().getProperty('RECAPTCHA_MIN_SCORE'));
    return isNaN(v) ? 0.1 : v;
  })(),
  BACKUP_RETENCAO_SEMANAS: 8,             // backups mais antigos vão para a lixeira
  CACHE_GET_SECONDS: 300,
  ALLOWED_MIME: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel'                                           // .xls
  ]
};
