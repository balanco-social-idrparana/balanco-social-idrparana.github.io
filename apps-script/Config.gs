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
 *   ADMIN_NOTIFY_EMAIL  (opcional) E-mail institucional p/ alertas
 */

function cfg(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Configuração ausente: ' + key);
  return v;
}

function cfgOpt(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || null;
}

// Limites — podem virar Script Properties se precisar ajustar sem deploy.
var LIMITS = {
  MAX_FILE_BYTES: 10 * 1024 * 1024,       // 10 MB por anexo (fotos/planilha)
  MAX_TOTAL_BYTES: 50 * 1024 * 1024,      // 50 MB no envio inteiro
  RATE_PER_EMAIL_SECONDS: 300,            // 1 envio NOVO por e-mail a cada 5 min
  RATE_PER_IP_HOURLY: 20,                 // 20 envios/edições por IP por hora
  RATE_EDIT_PER_EMAIL_HOURLY: 30,         // 30 edições por e-mail por hora (sem trava de 5 min)
  RATE_LOAD_PER_EMAIL_HOURLY: 60,         // 60 carregamentos por e-mail por hora (anti-enumeração)
  RATE_LOAD_PER_IP_HOURLY: 120,           // 120 carregamentos por IP por hora
  // reCAPTCHA v3: nota mínima [0..1]. Em rede corporativa (vários usuários atrás
  // de UM mesmo IP/proxy) o v3 atribui notas baixas e reprova pessoas REAIS — por
  // isso o corte é baixo aqui. As defesas reais continuam: token válido + action
  // + origin + honeypot + rate-limit. Ajustável sem deploy via Script Property
  // 'RECAPTCHA_MIN_SCORE' (ex.: subir para 0.5 se virar formulário público).
  RECAPTCHA_MIN_SCORE: (function () {
    var v = parseFloat(PropertiesService.getScriptProperties().getProperty('RECAPTCHA_MIN_SCORE'));
    return isNaN(v) ? 0.1 : v;
  })(),
  CACHE_GET_SECONDS: 300,
  ALLOWED_MIME: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel'                                           // .xls
  ]
};
