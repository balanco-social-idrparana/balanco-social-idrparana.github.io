import { useFormContext, useWatch, Path } from 'react-hook-form';
import { Field } from './Field';
import type { RelatorioInput } from '../schema/relatorio';
import { BLOCOS_ECON, BlocoEcon, calcularEcon, formatarBRL, ValoresBloco } from '../data/economia';

function p(name: string): Path<RelatorioInput> {
  return name as Path<RelatorioInput>;
}

function BlocoCalc({ bloco }: { bloco: BlocoEcon }) {
  const { register } = useFormContext<RelatorioInput>();
  const base = `econ_detalhe.${bloco.tipo}`;
  const valores = (useWatch<RelatorioInput>({ name: p(base) }) as ValoresBloco | undefined) || {};
  const { ganhoUnitario, ganhoLiquido, beneficio } = calcularEcon(bloco.tipo, valores);

  const numInput = (campo: string) => (
    <input type="number" step="any" min={0} {...register(p(`${base}.${campo}`), { valueAsNumber: true })} />
  );

  return (
    <div className="aspecto">
      <h3>{bloco.titulo}</h3>

      <p className="campo-ajuda"><strong>{bloco.subtitulo}</strong> — unidades padrão: ha, kg, R$.</p>
      <div className="grid">
        <Field label="Ano civil ou agrícola">
          <input type="text" {...register(p(`${base}.ano`))} />
        </Field>
        <Field label={bloco.labelAnterior}>{numInput('anterior')}</Field>
        <Field label={bloco.labelAtual}>{numInput('atual')}</Field>
        {bloco.temPrecoCusto && <Field label={bloco.labelPreco!}>{numInput('preco')}</Field>}
        {bloco.temPrecoCusto && <Field label={bloco.labelCusto!}>{numInput('custo')}</Field>}
        <Field label={bloco.labelGanhoUnitario + ' — calculado'}>
          <input type="text" readOnly tabIndex={-1} value={ganhoUnitario.toLocaleString('pt-BR')} className="calculado" />
        </Field>
      </div>

      <p className="campo-ajuda" style={{ marginTop: 10 }}><strong>Benefícios econômicos no Estado do Paraná</strong></p>
      <div className="grid">
        <Field label="Participação IDR-Paraná (%)" ajuda="Recomenda-se não ultrapassar 70%.">
          <input type="number" step="any" min={0} max={100} {...register(p(`${base}.participacao_idr`), { valueAsNumber: true })} />
        </Field>
        <Field label={bloco.labelArea}>{numInput('area')}</Field>
        <Field label="Ganho líquido IDR-Paraná — calculado">
          <input type="text" readOnly tabIndex={-1} value={ganhoLiquido.toLocaleString('pt-BR')} className="calculado" />
        </Field>
        <Field label="Benefício econômico (R$) — calculado">
          <input type="text" readOnly tabIndex={-1} value={formatarBRL(beneficio)} className="calculado destaque" />
        </Field>
      </div>

      <p className="campo-ajuda" style={{ marginTop: 10 }}><strong>Área de adoção fora do Paraná</strong></p>
      <div className="grid">
        <Field label="Outros estados do Brasil (ha)">{numInput('outros_estados_ha')}</Field>
        <Field label="Outros países (ha)">{numInput('outros_paises_ha')}</Field>
      </div>
    </div>
  );
}

export function EconomiaDetalhe() {
  const detalhe = useWatch<RelatorioInput>({ name: p('econ_detalhe') }) as
    | Record<string, ValoresBloco>
    | undefined;

  const total = BLOCOS_ECON.reduce((soma, b) => {
    const v = (detalhe && detalhe[b.tipo]) || {};
    return soma + calcularEcon(b.tipo, v).beneficio;
  }, 0);

  return (
    <div>
      <p className="campo-ajuda">
        Os campos <em>calculados</em> são preenchidos automaticamente (mesmas fórmulas da planilha).
      </p>
      {BLOCOS_ECON.map((b) => <BlocoCalc key={b.tipo} bloco={b} />)}
      <div className="total-beneficio">
        Benefício econômico total estimado (PR): <strong>{formatarBRL(total)}</strong>
      </div>
    </div>
  );
}
