import { useState } from 'react';
import { useForm, FormProvider, useFormContext, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { relatorioSchema, Relatorio, RelatorioInput, valoresPadrao } from './schema/relatorio';
import { Field } from './components/Field';
import { CheckboxGroup } from './components/CheckboxGroup';
import { GradeImpacto } from './components/GradeImpacto';
import { UploadAnexos } from './components/UploadAnexos';
import { EIXOS_ESTRATEGICOS, ODS } from './data/eixos';
import { GRADE_SOCIAL, GRADE_AMBIENTAL } from './data/grades';
import { enviarRelatorio, AnexoPayload, RespostaEnvio } from './lib/api';

const BASE = import.meta.env.BASE_URL || '/';
const URL_PLANILHA = `${BASE}planilha-complementar-bs-2025.xlsx`;
const URL_ORIENTACOES = `${BASE}orientacoes-bs-2025.pdf`;

// Descrição (texto) que acompanha cada grade, por aspecto.
const DESC_SOCIAL: Record<string, keyof RelatorioInput> = {
  emprego: 'social_emprego_desc',
  renda: 'social_renda_desc',
  bemestar: 'social_bemestar_desc',
  gestao: 'social_gestao_desc',
};
const DESC_AMBIENTAL: Record<string, keyof RelatorioInput> = {
  eficiencia: 'amb_eficiencia_desc',
  conservacao: 'amb_conservacao_desc',
  recuperacao: 'amb_recuperacao_desc',
  bemestar_animal: 'amb_bemestar_animal_desc',
  qualidade_produto: 'amb_qualidade_produto_desc',
};

const ROTULOS: Record<string, string> = {
  email: 'e-mail', responsavel: 'nome do responsável', titulo: 'título',
  diretoria_departamento: 'diretoria e departamento', programa_projeto: 'programa/projeto',
  coordenacao_equipe: 'coordenação e equipe', eixos: 'eixos estratégicos', ods: 'ODS',
  resumo: 'resumo descritivo', abrangencia_geografica: 'abrangência geográfica',
  parcerias_confirmado: 'confirmação de parcerias', impactos_gerais: 'impactos gerais',
  econ_produtividade: 'incremento de produtividade', econ_reducao_custos: 'redução de custos',
  econ_expansao_area: 'expansão de área', econ_agregacao_valor: 'agregação de valor',
  econ_memoria_calculo: 'memória de cálculo', econ_fontes: 'fontes de dados',
  social_emprego_desc: 'social — emprego', social_renda_desc: 'social — renda',
  social_bemestar_desc: 'social — bem-estar', social_gestao_desc: 'social — gestão',
  social_conclusao: 'conclusão social', grade_social: 'grade de impactos sociais',
  amb_eficiencia_desc: 'ambiental — eficiência', amb_conservacao_desc: 'ambiental — conservação',
  amb_recuperacao_desc: 'ambiental — recuperação', amb_bemestar_animal_desc: 'ambiental — bem-estar animal',
  amb_qualidade_produto_desc: 'ambiental — qualidade do produto', amb_conclusao: 'conclusão ambiental',
  grade_ambiental: 'grade de impactos ambientais',
};

function listarCamposComErro(errs: Record<string, unknown>): string[] {
  return Object.keys(errs).map((k) => ROTULOS[k] || k);
}

export function App() {
  const metodos = useForm<RelatorioInput, unknown, Relatorio>({
    resolver: zodResolver(relatorioSchema),
    defaultValues: valoresPadrao as RelatorioInput,
    mode: 'onBlur',
  });
  const [anexos, setAnexos] = useState<AnexoPayload[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespostaEnvio | null>(null);

  async function aoEnviar(dados: Relatorio) {
    if (!anexos.some((a) => a.tipo === 'planilha_complementar')) {
      setResultado({ ok: false, erro: 'anexe a planilha complementar preenchida (.xlsx).' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const r = await enviarRelatorio(dados, anexos);
      setResultado(r);
      if (r.ok) {
        metodos.reset(valoresPadrao as RelatorioInput);
        setAnexos([]);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setResultado({ ok: false, erro: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  function aoErroValidacao(errs: FieldErrors<RelatorioInput>) {
    const campos = listarCamposComErro(errs as Record<string, unknown>);
    setResultado({
      ok: false,
      erro: campos.length
        ? `Há ${campos.length} item(ns) a corrigir: ${campos.join(', ')}.`
        : 'Há campos inválidos. Revise o formulário.',
      campos,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <FormProvider {...metodos}>
      <div className="container">
        <header className="cabecalho">
          <h1>Relatório de Impactos — Balanço Social 2025</h1>
          <p>
            IDR-Paraná. Preencha <strong>um formulário por ação ou tecnologia</strong>,
            com os impactos econômicos, sociais e ambientais (metodologia Ambitec-Agro).
          </p>
        </header>

        <RecursosDownload />

        {resultado?.ok && (
          <div className="resultado-ok">
            <strong>Relatório recebido!</strong>
            <div>Protocolo: <code>{resultado.protocolo}</code></div>
            <div>{resultado.mensagem}</div>
          </div>
        )}
        {resultado && !resultado.ok && (
          <div className="resultado-erro">
            <strong>Não foi possível enviar.</strong>
            <div>{resultado.erro}</div>
          </div>
        )}

        <form onSubmit={metodos.handleSubmit(aoEnviar, aoErroValidacao)} noValidate>
          {/* Honeypot anti-bot — usuários reais não veem este campo */}
          <input
            type="text" tabIndex={-1} autoComplete="off"
            className="honeypot" aria-hidden="true"
            {...metodos.register('website_url')}
          />

          <Identificacao />
          <DescricaoTecnica />
          <ImpactosGerais />
          <ImpactosEconomicos />
          <ImpactosSociais />
          <ImpactosAmbientais />
          <Publicacoes />

          <section className="cartao">
            <h2>5. Anexos</h2>
            <UploadAnexos onChange={setAnexos} />
          </section>

          <div className="barra-acoes">
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar relatório'}
            </button>
          </div>
        </form>
      </div>
    </FormProvider>
  );
}

function RecursosDownload() {
  return (
    <div className="recursos">
      <strong>Antes de começar:</strong> baixe a planilha complementar, preencha-a
      (abas de parcerias e impactos econômicos) e anexe-a ao final.
      <div className="recursos-links">
        <a className="recurso-link" href={URL_PLANILHA} download>
          ⬇ Baixar planilha complementar (.xlsx)
        </a>
        <a className="recurso-link" href={URL_ORIENTACOES} target="_blank" rel="noreferrer">
          📄 Orientações BS 2025 (PDF)
        </a>
      </div>
    </div>
  );
}

function Identificacao() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>1. Identificação da ação ou tecnologia</h2>
      <div className="grid">
        <Field label="E-mail" obrigatorio erro={errors.email?.message}>
          <input type="email" {...register('email')} />
        </Field>
        <Field label="Nome do responsável pelas informações" obrigatorio erro={errors.responsavel?.message}>
          <input {...register('responsavel')} />
        </Field>
      </div>
      <Field label="Título da ação ou tecnologia" obrigatorio
        ajuda="Um formulário para cada ação ou tecnologia." erro={errors.titulo?.message}>
        <input {...register('titulo')} />
      </Field>
      <div className="grid">
        <Field label="Diretoria e departamento" obrigatorio erro={errors.diretoria_departamento?.message}>
          <input {...register('diretoria_departamento')} />
        </Field>
        <Field label="Programa/projeto" obrigatorio erro={errors.programa_projeto?.message}>
          <input {...register('programa_projeto')} />
        </Field>
      </div>
      <Field label="Coordenação/responsável e equipe" obrigatorio
        ajuda="Coordenador(a) e lista da equipe participante." erro={errors.coordenacao_equipe?.message}>
        <textarea rows={3} {...register('coordenacao_equipe')} />
      </Field>
      <Field label="Ano de desenvolvimento da tecnologia" ajuda="Se for uma tecnologia, ano de lançamento/início da transferência."
        erro={errors.ano_tecnologia?.message}>
        <input {...register('ano_tecnologia')} />
      </Field>
    </section>
  );
}

function DescricaoTecnica() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>2. Descrição técnica e contextualização</h2>
      <Field label="Conexão com eixos estratégicos" obrigatorio
        ajuda="A qual(is) eixo(s) estratégico(s) do IDR-Paraná a ação se relaciona."
        erro={errors.eixos?.message as string | undefined}>
        <CheckboxGroup<RelatorioInput> name="eixos" opcoes={EIXOS_ESTRATEGICOS} />
      </Field>
      <Field label="Conexão com Objetivos de Desenvolvimento Sustentável (ODS)" obrigatorio
        ajuda="A qual(is) ODS da ONU a ação se relaciona."
        erro={errors.ods?.message as string | undefined}>
        <CheckboxGroup<RelatorioInput> name="ods" opcoes={ODS} colunaUnica />
      </Field>
      <Field label="Resumo descritivo" obrigatorio erro={errors.resumo?.message}>
        <textarea rows={4} {...register('resumo')} />
      </Field>
      <Field label="Abrangência geográfica" obrigatorio erro={errors.abrangencia_geografica?.message}>
        <textarea rows={3} {...register('abrangencia_geografica')} />
      </Field>
      <div className="aviso-confirma">
        <label>
          <input type="checkbox" {...register('parcerias_confirmado')} />
          <span>
            Preenchi a aba <strong>"Parcerias"</strong> da{' '}
            <a href={URL_PLANILHA} download>planilha complementar</a> e a anexarei ao final.
          </span>
        </label>
        {errors.parcerias_confirmado && (
          <div className="erro-msg">{errors.parcerias_confirmado.message as string}</div>
        )}
      </div>
    </section>
  );
}

function ImpactosGerais() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>3. Impactos gerais</h2>
      <Field label="Impactos gerais na cadeia produtiva ou área" obrigatorio erro={errors.impactos_gerais?.message}>
        <textarea rows={4} {...register('impactos_gerais')} />
      </Field>
    </section>
  );
}

function ImpactosEconomicos() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  const campo = (
    name: keyof RelatorioInput, label: string
  ) => (
    <Field label={label} obrigatorio erro={errors[name]?.message as string | undefined}>
      <textarea rows={3} {...register(name)} />
    </Field>
  );
  return (
    <section className="cartao">
      <h2>3.2. Avaliação dos impactos econômicos</h2>
      {campo('econ_produtividade', 'Incremento de Produtividade')}
      {campo('econ_reducao_custos', 'Redução de Custos')}
      {campo('econ_expansao_area', 'Expansão da Produção em Novas Áreas')}
      {campo('econ_agregacao_valor', 'Agregação de Valor')}
      {campo('econ_memoria_calculo', 'Memória de cálculo')}
      {campo('econ_fontes', 'Fontes de dados')}
    </section>
  );
}

function ImpactosSociais() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>3.3. Avaliação dos impactos sociais</h2>
      <p className="grade-legenda">
        Escala: <strong>-3</strong> grande redução · <strong>-1</strong> redução ·
        <strong> 0</strong> neutro · <strong>+1</strong> aumento · <strong>+3</strong> grande aumento ·
        <strong> Não se aplica</strong>.
      </p>
      {GRADE_SOCIAL.map((grupo) => {
        const descName = DESC_SOCIAL[grupo.aspecto];
        return (
          <div key={grupo.aspecto} className="aspecto">
            <h3>{grupo.titulo}</h3>
            <Field label={`${grupo.titulo} — descrição/justificativa`} obrigatorio
              erro={errors[descName]?.message as string | undefined}>
              <textarea rows={3} {...register(descName)} />
            </Field>
            <GradeImpacto<RelatorioInput> name="grade_social" grupo={grupo} />
          </div>
        );
      })}
      {errors.grade_social && (
        <div className="erro-msg">{(errors.grade_social.message as string) || 'responda todos os itens das grades sociais.'}</div>
      )}
      <Field label="Conclusão dos impactos sociais" obrigatorio erro={errors.social_conclusao?.message}>
        <textarea rows={3} {...register('social_conclusao')} />
      </Field>
    </section>
  );
}

function ImpactosAmbientais() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>3.4. Avaliação dos impactos ambientais</h2>
      <p className="grade-legenda">
        Escala: <strong>-3</strong> grande redução · <strong>-1</strong> redução ·
        <strong> 0</strong> neutro · <strong>+1</strong> aumento · <strong>+3</strong> grande aumento ·
        <strong> Não se aplica</strong>.
      </p>
      {GRADE_AMBIENTAL.map((grupo) => {
        const descName = DESC_AMBIENTAL[grupo.aspecto];
        return (
          <div key={grupo.aspecto} className="aspecto">
            <h3>{grupo.titulo}</h3>
            <Field label={`${grupo.titulo} — descrição/justificativa`} obrigatorio
              erro={errors[descName]?.message as string | undefined}>
              <textarea rows={3} {...register(descName)} />
            </Field>
            <GradeImpacto<RelatorioInput> name="grade_ambiental" grupo={grupo} />
          </div>
        );
      })}
      {errors.grade_ambiental && (
        <div className="erro-msg">{(errors.grade_ambiental.message as string) || 'responda todos os itens das grades ambientais.'}</div>
      )}
      <Field label="Conclusão dos impactos ambientais" obrigatorio erro={errors.amb_conclusao?.message}>
        <textarea rows={3} {...register('amb_conclusao')} />
      </Field>
    </section>
  );
}

function Publicacoes() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>4. Publicações e matérias</h2>
      <Field label="Publicações e matérias (opcional)" erro={errors.publicacoes?.message}>
        <textarea rows={3} {...register('publicacoes')} />
      </Field>
    </section>
  );
}
