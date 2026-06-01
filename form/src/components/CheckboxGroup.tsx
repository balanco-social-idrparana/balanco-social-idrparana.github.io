import { useFormContext, useWatch, FieldValues, Path, PathValue } from 'react-hook-form';

interface Props<T extends FieldValues> {
  name: Path<T>;
  opcoes: readonly string[];
  /** layout em coluna única (ex.: ODS, lista longa) */
  colunaUnica?: boolean;
}

/**
 * Grupo de checkboxes ligado a um campo de array de strings no react-hook-form.
 * Marcar/desmarcar adiciona/remove o valor do array (imutável).
 */
export function CheckboxGroup<T extends FieldValues>({ name, opcoes, colunaUnica }: Props<T>) {
  const { setValue } = useFormContext<T>();
  const selecionados = (useWatch<T>({ name }) as string[] | undefined) || [];

  function alternar(valor: string, marcado: boolean) {
    const novo = marcado
      ? [...selecionados, valor]
      : selecionados.filter((v) => v !== valor);
    setValue(name, novo as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <div className={colunaUnica ? 'checkbox-grupo coluna' : 'checkbox-grupo'}>
      {opcoes.map((op) => {
        const marcado = selecionados.includes(op);
        return (
          <label key={op} className="checkbox-item">
            <input
              type="checkbox"
              checked={marcado}
              onChange={(e) => alternar(op, e.target.checked)}
            />
            <span>{op}</span>
          </label>
        );
      })}
    </div>
  );
}
