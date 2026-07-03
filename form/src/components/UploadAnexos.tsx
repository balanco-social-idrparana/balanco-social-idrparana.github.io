import { Dispatch, SetStateAction, useId, useRef, useState } from 'react';
import { arquivoParaAnexo, AnexoPayload, MAX_ANEXOS } from '../lib/api';

interface Props {
  /** Fonte de verdade dos anexos vive no App — o componente é controlado. */
  anexos: AnexoPayload[];
  /** O setter do App (aceita updater funcional): evita closure obsoleta no async. */
  onChange: Dispatch<SetStateAction<AnexoPayload[]>>;
}

/**
 * Anexos opcionais de fotos e documentos (PDF/JPG/PNG). A planilha complementar
 * NÃO é anexada — seus dados são preenchidos na seção 4 do formulário.
 */
export function UploadAnexos({ anexos, onChange }: Props) {
  const [erro, setErro] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const cheio = anexos.length >= MAX_ANEXOS;

  async function aoSelecionar(files: FileList | null) {
    setErro('');
    if (!files || !files.length) return;
    const convertidos: AnexoPayload[] = [];
    const erros: string[] = [];
    // Espaço restante calculado sobre o valor ATUAL evita ultrapassar o limite;
    // a conferência final ocorre no update funcional (à prova de concorrência).
    let restante = MAX_ANEXOS - anexos.length;
    for (const f of Array.from(files)) {
      if (restante <= 0) { erros.push(`Limite de ${MAX_ANEXOS} anexos: "${f.name}" não incluído`); continue; }
      try {
        convertidos.push(await arquivoParaAnexo('foto_documento', f));
        restante--;
      } catch (e) {
        erros.push((e as Error).message);
      }
    }
    if (convertidos.length) {
      // Update funcional: lê a lista mais recente (não a capturada antes do await),
      // então uma remoção durante a conversão não é desfeita e nada é perdido.
      onChange((prev) => [...prev, ...convertidos].slice(0, MAX_ANEXOS));
    }
    if (erros.length) setErro(erros.join(' · '));
    // Sem isto, re-selecionar o MESMO arquivo não dispara `change` no Chrome.
    if (inputRef.current) inputRef.current.value = '';
  }

  function remover(idx: number) {
    onChange((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="campo">
      <label htmlFor={inputId}>Fotos e documentos (opcional)</label>
      <p className="campo-ajuda">
        PDF, JPG ou PNG. Máximo 10 MB por arquivo e até {MAX_ANEXOS} arquivos. Você pode selecionar vários.
      </p>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        disabled={cheio}
        onChange={(e) => aoSelecionar(e.target.files)}
      />
      {cheio && <p className="campo-ajuda">Limite de {MAX_ANEXOS} anexos atingido.</p>}
      {anexos.length > 0 && (
        <ul className="anexo-lista">
          {anexos.map((a, i) => (
            <li key={`${a.nome}-${i}`}>
              <span>✓ {a.nome}</span>
              <button type="button" className="remover" onClick={() => remover(i)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      {erro && <div className="erro-msg" role="alert">{erro}</div>}
    </div>
  );
}
