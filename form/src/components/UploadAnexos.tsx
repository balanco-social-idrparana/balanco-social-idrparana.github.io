import { useEffect, useState } from 'react';
import { arquivoParaAnexo, AnexoPayload } from '../lib/api';

interface Props {
  onChange: (anexos: AnexoPayload[]) => void;
}

/**
 * Anexos opcionais de fotos e documentos (PDF/JPG/PNG). A planilha complementar
 * NÃO é anexada — seus dados são preenchidos na seção 4 do formulário.
 */
export function UploadAnexos({ onChange }: Props) {
  const [fotos, setFotos] = useState<AnexoPayload[]>([]);
  const [erro, setErro] = useState<string>('');

  useEffect(() => {
    onChange(fotos);
  }, [fotos, onChange]);

  async function aoSelecionar(files: FileList | null) {
    setErro('');
    if (!files || !files.length) return;
    const convertidos: AnexoPayload[] = [];
    const erros: string[] = [];
    for (const f of Array.from(files)) {
      try {
        convertidos.push(await arquivoParaAnexo('foto_documento', f));
      } catch (e) {
        erros.push((e as Error).message);
      }
    }
    setFotos((prev) => [...prev, ...convertidos]);
    if (erros.length) setErro(erros.join(' · '));
  }

  function remover(idx: number) {
    setFotos((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="campo">
      <label>Fotos e documentos (opcional)</label>
      <p className="campo-ajuda">PDF, JPG ou PNG. Máximo 10 MB por arquivo. Você pode selecionar vários.</p>
      <input
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => aoSelecionar(e.target.files)}
      />
      {fotos.length > 0 && (
        <ul className="anexo-lista">
          {fotos.map((a, i) => (
            <li key={`${a.nome}-${i}`}>
              <span>✓ {a.nome}</span>
              <button type="button" className="remover" onClick={() => remover(i)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      {erro && <div className="erro-msg">{erro}</div>}
    </div>
  );
}
