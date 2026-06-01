// Coeficientes das grades de impacto (metodologia Ambitec-Agro), extraídos do
// Formulário de Relatório de Impactos para o Balanço Social 2025 (IDR-Paraná).
// Fonte de verdade compartilhada entre o formulário e a validação. Os rótulos
// dos coeficientes são gravados literalmente na planilha (coluna `coeficiente`).

/** Valores possíveis de cada coeficiente. 'NA' = "Não se aplica". */
export const VALORES_IMPACTO = ['-3', '-1', '0', '1', '3', 'NA'] as const;
export type ValorImpacto = (typeof VALORES_IMPACTO)[number];

/** Rótulos para exibição na grade (colunas). */
export const ESCALA_IMPACTO: { valor: ValorImpacto; rotulo: string }[] = [
  { valor: '-3', rotulo: '-3' },
  { valor: '-1', rotulo: '-1' },
  { valor: '0', rotulo: '0' },
  { valor: '1', rotulo: '+1' },
  { valor: '3', rotulo: '+3' },
  { valor: 'NA', rotulo: 'Não se aplica' },
];

export interface GrupoGrade {
  /** chave estável gravada na planilha (coluna `aspecto`) */
  aspecto: string;
  /** título exibido na seção */
  titulo: string;
  /** rótulos dos coeficientes (linhas da grade) */
  coeficientes: string[];
}

export const GRADE_SOCIAL: GrupoGrade[] = [
  {
    aspecto: 'emprego',
    titulo: 'Emprego',
    coeficientes: [
      'Capacitação',
      'Oportunidade de emprego local qualificado',
      'Oferta de emprego',
      'Qualidade do emprego',
    ],
  },
  {
    aspecto: 'renda',
    titulo: 'Renda',
    coeficientes: [
      'Geração de renda do estabelecimento',
      'Diversidade de fontes de renda',
      'Valor da propriedade',
    ],
  },
  {
    aspecto: 'bemestar',
    titulo: 'Bem-estar e Saúde',
    coeficientes: [
      'Saúde ambiental e pessoal',
      'Segurança e saúde ocupacional',
      'Segurança alimentar',
    ],
  },
  {
    aspecto: 'gestao',
    titulo: 'Gestão e Administração',
    coeficientes: [
      'Dedicação e perfil do responsável',
      'Condição de comercialização',
      'Reciclagem de resíduos',
      'Relacionamento institucional',
      'Capital social (agroindústria)',
    ],
  },
];

export const GRADE_AMBIENTAL: GrupoGrade[] = [
  {
    aspecto: 'eficiencia',
    titulo: 'Eficiência Tecnológica',
    coeficientes: [
      'Uso de agroquímicos (inseticidas, fungicidas e herbicidas)',
      'Uso de fertilizantes e corretivos',
      'Insumos veterinários (medicamentos e vacinas)',
      'Produtos para alimentação animal',
      'Uso de energia',
      'Uso de recursos naturais - água',
      'Uso de recursos naturais - solo (área de produção)',
      'Uso de matérias-primas e aditivos na agroindústria',
    ],
  },
  {
    aspecto: 'conservacao',
    titulo: 'Conservação Ambiental',
    coeficientes: [
      'Qualidade da atmosfera',
      'Capacidade produtiva do solo',
      'Qualidade da água',
      'Geração de resíduos sólidos',
      'Biodiversidade',
    ],
  },
  {
    aspecto: 'recuperacao',
    titulo: 'Recuperação Ambiental',
    coeficientes: [
      'Recuperação de solos degradados',
      'Recuperação de ecossistemas degradados',
      'Recomposição de áreas de preservação permanente',
      'Reserva legal',
    ],
  },
  {
    aspecto: 'bemestar_animal',
    titulo: 'Bem-estar e Saúde Animal',
    coeficientes: [
      'Conforto térmico',
      'Acesso a fontes de água',
      'Acesso a fontes de suplementos alimentares',
      'Conduta ética de abate ou descarte',
    ],
  },
  {
    aspecto: 'qualidade_produto',
    titulo: 'Qualidade do Produto',
    coeficientes: [
      'Presença de aditivos em produto de origem animal ou vegetal in natura',
      'Resíduos químicos em produto de origem animal ou vegetal in natura',
      'Contaminantes biológicos em produto de origem animal ou vegetal in natura',
      'Presença de aditivos em produto agroindustrial ou na cadeia',
      'Resíduos químicos em produto agroindustrial ou na cadeia',
      'Contaminantes biológicos em produto agroindustrial ou na cadeia',
    ],
  },
];

/** Todos os grupos, com a dimensão a que pertencem. */
export const TODAS_GRADES: { dimensao: 'social' | 'ambiental'; grupo: GrupoGrade }[] = [
  ...GRADE_SOCIAL.map((grupo) => ({ dimensao: 'social' as const, grupo })),
  ...GRADE_AMBIENTAL.map((grupo) => ({ dimensao: 'ambiental' as const, grupo })),
];

/** Número total de coeficientes esperados por dimensão (para validação). */
export const TOTAL_COEF_SOCIAL = GRADE_SOCIAL.reduce((n, g) => n + g.coeficientes.length, 0);
export const TOTAL_COEF_AMBIENTAL = GRADE_AMBIENTAL.reduce((n, g) => n + g.coeficientes.length, 0);
