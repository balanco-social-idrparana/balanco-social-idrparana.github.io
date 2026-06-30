import { createContext, useContext, useState } from 'react';
import { useForm, FormProvider, useFormContext, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { relatorioSchema, Relatorio, RelatorioInput, valoresPadrao } from './schema/relatorio';
import { Field } from './components/Field';
import { CheckboxGroup } from './components/CheckboxGroup';
import { GradeImpacto } from './components/GradeImpacto';
import { UploadAnexos } from './components/UploadAnexos';
import { ListaRepetivel } from './components/ListaRepetivel';
import { EconomiaDetalhe } from './components/EconomiaDetalhe';
import { EIXOS_ESTRATEGICOS, ODS } from './data/eixos';
import { GRADE_SOCIAL, GRADE_AMBIENTAL, URL_INDICADORES, DOC_INDICADOR } from './data/grades';
import {
  enviarRelatorio, editarRelatorio, carregarRelatorio,
  AnexoPayload, RespostaEnvio,
} from './lib/api';

/** Protocolo em edição (null = criando um novo relatório). */
interface ModoEdicao {
  protocolo: string;
  versao: number;
}
const EdicaoContext = createContext<ModoEdicao | null>(null);
const useEdicao = () => useContext(EdicaoContext);

const BASE = import.meta.env.BASE_URL || '/';
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
  parcerias: 'parcerias', econ_detalhe: 'impactos econômicos detalhados', impactos_gerais: 'impactos gerais',
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
  const [edicao, setEdicao] = useState<ModoEdicao | null>(null);

  async function aoEnviar(dados: Relatorio) {
    setEnviando(true);
    setResultado(null);
    try {
      const r = edicao
        ? await editarRelatorio(edicao.protocolo, dados, anexos)
        : await enviarRelatorio(dados, anexos);
      setResultado(r);
      if (r.ok) {
        if (edicao) {
          // Permanece em modo edição com a nova versão como base; o próximo
          // salvamento criará a versão seguinte. Anexos enviados já foram gravados.
          setEdicao({ protocolo: edicao.protocolo, versao: r.versao ?? edicao.versao + 1 });
          setAnexos([]);
        } else {
          metodos.reset(valoresPadrao as RelatorioInput);
          setAnexos([]);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setResultado({ ok: false, erro: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  function aoCarregar(protocolo: string, versao: number, dados: RelatorioInput) {
    metodos.reset(dados);
    setEdicao({ protocolo, versao });
    setAnexos([]);
    setResultado(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    metodos.reset(valoresPadrao as RelatorioInput);
    setEdicao(null);
    setAnexos([]);
    setResultado(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <EdicaoContext.Provider value={edicao}>
      <div className="marca-topo">
        <div className="marca-inner">
          <img src={`${BASE}idr-gov-seab-h.webp`} alt="IDR-Paraná · Governo do Estado do Paraná · Secretaria da Agricultura e do Abastecimento" />
        </div>
      </div>
      <div className="faixa-acento" />

      <div className="container">
        <header className="cabecalho">
          <a className="voltar" href="../">← Voltar à página inicial</a>
          <span className="selo">Balanço Social 2025</span>
          <h1>Relatório de Impactos de Ações e Tecnologias</h1>
          <p>
            Preencha <strong>um formulário por ação ou tecnologia</strong> — impactos
            econômicos, sociais e ambientais pela metodologia Ambitec-Agro.{' '}
            <a href="../">Ver instruções</a>.
          </p>
        </header>

        <RecursosDownload />

        {!edicao && <CarregarParaEditar onCarregar={aoCarregar} />}

        {edicao && (
          <div className="aviso-edicao">
            <div>
              <strong>Editando o relatório {edicao.protocolo}</strong>
              <div>Versão atual: <strong>v{edicao.versao}</strong>. Ao salvar, será criada a versão <strong>v{edicao.versao + 1}</strong> (as anteriores são preservadas).</div>
              <div className="campo-ajuda">Os anexos enviados anteriormente são mantidos; envie novos arquivos apenas se quiser substituí-los.</div>
            </div>
            <button type="button" className="secundario" onClick={cancelarEdicao}>
              Cancelar edição (novo relatório)
            </button>
          </div>
        )}

        {resultado?.ok && (
          <div className="resultado-ok">
            <strong>{resultado.versao && resultado.versao > 1 ? 'Relatório atualizado!' : 'Relatório recebido!'}</strong>
            <div>Protocolo: <code>{resultado.protocolo}</code>{resultado.versao ? <> · versão <strong>v{resultado.versao}</strong></> : null}</div>
            <div>{resultado.mensagem}</div>
            {resultado.versao && resultado.versao === 1 && (
              <div className="campo-ajuda">Guarde este protocolo: com ele e o seu e-mail você pode editar o relatório depois.</div>
            )}
          </div>
        )}
        {resultado && !resultado.ok && (
          <div className="resultado-erro">
            <strong>Não foi possível enviar.</strong>
            <div>{resultado.erro}</div>
          </div>
        )}

        <form onSubmit={metodos.handleSubmit(aoEnviar, aoErroValidacao)} noValidate>
          {/* Honeypot anti-bot — usuários reais não veem este campo. Nome NEUTRO
              + atributos para impedir autofill de navegador/gerenciador de senha
              (autofill em "website_url" derrubava envios legítimos). */}
          <input
            type="text" tabIndex={-1} autoComplete="off"
            className="honeypot" aria-hidden="true"
            data-lpignore="true" data-form-type="other" data-1p-ignore=""
            {...metodos.register('hp_token')}
          />

          <Identificacao />
          <DescricaoTecnica />
          <ImpactosGerais />
          <ImpactosEconomicos />
          <ImpactosSociais />
          <ImpactosAmbientais />
          <PlanilhaComplementar />
          <Publicacoes />

          <section className="cartao">
            <h2>6. Anexos (fotos e documentos)</h2>
            <UploadAnexos onChange={setAnexos} />
          </section>

          <div className="barra-acoes">
            <button type="submit" disabled={enviando}>
              {enviando
                ? 'Enviando...'
                : edicao
                  ? `Salvar nova versão (v${edicao.versao + 1})`
                  : 'Enviar relatório'}
            </button>
          </div>
        </form>
      </div>

      <footer className="rodape-inst">
        <img src={`${BASE}idr-gov-seab-h.webp`} alt="" />
        <p><strong>IDR-Paraná</strong> — Instituto de Desenvolvimento Rural do Paraná (IAPAR-EMATER)</p>
        <p>Secretaria da Agricultura e do Abastecimento · Governo do Estado do Paraná</p>
        <p>Grupo Gestor do Balanço Social 2025</p>
      </footer>
      </EdicaoContext.Provider>
    </FormProvider>
  );
}

function RecursosDownload() {
  return (
    <div className="recursos">
      <strong>Preencha um relatório por ação ou tecnologia.</strong> As parcerias e os
      impactos econômicos detalhados são informados na seção 4, com cálculo automático
      (não é necessário baixar nem anexar planilha).
      <div className="recursos-links">
        <a className="recurso-link" href="../">📖 Instruções (página inicial)</a>
        <a className="recurso-link" href={URL_ORIENTACOES} target="_blank" rel="noreferrer">
          📄 Orientações BS 2025 (PDF)
        </a>
      </div>
    </div>
  );
}

function CarregarParaEditar({
  onCarregar,
}: {
  onCarregar: (protocolo: string, versao: number, dados: RelatorioInput) => void;
}) {
  const [protocolo, setProtocolo] = useState('');
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setErro('');
    if (!protocolo.trim() || !email.trim()) {
      setErro('Informe o protocolo e o e-mail usados no envio.');
      return;
    }
    setCarregando(true);
    try {
      const r = await carregarRelatorio(protocolo, email);
      if (r.ok && r.dados) {
        onCarregar(r.protocolo ?? protocolo.trim(), r.versao ?? 1, r.dados);
      } else {
        setErro(r.erro || 'Não foi possível carregar o relatório.');
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <details className="carregar-editar">
      <summary>Já enviou um relatório? Editar usando o protocolo</summary>
      <p className="campo-ajuda">
        Informe o número do protocolo (ex.: <code>BS2025-...</code>) e o mesmo e-mail
        usado no envio. Ao salvar, uma nova versão é criada e as anteriores são preservadas.
      </p>
      <div className="grid">
        <Field label="Protocolo">
          <input
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value)}
            placeholder="BS2025-00000000-000000-0000"
          />
        </Field>
        <Field label="E-mail usado no envio">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      <div className="barra-acoes">
        <button type="button" className="secundario" onClick={carregar} disabled={carregando}>
          {carregando ? 'Carregando...' : 'Carregar para editar'}
        </button>
      </div>
      {erro && <div className="erro-msg">{erro}</div>}
    </details>
  );
}

function Identificacao() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  const edicao = useEdicao();
  return (
    <section className="cartao">
      <h2>1. Identificação da ação ou tecnologia</h2>
      <div className="grid">
        <Field label="E-mail" obrigatorio
          ajuda={edicao ? 'Bloqueado durante a edição: o e-mail identifica o autor do protocolo.' : undefined}
          erro={errors.email?.message}>
          <input type="email" readOnly={!!edicao} {...register('email')} />
        </Field>
        <Field label="Nome do responsável pelas informações" obrigatorio erro={errors.responsavel?.message}>
          <input {...register('responsavel')} />
        </Field>
      </div>
      <Field label="Título da ação ou tecnologia" obrigatorio
        ajuda="Informe o nome ou título da ação ou tecnologia selecionada. Atenção: preencha um formulário para cada ação ou tecnologia."
        erro={errors.titulo?.message}>
        <input {...register('titulo')} />
      </Field>
      <div className="grid">
        <Field label="Diretoria e departamento" obrigatorio
          ajuda="Informe a Diretoria e o departamento a que a ação ou tecnologia está diretamente relacionada."
          erro={errors.diretoria_departamento?.message}>
          <input {...register('diretoria_departamento')} />
        </Field>
        <Field label="Programa/projeto" obrigatorio
          ajuda="Informe o programa e/ou projeto a que a ação ou tecnologia está vinculada."
          erro={errors.programa_projeto?.message}>
          <input {...register('programa_projeto')} />
        </Field>
      </div>
      <Field label="Coordenação/responsável e equipe" obrigatorio
        ajuda="Informe o coordenador e/ou responsável pela ação/tecnologia e pelo relatório, e a lista da equipe participante."
        erro={errors.coordenacao_equipe?.message}>
        <textarea rows={3} {...register('coordenacao_equipe')} />
      </Field>
      <Field label="Ano de desenvolvimento da tecnologia"
        ajuda="No caso de uma tecnologia, informe o ano de lançamento e quando começou a ser transferida."
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
        ajuda="Indique a qual(is) eixo(s) estratégico(s) do IDR-Paraná se relaciona a ação ou tecnologia avaliada."
        erro={errors.eixos?.message as string | undefined}>
        <CheckboxGroup<RelatorioInput> name="eixos" opcoes={EIXOS_ESTRATEGICOS} />
      </Field>
      <Field label="Conexão com Objetivos de Desenvolvimento Sustentável (ODS)" obrigatorio
        ajuda="Indique a qual(is) ODS da ONU se relaciona a ação ou tecnologia avaliada."
        erro={errors.ods?.message as string | undefined}>
        <CheckboxGroup<RelatorioInput> name="ods" opcoes={ODS} colunaUnica />
      </Field>
      <Field label="Resumo descritivo" obrigatorio
        ajuda="Destaque as principais características da ação/tecnologia e suas vantagens em relação à situação anterior, com breve comparação de aspectos positivos e eventuais restrições. Sugestão: histórico, grau de aceitação dos agricultores, evolução das áreas de adoção e regiões. Use linguagem clara, voltada ao público geral. Máx. 3.000 caracteres."
        erro={errors.resumo?.message}>
        <textarea rows={5} {...register('resumo')} />
      </Field>
      <Field label="Abrangência geográfica" obrigatorio
        ajuda="Indique as regiões do Paraná, de outros estados/regiões do Brasil ou outros países onde a ação/tecnologia é adotada ou tem repercussão. Se possível, informe a área estimada (ha) e/ou outra medida de adoção."
        erro={errors.abrangencia_geografica?.message}>
        <textarea rows={3} {...register('abrangencia_geografica')} />
      </Field>
      <p className="campo-ajuda">
        As parcerias e cooperações são informadas na <strong>seção 4</strong> deste formulário.
      </p>
    </section>
  );
}

function ImpactosGerais() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>3. Impactos gerais</h2>
      <Field label="Impactos gerais na cadeia produtiva ou área" obrigatorio
        ajuda="Identifique os principais impactos da ação/tecnologia na respectiva cadeia produtiva e/ou área de atuação, considerando seus principais segmentos (produtores de insumos, produtores rurais, processamento, distribuição e consumo)."
        erro={errors.impactos_gerais?.message}>
        <textarea rows={4} {...register('impactos_gerais')} />
      </Field>
    </section>
  );
}

function ImpactosEconomicos() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  const campo = (
    name: keyof RelatorioInput, label: string, ajuda?: string
  ) => (
    <Field label={label} obrigatorio ajuda={ajuda} erro={errors[name]?.message as string | undefined}>
      <textarea rows={3} {...register(name)} />
    </Field>
  );
  return (
    <section className="cartao">
      <h2>3.2. Avaliação dos impactos econômicos</h2>
      <p className="campo-ajuda">
        Comente os impactos econômicos da ação/tecnologia comparativamente à tecnologia
        adotada anteriormente. Cite o montante estimado e, sobretudo, o papel do IDR-Paraná
        na geração dos impactos. Os valores numéricos correspondentes são informados na seção 4.
      </p>
      {campo('econ_produtividade', 'Incremento de Produtividade', 'Comente os impactos econômicos em relação ao incremento de produtividade. Máx. 3.000 caracteres. Os valores são informados na seção 4.')}
      {campo('econ_reducao_custos', 'Redução de Custos', 'Comente os impactos econômicos em relação à redução de custos. Máx. 3.000 caracteres. Os valores são informados na seção 4.')}
      {campo('econ_expansao_area', 'Expansão da Produção em Novas Áreas', 'Comente os impactos econômicos em relação à expansão da produção em novas áreas. Máx. 3.000 caracteres. Os valores são informados na seção 4.')}
      {campo('econ_agregacao_valor', 'Agregação de Valor', 'Comente os impactos econômicos em relação à agregação de valor. Máx. 3.000 caracteres. Os valores são informados na seção 4.')}
      {campo('econ_memoria_calculo', 'Memória de cálculo', 'Demonstre como os impactos econômicos foram estimados (metodologia do excedente econômico), comparando com a tecnologia anterior, e explique como foram obtidos os números informados na seção 4. Máx. 3.000 caracteres.')}
      {campo('econ_fontes', 'Fontes de dados', 'Informe as fontes dos dados e o procedimento de coleta (entrevistas a produtores, levantamentos da equipe ou de outras instituições, cooperativas etc.). Se consultou usuários, informe o nº de entrevistas e o perfil.')}
    </section>
  );
}

function ImpactosSociais() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>3.3. Avaliação dos impactos sociais</h2>
      <p className="campo-ajuda">
        Descreva os impactos sociais (direção: positivo, negativo ou neutro). Os indicadores
        são do Sistema <strong>Ambitec-Social</strong> (Embrapa): para cada coeficiente, indique
        a direção e, se houver variação, a intensidade. Veja o documento{' '}
        <a href={URL_INDICADORES} target="_blank" rel="noreferrer">Indicadores Sociais e Ambientais</a>.
      </p>
      <p className="grade-legenda">
        Em cada grade, por indicador: <strong>-3</strong> grande diminuição ·
        <strong>-1</strong> moderada diminuição · <strong> 0</strong> sem alteração ·
        <strong>+1</strong> moderado aumento · <strong>+3</strong> grande aumento ·
        <strong> Não se aplica</strong>.
      </p>
      {GRADE_SOCIAL.map((grupo) => {
        const descName = DESC_SOCIAL[grupo.aspecto];
        return (
          <div key={grupo.aspecto} className="aspecto">
            <h3>{grupo.titulo}</h3>
            <Field label={`${grupo.titulo} — descrição/justificativa`} obrigatorio
              ajuda={`Descreva de forma sucinta o impacto da ação ou tecnologia no aspecto ${grupo.titulo}. Se não tiver relação, escreva "Não se aplica".`}
              erro={errors[descName]?.message as string | undefined}>
              <textarea rows={3} {...register(descName)} />
            </Field>
            <GradeImpacto<RelatorioInput> name="grade_social" grupo={grupo} />
            {DOC_INDICADOR[grupo.aspecto] && (
              <p className="link-doc">
                <a href={DOC_INDICADOR[grupo.aspecto]} target="_blank" rel="noreferrer">
                  📄 Descrições dos indicadores — {grupo.titulo}
                </a>
              </p>
            )}
          </div>
        );
      })}
      {errors.grade_social && (
        <div className="erro-msg">{(errors.grade_social.message as string) || 'responda todos os itens das grades sociais.'}</div>
      )}
      <Field label="Conclusão dos impactos sociais" obrigatorio
        ajuda='Com base nos impactos sociais acima, conclua se são positivos, negativos ou neutros, destacando os pontos que justificam a pontuação. Se não tiver relação, escreva "Não se aplica".'
        erro={errors.social_conclusao?.message}>
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
      <p className="campo-ajuda">
        Descreva os impactos ambientais (direção: positivo, negativo ou neutro). Os indicadores
        são dos Sistemas <strong>Ambitec</strong> (Agricultura, Produção Animal e Agroindústria)
        da Embrapa: para cada coeficiente, indique a direção e, se houver variação, a intensidade.
        Veja o documento{' '}
        <a href={URL_INDICADORES} target="_blank" rel="noreferrer">Indicadores Sociais e Ambientais</a>.
      </p>
      <p className="grade-legenda">
        Em cada grade, por indicador: <strong>-3</strong> grande diminuição ·
        <strong>-1</strong> moderada diminuição · <strong> 0</strong> sem alteração ·
        <strong>+1</strong> moderado aumento · <strong>+3</strong> grande aumento ·
        <strong> Não se aplica</strong>.
      </p>
      {GRADE_AMBIENTAL.map((grupo) => {
        const descName = DESC_AMBIENTAL[grupo.aspecto];
        return (
          <div key={grupo.aspecto} className="aspecto">
            <h3>{grupo.titulo}</h3>
            <Field label={`${grupo.titulo} — descrição/justificativa`} obrigatorio
              ajuda={`Descreva de forma sucinta o impacto da ação ou tecnologia no aspecto ${grupo.titulo}. Se não tiver relação, escreva "Não se aplica".`}
              erro={errors[descName]?.message as string | undefined}>
              <textarea rows={3} {...register(descName)} />
            </Field>
            <GradeImpacto<RelatorioInput> name="grade_ambiental" grupo={grupo} />
            {DOC_INDICADOR[grupo.aspecto] && (
              <p className="link-doc">
                <a href={DOC_INDICADOR[grupo.aspecto]} target="_blank" rel="noreferrer">
                  📄 Descrições dos indicadores — {grupo.titulo}
                </a>
              </p>
            )}
          </div>
        );
      })}
      {errors.grade_ambiental && (
        <div className="erro-msg">{(errors.grade_ambiental.message as string) || 'responda todos os itens das grades ambientais.'}</div>
      )}
      <Field label="Conclusão dos impactos ambientais" obrigatorio
        ajuda='Com base nos impactos ambientais acima, conclua se são positivos, negativos ou neutros, destacando os pontos que justificam a pontuação. Se não tiver relação, escreva "Não se aplica".'
        erro={errors.amb_conclusao?.message}>
        <textarea rows={3} {...register('amb_conclusao')} />
      </Field>
    </section>
  );
}

function PlanilhaComplementar() {
  const { control, register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>4. Informações Complementares</h2>
      <p className="campo-ajuda">
        Preencha apenas os blocos que se aplicam à ação/tecnologia. Parcerias e impactos econômicos detalhados.
      </p>

      <h3>Parcerias e cooperações</h3>
      <p className="campo-ajuda">
        Informe os parceiros e cooperadores na ação/tecnologia, citando as funções, os recursos
        e a porcentagem de participação de cada um no impacto observado.
      </p>
      <ListaRepetivel<RelatorioInput>
        control={control}
        name="parcerias"
        itemPadrao={{ instituicao: '', funcao: '' }}
        textoAdicionar="+ Adicionar parceria"
        vazio="Nenhuma parceria informada (clique abaixo para adicionar)."
        renderItem={(i) => (
          <div className="grid">
            <Field label="Instituição" obrigatorio erro={errors.parcerias?.[i]?.instituicao?.message}>
              <input {...register(`parcerias.${i}.instituicao` as const)} />
            </Field>
            <Field label="Função da entidade na parceria">
              <input {...register(`parcerias.${i}.funcao` as const)} />
            </Field>
            <Field label="Valor investido pela entidade parceira (R$)">
              <input type="number" step="any" min={0} {...register(`parcerias.${i}.valor_investido` as const, { valueAsNumber: true })} />
            </Field>
            <Field label="Participação no impacto observado (%)" erro={errors.parcerias?.[i]?.participacao_pct?.message}>
              <input type="number" step="any" min={0} max={100} {...register(`parcerias.${i}.participacao_pct` as const, { valueAsNumber: true })} />
            </Field>
          </div>
        )}
      />

      <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid #eee' }} />

      <h3>Impactos econômicos detalhados</h3>
      <EconomiaDetalhe />
    </section>
  );
}

function Publicacoes() {
  const { register, formState: { errors } } = useFormContext<RelatorioInput>();
  return (
    <section className="cartao">
      <h2>5. Publicações e matérias</h2>
      <Field label="Publicações e matérias (opcional)"
        ajuda="Liste as principais publicações técnico-científicas e matérias jornalísticas que tratam da ação/tecnologia. Insira os links."
        erro={errors.publicacoes?.message}>
        <textarea rows={3} {...register('publicacoes')} />
      </Field>
    </section>
  );
}
