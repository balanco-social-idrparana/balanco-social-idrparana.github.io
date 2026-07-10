/**
 * Importar2024.gs — reaproveitamento dos relatórios do Balanço Social 2024.
 *
 * Objetivo: permitir que o autor de um relatório de 2024 "puxe" os valores do
 * ano anterior para começar um relatório NOVO de 2025 já preenchido, revisando
 * apenas o que mudou. Em 2024 não havia protocolo, então a busca é por e-mail:
 * o autor informa o e-mail usado em 2024 e escolhe, numa lista, qual relatório
 * reaproveitar.
 *
 * Arquitetura (snapshot importado):
 *   1. importar2024() — função de MANUTENÇÃO (rode no editor, como
 *      configurarRecursos). Lê a planilha de respostas de 2024 (fonte separada),
 *      mapeia cada linha para o formato do formulário de 2025 (RelatorioInput) e
 *      grava um snapshot na aba `import_2024` do banco. Roda UMA vez; depois o
 *      recurso não depende mais da planilha original.
 *   2. Ações web `listar2024` e `carregar2024` (Code.gs) leem apenas a aba
 *      `import_2024` — nunca a planilha original.
 *
 * Configuração (Script Properties):
 *   IMPORT_2024_SHEET_ID  ID da planilha de respostas de 2024 (Google Sheets).
 *                         Se a fonte for um .xlsx, converta para Planilhas Google
 *                         (Arquivo → Salvar como Planilhas Google) e use o ID da
 *                         cópia — SpreadsheetApp.openById só abre Sheets nativas.
 *   IMPORT_2024_TAB       (opcional) nome da aba de respostas detalhadas.
 *                         Padrão: 'Respostas ao formulário 2'.
 *
 * Privacidade (LGPD): o snapshot contém e-mails e textos dos relatórios de 2024.
 * A aba `import_2024` vive no mesmo banco privado e as ações web só devolvem os
 * relatórios cujo e-mail bate com o informado (o autor só vê os próprios).
 */

// Ordem dos aspectos da grade na planilha de 2024 (uma coluna de descrição
// seguida das colunas de coeficientes, na ordem de GRADE_*_DEF). A contagem de
// coeficientes por aspecto é idêntica à de 2025, então o mapeamento é posicional
// — inclusive o rótulo renomeado (2024 "Condição do trabalhador" → 2025
// "Qualidade do emprego"), que casa por posição dentro do aspecto Emprego.
var IMPORT_2024_ORDEM_SOCIAL = [
  ['emprego', 'social_emprego_desc'],
  ['renda', 'social_renda_desc'],
  ['bemestar', 'social_bemestar_desc'],
  ['gestao', 'social_gestao_desc']
];
var IMPORT_2024_ORDEM_AMBIENTAL = [
  ['eficiencia', 'amb_eficiencia_desc'],
  ['conservacao', 'amb_conservacao_desc'],
  ['recuperacao', 'amb_recuperacao_desc'],
  ['bemestar_animal', 'amb_bemestar_animal_desc'],
  ['qualidade_produto', 'amb_qualidade_produto_desc']
];

/** Corta texto a `max` caracteres (padrão: teto de campo) e apara espaços. */
function truncarTexto2024_(v, max) {
  max = max || LIMITS.MAX_TEXTO_CAMPO;
  var s = String(v === null || v === undefined ? '' : v).trim();
  return s.length > max ? s.substring(0, max) : s;
}

/**
 * Converte o valor da grade de 2024 para a escala Ambitec de 2025.
 * Aceita '3','1','0','-1','-3' (com ou sem '+') e "Não se aplica" → 'NA'.
 * Célula vazia ou valor desconhecido → '' (o coeficiente fica sem resposta, e o
 * autor completa no formulário — a grade só é exigida completa no envio).
 */
function converterValorImpacto2024_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s === '') return '';
  var low = s.toLowerCase();
  if (low.indexOf('não se aplica') >= 0 || low.indexOf('nao se aplica') >= 0 || low === 'na') return 'NA';
  s = s.replace(/^\+/, '');
  if (['-3', '-1', '0', '1', '3'].indexOf(s) >= 0) return s;
  return '';
}

/**
 * Extrai de uma célula multivalorada (respostas do Google Forms unidas por ", ")
 * os itens que pertencem ao conjunto fechado `permitidos`. Usa correspondência
 * por conteúdo (não split por vírgula) porque alguns rótulos contêm vírgula —
 * ex.: "9. Indústria, inovação e infraestrutura".
 */
function parseListaDominio2024_(cell, permitidos) {
  var s = String(cell || '');
  var out = [];
  for (var i = 0; i < permitidos.length; i++) {
    if (s.indexOf(permitidos[i]) >= 0) out.push(permitidos[i]);
  }
  return out;
}

/**
 * Mapeia UMA linha da planilha de 2024 (array de células, na ordem das colunas
 * do formulário) para { email, titulo, diretoria, programa, dados }, onde `dados`
 * é um RelatorioInput pronto para pré-preencher o formulário de 2025.
 *
 * A ordem das colunas espelha o formulário de 2024: identificação, eixos/ODS,
 * resumo/abrangência, parcerias (texto livre — não migra para a lista
 * estruturada de 2025), impactos gerais, econômicos (6), e então, por aspecto,
 * uma descrição seguida dos coeficientes. Conclusões social/ambiental não
 * existiam em 2024 → ficam vazias (o autor preenche).
 */
function mapearLinha2024_(row) {
  var i = 0;
  function nx() { var v = row[i++]; return v === null || v === undefined ? '' : v; }
  function txt() { return truncarTexto2024_(nx()); }

  nx();                       // 0  carimbo de data/hora
  var email = String(nx()).trim(); // 1  e-mail
  var responsavel = txt();    // 2  responsável pelas informações
  var titulo = txt();         // 3  título da ação/tecnologia
  var diretoria = txt();      // 4  diretoria e gerência
  var programa = txt();       // 5  programa/projeto
  var coordenacao = txt();    // 6  coordenação/responsável e equipe
  var ano = txt();            // 7  ano de desenvolvimento
  var eixosCell = String(nx()); // 8  eixos estratégicos (multivalorado)
  var odsCell = String(nx());   // 9  ODS (multivalorado)
  var resumo = txt();         // 10 resumo descritivo
  var abrangencia = txt();    // 11 abrangência geográfica
  nx();                       // 12 parcerias (texto livre) — não migra
  var impactos = txt();       // 13 impactos gerais
  var econProdutividade = txt();   // 14
  var econReducaoCustos = txt();   // 15
  var econExpansaoArea = txt();    // 16
  var econAgregacaoValor = txt();  // 17
  var econMemoriaCalculo = txt();  // 18
  var econFontes = txt();          // 19

  var descSocial = {};
  var gradeSocial = [];
  IMPORT_2024_ORDEM_SOCIAL.forEach(function (par) {
    descSocial[par[1]] = txt();
    GRADE_SOCIAL_DEF[par[0]].forEach(function (coef) {
      var val = converterValorImpacto2024_(nx());
      if (val !== '') gradeSocial.push({ aspecto: par[0], coeficiente: coef, valor: val });
    });
  });

  var descAmb = {};
  var gradeAmbiental = [];
  IMPORT_2024_ORDEM_AMBIENTAL.forEach(function (par) {
    descAmb[par[1]] = txt();
    GRADE_AMBIENTAL_DEF[par[0]].forEach(function (coef) {
      var val = converterValorImpacto2024_(nx());
      if (val !== '') gradeAmbiental.push({ aspecto: par[0], coeficiente: coef, valor: val });
    });
  });

  var publicacoes = txt();    // colunas de anexos que seguem são ignoradas

  var dados = {
    email: email,
    responsavel: truncarTexto2024_(responsavel, 200),
    titulo: truncarTexto2024_(titulo, 300),
    diretoria_departamento: truncarTexto2024_(diretoria, 300),
    programa_projeto: truncarTexto2024_(programa, 300),
    coordenacao_equipe: coordenacao,
    ano_tecnologia: truncarTexto2024_(ano, 50),
    eixos: parseListaDominio2024_(eixosCell, EIXOS_PERMITIDOS),
    ods: parseListaDominio2024_(odsCell, ODS_PERMITIDOS),
    resumo: resumo,
    abrangencia_geografica: abrangencia,
    impactos_gerais: impactos,
    econ_produtividade: econProdutividade,
    econ_reducao_custos: econReducaoCustos,
    econ_expansao_area: econExpansaoArea,
    econ_agregacao_valor: econAgregacaoValor,
    econ_memoria_calculo: econMemoriaCalculo,
    econ_fontes: econFontes,
    parcerias: [],
    econ_detalhe: {
      produtividade: { ano: '2025' },
      reducao_custos: { ano: '2025' },
      expansao: { ano: '2025' },
      agregacao: { ano: '2025' }
    },
    social_emprego_desc: descSocial.social_emprego_desc,
    social_renda_desc: descSocial.social_renda_desc,
    social_bemestar_desc: descSocial.social_bemestar_desc,
    social_gestao_desc: descSocial.social_gestao_desc,
    social_conclusao: '',
    grade_social: gradeSocial,
    amb_eficiencia_desc: descAmb.amb_eficiencia_desc,
    amb_conservacao_desc: descAmb.amb_conservacao_desc,
    amb_recuperacao_desc: descAmb.amb_recuperacao_desc,
    amb_bemestar_animal_desc: descAmb.amb_bemestar_animal_desc,
    amb_qualidade_produto_desc: descAmb.amb_qualidade_produto_desc,
    amb_conclusao: '',
    grade_ambiental: gradeAmbiental,
    publicacoes: publicacoes
  };

  return {
    email: email,
    titulo: dados.titulo,
    diretoria: dados.diretoria_departamento,
    programa: dados.programa_projeto,
    dados: dados
  };
}

/** true se o `sub` (minúsculas) aparece na célula (case-insensitive). */
function contemLower2024_(celula, sub) {
  return String(celula || '').toLowerCase().indexOf(sub) >= 0;
}

/**
 * Confere âncoras do cabeçalho da planilha de 2024. Protege contra aba errada ou
 * colunas fora de ordem (o mapeamento é posicional). Lança erro claro se não bate.
 */
function validarCabecalho2024_(header) {
  var ok = contemLower2024_(header[3], 'tulo') &&      // TÍTULO DA AÇÃO...
    contemLower2024_(header[10], 'resumo') &&           // RESUMO DESCRITIVO
    contemLower2024_(header[13], 'impactos gerais') &&  // IMPACTOS GERAIS...
    contemLower2024_(header[20], 'emprego') &&          // ...Aspecto Emprego
    contemLower2024_(header[71], 'publica');            // PUBLICAÇÕES E MATÉRIAS
  if (!ok) {
    throw new Error(
      'Cabeçalho da planilha de 2024 não corresponde ao layout esperado ' +
      '(aba errada ou colunas fora de ordem). Ajuste a Script Property ' +
      'IMPORT_2024_TAB para a aba de respostas detalhadas.'
    );
  }
}

/**
 * Importa (ou reimporta) o snapshot dos relatórios de 2024 para a aba
 * `import_2024`. MANUTENÇÃO: rode no editor (Executar → importar2024).
 * Idempotente: reescreve a aba do zero a cada execução.
 */
function importar2024() {
  var sourceId = cfg('IMPORT_2024_SHEET_ID');
  var tabName = PropertiesService.getScriptProperties().getProperty('IMPORT_2024_TAB') ||
    'Respostas ao formulário 2';

  var src;
  try {
    src = SpreadsheetApp.openById(sourceId);
  } catch (e) {
    throw new Error(
      'Não foi possível abrir a planilha de 2024 (IMPORT_2024_SHEET_ID). ' +
      'Confirme o ID e que é uma Planilha Google (não .xlsx) acessível à conta do script. Detalhe: ' +
      (e && e.message)
    );
  }
  var aba = src.getSheetByName(tabName);
  if (!aba) throw new Error('Aba não encontrada na planilha de 2024: "' + tabName + '"');

  var dados = aba.getDataRange().getValues();
  if (dados.length < 2) throw new Error('Planilha de 2024 sem linhas de dados.');
  validarCabecalho2024_(dados[0]);

  var ss = abrirPlanilha();
  var destino = garantirCabecalho(ss, 'import_2024');
  var ultima = destino.getLastRow();
  if (ultima > 1) destino.deleteRows(2, ultima - 1); // reimport limpo

  var linhas = [];
  var avisos = [];
  var seq = 0;
  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var emailBruto = String(row[1] || '').trim();
    var tituloBruto = String(row[3] || '').trim();
    if (!emailBruto && !tituloBruto) continue; // linha em branco

    var m;
    try { m = mapearLinha2024_(row); } catch (e) {
      avisos.push('linha ' + (r + 1) + ': falha no mapeamento (' + (e && e.message) + ')');
      continue;
    }
    if (!validarEmail(m.email)) {
      avisos.push('linha ' + (r + 1) + ': e-mail ausente/ inválido — não poderá ser reaproveitado');
    }

    seq++;
    var id = 'BS2024-' + ('000' + seq).slice(-3);
    var json = JSON.stringify(m.dados);
    if (json.length > 49000) { // teto prático da célula do Sheets (50.000)
      avisos.push('linha ' + (r + 1) + ': registro muito grande, truncado');
      json = json.substring(0, 49000);
    }
    linhas.push(montarLinha('import_2024', {
      id: id,
      email_norm: normalizarEmail(m.email),
      email: m.email,
      responsavel: m.dados.responsavel,
      titulo: m.titulo,
      diretoria_departamento: m.diretoria,
      programa_projeto: m.programa,
      dados_json: json
    }));
  }

  if (linhas.length) {
    destino.getRange(2, 1, linhas.length, SCHEMA.import_2024.length).setValues(linhas);
  }

  var msg = 'import_2024: ' + linhas.length + ' relatório(s) importado(s)' +
    (avisos.length ? ' — ' + avisos.length + ' aviso(s)' : '') + '.';
  Logger.log(msg);
  avisos.forEach(function (a) { Logger.log('  · ' + a); });
  return msg;
}

/**
 * Relatórios de 2024 do autor (lista para escolha). Devolve só os campos de
 * exibição — nunca o conteúdo completo nem e-mails de terceiros.
 */
function listarImport2024PorEmail(ss, email) {
  var alvo = normalizarEmail(email);
  var aba = ss.getSheetByName('import_2024');
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  var cols = SCHEMA.import_2024;
  var iId = cols.indexOf('id');
  var iNorm = cols.indexOf('email_norm');
  var iTit = cols.indexOf('titulo');
  var iDir = cols.indexOf('diretoria_departamento');
  var iProg = cols.indexOf('programa_projeto');
  var out = [];
  for (var r = 1; r < dados.length; r++) {
    if (String(dados[r][iNorm]) !== alvo) continue;
    out.push({
      id: String(dados[r][iId]),
      titulo: String(dados[r][iTit] || ''),
      diretoria: String(dados[r][iDir] || ''),
      programa: String(dados[r][iProg] || '')
    });
  }
  return out;
}

/**
 * Dados completos de um relatório de 2024 para pré-preencher o formulário. Gate:
 * o e-mail informado precisa bater com o do registro (o autor só carrega os
 * próprios). Retorna o RelatorioInput ou null (id inexistente ou e-mail divergente).
 */
function carregarImport2024(ss, id, email) {
  var alvo = normalizarEmail(email);
  var aba = ss.getSheetByName('import_2024');
  if (!aba) return null;
  var dados = aba.getDataRange().getValues();
  var cols = SCHEMA.import_2024;
  var iId = cols.indexOf('id');
  var iNorm = cols.indexOf('email_norm');
  var iJson = cols.indexOf('dados_json');
  for (var r = 1; r < dados.length; r++) {
    if (String(dados[r][iId]) !== String(id)) continue;
    if (String(dados[r][iNorm]) !== alvo) return null; // existe, mas não é do autor
    try { return JSON.parse(String(dados[r][iJson])); } catch (e) { return null; }
  }
  return null;
}
