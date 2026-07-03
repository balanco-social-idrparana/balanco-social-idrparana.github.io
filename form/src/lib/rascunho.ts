import type { RelatorioInput } from '../schema/relatorio';

/**
 * Rascunho automático do formulário em localStorage. O formulário leva ~1h para
 * preencher; sem isto um F5 acidental descartaria tudo. Anexos NÃO são
 * persistidos (base64 estouraria a cota de ~5 MB do localStorage).
 */

export interface EdicaoRascunho {
  protocolo: string;
  versao: number;
}

export interface RascunhoSalvo {
  values: Partial<RelatorioInput>;
  edicao: EdicaoRascunho | null;
  salvoEm: number;
}

const CHAVE = 'bs2025:rascunho:v1';
/** Rascunhos além disso são descartados: contêm dados pessoais e o formulário
 *  pode estar numa estação compartilhada. */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storagePadrao(): StorageLike | null {
  // localStorage pode lançar em modo privado/iframe com cookies bloqueados.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function salvarRascunho(
  values: Partial<RelatorioInput>,
  edicao: EdicaoRascunho | null,
  storage: StorageLike | null = storagePadrao()
): void {
  if (!storage) return;
  const registro: RascunhoSalvo = { values, edicao, salvoEm: Date.now() };
  try {
    storage.setItem(CHAVE, JSON.stringify(registro));
  } catch {
    // Cota cheia/modo privado: rascunho é melhor esforço, nunca derruba o form.
  }
}

export function lerRascunho(
  storage: StorageLike | null = storagePadrao()
): RascunhoSalvo | null {
  if (!storage) return null;
  try {
    const bruto = storage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as RascunhoSalvo;
    if (!r || typeof r !== 'object' || !r.values || typeof r.values !== 'object') return null;
    const salvoEm = typeof r.salvoEm === 'number' ? r.salvoEm : 0;
    // Rascunho vencido: descarta e não restaura (dados pessoais em máquina
    // possivelmente compartilhada).
    if (!salvoEm || Date.now() - salvoEm > VALIDADE_MS) {
      limparRascunho(storage);
      return null;
    }
    return {
      values: r.values,
      edicao: r.edicao && r.edicao.protocolo ? r.edicao : null,
      salvoEm,
    };
  } catch {
    return null;
  }
}

/**
 * Há rascunho de um relatório NOVO (não uma edição) pendente? Usado para
 * confirmar antes de descartá-lo ao carregar outro protocolo. Vale mesmo para
 * rascunho restaurado de outra sessão (em que o formulário não está "dirty").
 */
export function temRascunhoNovoPendente(storage: StorageLike | null = storagePadrao()): boolean {
  const r = lerRascunho(storage);
  return Boolean(r && !r.edicao);
}

export function limparRascunho(storage: StorageLike | null = storagePadrao()): void {
  if (!storage) return;
  try {
    storage.removeItem(CHAVE);
  } catch {
    // idem: melhor esforço
  }
}
