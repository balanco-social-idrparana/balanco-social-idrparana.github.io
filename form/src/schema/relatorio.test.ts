import { describe, expect, it } from 'vitest';
import { relatorioSchema, MAX_PARCERIAS, ItemGrade } from './relatorio';
import { GRADE_SOCIAL, GRADE_AMBIENTAL, GrupoGrade } from '../data/grades';

function gradeCompleta(grupos: GrupoGrade[]): ItemGrade[] {
  return grupos.flatMap((g) =>
    g.coeficientes.map((c) => ({ aspecto: g.aspecto, coeficiente: c, valor: '0' as const }))
  );
}

function relatorioValido() {
  return {
    email: 'servidor@idr.pr.gov.br',
    responsavel: 'Fulano de Tal',
    titulo: 'Tecnologia X',
    diretoria_departamento: 'DEX/DAT',
    programa_projeto: 'Programa Y',
    coordenacao_equipe: 'Coordenador Z e equipe',
    ano_tecnologia: '2020',
    eixos: ['Competitividade e renda'],
    ods: ['1. Erradicação da pobreza'],
    resumo: 'Resumo da ação.',
    abrangencia_geografica: 'Paraná',
    impactos_gerais: 'Impactos gerais.',
    econ_produtividade: 'Texto.',
    econ_reducao_custos: 'Texto.',
    econ_expansao_area: 'Texto.',
    econ_agregacao_valor: 'Texto.',
    econ_memoria_calculo: 'Texto.',
    econ_fontes: 'Texto.',
    parcerias: [],
    econ_detalhe: {
      produtividade: { ano: '2025' },
      reducao_custos: { ano: '2025' },
      expansao: { ano: '2025' },
      agregacao: { ano: '2025' },
    },
    social_emprego_desc: 'Texto.',
    social_renda_desc: 'Texto.',
    social_bemestar_desc: 'Texto.',
    social_gestao_desc: 'Texto.',
    social_conclusao: 'Texto.',
    grade_social: gradeCompleta(GRADE_SOCIAL),
    amb_eficiencia_desc: 'Texto.',
    amb_conservacao_desc: 'Texto.',
    amb_recuperacao_desc: 'Texto.',
    amb_bemestar_animal_desc: 'Texto.',
    amb_qualidade_produto_desc: 'Texto.',
    amb_conclusao: 'Texto.',
    grade_ambiental: gradeCompleta(GRADE_AMBIENTAL),
    publicacoes: '',
  };
}

describe('relatorioSchema', () => {
  it('aceita um relatório completo válido', () => {
    const r = relatorioSchema.safeParse(relatorioValido());
    expect(r.success, JSON.stringify(!r.success ? r.error.issues : null)).toBe(true);
  });

  it('aceita textos entre 3.000 e 8.000 (compatibilidade com relatórios legados)', () => {
    // 3.000 é recomendação de UI; a validação rígida (espelha o backend) é 8.000.
    // Reeditar um relatório antigo com 5.000 chars não pode ser bloqueado.
    const texto = 'x'.repeat(5000);
    const dados = { ...relatorioValido(), resumo: texto, econ_memoria_calculo: texto };
    expect(relatorioSchema.safeParse(dados).success).toBe(true);
  });

  it('rejeita texto acima do teto rígido de 8.000 caracteres', () => {
    const dados = { ...relatorioValido(), resumo: 'x'.repeat(8001) };
    const r = relatorioSchema.safeParse(dados);
    expect(r.success).toBe(false);
    expect(JSON.stringify(!r.success ? r.error.issues : null)).toContain('8.000');
  });

  it(`rejeita mais de ${MAX_PARCERIAS} parcerias (espelha o backend)`, () => {
    const parceria = { instituicao: 'Instituição', funcao: '' };
    const ok = { ...relatorioValido(), parcerias: Array(MAX_PARCERIAS).fill(parceria) };
    expect(relatorioSchema.safeParse(ok).success).toBe(true);
    const demais = { ...relatorioValido(), parcerias: Array(MAX_PARCERIAS + 1).fill(parceria) };
    expect(relatorioSchema.safeParse(demais).success).toBe(false);
  });

  it('rejeita instituição de parceria com mais de 300 caracteres', () => {
    const dados = {
      ...relatorioValido(),
      parcerias: [{ instituicao: 'x'.repeat(301), funcao: '' }],
    };
    expect(relatorioSchema.safeParse(dados).success).toBe(false);
  });

  it('rejeita grade incompleta (coeficiente sem resposta)', () => {
    const dados = { ...relatorioValido(), grade_social: gradeCompleta(GRADE_SOCIAL).slice(1) };
    const r = relatorioSchema.safeParse(dados);
    expect(r.success).toBe(false);
    expect(JSON.stringify(!r.success ? r.error.issues : null)).toContain('faltando');
  });

  it('rejeita valor fora da escala Ambitec', () => {
    const grade = gradeCompleta(GRADE_SOCIAL);
    (grade[0] as { valor: string }).valor = '2';
    const dados = { ...relatorioValido(), grade_social: grade };
    expect(relatorioSchema.safeParse(dados).success).toBe(false);
  });
});
