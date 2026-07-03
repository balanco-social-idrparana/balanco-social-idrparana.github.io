import type { Relatorio, RelatorioInput } from '../schema/relatorio';
import { executarRecaptcha } from './recaptcha';

const API_URL = import.meta.env.VITE_API_URL as string;

// MIME aceitos: planilha (xlsx/xls), PDF e imagens (fotos/documentos).
export const MIME_PLANILHA = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];
export const MIME_FOTO_DOC = ['application/pdf', 'image/jpeg', 'image/png'];

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
export const MAX_ANEXOS = 10; // nº máximo de arquivos por envio (espelha o backend)
// 32 MB no envio inteiro (espelha o backend). O payload viaja como base64 em
// JSON (~33% maior), então o total decodificado precisa ficar folgadamente
// abaixo do teto de ~50 MB por requisição do Apps Script.
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_MB = Math.round(MAX_TOTAL_BYTES / (1024 * 1024));

/** Tempo máximo de espera (base para consultas rápidas como 'carregar'). */
const TIMEOUT_BASE_MS = 60_000;
/** Folga adicional por MB de anexos: upload lento + decode + gravação no backend. */
const TIMEOUT_POR_MB_MS = 15_000;
const TIMEOUT_MAX_MS = 300_000;

function timeoutParaBytes(totalBytes: number): number {
  const mb = totalBytes / (1024 * 1024);
  return Math.min(TIMEOUT_MAX_MS, TIMEOUT_BASE_MS + Math.ceil(mb) * TIMEOUT_POR_MB_MS);
}

export function bytesDeBase64(b: string): number {
  if (!b) return 0;
  let pad = 0;
  if (b.endsWith('==')) pad = 2;
  else if (b.endsWith('=')) pad = 1;
  return Math.floor((b.length * 3) / 4) - pad;
}

export type TipoAnexo = 'planilha_complementar' | 'foto_documento';

export interface AnexoPayload {
  tipo: TipoAnexo;
  nome: string;
  mime: string;
  base64: string;
}

/** Lê o arquivo como base64 sem bloquear a interface (FileReader é assíncrono). */
function lerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const virgula = url.indexOf(',');
      if (virgula < 0) reject(new Error(`Falha ao ler "${file.name}". Tente novamente.`));
      else resolve(url.slice(virgula + 1));
    };
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}". Tente novamente.`));
    reader.readAsDataURL(file);
  });
}

export function inferirMime(nome: string): string {
  if (/\.xlsx$/i.test(nome)) return MIME_PLANILHA[0];
  if (/\.xls$/i.test(nome)) return MIME_PLANILHA[1];
  if (/\.pdf$/i.test(nome)) return 'application/pdf';
  if (/\.(jpe?g)$/i.test(nome)) return 'image/jpeg';
  if (/\.png$/i.test(nome)) return 'image/png';
  return '';
}

export async function arquivoParaAnexo(tipo: TipoAnexo, file: File): Promise<AnexoPayload> {
  const permitidos = tipo === 'planilha_complementar' ? MIME_PLANILHA : MIME_FOTO_DOC;
  const porExtensao = inferirMime(file.name);
  // Alguns navegadores não informam o MIME (ou informam um genérico); a extensão
  // cobre esses casos. Para planilhas a extensão prevalece, pois .xls/.xlsx
  // chegam com MIME genérico com frequência. O backend confere os magic bytes.
  let mime = file.type || porExtensao;
  if (tipo === 'planilha_complementar' && MIME_PLANILHA.includes(porExtensao)) {
    mime = porExtensao;
  }
  if (!permitidos.includes(mime)) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type || file.name}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Arquivo "${file.name}" excede 10 MB`);
  }
  return {
    tipo,
    nome: file.name,
    mime,
    base64: await lerComoBase64(file),
  };
}

export interface RespostaEnvio {
  ok: boolean;
  protocolo?: string;
  versao?: number;
  mensagem?: string;
  erro?: string;
  campos?: string[];
  _status?: number;
}

export interface RespostaCarregar {
  ok: boolean;
  protocolo?: string;
  versao?: number;
  dados?: RelatorioInput;
  erro?: string;
  _status?: number;
}

// text/plain evita preflight CORS — Apps Script aceita JSON cru.
export async function postar<T>(payload: unknown, timeoutMs = TIMEOUT_BASE_MS): Promise<T> {
  if (!API_URL) throw new Error('VITE_API_URL não configurado');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controle.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error(
        'Tempo de envio esgotado. O relatório PODE ter sido recebido — antes de ' +
        'reenviar, use "Já enviou um relatório? Editar usando o protocolo" com o seu ' +
        'e-mail para conferir e evitar duplicidade.'
      );
    }
    throw new Error('Falha de conexão com o servidor. Verifique sua internet e tente novamente.');
  } finally {
    clearTimeout(timer);
  }
  const txt = await r.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    return { ok: false, erro: 'resposta inválida do servidor' } as T;
  }
}

async function enviarComAcao(
  acao: 'enviar' | 'editar',
  relatorio: Relatorio,
  anexos: AnexoPayload[],
  protocolo?: string
): Promise<RespostaEnvio> {
  if (anexos.length > MAX_ANEXOS) {
    return { ok: false, erro: `máximo de ${MAX_ANEXOS} anexos por envio` };
  }
  const totalBytes = anexos.reduce((n, a) => n + bytesDeBase64(a.base64), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false, erro: `tamanho total dos anexos excede ${MAX_TOTAL_MB} MB` };
  }

  const recaptcha_token = await executarRecaptcha('relatorio_bs');

  const payload = {
    ...relatorio,
    acao,
    ...(protocolo ? { protocolo } : {}),
    anexos,
    origin: window.location.origin,
    recaptcha_token,
  };

  return postar<RespostaEnvio>(payload, timeoutParaBytes(totalBytes));
}

export async function enviarRelatorio(
  relatorio: Relatorio,
  anexos: AnexoPayload[]
): Promise<RespostaEnvio> {
  return enviarComAcao('enviar', relatorio, anexos);
}

export async function editarRelatorio(
  protocolo: string,
  relatorio: Relatorio,
  anexos: AnexoPayload[]
): Promise<RespostaEnvio> {
  return enviarComAcao('editar', relatorio, anexos, protocolo);
}

/** Carrega a última versão de um relatório para edição (gate: protocolo + e-mail do autor). */
export async function carregarRelatorio(
  protocolo: string,
  email: string
): Promise<RespostaCarregar> {
  const recaptcha_token = await executarRecaptcha('carregar_bs');
  const payload = {
    acao: 'carregar',
    protocolo: protocolo.trim(),
    email: email.trim(),
    origin: window.location.origin,
    recaptcha_token,
  };
  return postar<RespostaCarregar>(payload);
}
