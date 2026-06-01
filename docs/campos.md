# Referência de campos — Balanço Social IDR-Paraná 2025

Cada submissão do formulário é **um relatório** de **uma ação ou tecnologia** do
IDR-Paraná. A avaliação de impactos segue a metodologia **Ambitec-Agro**.

A **fonte de verdade** dos nomes de campo é
[`contrato-dados.md`](contrato-dados.md). Esta página descreve, em linguagem de
referência para quem preenche e para quem mantém o sistema, todos os campos do
formulário e as abas da planilha. Ao alterar o esquema, mantenha sincronizados:

1. `docs/contrato-dados.md` — contrato (fonte de verdade dos nomes).
2. `form/src/schema/relatorio.ts` — schema Zod do frontend.
3. `form/src/data/grades.ts` e `form/src/data/eixos.ts` — listas compartilhadas.
4. `apps-script/Sheets.gs` — esquema da planilha.
5. Este arquivo.

## Escala de impacto (Ambitec-Agro)

Cada coeficiente das grades social e ambiental recebe um valor desta escala.
`Não se aplica` é uma resposta válida — não pode ficar em branco.

| Valor gravado | Exibição | Significado |
|---|---|---|
| `-3` | -3 | Impacto negativo grande |
| `-1` | -1 | Impacto negativo pequeno |
| `0` | 0 | Sem alteração |
| `1` | +1 | Impacto positivo pequeno |
| `3` | +3 | Impacto positivo grande |
| `NA` | Não se aplica | Coeficiente não pertinente a esta ação/tecnologia |

## Identificação do relatório

Não há chave natural estável (o título não é necessariamente único). O backend
gera um **protocolo** e acrescenta uma nova linha por submissão (append-only):

```
protocolo = BS2025-yyyyMMdd-HHmmss-<rand4>
```

## Aba `relatorios` (principal — uma linha por relatório)

A ordem das colunas abaixo é a ordem na planilha.

| Coluna | Rótulo no formulário | Obrigatório | Observação |
|---|---|---|---|
| `protocolo` | — | gerado | Identificador único do relatório. |
| `email` | E-mail | sim | E-mail do responsável pelas informações. |
| `responsavel` | Nome do responsável pelas informações | sim | |
| `titulo` | Título da ação ou tecnologia | sim | |
| `diretoria_departamento` | Diretoria e departamento | sim | |
| `programa_projeto` | Programa/projeto | sim | |
| `coordenacao_equipe` | Coordenação/responsável e equipe | sim | |
| `ano_tecnologia` | Ano de desenvolvimento da tecnologia | não | |
| `resumo` | Resumo descritivo | sim | |
| `abrangencia_geografica` | Abrangência geográfica | sim | |
| `impactos_gerais` | Impactos gerais na cadeia produtiva ou área | sim | |
| `econ_produtividade` | Econômicos — Incremento de produtividade | sim | |
| `econ_reducao_custos` | Econômicos — Redução de custos | sim | |
| `econ_expansao_area` | Econômicos — Expansão da produção em novas áreas | sim | |
| `econ_agregacao_valor` | Econômicos — Agregação de valor | sim | |
| `econ_memoria_calculo` | Econômicos — Memória de cálculo | sim | |
| `econ_fontes` | Econômicos — Fontes de dados | sim | |
| `social_emprego_desc` | Sociais — Aspecto Emprego (descrição) | sim | |
| `social_renda_desc` | Sociais — Aspecto Renda (descrição) | sim | |
| `social_bemestar_desc` | Sociais — Aspecto Bem-estar e Saúde (descrição) | sim | |
| `social_gestao_desc` | Sociais — Aspecto Gestão e Administração (descrição) | sim | |
| `social_conclusao` | Sociais — Conclusão | sim | |
| `amb_eficiencia_desc` | Ambientais — Eficiência Tecnológica (descrição) | sim | |
| `amb_conservacao_desc` | Ambientais — Conservação Ambiental (descrição) | sim | |
| `amb_recuperacao_desc` | Ambientais — Recuperação Ambiental (descrição) | sim | |
| `amb_bemestar_animal_desc` | Ambientais — Bem-estar e Saúde Animal (descrição) | sim | |
| `amb_qualidade_produto_desc` | Ambientais — Qualidade do Produto (descrição) | sim | |
| `amb_conclusao` | Ambientais — Conclusão | sim | |
| `publicacoes` | Publicações e matérias | não | |
| `beneficio_economico_total` | — | calculado | Soma (R$) dos benefícios econômicos dos blocos preenchidos. |
| `indice_social` | — | calculado | Média dos coeficientes sociais aplicáveis (ignora `NA`). |
| `indice_ambiental` | — | calculado | Média dos coeficientes ambientais aplicáveis (ignora `NA`). |
| `criado_em` | — | gerado | Timestamp do servidor. |
| `status` | — | gerado | Inicia em `pendente_revisao`. |

## Abas filhas (regravadas por `protocolo`)

Quantas linhas surgem por relatório:

- **`eixos`** — `protocolo`, `eixo`. Uma linha por eixo estratégico marcado
  (no mínimo um).
- **`ods`** — `protocolo`, `ods`. Uma linha por ODS marcado (no mínimo um).
- **`grade_social`** — `protocolo`, `aspecto`, `coeficiente`, `valor`. Uma linha
  por coeficiente social (todos respondidos; `NA` conta como resposta).
- **`grade_ambiental`** — `protocolo`, `aspecto`, `coeficiente`, `valor`. Uma
  linha por coeficiente ambiental (todos respondidos).
- **`parcerias`** — `protocolo`, `instituicao`, `funcao`, `valor_investido`,
  `participacao_pct`. Uma linha por parceria informada (opcional).
- **`econ_detalhe`** — `protocolo`, `tipo`, `ano`, `anterior`, `atual`, `preco`,
  `custo`, `ganho_unitario`, `participacao_idr`, `area`, `ganho_liquido`,
  `beneficio`, `outros_estados_ha`, `outros_paises_ha`. Uma linha por bloco
  econômico preenchido. `tipo` ∈ `{ produtividade, reducao_custos, expansao,
  agregacao }`; `ganho_unitario`/`ganho_liquido`/`beneficio` são calculados.
- **`anexos`** — `protocolo`, `tipo`, `nome_arquivo`, `drive_file_id`,
  `tamanho_bytes`, `criado_em`. O `drive_file_id` não é exposto. `tipo` ∈
  `{ foto_documento }` (fotos/documentos opcionais).
- **`_log`** — `timestamp`, `ip_hash`, `origin`, `acao`, `ref`, `detalhe`.
  Interno.

## Eixos estratégicos

Lista fechada (marque ao menos um). Fonte: `form/src/data/eixos.ts`.

- Competitividade e renda
- Segurança alimentar e nutricional
- Promoção social e cidadania
- Sustentabilidade ambiental

## Objetivos de Desenvolvimento Sustentável (ODS)

Lista fechada (marque ao menos um). Fonte: `form/src/data/eixos.ts`.

| # | ODS |
|---|---|
| 1 | Erradicação da pobreza |
| 2 | Fome zero e agricultura sustentável |
| 3 | Saúde e bem-estar |
| 4 | Educação de qualidade |
| 5 | Igualdade de gênero |
| 6 | Água potável e saneamento |
| 7 | Energia limpa e acessível |
| 8 | Trabalho decente e crescimento econômico |
| 9 | Indústria, inovação e infraestrutura |
| 10 | Redução das desigualdades |
| 11 | Cidades e comunidades sustentáveis |
| 12 | Consumo e produção sustentáveis |
| 13 | Ação contra a mudança global do clima |
| 14 | Vida na água |
| 15 | Vida terrestre |
| 16 | Paz, justiça e instituições eficazes |
| 17 | Parcerias e meios de implementação |

## Grade de impactos sociais

Cada coeficiente recebe um valor da escala de impacto. `aspecto` é a chave
gravada na planilha; o título é o que aparece na seção. Fonte:
`form/src/data/grades.ts`.

### Emprego (`emprego`)

- Capacitação
- Oportunidade de emprego local qualificado
- Oferta de emprego
- Qualidade do emprego

### Renda (`renda`)

- Geração de renda do estabelecimento
- Diversidade de fontes de renda
- Valor da propriedade

### Bem-estar e Saúde (`bemestar`)

- Saúde ambiental e pessoal
- Segurança e saúde ocupacional
- Segurança alimentar

### Gestão e Administração (`gestao`)

- Dedicação e perfil do responsável
- Condição de comercialização
- Reciclagem de resíduos
- Relacionamento institucional
- Capital social (agroindústria)

## Grade de impactos ambientais

### Eficiência Tecnológica (`eficiencia`)

- Uso de agroquímicos (inseticidas, fungicidas e herbicidas)
- Uso de fertilizantes e corretivos
- Insumos veterinários (medicamentos e vacinas)
- Produtos para alimentação animal
- Uso de energia
- Uso de recursos naturais - água
- Uso de recursos naturais - solo (área de produção)
- Uso de matérias-primas e aditivos na agroindústria

### Conservação Ambiental (`conservacao`)

- Qualidade da atmosfera
- Capacidade produtiva do solo
- Qualidade da água
- Geração de resíduos sólidos
- Biodiversidade

### Recuperação Ambiental (`recuperacao`)

- Recuperação de solos degradados
- Recuperação de ecossistemas degradados
- Recomposição de áreas de preservação permanente
- Reserva legal

### Bem-estar e Saúde Animal (`bemestar_animal`)

- Conforto térmico
- Acesso a fontes de água
- Acesso a fontes de suplementos alimentares
- Conduta ética de abate ou descarte

### Qualidade do Produto (`qualidade_produto`)

- Presença de aditivos em produto de origem animal ou vegetal in natura
- Resíduos químicos em produto de origem animal ou vegetal in natura
- Contaminantes biológicos em produto de origem animal ou vegetal in natura
- Presença de aditivos em produto agroindustrial ou na cadeia
- Resíduos químicos em produto agroindustrial ou na cadeia
- Contaminantes biológicos em produto agroindustrial ou na cadeia

## Seção 4 — Planilha complementar (parcerias + impactos econômicos)

Esta seção **incorpora no formulário** os dados que antes eram preenchidos na
planilha `.xlsx` complementar. Todo o preenchimento é **opcional** (informe o que
se aplica). A planilha permanece disponível para download apenas como referência.

### Parcerias e cooperações (aba `parcerias`)

Tabela repetível — uma linha por parceria:

| Campo | Coluna | Observação |
|---|---|---|
| Instituição | `instituicao` | Obrigatório se a linha existir. |
| Função da entidade na parceria | `funcao` | |
| Valor investido pela entidade parceira (R$) | `valor_investido` | Número ≥ 0. |
| Participação no impacto observado (%) | `participacao_pct` | 0 a 100. |

### Impactos econômicos detalhados (aba `econ_detalhe`)

Quatro blocos (`produtividade`, `reducao_custos`, `expansao`, `agregacao`). Cada
bloco coleta os valores de entrada; o sistema **calcula** o ganho unitário, o
ganho líquido IDR e o benefício econômico com as mesmas fórmulas da planilha:

- `ganho_unitario` — produtividade: `(atual − anterior) × preço − custo`;
  redução de custos: `anterior − atual`; expansão/agregação: `atual − anterior`.
- `ganho_liquido` = `ganho_unitario × participacao_idr / 100`.
- `beneficio` = `ganho_liquido × area`.

Entradas por bloco: `ano`, `anterior`, `atual`, `preco`/`custo` (só
produtividade), `participacao_idr` (%), `area` (área de adoção/expansão ou
produção estimada), `outros_estados_ha`, `outros_paises_ha`. O
`beneficio_economico_total` da aba `relatorios` é a soma dos benefícios.

## Anexos (fotos e documentos)

| Tipo | Chave | Obrigatório | Observação |
|---|---|---|---|
| Fotos e documentos | `foto_documento` | não | Imagens e documentos de apoio (vários). |

Tipos de arquivo aceitos: PDF, JPEG e PNG. Os limites de tamanho são definidos em
`apps-script/Config.gs`. **A planilha complementar não é mais anexada** — seus
dados são informados na seção 4 (o backend ainda aceita o tipo de arquivo de
planilha, mas o formulário não oferece esse upload).

## Regras de validação (cliente e servidor)

- Todos os campos obrigatórios da aba `relatorios` preenchidos (não vazios).
- Ao menos um eixo estratégico e ao menos um ODS marcados.
- As grades social e ambiental com **todos** os coeficientes respondidos
  (`NA` conta como resposta); nenhum coeficiente desconhecido.
- `parcerias` e `econ_detalhe` são opcionais; valores numéricos ≥ 0 e
  percentuais em [0, 100]. Anexos são opcionais.
- O campo oculto `website_url` (honeypot) deve vir vazio; reCAPTCHA v3 (action
  `relatorio_bs`) válido e `origin` autorizado.
