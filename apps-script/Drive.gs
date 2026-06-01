/**
 * Salva anexos em pasta privada por protocolo. Os arquivos NÃO são
 * compartilhados publicamente — apenas o dono do script (conta institucional)
 * tem acesso.
 */

function pastaDoProtocolo(protocolo) {
  var raiz = DriveApp.getFolderById(cfg('DRIVE_FOLDER_ID'));
  var nome = sanitizarNomeArquivo(protocolo);
  var it = raiz.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  var pasta = raiz.createFolder(nome);
  // Garantia explícita de não-compartilhamento.
  try {
    pasta.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) { /* algumas contas não permitem; o default já é privado */ }
  return pasta;
}

/**
 * Recebe um anexo { tipo, nome, mime, base64 } e grava no Drive.
 * `tipo` ∈ { 'foto_documento', 'planilha_complementar' }.
 * Retorna metadados para a aba `anexos`.
 */
function salvarAnexo(pasta, anexo) {
  if (!anexo || !anexo.base64) throw new Error('anexo vazio');
  if (TIPOS_ANEXO_PERMITIDOS.indexOf(anexo.tipo) < 0) {
    throw new Error('tipo de anexo inválido: ' + anexo.tipo);
  }
  if (LIMITS.ALLOWED_MIME.indexOf(anexo.mime) < 0) {
    throw new Error('MIME não permitido: ' + anexo.mime);
  }
  var bytes = Utilities.base64Decode(anexo.base64);
  if (bytes.length > LIMITS.MAX_FILE_BYTES) {
    throw new Error('anexo excede ' + LIMITS.MAX_FILE_BYTES + ' bytes');
  }
  // Convertendo signed bytes -> unsigned para checagem de magic bytes.
  var headBytes = bytes.slice(0, 8).map(function (b) { return b < 0 ? b + 256 : b; });
  if (!checarMagicBytes(headBytes, anexo.mime)) {
    throw new Error('conteúdo do anexo não corresponde ao tipo declarado');
  }
  var nome = sanitizarNomeArquivo(
    (anexo.tipo || 'doc') + '-' + (anexo.nome || 'arquivo')
  );
  var blob = Utilities.newBlob(bytes, anexo.mime, nome);
  var arquivo = pasta.createFile(blob);
  try {
    arquivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) { /* default já é privado */ }
  return {
    tipo: anexo.tipo || '',
    nome_arquivo: nome,
    drive_file_id: arquivo.getId(),
    tamanho_bytes: bytes.length,
    criado_em: new Date()
  };
}
