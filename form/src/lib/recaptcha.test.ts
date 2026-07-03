// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão do bug: uma falha transitória ao carregar o script do reCAPTCHA
 * ficava cacheada (promise rejeitada na variável de módulo) e TODOS os envios
 * seguintes falhavam até recarregar a página.
 */
describe('carregarRecaptcha', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    delete (window as { grecaptcha?: unknown }).grecaptcha;
  });

  async function importarModulo() {
    return import('./recaptcha');
  }

  function scriptInjetado(): HTMLScriptElement | null {
    return document.head.querySelector('script[src*="recaptcha"]');
  }

  it('após falha de carregamento, a próxima tentativa injeta o script de novo', async () => {
    const { carregarRecaptcha } = await importarModulo();

    const p1 = carregarRecaptcha();
    const s1 = scriptInjetado();
    expect(s1).not.toBeNull();
    s1!.onerror!(new Event('error'));
    await expect(p1).rejects.toThrow('falha ao carregar');

    // Segunda tentativa NÃO pode reusar a promise rejeitada.
    const p2 = carregarRecaptcha();
    const s2 = scriptInjetado();
    expect(s2).not.toBeNull();
    expect(s2).not.toBe(s1);
    (window as { grecaptcha?: unknown }).grecaptcha = { ready: (cb: () => void) => cb(), execute: vi.fn() };
    s2!.onload!(new Event('load'));
    await expect(p2).resolves.toBeUndefined();
  });

  it('chamadas simultâneas compartilham o mesmo carregamento', async () => {
    const { carregarRecaptcha } = await importarModulo();
    const p1 = carregarRecaptcha();
    const p2 = carregarRecaptcha();
    expect(document.head.querySelectorAll('script').length).toBe(1);
    (window as { grecaptcha?: unknown }).grecaptcha = { ready: (cb: () => void) => cb(), execute: vi.fn() };
    scriptInjetado()!.onload!(new Event('load'));
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
  });
});
