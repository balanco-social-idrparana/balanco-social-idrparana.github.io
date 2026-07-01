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
    var acao = corpo.acao || 'enviar';

    if (acao !== 'enviar' && acao !== 'editar' && acao !== 'carregar') {
      return resposta(400, { erro: 'ação inválida' });
    }

    // 1. Origem
    if (!validarOrigem(corpo.origin)) {
      return resposta(403, { erro: 'origem não permitida' });
    }

    // 2. Honeypot REMOVIDO (2026-07). O campo oculto (website_url e depois
    //    hp_token) era autopreenchido pelo navegador/gerenciador de senha dos
    //    servidores e derrubava envios LEGÍTIMOS com "requisição inválida". Como
    //    não havia sinal de bots e as demais defesas cobrem o caso, o honeypot
    //    foi desativado. Defesas ativas: reCAPTCHA v3 + origin + rate-limit.

    // 3. reCAPTCHA v3 — ação esperada varia por operação. O score NÃO é
    //    devolvido ao cliente (evita calibragem de bot).
    var acaoCaptcha = acao === 'carregar' ? 'carregar_bs' : 'relatorio_bs';
    var captcha = verificarRecaptcha(corpo.recaptcha_token, acaoCaptcha);
    if (!captcha.ok) {
      registrarLogSeguro(ipHash, corpo.origin, 'recaptcha_baixo', '', String(captcha.score));
      return resposta(403, { erro: 'verificação anti-bot falhou' });
    }

    // 4. Dispatch.
    if (acao === 'carregar') return processarCarregar(corpo, ipHash);
    return processarEnvio(corpo, ipHash, acao);
  } catch (err) {
    // Não vazar mensagens internas para o cliente.
    try { console.error(err && err.stack || err); } catch (e) {}
    return resposta(500, { erro: 'falha interna ao processar o relatório' });
  }
}

/**
 * Carregar relatório por protocolo para edição. Gate de autorização: o e-mail
 * informado precisa bater com o da ÚLTIMA versão do protocolo. A resposta para
 * "protocolo inexistente" e "e-mail divergente" é idêntica (404) para não
 * revelar a existência de um protocolo a quem não é o autor.
 */
function processarCarregar(corpo, ipHash) {
  if (!validarProtocolo(corpo.protocolo)) return resposta(400, { erro: 'protocolo inválido' });
  if (!validarEmail(corpo.email)) return resposta(400, { erro: 'e-mail inválido' });

  // Rate-limit de leitura (anti-enumeração), por e-mail e por IP.
  var chaveEmail = 'rl:load:' + hashIP(normalizarEmail(corpo.email));
  if (!checarRateLimit(chaveEmail, LIMITS.RATE_LOAD_PER_EMAIL_HOURLY, 3600)) {
    return resposta(429, { erro: 'muitas consultas; tente novamente mais tarde' });
  }
  if (corpo._ip && !checarRateLimit('rl:loadip:' + ipHash, LIMITS.RATE_LOAD_PER_IP_HOURLY, 3600)) {
    return resposta(429, { erro: 'limite de consultas por hora atingido' });
  }

  var ss = abrirPlanilha();
  var emailReal = emailDaUltimaVersao(ss, corpo.protocolo);
  if (!emailReal || normalizarEmail(emailReal) !== normalizarEmail(corpo.email)) {
    registrarLogSeguro(ipHash, corpo.origin, 'carregar_negado', corpo.protocolo, mascararEmail(corpo.email));
    return resposta(404, { erro: 'protocolo não encontrado para este e-mail' });
  }

  var completo = lerRelatorioCompleto(ss, corpo.protocolo, null);
  if (!completo) return resposta(404, { erro: 'protocolo não encontrado para este e-mail' });

  registrarLogSeguro(ipHash, corpo.origin, 'carregar_ok', corpo.protocolo, mascararEmail(corpo.email));
  return resposta(200, {
    ok: true,
    protocolo: corpo.protocolo,
    versao: completo.versao,
    dados: completo.dados
  });
}

/**
 * Enviar (novo, v1) ou editar (nova versão) um relatório. A validação é idêntica
 * nos dois casos; só muda a definição de protocolo/versão e o gate de autoria.
 */
function processarEnvio(corpo, ipHash, acao) {
  var editando = acao === 'editar';

  if (editando && !validarProtocolo(corpo.protocolo)) {
    return resposta(400, { erro: 'protocolo inválido' });
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

  // Anexos são opcionais (a planilha é preenchida no próprio formulário).
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
    // Rate limit. No envio novo: 1 por e-mail a cada 5 min (anti-spam). Na
    // edição: limite por hora (permite corrigir o próprio relatório sem esperar
    // 5 min entre salvamentos). Sempre também por IP, quando houver IP real.
    if (editando) {
      var chaveEdit = 'rl:edit:' + hashIP(normalizarEmail(corpo.email));
      if (!checarRateLimit(chaveEdit, LIMITS.RATE_EDIT_PER_EMAIL_HOURLY, 3600)) {
        return resposta(429, { erro: 'muitas edições; tente novamente mais tarde' });
      }
    } else {
      var chaveEmail = 'rl:email:' + hashIP(normalizarEmail(corpo.email));
      if (!checarRateLimit(chaveEmail, 1, LIMITS.RATE_PER_EMAIL_SECONDS)) {
        return resposta(429, { erro: 'aguarde antes de reenviar com este e-mail' });
      }
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

    // Define protocolo e versão. Na edição, exige autoria (e-mail bate com a
    // última versão) e incrementa a versão preservando o histórico.
    var protocolo, versao, versaoAnterior;
    if (editando) {
      versaoAnterior = maxVersao(ss, corpo.protocolo);
      if (versaoAnterior === 0) {
        return resposta(404, { erro: 'protocolo não encontrado' });
      }
      var emailReal = emailDaUltimaVersao(ss, corpo.protocolo);
      if (!emailReal || normalizarEmail(emailReal) !== normalizarEmail(corpo.email)) {
        registrarLogSeguro(ipHash, corpo.origin, 'editar_negado', corpo.protocolo, mascararEmail(corpo.email));
        return resposta(403, { erro: 'e-mail não corresponde ao autor deste protocolo' });
      }
      protocolo = corpo.protocolo;
      versao = versaoAnterior + 1;
    } else {
      protocolo = gerarProtocolo();
      versao = 1;
      versaoAnterior = 0;
    }

    // 11. Anexos. Novos uploads são salvos (fail-fast em arquivos suspeitos). Na
    //     edição sem upload, herda os anexos da versão anterior (carry-forward).
    var anexosSalvos = [];
    if (editando && anexos.length === 0) {
      anexosSalvos = filhasDaVersao(ss, 'anexos', protocolo, versaoAnterior).map(function (x) {
        return {
          tipo: String(x.tipo || ''),
          nome_arquivo: String(x.nome_arquivo || ''),
          drive_file_id: String(x.drive_file_id || ''),
          tamanho_bytes: Number(x.tamanho_bytes) || 0,
          criado_em: x.criado_em || new Date()
        };
      });
    } else if (anexos.length) {
      var pasta = pastaDoProtocolo(protocolo);
      for (var k = 0; k < anexos.length; k++) {
        anexosSalvos.push(salvarAnexo(pasta, anexos[k]));
      }
    }

    // 12. Calcula índices (grades) e impactos econômicos detalhados.
    var indiceSocial = calcularIndice(corpo.grade_social);
    var indiceAmbiental = calcularIndice(corpo.grade_ambiental);
    var econ = montarEconDetalhe(corpo.econ_detalhe);

    // 13. Registro principal (append-only versionado).
    var registro = {
      protocolo: protocolo,
      versao: versao,
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

    // 14. Abas filhas desta versão (não tocam em outras versões).
    replaceFilhasVersao(ss, 'eixos', protocolo, versao, mapearEixos(corpo.eixos));
    replaceFilhasVersao(ss, 'ods', protocolo, versao, mapearOds(corpo.ods));
    replaceFilhasVersao(ss, 'grade_social', protocolo, versao, corpo.grade_social);
    replaceFilhasVersao(ss, 'grade_ambiental', protocolo, versao, corpo.grade_ambiental);
    replaceFilhasVersao(ss, 'parcerias', protocolo, versao, Array.isArray(corpo.parcerias) ? corpo.parcerias : []);
    replaceFilhasVersao(ss, 'econ_detalhe', protocolo, versao, econ.linhas);
    replaceFilhasVersao(ss, 'anexos', protocolo, versao, anexosSalvos);

    registrarLogSeguro(ipHash, corpo.origin, editando ? 'relatorio_editado' : 'relatorio_ok',
                       protocolo + (editando ? ' v' + versao : ''), mascararEmail(corpo.email));

    // Invalida cache do GET para refletir o novo total rapidamente.
    try { CacheService.getScriptCache().remove('publico:resumo'); } catch (e) {}

    return resposta(200, {
      ok: true,
      protocolo: protocolo,
      versao: versao,
      mensagem: editando
        ? 'Relatório atualizado (versão ' + versao + '). Está em análise pela equipe.'
        : 'Relatório recebido. Está em análise pela equipe.'
    });
  } finally {
    lock.releaseLock();
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

// ─── Utilitários de manutenção: duplicatas (executar NO EDITOR) ──────────────
// Não são expostos na web. Duplicata = mais de um PROTOCOLO distinto com o MESMO
// email+titulo (reenvios acidentais). Versões do mesmo protocolo NÃO são
// duplicatas. A sugestão é sempre MANTER o protocolo de criação mais recente.

function analisarDuplicatas() {
  var ss = abrirPlanilha();
  var aba = abaPorNome(ss, 'relatorios');
  var dados = aba.getDataRange().getValues();
  var C = {};
  SCHEMA.relatorios.forEach(function (c, idx) { C[c] = idx; });

  var porProtocolo = {};
  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    var protocolo = String(row[C.protocolo] || '');
    if (!protocolo) continue;
    var criado = row[C.criado_em];
    var ms = (criado && criado.getTime) ? criado.getTime() : 0;
    var p = porProtocolo[protocolo];
    if (!p) {
      p = porProtocolo[protocolo] = {
        protocolo: protocolo, email: String(row[C.email] || ''),
        responsavel: String(row[C.responsavel] || ''), titulo: String(row[C.titulo] || ''),
        status: String(row[C.status] || ''), versoes: [], latestMs: 0
      };
    }
    p.versoes.push(versaoEfetiva(row[C.versao]));
    if (ms >= p.latestMs) { p.latestMs = ms; p.status = String(row[C.status] || ''); }
  }

  var grupos = {};
  for (var pr in porProtocolo) {
    var o = porProtocolo[pr];
    var chave = o.email.toLowerCase().trim() + ' || ' + o.titulo.toLowerCase().trim();
    (grupos[chave] = grupos[chave] || []).push(o);
  }
  var duplicados = [];
  for (var k in grupos) {
    var arr = grupos[k];
    if (arr.length < 2) continue;
    arr.sort(function (a, b) { return b.latestMs - a.latestMs; }); // mais recente primeiro
    duplicados.push({ chave: k, protocolos: arr, manter: arr[0].protocolo });
  }
  return { porProtocolo: porProtocolo, gruposDuplicados: duplicados };
}

function fmtMs_(ms) {
  return ms ? Utilities.formatDate(new Date(ms), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss') : '';
}

// Passo 1 (leitura): escreve um relatório legível na aba `_diag_duplicatas`.
// NÃO apaga nada. Revise essa aba antes de remover.
function gravarDiagnosticoDuplicatas() {
  var ss = abrirPlanilha();
  var an = analisarDuplicatas();
  var aba = ss.getSheetByName('_diag_duplicatas');
  if (aba) aba.clear(); else aba = ss.insertSheet('_diag_duplicatas');
  var header = ['grupo', 'sugestao', 'email', 'titulo', 'protocolo', 'versoes', 'criado_em_mais_recente', 'status', 'responsavel'];
  var linhas = [header];
  var g = 0;
  an.gruposDuplicados.forEach(function (grp) {
    g++;
    grp.protocolos.forEach(function (o) {
      linhas.push([
        g, o.protocolo === grp.manter ? 'MANTER' : 'APAGAR',
        o.email, o.titulo, o.protocolo,
        o.versoes.sort(function (a, b) { return a - b; }).join(','),
        fmtMs_(o.latestMs), o.status, o.responsavel
      ]);
    });
  });
  if (linhas.length === 1) linhas.push(['—', 'nenhuma duplicata encontrada', '', '', '', '', '', '', '']);
  aba.getRange(1, 1, linhas.length, header.length).setValues(linhas);
  aba.setFrozenRows(1);
  var msg = an.gruposDuplicados.length + ' grupo(s) de duplicatas — veja a aba _diag_duplicatas';
  Logger.log(msg);
  return msg;
}

// Apaga TODAS as linhas (todas as versões) de um protocolo em todas as abas.
function apagarProtocoloTudo_(ss, protocolo) {
  var tabs = ['relatorios', 'eixos', 'ods', 'grade_social', 'grade_ambiental', 'parcerias', 'econ_detalhe', 'anexos'];
  var removidas = 0;
  tabs.forEach(function (nome) {
    var aba = abaPorNome(ss, nome);
    var dados = aba.getDataRange().getValues();
    var protCol = SCHEMA[nome].indexOf('protocolo');
    for (var i = dados.length - 1; i >= 1; i--) {
      if (String(dados[i][protCol]) === String(protocolo)) { aba.deleteRow(i + 1); removidas++; }
    }
  });
  return removidas;
}

// Passo 2 (DESTRUTIVO): remove os protocolos marcados APAGAR (os não-mais-recentes
// de cada grupo) em TODAS as abas. Rode só depois de revisar `_diag_duplicatas`.
function removerDuplicatasSugeridas() {
  var ss = abrirPlanilha();
  var an = analisarDuplicatas();
  var aRemover = [];
  an.gruposDuplicados.forEach(function (grp) {
    grp.protocolos.forEach(function (o) { if (o.protocolo !== grp.manter) aRemover.push(o.protocolo); });
  });
  var totalLinhas = 0;
  aRemover.forEach(function (pr) { totalLinhas += apagarProtocoloTudo_(ss, pr); });
  try { CacheService.getScriptCache().remove('publico:resumo'); } catch (e) {}
  var msg = 'Removidos ' + aRemover.length + ' protocolo(s): ' +
            (aRemover.join(', ') || '(nenhum)') + ' | linhas apagadas: ' + totalLinhas;
  Logger.log(msg);
  return msg;
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
