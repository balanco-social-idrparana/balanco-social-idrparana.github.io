/**
 * Listas-domínio canônicas (espelham form/src/data/eixos.ts e grades.ts).
 * Usadas para validar server-side contra conjuntos FECHADOS — o frontend é
 * público e falsificável, então o backend não confia nos rótulos recebidos.
 *
 * IMPORTANTE: manter em sincronia com form/src/data/*.ts. Os rótulos precisam
 * bater caractere a caractere com o que o formulário envia.
 */

var EIXOS_PERMITIDOS = [
  'Competitividade e renda',
  'Segurança alimentar e nutricional',
  'Promoção social e cidadania',
  'Sustentabilidade ambiental'
];

var ODS_PERMITIDOS = [
  '1. Erradicação da pobreza',
  '2. Fome zero e agricultura sustentável',
  '3. Saúde e bem-estar',
  '4. Educação de qualidade',
  '5. Igualdade de gênero',
  '6. Água potável e saneamento',
  '7. Energia limpa e acessível',
  '8. Trabalho decente e crescimento econômico',
  '9. Indústria, inovação e infraestrutura',
  '10. Redução das desigualdades',
  '11. Cidades e comunidades sustentáveis',
  '12. Consumo e produção sustentáveis',
  '13. Ação contra a mudança global do clima',
  '14. Vida na água',
  '15. Vida terrestre',
  '16. Paz, justiça e instituições eficazes',
  '17. Parcerias e meios de implementação'
];

// Coeficientes por aspecto (chave estável). Espelha GRADE_SOCIAL/GRADE_AMBIENTAL.
var GRADE_SOCIAL_DEF = {
  emprego: [
    'Capacitação',
    'Oportunidade de emprego local qualificado',
    'Oferta de emprego',
    'Qualidade do emprego'
  ],
  renda: [
    'Geração de renda do estabelecimento',
    'Diversidade de fontes de renda',
    'Valor da propriedade'
  ],
  bemestar: [
    'Saúde ambiental e pessoal',
    'Segurança e saúde ocupacional',
    'Segurança alimentar'
  ],
  gestao: [
    'Dedicação e perfil do responsável',
    'Condição de comercialização',
    'Reciclagem de resíduos',
    'Relacionamento institucional',
    'Capital social (agroindústria)'
  ]
};

var GRADE_AMBIENTAL_DEF = {
  eficiencia: [
    'Uso de agroquímicos (inseticidas, fungicidas e herbicidas)',
    'Uso de fertilizantes e corretivos',
    'Insumos veterinários (medicamentos e vacinas)',
    'Produtos para alimentação animal',
    'Uso de energia',
    'Uso de recursos naturais - água',
    'Uso de recursos naturais - solo (área de produção)',
    'Uso de matérias-primas e aditivos na agroindústria'
  ],
  conservacao: [
    'Qualidade da atmosfera',
    'Capacidade produtiva do solo',
    'Qualidade da água',
    'Geração de resíduos sólidos',
    'Biodiversidade'
  ],
  recuperacao: [
    'Recuperação de solos degradados',
    'Recuperação de ecossistemas degradados',
    'Recomposição de áreas de preservação permanente',
    'Reserva legal'
  ],
  bemestar_animal: [
    'Conforto térmico',
    'Acesso a fontes de água',
    'Acesso a fontes de suplementos alimentares',
    'Conduta ética de abate ou descarte'
  ],
  qualidade_produto: [
    'Presença de aditivos em produto de origem animal ou vegetal in natura',
    'Resíduos químicos em produto de origem animal ou vegetal in natura',
    'Contaminantes biológicos em produto de origem animal ou vegetal in natura',
    'Presença de aditivos em produto agroindustrial ou na cadeia',
    'Resíduos químicos em produto agroindustrial ou na cadeia',
    'Contaminantes biológicos em produto agroindustrial ou na cadeia'
  ]
};

var TIPOS_ANEXO_PERMITIDOS = ['foto_documento', 'planilha_complementar'];

// ─── Impactos econômicos detalhados (abas da planilha complementar) ──────────
var TIPOS_ECON = ['produtividade', 'reducao_custos', 'expansao', 'agregacao'];

function numND(v) {
  var n = Number(v);
  return (v === '' || v === null || v === undefined || isNaN(n)) ? 0 : n;
}

/** Número opcional: vazio é ok; senão precisa ser ≥0 (e ≤max se informado). */
function numOpcOk(v, max) {
  if (v === '' || v === null || v === undefined) return true;
  var n = Number(v);
  if (isNaN(n) || n < 0) return false;
  if (max !== undefined && n > max) return false;
  return true;
}

/** Reproduz as fórmulas da planilha para um bloco econômico. */
function calcularEconBloco(tipo, b) {
  b = b || {};
  var gu;
  if (tipo === 'produtividade') gu = (numND(b.atual) - numND(b.anterior)) * numND(b.preco) - numND(b.custo);
  else if (tipo === 'reducao_custos') gu = numND(b.anterior) - numND(b.atual);
  else gu = numND(b.atual) - numND(b.anterior); // expansao e agregacao
  var gl = gu * numND(b.participacao_idr) / 100;
  var ben = gl * numND(b.area);
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  return { ganho_unitario: r2(gu), ganho_liquido: r2(gl), beneficio: r2(ben) };
}

function validarParcerias(arr) {
  if (arr === undefined || arr === null) return null;
  if (!Array.isArray(arr)) return { erro: 'parcerias inválidas' };
  if (arr.length > 50) return { erro: 'número de parcerias excede o limite' };
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i] || {};
    if (!p.instituicao || String(p.instituicao).trim() === '') return { erro: 'parceria sem instituição', indice: i };
    if (String(p.instituicao).length > 300 || String(p.funcao || '').length > 300) return { erro: 'texto de parceria muito longo', indice: i };
    if (!numOpcOk(p.valor_investido)) return { erro: 'valor investido inválido em parceria', indice: i };
    if (!numOpcOk(p.participacao_pct, 100)) return { erro: 'participação (%) inválida em parceria', indice: i };
  }
  return null;
}

function validarEconDetalhe(obj) {
  if (obj === undefined || obj === null) return null;
  if (typeof obj !== 'object') return { erro: 'econ_detalhe inválido' };
  var campos = ['anterior', 'atual', 'preco', 'custo', 'area', 'outros_estados_ha', 'outros_paises_ha'];
  for (var t = 0; t < TIPOS_ECON.length; t++) {
    var b = obj[TIPOS_ECON[t]];
    if (!b) continue;
    for (var c = 0; c < campos.length; c++) {
      if (!numOpcOk(b[campos[c]])) return { erro: 'valor numérico inválido em econ_detalhe', tipo: TIPOS_ECON[t], campo: campos[c] };
    }
    if (!numOpcOk(b.participacao_idr, 100)) return { erro: 'participação IDR (%) inválida', tipo: TIPOS_ECON[t] };
    if (b.ano !== undefined && String(b.ano).length > 20) return { erro: 'ano inválido em econ_detalhe', tipo: TIPOS_ECON[t] };
  }
  return null;
}

/**
 * Monta as linhas da aba `econ_detalhe` (uma por tipo com dados) com os valores
 * calculados. Retorna { linhas, total } — total = benefício econômico somado.
 */
function montarEconDetalhe(obj) {
  obj = obj || {};
  var num = function (v) { return (v === '' || v === null || v === undefined) ? '' : Number(v); };
  var linhas = [];
  var total = 0;
  for (var t = 0; t < TIPOS_ECON.length; t++) {
    var tipo = TIPOS_ECON[t];
    var b = obj[tipo] || {};
    var temDados = ['anterior', 'atual', 'preco', 'custo', 'participacao_idr', 'area', 'outros_estados_ha', 'outros_paises_ha']
      .some(function (k) { return b[k] !== '' && b[k] !== null && b[k] !== undefined; });
    if (!temDados) continue;
    var calc = calcularEconBloco(tipo, b);
    total += calc.beneficio;
    linhas.push({
      tipo: tipo,
      ano: b.ano || '',
      anterior: num(b.anterior), atual: num(b.atual), preco: num(b.preco), custo: num(b.custo),
      ganho_unitario: calc.ganho_unitario,
      participacao_idr: num(b.participacao_idr), area: num(b.area),
      ganho_liquido: calc.ganho_liquido, beneficio: calc.beneficio,
      outros_estados_ha: num(b.outros_estados_ha), outros_paises_ha: num(b.outros_paises_ha)
    });
  }
  return { linhas: linhas, total: Math.round(total * 100) / 100 };
}

/** Normaliza e-mail p/ chave de rate-limit (Gmail: remove pontos e sufixo +tag). */
function normalizarEmail(email) {
  var s = String(email || '').trim().toLowerCase();
  var p = s.split('@');
  if (p.length !== 2) return s;
  var local = p[0].split('+')[0];
  var dominio = p[1];
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }
  return local + '@' + dominio;
}

/** Valida um array de strings contra um conjunto fechado. ≥1 item, sem desconhecidos. */
function validarSubconjunto(arr, permitidos) {
  if (!Array.isArray(arr) || arr.length < 1) return false;
  for (var i = 0; i < arr.length; i++) {
    if (permitidos.indexOf(arr[i]) < 0) return false;
  }
  return true;
}

/**
 * Valida uma grade contra a definição de aspectos/coeficientes esperados:
 *  - todo item tem aspecto/coeficiente conhecidos e valor na escala Ambitec;
 *  - cada par aspecto+coeficiente aparece no máximo uma vez (sem duplicatas);
 *  - TODOS os coeficientes esperados estão presentes (grade completa).
 * Retorna objeto de erro ou null.
 */
function validarGradeContra(grade, definicao, nome) {
  if (!Array.isArray(grade)) return { erro: 'grade ausente', campo: nome };

  var esperados = {};
  var totalEsperado = 0;
  for (var asp in definicao) {
    if (!definicao.hasOwnProperty(asp)) continue;
    definicao[asp].forEach(function (coef) { esperados[asp + '::' + coef] = true; totalEsperado++; });
  }

  var vistos = {};
  for (var i = 0; i < grade.length; i++) {
    var item = grade[i] || {};
    var chave = item.aspecto + '::' + item.coeficiente;
    if (!esperados[chave]) return { erro: 'coeficiente desconhecido na grade', campo: nome, indice: i };
    if (vistos[chave]) return { erro: 'coeficiente duplicado na grade', campo: nome, indice: i };
    if (!validarValorImpacto(item.valor)) return { erro: 'valor de impacto inválido', campo: nome, indice: i };
    vistos[chave] = true;
  }

  var totalVistos = 0;
  for (var k in vistos) { if (vistos.hasOwnProperty(k)) totalVistos++; }
  if (totalVistos !== totalEsperado) return { erro: 'grade incompleta (responda todos os coeficientes)', campo: nome };

  return null;
}
