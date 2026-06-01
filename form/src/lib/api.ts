import type { Relatorio } from '../schema/relatorio';
import { executarRecaptcha } from './recaptcha';

const API_URL = import.meta.env.VITE_API_URL as string;

// MIME aceitos: planilha (xlsx/xls), PDF e imagens (fotos/documentos).
export const MIME_PLANILHA = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];
export const MIME_FOTO_DOC = ['application/pdf', 'image/jpeg', 'image/png'];
const MIME_PERMITIDOS = [...MIME_PLANILHA, ...MIME_FOTO_DOC];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB no envio inteiro (espelha o backend)

function bytesDeBase64(b: string): number {
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

export async function arquivoParaAnexo(tipo: TipoAnexo, file: File): Promise<AnexoPayload> {
  const permitidos = tipo === 'planilha_complementar' ? MIME_PLANILHA : MIME_FOTO_DOC;
  // Alguns navegadores não definem o MIME de .xls/.xlsx de forma confiável;
  // aceitamos pela extensão quando o tipo declarado for planilha.
  const mimeOk =
    permitidos.includes(file.type) ||
    (tipo === 'planilha_complementar' && /\.(xlsx|xls)$/i.test(file.name));
  if (!mimeOk || !MIME_PERMITIDOS.includes(file.type || inferirMime(file.name))) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type || file.name}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Arquivo "${file.name}" excede 10 MB`);
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return {
    tipo,
    nome: file.name,
    mime: file.type || inferirMime(file.name),
    base64: btoa(bin),
  };
}

function inferirMime(nome: string): string {
  if (/\.xlsx$/i.test(nome)) return MIME_PLANILHA[0];
  if (/\.xls$/i.test(nome)) return MIME_PLANILHA[1];
  if (/\.pdf$/i.test(nome)) return 'application/pdf';
  if (/\.(jpe?g)$/i.test(nome)) return 'image/jpeg';
  if (/\.png$/i.test(nome)) return 'image/png';
  return '';
}

export interface RespostaEnvio {
  ok: boolean;
  protocolo?: string;
  mensagem?: string;
  erro?: string;
  campos?: string[];
  _status?: number;
}

export async function enviarRelatorio(
  relatorio: Relatorio,
  anexos: AnexoPayload[]
): Promise<RespostaEnvio> {
  if (!API_URL) throw new Error('VITE_API_URL não configurado');

  const totalBytes = anexos.reduce((n, a) => n + bytesDeBase64(a.base64), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false, erro: 'tamanho total dos anexos excede 50 MB' };
  }

  const recaptcha_token = await executarRecaptcha('relatorio_bs');

  const payload = {
    ...relatorio,
    anexos,
    origin: window.location.origin,
    recaptcha_token,
  };

  // text/plain evita preflight CORS — Apps Script aceita JSON cru.
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const txt = await r.text();
  try {
    return JSON.parse(txt) as RespostaEnvio;
  } catch {
    return { ok: false, erro: 'resposta inválida do servidor' };
  }
}
