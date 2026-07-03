import { describe, expect, it } from 'vitest';
import { lerRascunho, limparRascunho, salvarRascunho, temRascunhoNovoPendente } from './rascunho';
import type { RelatorioInput } from '../schema/relatorio';

function storageFake(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    _dados: dados,
  };
}

const values = { titulo: 'Ação X', email: 'a@b.gov.br' } as Partial<RelatorioInput>;

describe('rascunho', () => {
  it('salva e restaura o round-trip completo', () => {
    const st = storageFake();
    salvarRascunho(values, { protocolo: 'BS2025-20260101-000000-1234', versao: 2 }, st);
    const r = lerRascunho(st);
    expect(r).not.toBeNull();
    expect(r!.values.titulo).toBe('Ação X');
    expect(r!.edicao).toEqual({ protocolo: 'BS2025-20260101-000000-1234', versao: 2 });
    expect(r!.salvoEm).toBeGreaterThan(0);
  });

  it('limpar remove o rascunho', () => {
    const st = storageFake();
    salvarRascunho(values, null, st);
    limparRascunho(st);
    expect(lerRascunho(st)).toBeNull();
  });

  it('JSON corrompido não derruba o formulário (retorna null)', () => {
    const st = storageFake({ 'bs2025:rascunho:v1': '{corrompido' });
    expect(lerRascunho(st)).toBeNull();
  });

  it('registro sem values é descartado', () => {
    const st = storageFake({ 'bs2025:rascunho:v1': JSON.stringify({ salvoEm: 1 }) });
    expect(lerRascunho(st)).toBeNull();
  });

  it('edicao inválida degrada para null (novo relatório)', () => {
    const st = storageFake({
      'bs2025:rascunho:v1': JSON.stringify({ values, edicao: { versao: 1 }, salvoEm: Date.now() }),
    });
    expect(lerRascunho(st)!.edicao).toBeNull();
  });

  it('rascunho vencido (>7 dias) é descartado e removido do storage', () => {
    const st = storageFake({
      'bs2025:rascunho:v1': JSON.stringify({ values, edicao: null, salvoEm: Date.now() - 8 * 24 * 3600 * 1000 }),
    });
    expect(lerRascunho(st)).toBeNull();
    expect(st._dados.has('bs2025:rascunho:v1')).toBe(false); // limpo
  });

  it('rascunho recente (dentro de 7 dias) é restaurado', () => {
    const st = storageFake();
    salvarRascunho(values, null, st);
    expect(lerRascunho(st)).not.toBeNull();
  });

  it('temRascunhoNovoPendente: true para rascunho de relatório novo', () => {
    const st = storageFake();
    expect(temRascunhoNovoPendente(st)).toBe(false); // vazio
    salvarRascunho(values, null, st); // relatório novo
    expect(temRascunhoNovoPendente(st)).toBe(true);
  });

  it('temRascunhoNovoPendente: false para rascunho de EDIÇÃO (não é relatório novo)', () => {
    const st = storageFake();
    salvarRascunho(values, { protocolo: 'BS2025-20260101-000000-1234', versao: 1 }, st);
    expect(temRascunhoNovoPendente(st)).toBe(false);
  });

  it('temRascunhoNovoPendente: false quando o rascunho venceu (cross-session > 7 dias)', () => {
    const st = storageFake({
      'bs2025:rascunho:v1': JSON.stringify({ values, edicao: null, salvoEm: Date.now() - 8 * 24 * 3600 * 1000 }),
    });
    expect(temRascunhoNovoPendente(st)).toBe(false);
  });

  it('storage indisponível ou cheio nunca lança', () => {
    const quebrado = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('cheio'); },
      removeItem: () => { throw new Error('bloqueado'); },
    };
    expect(() => salvarRascunho(values, null, quebrado)).not.toThrow();
    expect(lerRascunho(quebrado)).toBeNull();
    expect(() => limparRascunho(quebrado)).not.toThrow();
    expect(() => salvarRascunho(values, null, null)).not.toThrow();
    expect(lerRascunho(null)).toBeNull();
  });
});
