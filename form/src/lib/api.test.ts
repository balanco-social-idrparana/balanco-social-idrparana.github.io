// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  arquivoParaAnexo, bytesDeBase64, inferirMime, postar,
  enviarRelatorio, listar2024, carregar2024, MAX_FILE_BYTES, MAX_ANEXOS, AnexoPayload,
} from './api';

// reCAPTCHA depende do script do Google (indisponível em teste); devolve um token fixo.
vi.mock('./recaptcha', () => ({
  executarRecaptcha: vi.fn(async (action: string) => `token-${action}`),
}));

function anexoFake(nome: string): AnexoPayload {
  return { tipo: 'foto_documento', nome, mime: 'application/pdf', base64: btoa('%PDF-1.4') };
}

describe('bytesDeBase64', () => {
  it('calcula bytes reais descontando padding', () => {
    for (const texto of ['a', 'ab', 'abc', 'abcd', 'um texto maior']) {
      const b64 = Buffer.from(texto).toString('base64');
      expect(bytesDeBase64(b64)).toBe(texto.length);
    }
    expect(bytesDeBase64('')).toBe(0);
  });
});

describe('inferirMime', () => {
  it('mapeia extensões conhecidas', () => {
    expect(inferirMime('a.pdf')).toBe('application/pdf');
    expect(inferirMime('a.JPG')).toBe('image/jpeg');
    expect(inferirMime('a.jpeg')).toBe('image/jpeg');
    expect(inferirMime('a.png')).toBe('image/png');
    expect(inferirMime('a.xlsx')).toContain('spreadsheetml');
    expect(inferirMime('a.xls')).toBe('application/vnd.ms-excel');
    expect(inferirMime('a.exe')).toBe('');
  });
});

describe('arquivoParaAnexo', () => {
  it('aceita PDF sem MIME declarado (fallback por extensão)', async () => {
    // Navegadores às vezes não informam o type — era rejeitado antes.
    const f = new File(['%PDF-1.4 conteudo'], 'doc.pdf', { type: '' });
    const anexo = await arquivoParaAnexo('foto_documento', f);
    expect(anexo.mime).toBe('application/pdf');
    expect(anexo.nome).toBe('doc.pdf');
    expect(Buffer.from(anexo.base64, 'base64').toString()).toBe('%PDF-1.4 conteudo');
  });

  it('rejeita tipo não permitido', async () => {
    const f = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    await expect(arquivoParaAnexo('foto_documento', f)).rejects.toThrow('não permitido');
  });

  it('rejeita planilha no lugar de foto/documento', async () => {
    const f = new File(['PK'], 'dados.xlsx', { type: '' });
    await expect(arquivoParaAnexo('foto_documento', f)).rejects.toThrow('não permitido');
  });

  it('rejeita arquivo acima de 10 MB', async () => {
    const f = new File(['pequeno'], 'foto.png', { type: 'image/png' });
    Object.defineProperty(f, 'size', { value: MAX_FILE_BYTES + 1 });
    await expect(arquivoParaAnexo('foto_documento', f)).rejects.toThrow('excede 10 MB');
  });
});

describe('postar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('aborta com mensagem amigável quando o servidor não responde (timeout)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })
    ));
    const promessa = postar({ acao: 'enviar' });
    const expectativa = expect(promessa).rejects.toThrow('Tempo de envio esgotado');
    await vi.advanceTimersByTimeAsync(60_001);
    await expectativa;
  });

  it('converte falha de rede em mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(postar({})).rejects.toThrow('Falha de conexão');
  });

  it('resposta não-JSON vira erro tratado (não exceção)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ text: () => Promise.resolve('<html>erro</html>') })
    ));
    const r = await postar<{ ok: boolean; erro?: string }>({});
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('resposta inválida do servidor');
  });
});

describe('reaproveitamento de 2024', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('listar2024 envia a ação correta e devolve os itens', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, itens: [{ id: 'BS2024-001', titulo: 'Uva' }] })) })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const r = await listar2024('  Autor@IDR.pr.gov.br ');
    expect(r.ok).toBe(true);
    expect(r.itens?.[0].id).toBe('BS2024-001');
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.acao).toBe('listar2024');
    expect(body.email).toBe('Autor@IDR.pr.gov.br'); // trim aplicado
    expect(body.recaptcha_token).toBe('token-carregar_bs');
  });

  it('carregar2024 envia id + e-mail e devolve os dados', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, dados: { titulo: 'Uva' } })) })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const r = await carregar2024('BS2024-001', 'autor@idr.pr.gov.br');
    expect(r.ok).toBe(true);
    expect(r.dados?.titulo).toBe('Uva');
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.acao).toBe('carregar2024');
    expect(body.id).toBe('BS2024-001');
  });
});

describe('enviarRelatorio: guarda de MAX_ANEXOS (espelha o backend)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('recusa mais de 10 anexos antes de tocar reCAPTCHA/rede', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const anexos = Array.from({ length: MAX_ANEXOS + 1 }, (_, i) => anexoFake(`f${i}.pdf`));
    const r = await enviarRelatorio({} as never, anexos);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(String(MAX_ANEXOS));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
