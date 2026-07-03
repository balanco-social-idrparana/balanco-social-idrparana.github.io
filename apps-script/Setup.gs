/**
 * Setup.gs — execute UMA VEZ (menu Executar > configurarRecursos) para criar a
 * planilha-banco, as pastas no Drive e definir as Script Properties.
 * Idempotente: não recria recursos já configurados e PRESERVA RECAPTCHA_SECRET.
 * Reexecutar após mudanças de schema atualiza os cabeçalhos das abas (sem dados
 * existentes a coluna é só reescrita) e cria as abas novas.
 */
function configurarRecursos() {
  var props = PropertiesService.getScriptProperties();
  var atual = props.getProperties();

  var sheetId = atual.SHEET_ID;
  if (!sheetId) {
    var nova = SpreadsheetApp.create('Balanço Social IDR-Paraná 2025 — Banco');
    sheetId = nova.getId();
  }

  var pastaAnexos = atual.DRIVE_FOLDER_ID
    ? DriveApp.getFolderById(atual.DRIVE_FOLDER_ID)
    : DriveApp.createFolder('Balanço Social BS2025 — Anexos');
  var pastaBackup = atual.BACKUP_FOLDER_ID
    ? DriveApp.getFolderById(atual.BACKUP_FOLDER_ID)
    : DriveApp.createFolder('Balanço Social BS2025 — Backups');
  try { pastaAnexos.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
  try { pastaBackup.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}

  var salt = atual.IP_HASH_SALT || (Utilities.getUuid() + Utilities.getUuid());

  props.setProperties({
    SHEET_ID: sheetId,
    DRIVE_FOLDER_ID: pastaAnexos.getId(),
    BACKUP_FOLDER_ID: pastaBackup.getId(),
    ALLOWED_ORIGIN: 'https://balanco-social-idrparana.github.io',
    IP_HASH_SALT: salt
  }, false);

  // Cria/atualiza o cabeçalho de TODAS as abas conforme o SCHEMA atual.
  var ss = SpreadsheetApp.openById(sheetId);
  ['relatorios', 'eixos', 'ods', 'grade_social', 'grade_ambiental',
   'parcerias', 'econ_detalhe', 'anexos', '_log']
    .forEach(function (n) { garantirCabecalho(ss, n); });

  Logger.log('SHEET_ID = ' + sheetId);
  Logger.log('DRIVE_FOLDER_ID = ' + pastaAnexos.getId());
  Logger.log('BACKUP_FOLDER_ID = ' + pastaBackup.getId());
  Logger.log('Planilha (banco): ' + ss.getUrl());
  Logger.log('OK. Defina RECAPTCHA_SECRET (se ainda não fez) e publique/atualize o app da Web.');
  return 'configurado';
}

/**
 * Utilitário one-off: remove TODAS as linhas de dados (mantém cabeçalhos),
 * inclusive o _log de auditoria. DESTRUTIVO — vive no mesmo projeto do Web App
 * de produção, então exige uma guarda de uso único: defina a Script Property
 * CONFIRMAR_LIMPEZA=SIM-APAGAR-TUDO imediatamente antes de executar. Um backup
 * é gravado antes de apagar.
 */
function limparDadosDeTeste() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CONFIRMAR_LIMPEZA') !== 'SIM-APAGAR-TUDO') {
    throw new Error(
      'Abortado: esta função apaga TODAS as linhas de TODAS as abas (inclusive _log). ' +
      'Para confirmar, defina a Script Property CONFIRMAR_LIMPEZA=SIM-APAGAR-TUDO e execute de novo.'
    );
  }
  // Backup ANTES de consumir a guarda: se o backup falhar (ex.: BACKUP_FOLDER_ID
  // ausente), a guarda permanece e NADA é apagado — o operador corrige e repete.
  backupSemanal();
  props.deleteProperty('CONFIRMAR_LIMPEZA'); // guarda de uso único

  var ss = SpreadsheetApp.openById(cfg("SHEET_ID"));
  var abas = ["relatorios","eixos","ods","grade_social","grade_ambiental","parcerias","econ_detalhe","anexos","_log"];
  abas.forEach(function (n) {
    var a = ss.getSheetByName(n); if (!a) return;
    var last = a.getLastRow(); if (last > 1) a.deleteRows(2, last - 1);
  });
  try { CacheService.getScriptCache().remove("publico:resumo"); } catch (e) {}
  return "limpo";
}
