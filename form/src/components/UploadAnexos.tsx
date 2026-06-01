import { useEffect, useState } from 'react';
import { arquivoParaAnexo, AnexoPayload } from '../lib/api';

interface Props {
  onChange: (anexos: AnexoPayload[]) => void;
}

/**
 * Anexos do relatório:
 *  - Planilha complementar (.xlsx/.xls) — OBRIGATÓRIA, arquivo único.
 *  - Fotos e documentos (PDF/JPG/PNG) — opcionais, vários arquivos.
 */
export function UploadAnexos({ onChange }: Props) {
  const [planilha, setPlanilha] = useState<AnexoPayload | undefined>();
  const [erroPlanilha, setErroPlanilha] = useState<string>('');
  const [fotos, setFotos] = useState<AnexoPayload[]>([]);
  const [erroFotos, setErroFotos] = useState<string>('');

  // Deriva a lista final do estado já commitado (evita corrida de closures).
  useEffect(() => {
    const todos = [...(planilha ? [planilha] : []), ...fotos];
    onChange(todos);
  }, [planilha, fotos, onChange]);

  async function aoSelecionarPlanilha(f: File | null) {
    setErroPlanilha('');
    if (!f) {
      setPlanilha(undefined);
      return;
    }
    try {
      setPlanilha(await arquivoParaAnexo('planilha_complementar', f));
    } catch (e) {
      setPlanilha(undefined);
      setErroPlanilha((e as Error).message);
    }
  }

  async function aoSelecionarFotos(files: FileList | null) {
    setErroFotos('');
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
    if (erros.length) setErroFotos(erros.join(' · '));
  }

  function removerFoto(idx: number) {
    setFotos((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="campo">
        <label className="obrigatorio">Planilha complementar preenchida (.xlsx)</label>
        <p className="campo-ajuda">
          Anexe a planilha BS 2025 já preenchida (abas Parcerias e impactos econômicos).
          É obrigatória para a consolidação do Balanço Social.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => aoSelecionarPlanilha(e.target.files?.[0] || null)}
        />
        {planilha && <div className="anexo-ok">✓ {planilha.nome}</div>}
        {erroPlanilha && <div className="erro-msg">{erroPlanilha}</div>}
      </div>

      <div className="campo">
        <label>Fotos e documentos (opcional)</label>
        <p className="campo-ajuda">PDF, JPG ou PNG. Máximo 10 MB por arquivo. Você pode selecionar vários.</p>
        <input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => aoSelecionarFotos(e.target.files)}
        />
        {fotos.length > 0 && (
          <ul className="anexo-lista">
            {fotos.map((a, i) => (
              <li key={`${a.nome}-${i}`}>
                <span>✓ {a.nome}</span>
                <button type="button" className="remover" onClick={() => removerFoto(i)}>Remover</button>
              </li>
            ))}
          </ul>
        )}
        {erroFotos && <div className="erro-msg">{erroFotos}</div>}
      </div>
    </div>
  );
}
