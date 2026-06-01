import { ReactNode } from 'react';

interface Props {
  label: string;
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, obrigatorio, ajuda, erro, children, htmlFor }: Props) {
  return (
    <div className="campo">
      <label htmlFor={htmlFor} className={obrigatorio ? 'obrigatorio' : ''}>{label}</label>
      {ajuda && <p className="campo-ajuda">{ajuda}</p>}
      {children}
      {erro && <div className="erro-msg">{erro}</div>}
    </div>
  );
}
