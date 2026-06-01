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
