/**
 * Acesso à planilha (banco). Cada aba tem um cabeçalho fixo definido em SCHEMA.
 *
 * Diferença para a referência (gestaodeater): aqui a aba principal é APPEND-ONLY
 * (uma linha por submissão, sem chave natural) — não há upsert. A chave de
 * relacionamento das abas filhas é o `protocolo` gerado pelo backend.
 *
 * As colunas e a ordem espelham docs/contrato-dados.md (fonte de verdade).
 */

var SCHEMA = {
  relatorios: [
    'protocolo', 'email', 'responsavel', 'titulo',
    'diretoria_departamento', 'programa_projeto', 'coordenacao_equipe',
    'ano_tecnologia', 'resumo', 'abrangencia_geografica',
    'parcerias_confirmado', 'impactos_gerais',
    'econ_produtividade', 'econ_reducao_custos', 'econ_expansao_area',
    'econ_agregacao_valor', 'econ_memoria_calculo', 'econ_fontes',
    'social_emprego_desc', 'social_renda_desc', 'social_bemestar_desc',
    'social_gestao_desc', 'social_conclusao',
    'amb_eficiencia_desc', 'amb_conservacao_desc', 'amb_recuperacao_desc',
    'amb_bemestar_animal_desc', 'amb_qualidade_produto_desc', 'amb_conclusao',
    'publicacoes',
    'indice_social', 'indice_ambiental', 'criado_em', 'status'
  ],
  eixos:           ['protocolo', 'eixo'],
  ods:             ['protocolo', 'ods'],
  grade_social:    ['protocolo', 'aspecto', 'coeficiente', 'valor'],
  grade_ambiental: ['protocolo', 'aspecto', 'coeficiente', 'valor'],
  anexos:          ['protocolo', 'tipo', 'nome_arquivo', 'drive_file_id', 'tamanho_bytes', 'criado_em'],
  _log:            ['timestamp', 'ip_hash', 'origin', 'acao', 'ref', 'detalhe']
};

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

function montarLinha(nomeAba, registro) {
  var cols = SCHEMA[nomeAba];
  return cols.map(function (c) { return escaparCelula(registro[c]); });
}

/**
 * Append-only: SEMPRE acrescenta uma nova linha em `relatorios`. Carimba
 * criado_em com a data/hora do servidor e força status='pendente_revisao'.
 * Não há upsert — cada submissão é um relatório distinto.
 */
function appendRelatorio(ss, registro) {
  var aba = abaPorNome(ss, 'relatorios');
  registro.criado_em = new Date();
  registro.status = 'pendente_revisao';
  aba.appendRow(montarLinha('relatorios', registro));
  return { criado: true };
}

/**
 * Replace-all nas abas filhas para um `protocolo`. Como protocolo é único por
 * submissão, na prática isto sempre insere (mas mantém o padrão idempotente da
 * referência, agora chaveado por 'protocolo' em vez de 'cnpj').
 */
function replaceFilhas(ss, nomeAba, protocolo, registros) {
  var aba = abaPorNome(ss, nomeAba);
  var dados = aba.getDataRange().getValues();
  var protCol = SCHEMA[nomeAba].indexOf('protocolo');

  // Apaga linhas existentes do protocolo (de baixo p/ cima p/ não bagunçar índices).
  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][protCol]) === String(protocolo)) aba.deleteRow(i + 1);
  }
  if (!registros || !registros.length) return;
  // Não muta os objetos do chamador — cria cópia com o protocolo.
  var linhas = registros.map(function (r) {
    return montarLinha(nomeAba, Object.assign({}, r, { protocolo: protocolo }));
  });
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, SCHEMA[nomeAba].length)
     .setValues(linhas);
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
