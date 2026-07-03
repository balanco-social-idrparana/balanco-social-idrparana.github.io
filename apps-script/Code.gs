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

// Campos escalares OPCIONAIS que também têm teto de comprimento.
var CAMPOS_OPCIONAIS = ['ano_tecnologia', 'publicacoes'];

// Teto de comprimento por campo (os demais usam LIMITS.MAX_TEXTO_CAMPO). O
// doPost é público: o Zod do frontend não protege contra um cliente forjado,
// e uma célula >50.000 chars faria o Sheets lançar exceção tardia (500 com
// anexos órfãos no Drive).
var CAMPOS_MAX = {
  email: 254,
  responsavel: 200,
  titulo: 300,
  diretoria_departamento: 300,
  programa_projeto: 300,
  ano_tecnologia: 50
};

/** Primeiro campo que excede o tamanho máximo, ou null se todos ok. */
function validarTamanhos(corpo) {
  var campos = CAMPOS_OBRIGATORIOS.concat(CAMPOS_OPCIONAIS);
  for (var i = 0; i < campos.length; i++) {
    var c = campos[i];
    var v = corpo[c];
    if (v === undefined || v === null) continue;
    var max = CAMPOS_MAX[c] || LIMITS.MAX_TEXTO_CAMPO;
    if (String(v).length > max) {
      return { erro: 'campo excede o tamanho máximo', campo: c, max: max };
    }
  }
  return null;
}

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

  // Rate-limit de leitura (anti-enumeração): contadores de TENTATIVA — contam
  // mesmo quando a consulta falha, por isso consomem já na checagem. Janela
  // horária fixa (bucketHora) para não somar o dia inteiro.
  //
  // tryLock (curto) em vez de waitLock: o objetivo do lock é apenas tornar
  // atômico o read-increment-write. Se um ENVIO grande estiver segurando o
  // ScriptLock (upload de anexos), não vale 503-ar leitores legítimos — segue
  // sem lock, aceitando a pequena imprecisão de um contador anti-enumeração.
  var h = bucketHora();
  var chaveEmail = 'rl:load:' + h + ':' + hashIP(normalizarEmail(corpo.email));
  var lock = LockService.getScriptLock();
  var comLock = false;
  try { comLock = lock.tryLock(1500); } catch (e) { comLock = false; }
  var passou;
  try {
    passou = checarRateLimit(chaveEmail, LIMITS.RATE_LOAD_PER_EMAIL_HOURLY, 3600) &&
      (!corpo._ip || checarRateLimit('rl:loadip:' + h + ':' + ipHash, LIMITS.RATE_LOAD_PER_IP_HOURLY, 3600)) &&
      checarRateLimit('rl:loadglobal:' + h, LIMITS.RATE_GLOBAL_LOAD_HOURLY, 3600);
  } finally {
    if (comLock) lock.releaseLock();
  }
  if (!passou) {
    return resposta(429, { erro: 'muitas consultas; tente novamente mais tarde' });
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

  // 4. Campos escalares obrigatórios + teto de comprimento por campo.
  var faltando = exigirCampos(corpo, CAMPOS_OBRIGATORIOS);
  if (faltando.length) return resposta(400, { erro: 'campos obrigatórios faltando', campos: faltando });

  var excedente = validarTamanhos(corpo);
  if (excedente) return resposta(400, excedente);

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

  // 8. Anexos — pré-validação COMPLETA (contagem, tipo, MIME, tamanho, magic
  //    bytes) antes do lock e de qualquer gravação: um anexo inválido devolve
  //    400 claro em vez de 500 com arquivos órfãos no Drive.
  var erroAnexos = validarAnexos(anexos);
  if (erroAnexos) return resposta(erroAnexos.status, erroAnexos.corpo);

  // 9. Lock para serializar escritas concorrentes E o rate-limit (o
  //    read-increment-write do CacheService não é atômico; sob lock vira-o).
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    return resposta(503, { erro: 'sistema ocupado, tente novamente em instantes' });
  }
  try {
    var h = bucketHora();
    // Consumo APÓS sucesso: apenas o cooldown de 5 min do envio NOVO — um 500
    // no meio do fluxo não pode trancar o reenvio legítimo por 5 minutos. Os
    // demais contadores (edit, ip, global) são anti-abuso e consomem JÁ na
    // checagem (uma tentativa que falha ainda conta), com janela horária real.
    var consumoAposSucesso = [];
    if (editando) {
      // Anti-probe: a edição chega aqui só com payload totalmente válido; o gate
      // de autoria vem depois. Consumir na checagem limita sondagem por e-mail.
      var chaveEdit = 'rl:edit:' + h + ':' + hashIP(normalizarEmail(corpo.email));
      if (!checarRateLimit(chaveEdit, LIMITS.RATE_EDIT_PER_EMAIL_HOURLY, 3600)) {
        return resposta(429, { erro: 'muitas edições; tente novamente mais tarde' });
      }
    } else {
      var chaveEmail = 'rl:email:' + hashIP(normalizarEmail(corpo.email));
      if (rateLimitEstourado(chaveEmail, 1)) {
        return resposta(429, { erro: 'aguarde antes de reenviar com este e-mail' });
      }
      consumoAposSucesso.push([chaveEmail, LIMITS.RATE_PER_EMAIL_SECONDS]);
    }
    // Só aplica o limite por IP quando há IP real. O Apps Script não expõe o IP
    // do cliente e o frontend não o envia, então hashIP('') seria constante —
    // sem este guard, o limite viraria um teto GLOBAL para toda a rede.
    if (corpo._ip) {
      if (!checarRateLimit('rl:ip:' + h + ':' + ipHash, LIMITS.RATE_PER_IP_HOURLY, 3600)) {
        return resposta(429, { erro: 'limite de envios por hora atingido' });
      }
    }
    // Teto GLOBAL por hora — freio real contra spam. Consome na checagem (só
    // payloads válidos chegam aqui; validação e reCAPTCHA já passaram), logo
    // não é exaurível por floods de lixo. e-mail/IP são contornáveis; este não.
    if (!checarRateLimit('rl:global:' + h, LIMITS.RATE_GLOBAL_HOURLY, 3600)) {
      registrarLogSeguro(ipHash, corpo.origin, 'global_rate', '', '');
      return resposta(429, { erro: 'limite de envios do sistema atingido; tente novamente mais tarde' });
    }

    var ss = abrirPlanilha();

    // Define protocolo e versão. Na edição, exige autoria (e-mail bate com a
    // última versão) e incrementa a versão preservando o histórico. As duas
    // falhas de autorização devolvem o MESMO 404 (como no carregar) para não
    // revelar se um protocolo existe a quem não é o autor.
    var protocolo, versao, versaoAnterior;
    if (editando) {
      versaoAnterior = maxVersao(ss, corpo.protocolo);
      var emailReal = versaoAnterior === 0 ? '' : emailDaUltimaVersao(ss, corpo.protocolo);
      if (versaoAnterior === 0 || !emailReal ||
          normalizarEmail(emailReal) !== normalizarEmail(corpo.email)) {
        registrarLogSeguro(ipHash, corpo.origin, 'editar_negado', corpo.protocolo, mascararEmail(corpo.email));
        return resposta(404, { erro: 'protocolo não encontrado para este e-mail' });
      }
      protocolo = corpo.protocolo;
      versao = versaoAnterior + 1;
    } else {
      protocolo = gerarProtocoloUnico(ss);
      versao = 1;
      versaoAnterior = 0;
    }

    // 11. Anexos. Novos uploads são salvos (fail-fast em arquivos suspeitos). Na
    //     edição sem upload, herda os anexos da versão anterior (carry-forward).
    //     Em falha parcial, os arquivos já criados vão para a lixeira (sem órfãos).
    var anexosSalvos = [];
    var anexosNovos = false;
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
      anexosNovos = true;
      var pasta = pastaDoProtocolo(protocolo);
      try {
        for (var k = 0; k < anexos.length; k++) {
          anexosSalvos.push(salvarAnexo(pasta, anexos[k]));
        }
      } catch (errAnexo) {
        lixeiraAnexos(anexosSalvos);
        return resposta(400, { erro: 'falha ao processar um dos anexos; verifique os arquivos e tente novamente' });
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
    // 14. Escrita versionada: TODAS as abas filhas primeiro, a linha-pai em
    //     `relatorios` por ÚLTIMO. A versão só passa a existir para leitores
    //     (maxVersao/lerRelatorioCompleto partem de `relatorios`) quando está
    //     completa — uma falha no meio não deixa versão corrompida visível.
    var filhas = [
      ['eixos', mapearEixos(corpo.eixos)],
      ['ods', mapearOds(corpo.ods)],
      ['grade_social', corpo.grade_social],
      ['grade_ambiental', corpo.grade_ambiental],
      ['parcerias', Array.isArray(corpo.parcerias) ? corpo.parcerias : []],
      ['econ_detalhe', econ.linhas],
      ['anexos', anexosSalvos]
    ];
    try {
      for (var f = 0; f < filhas.length; f++) {
        replaceFilhasVersao(ss, filhas[f][0], protocolo, versao, filhas[f][1]);
      }
      appendRelatorio(ss, registro);
    } catch (errEscrita) {
      // Melhor esforço: remove as linhas-filhas já gravadas desta versão e os
      // anexos recém-criados, para a falha não deixar resíduo.
      for (var g = 0; g < filhas.length; g++) {
        try { replaceFilhasVersao(ss, filhas[g][0], protocolo, versao, []); } catch (e3) {}
      }
      if (anexosNovos) lixeiraAnexos(anexosSalvos);
      throw errEscrita;
    }

    // Consumo pós-sucesso (só o cooldown de 5 min). Melhor esforço: uma falha
    // do CacheService aqui não pode virar 500 num relatório JÁ gravado (o
    // cliente reenviaria e duplicaria).
    try {
      for (var rl = 0; rl < consumoAposSucesso.length; rl++) {
        incrementarRateLimit(consumoAposSucesso[rl][0], consumoAposSucesso[rl][1]);
      }
    } catch (eRl) { /* consumo de rate-limit nunca derruba um envio gravado */ }

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
      // escaparCelula: estes valores vêm do usuário e este caminho grava via
      // setValues direto — sem o escape, um titulo "=IMPORTXML(...)" viraria
      // fórmula na aba que o operador abre para revisar.
      linhas.push([
        g, o.protocolo === grp.manter ? 'MANTER' : 'APAGAR',
        escaparCelula(o.email), escaparCelula(o.titulo), escaparCelula(o.protocolo),
        o.versoes.sort(function (a, b) { return a - b; }).join(','),
        fmtMs_(o.latestMs), escaparCelula(o.status), escaparCelula(o.responsavel)
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
  // Mesmo lock do Web App: deleteRow concorrendo com um doPost em produção
  // deslocaria índices de linha no meio da escrita.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
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
  } finally {
    lock.releaseLock();
  }
}

/**
 * Snapshot semanal — instalar como trigger time-based (Edit → Current project's triggers).
 * Mantém apenas as últimas LIMITS.BACKUP_RETENCAO_SEMANAS cópias (LGPD: não
 * acumular indefinidamente cópias integrais com e-mails crus).
 */
function backupSemanal() {
  var origem = DriveApp.getFileById(cfg('SHEET_ID'));
  var destino = DriveApp.getFolderById(cfg('BACKUP_FOLDER_ID'));
  var nome = 'backup-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss');
  var copia = origem.makeCopy(nome, destino);
  // A cópia contém e-mails crus (coluna `email`). Garante não-compartilhamento (LGPD).
  try { copia.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
  removerBackupsAntigos_(destino);
}

/** Lixeira para backups além do prazo de retenção. */
function removerBackupsAntigos_(pasta) {
  var corte = new Date(Date.now() - LIMITS.BACKUP_RETENCAO_SEMANAS * 7 * 24 * 3600 * 1000);
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var f = arquivos.next();
    try {
      if (f.getName().indexOf('backup-') === 0 && f.getDateCreated() < corte) {
        f.setTrashed(true);
      }
    } catch (e) { /* melhor esforço: um arquivo problemático não para a rotação */ }
  }
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

/**
 * Gera protocolo garantindo unicidade contra a planilha. Deve rodar SOB o
 * ScriptLock do envio (senão dois envios no mesmo segundo poderiam colidir
 * entre a checagem e o append). O protocolo não é segredo — a autorização de
 * leitura/edição exige também o e-mail do autor.
 */
function gerarProtocoloUnico(ss) {
  for (var i = 0; i < 5; i++) {
    var p = gerarProtocolo();
    if (maxVersao(ss, p) === 0) return p;
  }
  throw new Error('não foi possível gerar protocolo único após 5 tentativas');
}

/**
 * Pré-validação completa dos anexos ANTES do lock e de qualquer gravação.
 * Retorna { status, corpo } para responder, ou null se tudo ok.
 */
function validarAnexos(anexos) {
  if (anexos.length > LIMITS.MAX_ANEXOS) {
    return { status: 400, corpo: { erro: 'número de anexos excede o limite de ' + LIMITS.MAX_ANEXOS } };
  }
  var totalBytes = 0;
  for (var i = 0; i < anexos.length; i++) {
    var a = anexos[i] || {};
    if (!a.base64) return { status: 400, corpo: { erro: 'anexo vazio', indice: i } };
    if (TIPOS_ANEXO_PERMITIDOS.indexOf(a.tipo) < 0) {
      return { status: 400, corpo: { erro: 'tipo de anexo inválido', indice: i } };
    }
    if (LIMITS.ALLOWED_MIME.indexOf(a.mime) < 0) {
      return { status: 400, corpo: { erro: 'formato de arquivo não permitido', indice: i } };
    }
    var bytes = bytesDeBase64(a.base64);
    if (bytes > LIMITS.MAX_FILE_BYTES) {
      return { status: 413, corpo: { erro: 'arquivo excede o limite de 10 MB', indice: i } };
    }
    if (!magicBytesConferem(a.base64, a.mime)) {
      return { status: 400, corpo: { erro: 'conteúdo do arquivo não corresponde ao tipo declarado', indice: i } };
    }
    totalBytes += bytes;
  }
  if (totalBytes > LIMITS.MAX_TOTAL_BYTES) {
    return { status: 413, corpo: { erro: 'tamanho total dos anexos excede o limite' } };
  }
  return null;
}

/** Decodifica só o prefixo do base64 (12 chars → 9 bytes) p/ checar magic bytes. */
function magicBytesConferem(base64, mime) {
  var prefixo = String(base64).substring(0, 12);
  if (prefixo.length < 12) return false; // arquivo minúsculo demais p/ ser válido
  try {
    var bytes = Utilities.base64Decode(prefixo).map(function (b) { return b < 0 ? b + 256 : b; });
    return checarMagicBytes(bytes, mime);
  } catch (e) {
    return false; // base64 malformado
  }
}

/** Move para a lixeira os arquivos de anexos já criados (limpeza de falha parcial). */
function lixeiraAnexos(anexosSalvos) {
  for (var i = 0; i < anexosSalvos.length; i++) {
    try {
      if (anexosSalvos[i] && anexosSalvos[i].drive_file_id) {
        DriveApp.getFileById(anexosSalvos[i].drive_file_id).setTrashed(true);
      }
    } catch (e) { /* melhor esforço */ }
  }
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
