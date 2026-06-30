/**
 * Acesso à planilha (banco). Cada aba tem um cabeçalho fixo definido em SCHEMA.
 *
 * Diferença para a referência (gestaodeater): aqui a aba principal é APPEND-ONLY
 * (uma linha por submissão, sem chave natural) — não há upsert. A chave de
 * relacionamento das abas filhas é o `protocolo` gerado pelo backend.
 *
 * As colunas e a ordem espelham docs/contrato-dados.md (fonte de verdade).
 */

// `versao` fica SEMPRE na última coluna de cada aba versionada. Acrescentar
// coluna no fim (em vez de no meio) preserva o alinhamento das linhas já
// gravadas antes do versionamento — nelas a célula fica em branco e é tratada
// como versão 1 (ver versaoEfetiva).
var SCHEMA = {
  relatorios: [
    'protocolo', 'email', 'responsavel', 'titulo',
    'diretoria_departamento', 'programa_projeto', 'coordenacao_equipe',
    'ano_tecnologia', 'resumo', 'abrangencia_geografica',
    'impactos_gerais',
    'econ_produtividade', 'econ_reducao_custos', 'econ_expansao_area',
    'econ_agregacao_valor', 'econ_memoria_calculo', 'econ_fontes',
    'social_emprego_desc', 'social_renda_desc', 'social_bemestar_desc',
    'social_gestao_desc', 'social_conclusao',
    'amb_eficiencia_desc', 'amb_conservacao_desc', 'amb_recuperacao_desc',
    'amb_bemestar_animal_desc', 'amb_qualidade_produto_desc', 'amb_conclusao',
    'publicacoes',
    'beneficio_economico_total',
    'indice_social', 'indice_ambiental', 'criado_em', 'status', 'versao'
  ],
  eixos:           ['protocolo', 'eixo', 'versao'],
  ods:             ['protocolo', 'ods', 'versao'],
  grade_social:    ['protocolo', 'aspecto', 'coeficiente', 'valor', 'versao'],
  grade_ambiental: ['protocolo', 'aspecto', 'coeficiente', 'valor', 'versao'],
  parcerias:       ['protocolo', 'instituicao', 'funcao', 'valor_investido', 'participacao_pct', 'versao'],
  econ_detalhe:    ['protocolo', 'tipo', 'ano', 'anterior', 'atual', 'preco', 'custo',
                    'ganho_unitario', 'participacao_idr', 'area',
                    'ganho_liquido', 'beneficio', 'outros_estados_ha', 'outros_paises_ha', 'versao'],
  anexos:          ['protocolo', 'tipo', 'nome_arquivo', 'drive_file_id', 'tamanho_bytes', 'criado_em', 'versao'],
  _log:            ['timestamp', 'ip_hash', 'origin', 'acao', 'ref', 'detalhe']
};

/** Versão efetiva de uma célula: em branco (linha legada) conta como 1. */
function versaoEfetiva(v) {
  if (v === '' || v === null || v === undefined) return 1;
  var n = parseInt(v, 10);
  return isNaN(n) ? 1 : n;
}

function abrirPlanilha() {
  return SpreadsheetApp.openById(cfg('SHEET_ID'));
}

function abaPorNome(ss, nome) {
  var aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.appendRow(SCHEMA[nome]);
    aba.setFrozenRows(1);
  } else if (aba.getLastRow() === 0) {
    aba.appendRow(SCHEMA[nome]);
    aba.setFrozenRows(1);
  }
  return aba;
}

/**
 * Defesa contra injeção de fórmulas (CSV/Spreadsheet injection): valores de
 * texto que começam com =, +, - ou @ seriam interpretados como fórmula ao abrir
 * a planilha. Prefixamos com apóstrofo para forçar texto literal.
 */
function escaparCelula(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return v; // números/datas passam direto
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

/**
 * Garante que a linha 1 da aba contém exatamente o cabeçalho do SCHEMA atual
 * (sobrescreve). Seguro quando ainda não há dados; usado pelo configurarRecursos
 * para refletir mudanças de schema sem precisar apagar abas manualmente.
 */
function garantirCabecalho(ss, nome) {
  var aba = abaPorNome(ss, nome);
  var cols = SCHEMA[nome];
  aba.getRange(1, 1, 1, cols.length).setValues([cols]);
  aba.setFrozenRows(1);
  return aba;
}

function montarLinha(nomeAba, registro) {
  var cols = SCHEMA[nomeAba];
  return cols.map(function (c) { return escaparCelula(registro[c]); });
}

/**
 * Append-only versionado: SEMPRE acrescenta uma nova linha em `relatorios`.
 * Cada versão de um protocolo é uma linha distinta. Carimba criado_em com a
 * data/hora do servidor e força status='pendente_revisao'. A `versao` deve vir
 * no registro (1 no primeiro envio, max+1 a cada edição).
 */
function appendRelatorio(ss, registro) {
  var aba = abaPorNome(ss, 'relatorios');
  registro.criado_em = new Date();
  registro.status = 'pendente_revisao';
  registro.versao = registro.versao || 1;
  aba.appendRow(montarLinha('relatorios', registro));
  return { criado: true };
}

/**
 * Maior versão de um protocolo na aba `relatorios`. Retorna 0 se o protocolo
 * não existe (linhas legadas sem versão contam como 1).
 */
function maxVersao(ss, protocolo) {
  var aba = abaPorNome(ss, 'relatorios');
  var dados = aba.getDataRange().getValues();
  var protCol = SCHEMA.relatorios.indexOf('protocolo');
  var verCol = SCHEMA.relatorios.indexOf('versao');
  var max = 0;
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][protCol]) === String(protocolo)) {
      var v = versaoEfetiva(dados[i][verCol]);
      if (v > max) max = v;
    }
  }
  return max;
}

/**
 * Escreve as linhas filhas de uma versão específica. Como (protocolo, versao) é
 * único por edição, na prática sempre insere — mas apaga primeiro um par
 * (protocolo, versao) idêntico para manter idempotência em reprocessamentos.
 * NUNCA toca em linhas de outras versões: o histórico é preservado.
 */
function replaceFilhasVersao(ss, nomeAba, protocolo, versao, registros) {
  var aba = abaPorNome(ss, nomeAba);
  var dados = aba.getDataRange().getValues();
  var protCol = SCHEMA[nomeAba].indexOf('protocolo');
  var verCol = SCHEMA[nomeAba].indexOf('versao');

  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][protCol]) === String(protocolo) &&
        versaoEfetiva(dados[i][verCol]) === versao) {
      aba.deleteRow(i + 1);
    }
  }
  if (!registros || !registros.length) return;
  // Não muta os objetos do chamador — cria cópia com protocolo + versao.
  var linhas = registros.map(function (r) {
    return montarLinha(nomeAba, Object.assign({}, r, { protocolo: protocolo, versao: versao }));
  });
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, SCHEMA[nomeAba].length)
     .setValues(linhas);
}

/** Linhas de uma aba como objetos {coluna: valor}, sem o cabeçalho. */
function linhasComoObjetos(ss, nomeAba) {
  var aba = abaPorNome(ss, nomeAba);
  var dados = aba.getDataRange().getValues();
  var cols = SCHEMA[nomeAba];
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var obj = {};
    for (var c = 0; c < cols.length; c++) obj[cols[c]] = dados[i][c];
    out.push(obj);
  }
  return out;
}

/** Linhas filhas de um (protocolo, versao). */
function filhasDaVersao(ss, nomeAba, protocolo, versao) {
  return linhasComoObjetos(ss, nomeAba).filter(function (r) {
    return String(r.protocolo) === String(protocolo) && versaoEfetiva(r.versao) === versao;
  });
}

/** E-mail registrado na ÚLTIMA versão de um protocolo ('' se não existe). */
function emailDaUltimaVersao(ss, protocolo) {
  var ver = maxVersao(ss, protocolo);
  if (ver === 0) return '';
  var aba = abaPorNome(ss, 'relatorios');
  var dados = aba.getDataRange().getValues();
  var protCol = SCHEMA.relatorios.indexOf('protocolo');
  var verCol = SCHEMA.relatorios.indexOf('versao');
  var emailCol = SCHEMA.relatorios.indexOf('email');
  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][protCol]) === String(protocolo) &&
        versaoEfetiva(dados[i][verCol]) === ver) {
      return String(dados[i][emailCol] || '');
    }
  }
  return '';
}

/** Número ou '' (para reconstruir campos numéricos opcionais do formulário). */
function numOuVazio(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

/**
 * Reconstrói um relatório completo (última versão por padrão) no formato que o
 * formulário consome (RelatorioInput). Retorna null se o protocolo não existe.
 */
function lerRelatorioCompleto(ss, protocolo, versao) {
  var ver = versao || maxVersao(ss, protocolo);
  if (!ver) return null;

  var aba = abaPorNome(ss, 'relatorios');
  var dados = aba.getDataRange().getValues();
  var cols = SCHEMA.relatorios;
  var protCol = cols.indexOf('protocolo');
  var verCol = cols.indexOf('versao');
  var linha = null;
  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][protCol]) === String(protocolo) &&
        versaoEfetiva(dados[i][verCol]) === ver) {
      linha = dados[i];
      break;
    }
  }
  if (!linha) return null;

  var r = {};
  for (var c = 0; c < cols.length; c++) r[cols[c]] = linha[c];

  // Escalares de texto do formulário (mantém '' quando ausente).
  var camposTexto = [
    'email', 'responsavel', 'titulo', 'diretoria_departamento', 'programa_projeto',
    'coordenacao_equipe', 'ano_tecnologia', 'resumo', 'abrangencia_geografica',
    'impactos_gerais', 'econ_produtividade', 'econ_reducao_custos', 'econ_expansao_area',
    'econ_agregacao_valor', 'econ_memoria_calculo', 'econ_fontes',
    'social_emprego_desc', 'social_renda_desc', 'social_bemestar_desc', 'social_gestao_desc',
    'social_conclusao', 'amb_eficiencia_desc', 'amb_conservacao_desc', 'amb_recuperacao_desc',
    'amb_bemestar_animal_desc', 'amb_qualidade_produto_desc', 'amb_conclusao', 'publicacoes'
  ];
  var dados_form = {};
  camposTexto.forEach(function (k) { dados_form[k] = r[k] === undefined || r[k] === null ? '' : String(r[k]); });

  // Listas e grades (filtradas por versão).
  dados_form.eixos = filhasDaVersao(ss, 'eixos', protocolo, ver).map(function (x) { return String(x.eixo); });
  dados_form.ods = filhasDaVersao(ss, 'ods', protocolo, ver).map(function (x) { return String(x.ods); });
  dados_form.grade_social = filhasDaVersao(ss, 'grade_social', protocolo, ver).map(function (x) {
    return { aspecto: String(x.aspecto), coeficiente: String(x.coeficiente), valor: String(x.valor) };
  });
  dados_form.grade_ambiental = filhasDaVersao(ss, 'grade_ambiental', protocolo, ver).map(function (x) {
    return { aspecto: String(x.aspecto), coeficiente: String(x.coeficiente), valor: String(x.valor) };
  });
  dados_form.parcerias = filhasDaVersao(ss, 'parcerias', protocolo, ver).map(function (x) {
    return {
      instituicao: String(x.instituicao || ''),
      funcao: String(x.funcao || ''),
      valor_investido: numOuVazio(x.valor_investido),
      participacao_pct: numOuVazio(x.participacao_pct)
    };
  });

  // econ_detalhe: objeto por tipo, só com os campos de entrada (os calculados
  // são refeitos no frontend). Tipos sem linha gravada ficam com ano padrão.
  var econPadrao = { produtividade: { ano: '2025' }, reducao_custos: { ano: '2025' },
                     expansao: { ano: '2025' }, agregacao: { ano: '2025' } };
  filhasDaVersao(ss, 'econ_detalhe', protocolo, ver).forEach(function (x) {
    var tipo = String(x.tipo);
    if (!econPadrao.hasOwnProperty(tipo)) return;
    econPadrao[tipo] = {
      ano: x.ano === '' || x.ano === null || x.ano === undefined ? '2025' : String(x.ano),
      anterior: numOuVazio(x.anterior), atual: numOuVazio(x.atual),
      preco: numOuVazio(x.preco), custo: numOuVazio(x.custo),
      participacao_idr: numOuVazio(x.participacao_idr), area: numOuVazio(x.area),
      outros_estados_ha: numOuVazio(x.outros_estados_ha), outros_paises_ha: numOuVazio(x.outros_paises_ha)
    };
  });
  dados_form.econ_detalhe = econPadrao;

  return { versao: ver, dados: dados_form };
}

function registrarLog(ss, registro) {
  var aba = abaPorNome(ss, '_log');
  aba.appendRow(montarLinha('_log', {
    timestamp: new Date(),
    ip_hash: registro.ip_hash || '',
    origin: registro.origin || '',
    acao: registro.acao || '',
    ref: registro.ref || '',
    detalhe: registro.detalhe || ''
  }));
}

/**
 * Índice de uma grade (social ou ambiental): média dos valores numéricos,
 * ignorando 'NA' (não aplicável). Arredonda a 2 casas. Retorna '' se nenhum
 * coeficiente for aplicável.
 *
 * itensGrade: [{ aspecto, coeficiente, valor }, ...] com valor na escala
 * { '-3','-1','0','1','3','NA' }.
 */
function calcularIndice(itensGrade) {
  if (!itensGrade || !itensGrade.length) return '';
  var soma = 0;
  var n = 0;
  for (var i = 0; i < itensGrade.length; i++) {
    var v = String(itensGrade[i].valor);
    if (v === 'NA' || v === '') continue;
    var num = Number(v);
    if (isNaN(num)) continue;
    soma += num;
    n++;
  }
  if (n === 0) return '';
  return Math.round((soma / n) * 100) / 100;
}

/**
 * Resumo PÚBLICO mínimo: apenas a contagem de relatórios. Nenhum dado
 * sensível é exposto (sem e-mails, sem títulos, sem anexos).
 */
function lerResumoPublico() {
  var ss = abrirPlanilha();
  var aba = abaPorNome(ss, 'relatorios');
  var dados = aba.getDataRange().getValues();
  var protCol = SCHEMA.relatorios.indexOf('protocolo');
  var total = 0;
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][protCol]) total++;
  }
  return { total: total };
}
