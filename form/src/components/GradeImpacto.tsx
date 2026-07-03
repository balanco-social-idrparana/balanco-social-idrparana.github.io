import { useFormContext, useWatch, FieldValues, Path, PathValue } from 'react-hook-form';
import { GrupoGrade, ESCALA_IMPACTO, ValorImpacto } from '../data/grades';
import type { ItemGrade } from '../schema/relatorio';

interface Props<T extends FieldValues> {
  /** nome do campo de array no formulário: 'grade_social' | 'grade_ambiental' */
  name: Path<T>;
  grupo: GrupoGrade;
}

/**
 * Tabela de avaliação Ambitec de um aspecto: cada linha é um coeficiente e cada
 * coluna um valor da escala (-3, -1, 0, +1, +3, Não se aplica). A seleção é
 * gravada como itens { aspecto, coeficiente, valor } no array do formulário.
 */
export function GradeImpacto<T extends FieldValues>({ name, grupo }: Props<T>) {
  const { setValue, formState: { errors } } = useFormContext<T>();
  const itens = (useWatch<T>({ name }) as ItemGrade[] | undefined) || [];
  // Validar a grade inteira no primeiro clique acusaria "faltando: ..." para
  // itens ainda não respondidos. Só revalida quando já existe erro (para limpá-lo).
  const jaTemErro = Boolean((errors as Record<string, unknown>)[String(name)]);

  function valorDe(coeficiente: string): ValorImpacto | undefined {
    return itens.find((i) => i.aspecto === grupo.aspecto && i.coeficiente === coeficiente)?.valor;
  }

  function definir(coeficiente: string, valor: ValorImpacto) {
    const semEste = itens.filter(
      (i) => !(i.aspecto === grupo.aspecto && i.coeficiente === coeficiente)
    );
    const novo: ItemGrade[] = [...semEste, { aspecto: grupo.aspecto, coeficiente, valor }];
    setValue(name, novo as PathValue<T, Path<T>>, { shouldValidate: jaTemErro, shouldDirty: true });
  }

  const nomeRadio = `${String(name)}-${grupo.aspecto}`;

  return (
    <div className="grade-wrap">
      <table className="grade">
        <thead>
          <tr>
            <th scope="col" className="grade-coef">Coeficiente</th>
            {ESCALA_IMPACTO.map((e) => (
              <th scope="col" key={e.valor} className="grade-val">{e.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupo.coeficientes.map((coef) => {
            const atual = valorDe(coef);
            return (
              <tr key={coef}>
                <th scope="row" className="grade-coef">{coef}</th>
                {ESCALA_IMPACTO.map((e) => (
                  <td key={e.valor} className="grade-val">
                    <input
                      type="radio"
                      name={`${nomeRadio}-${coef}`}
                      aria-label={`${coef}: ${e.rotulo}`}
                      checked={atual === e.valor}
                      onChange={() => definir(coef, e.valor)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
