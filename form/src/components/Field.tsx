import {
  Children, ReactElement, ReactNode, cloneElement, isValidElement, useId,
} from 'react';

interface Props {
  label: string;
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  children: ReactNode;
  htmlFor?: string;
}

/**
 * Campo com rótulo/ajuda/erro acessíveis. Quando o filho é um único elemento
 * nativo (input/textarea/select), injeta `id` + `aria-describedby`/`aria-invalid`
 * e associa o <label> a ele; filhos compostos (grupos de checkbox, listas) são
 * expostos como role="group" rotulado.
 */
export function Field({ label, obrigatorio, ajuda, erro, children, htmlFor }: Props) {
  const autoId = useId();
  const filhoNativo =
    Children.count(children) === 1 && isValidElement(children) && typeof children.type === 'string'
      ? (children as ReactElement<Record<string, unknown>>)
      : null;

  const inputId = htmlFor ?? (filhoNativo ? ((filhoNativo.props.id as string) ?? `${autoId}-campo`) : undefined);
  const labelId = `${autoId}-rotulo`;
  const ajudaId = ajuda ? `${autoId}-ajuda` : undefined;
  const erroId = erro ? `${autoId}-erro` : undefined;
  const describedBy = [ajudaId, erroId].filter(Boolean).join(' ') || undefined;

  const controle = filhoNativo ? (
    cloneElement(filhoNativo, {
      id: inputId,
      'aria-describedby': describedBy,
      'aria-invalid': erro ? true : undefined,
    })
  ) : (
    <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>{children}</div>
  );

  return (
    <div className="campo">
      <label id={labelId} htmlFor={inputId} className={obrigatorio ? 'obrigatorio' : ''}>{label}</label>
      {ajuda && <p id={ajudaId} className="campo-ajuda">{ajuda}</p>}
      {controle}
      {erro && <div id={erroId} className="erro-msg">{erro}</div>}
    </div>
  );
}
