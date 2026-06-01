import { z } from 'zod';
import { EIXOS_ESTRATEGICOS, ODS } from '../data/eixos';
import {
  VALORES_IMPACTO,
  GRADE_SOCIAL,
  GRADE_AMBIENTAL,
  GrupoGrade,
} from '../data/grades';

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

const valorImpactoSchema = z.enum(VALORES_IMPACTO);

const itemGradeSchema = z.object({
  aspecto: z.string().min(1),
  coeficiente: z.string().min(1),
  valor: valorImpactoSchema,
});

export type ItemGrade = z.infer<typeof itemGradeSchema>;

const textoObrig = (rotulo: string, max = 8000) =>
  z.string().trim().min(1, `${rotulo} é obrigatório`).max(max);

const textoOpc = (max = 8000) => z.string().trim().max(max).optional().default('');

/**
 * Garante que a grade contém exatamente uma resposta para cada coeficiente
 * esperado (nenhum faltando, nenhum desconhecido). `NA` conta como resposta.
 */
function gradeCompleta(grupos: GrupoGrade[]) {
  const esperados = new Set<string>();
  grupos.forEach((g) => g.coeficientes.forEach((c) => esperados.add(g.aspecto + '::' + c)));
  return (itens: ItemGrade[], ctx: z.RefinementCtx) => {
    const vistos = new Set<string>();
    for (const it of itens) {
      const chave = it.aspecto + '::' + it.coeficiente;
      if (!esperados.has(chave)) {
        ctx.addIssue({ code: 'custom', message: `coeficiente desconhecido: ${it.coeficiente}` });
      }
      vistos.add(chave);
    }
    for (const chave of esperados) {
      if (!vistos.has(chave)) {
        ctx.addIssue({ code: 'custom', message: `responda todos os itens da grade (faltando: ${chave.split('::')[1]})` });
      }
    }
  };
}

// ─── Schema principal ────────────────────────────────────────────────────────

export const relatorioSchema = z.object({
  // Identificação
  email: z.string().trim().email('e-mail inválido').max(254),
  responsavel: textoObrig('Nome do responsável', 200),
  titulo: textoObrig('Título da ação ou tecnologia', 300),
  diretoria_departamento: textoObrig('Diretoria e departamento', 300),
  programa_projeto: textoObrig('Programa/projeto', 300),
  coordenacao_equipe: textoObrig('Coordenação/responsável e equipe'),
  ano_tecnologia: z.string().trim().max(50).optional().default(''),

  // Descrição técnica
  eixos: z.array(z.enum(EIXOS_ESTRATEGICOS)).min(1, 'selecione ao menos um eixo estratégico'),
  ods: z.array(z.enum(ODS)).min(1, 'selecione ao menos um ODS'),
  resumo: textoObrig('Resumo descritivo'),
  abrangencia_geografica: textoObrig('Abrangência geográfica'),
  parcerias_confirmado: z.literal(true, { message: 'confirme o preenchimento da aba "Parcerias" na planilha' }),

  // Impactos gerais
  impactos_gerais: textoObrig('Impactos gerais na cadeia produtiva ou área'),

  // Econômicos
  econ_produtividade: textoObrig('Incremento de produtividade'),
  econ_reducao_custos: textoObrig('Redução de custos'),
  econ_expansao_area: textoObrig('Expansão da produção em novas áreas'),
  econ_agregacao_valor: textoObrig('Agregação de valor'),
  econ_memoria_calculo: textoObrig('Memória de cálculo'),
  econ_fontes: textoObrig('Fontes de dados'),

  // Sociais (texto + grade)
  social_emprego_desc: textoObrig('Aspecto Emprego (descrição)'),
  social_renda_desc: textoObrig('Aspecto Renda (descrição)'),
  social_bemestar_desc: textoObrig('Aspecto Bem-estar e Saúde (descrição)'),
  social_gestao_desc: textoObrig('Aspecto Gestão e Administração (descrição)'),
  social_conclusao: textoObrig('Conclusão dos impactos sociais'),
  grade_social: z.array(itemGradeSchema).superRefine(gradeCompleta(GRADE_SOCIAL)),

  // Ambientais (texto + grade)
  amb_eficiencia_desc: textoObrig('Aspecto Eficiência Tecnológica (descrição)'),
  amb_conservacao_desc: textoObrig('Aspecto Conservação Ambiental (descrição)'),
  amb_recuperacao_desc: textoObrig('Aspecto Recuperação Ambiental (descrição)'),
  amb_bemestar_animal_desc: textoObrig('Aspecto Bem-estar e Saúde Animal (descrição)'),
  amb_qualidade_produto_desc: textoObrig('Aspecto Qualidade do Produto (descrição)'),
  amb_conclusao: textoObrig('Conclusão dos impactos ambientais'),
  grade_ambiental: z.array(itemGradeSchema).superRefine(gradeCompleta(GRADE_AMBIENTAL)),

  // Publicações
  publicacoes: textoOpc(),

  // Anti-bot: honeypot. A validação real ocorre no backend (descarta se vier
  // preenchido). O Zod não falha aqui por causa de autopreenchimento.
  website_url: z.string().optional().default(''),
});

export type Relatorio = z.output<typeof relatorioSchema>;
export type RelatorioInput = z.input<typeof relatorioSchema>;

// Constrói as entradas iniciais da grade (sem valor selecionado ainda).
// O App mantém o estado e só inclui itens já respondidos no submit; a validação
// `gradeCompleta` exige que todos estejam respondidos no envio.
export const valoresPadrao: Partial<RelatorioInput> = {
  ano_tecnologia: '',
  eixos: [],
  ods: [],
  grade_social: [],
  grade_ambiental: [],
  publicacoes: '',
  website_url: '',
  parcerias_confirmado: false as unknown as true,
};
