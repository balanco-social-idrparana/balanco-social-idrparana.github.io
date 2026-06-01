// Configuração dos blocos de impacto econômico detalhado, espelhando as abas da
// "Planilha Complementar BS 2025" (Incremento de Produtividade, Redução de
// Custos, Expansão da Produção, Agregação de Valor). As fórmulas reproduzem as
// da planilha. Fonte de verdade compartilhada com o backend (Apps Script).

export type TipoEcon = 'produtividade' | 'reducao_custos' | 'expansao' | 'agregacao';

export interface BlocoEcon {
  tipo: TipoEcon;
  titulo: string;
  subtitulo: string;
  labelAnterior: string;
  labelAtual: string;
  /** apenas Incremento de Produtividade usa preço unitário e custo adicional */
  temPrecoCusto: boolean;
  labelPreco?: string;
  labelCusto?: string;
  labelGanhoUnitario: string;
  labelArea: string;
}

export const BLOCOS_ECON: BlocoEcon[] = [
  {
    tipo: 'produtividade',
    titulo: 'Impacto por Incremento de Produtividade',
    subtitulo: 'Ganhos líquidos unitários',
    labelAnterior: 'Rendimento anterior (kg/ha)',
    labelAtual: 'Rendimento atual (kg/ha)',
    temPrecoCusto: true,
    labelPreco: 'Preço unitário (R$/kg)',
    labelCusto: 'Custo adicional (R$/ha)',
    labelGanhoUnitario: 'Ganho unitário (R$/ha)',
    labelArea: 'Área estimada de adoção (ha)',
  },
  {
    tipo: 'reducao_custos',
    titulo: 'Impacto por Redução de Custos',
    subtitulo: 'Ganhos unitários de redução de custos',
    labelAnterior: 'Custo anterior (R$/ha)',
    labelAtual: 'Custo atual (R$/ha)',
    temPrecoCusto: false,
    labelGanhoUnitario: 'Economia obtida (R$/ha)',
    labelArea: 'Área estimada de adoção (ha)',
  },
  {
    tipo: 'expansao',
    titulo: 'Impacto por Expansão da Produção em Novas Áreas',
    subtitulo: 'Ganhos unitários de renda',
    labelAnterior: 'Renda anterior (R$/ha)',
    labelAtual: 'Renda atual (R$/ha)',
    temPrecoCusto: false,
    labelGanhoUnitario: 'Renda obtida (R$/ha)',
    labelArea: 'Área estimada de expansão (ha)',
  },
  {
    tipo: 'agregacao',
    titulo: 'Impacto por Agregação de Valor',
    subtitulo: 'Ganhos unitários de renda por agregação de valor',
    labelAnterior: 'Renda com produto sem agregação de valor (R$/kg)',
    labelAtual: 'Renda com produto com agregação de valor (R$/kg)',
    temPrecoCusto: false,
    labelGanhoUnitario: 'Renda obtida (R$/kg)',
    labelArea: 'Produção estimada (kg)',
  },
];

export interface ValoresBloco {
  ano?: string;
  anterior?: number;
  atual?: number;
  preco?: number;
  custo?: number;
  participacao_idr?: number;
  area?: number;
  outros_estados_ha?: number;
  outros_paises_ha?: number;
}

const n = (v: number | undefined): number => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

/** Reproduz as fórmulas da planilha para um bloco econômico. */
export function calcularEcon(tipo: TipoEcon, v: ValoresBloco) {
  let ganhoUnitario: number;
  if (tipo === 'produtividade') {
    ganhoUnitario = (n(v.atual) - n(v.anterior)) * n(v.preco) - n(v.custo);
  } else if (tipo === 'reducao_custos') {
    ganhoUnitario = n(v.anterior) - n(v.atual); // economia
  } else {
    ganhoUnitario = n(v.atual) - n(v.anterior); // renda obtida (expansão e agregação)
  }
  const ganhoLiquido = (ganhoUnitario * n(v.participacao_idr)) / 100;
  const beneficio = ganhoLiquido * n(v.area);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { ganhoUnitario: r2(ganhoUnitario), ganhoLiquido: r2(ganhoLiquido), beneficio: r2(beneficio) };
}

export function formatarBRL(x: number): string {
  return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
