import { ReactNode } from 'react';
import { useFieldArray, Control, FieldValues, ArrayPath } from 'react-hook-form';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: ArrayPath<T>;
  // Tipado como Record porque o union de field arrays não estreita por `name`;
  // a validação real ocorre via Zod no submit.
  itemPadrao: Record<string, unknown>;
  textoAdicionar?: string;
  vazio?: string;
  /** Teto de itens (espelha o limite validado no schema/backend). */
  maxItens?: number;
  renderItem: (index: number) => ReactNode;
}

export function ListaRepetivel<T extends FieldValues>({
  control, name, itemPadrao, textoAdicionar, vazio, maxItens, renderItem,
}: Props<T>) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const atingiuMax = maxItens !== undefined && fields.length >= maxItens;
  return (
    <div>
      {fields.length === 0 && vazio && <p className="campo-ajuda">{vazio}</p>}
      {fields.map((f, i) => (
        <div key={f.id} className="lista-item">
          {renderItem(i)}
          <div className="acoes">
            <button type="button" className="remover" onClick={() => remove(i)}>Remover</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secundario"
        disabled={atingiuMax}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => append(itemPadrao as any)}
      >
        {textoAdicionar || '+ Adicionar'}
      </button>
      {atingiuMax && <p className="campo-ajuda">Limite de {maxItens} itens atingido.</p>}
    </div>
  );
}
