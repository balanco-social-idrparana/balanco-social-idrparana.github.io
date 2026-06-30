# Contrato de dados — Balanço Social IDR-Paraná 2025

Fonte: *Formulário de Relatório de Impactos para o Balanço Social 2025* (IDR-Paraná).
Uma submissão = um **relatório** de uma **ação ou tecnologia**. Metodologia de
impacto: **Ambitec-Agro** (escala `-3 | -1 | 0 | +1 | +3 | Não se aplica`).

Este documento é a **única fonte de verdade** dos nomes de campo. O schema do
frontend (`form/src/schema/relatorio.ts`) e o schema da planilha
(`apps-script/Sheets.gs`) DEVEM bater exatamente com os nomes abaixo.

> Não há CNPJ/CPF/CEP. Não há consentimento LGPD (formulário interno). Defesa
> anti-abuso: honeypot `hp_token` (nome neutro — `website_url` era autopreenchido
> pelo navegador e bloqueava envios legítimos) + reCAPTCHA v3 (`recaptcha_token`) +
> validação de `origin` + rate-limit, conforme `gestaodeater`.

## Identificação do relatório

Sem chave natural estável (o título não é garantido único). O backend gera um
`protocolo` no primeiro envio e **acrescenta** uma nova linha por submissão
(append-only).

```
protocolo = 'BS2025-' + yyyyMMdd-HHmmss + '-' + random4
```

### Versionamento (editar pelo protocolo)

O `protocolo` é estável; cada edição grava uma **nova versão** (`versao` = 1 no
primeiro envio, `max(protocolo)+1` a cada edição). O histórico é preservado: a
versão "atual" é sempre a de maior `versao`. Linhas legadas (anteriores ao
versionamento) têm `versao` em branco e contam como **v1**.

Ações do `doPost` (campo `acao` no payload, default `enviar`):

- `enviar` — novo relatório (gera protocolo, grava v1). Comportamento original.
- `editar` — grava nova versão de um `protocolo` existente. Exige autoria: o
  `email` informado precisa bater (normalizado) com o da última versão.
- `carregar` — retorna a última versão de um `protocolo` para reedição. Mesmo
  gate de autoria (`protocolo` + `email`). Resposta para protocolo inexistente e
  e-mail divergente é idêntica (`404`), para não revelar a existência do protocolo.

## Aba `relatorios` (principal) — colunas, nesta ordem

| coluna | origem no formulário | obrigatório |
|---|---|---|
| `protocolo` | gerado pelo backend | — |
| `email` | E-mail | sim |
| `responsavel` | NOME DO RESPONSÁVEL PELAS INFORMAÇÕES | sim |
| `titulo` | TÍTULO DA AÇÃO OU TECNOLOGIA | sim |
| `diretoria_departamento` | DIRETORIA E DEPARTAMENTO | sim |
| `programa_projeto` | PROGRAMA/PROJETO | sim |
| `coordenacao_equipe` | COORDENAÇÃO/RESPONSÁVEL E EQUIPE | sim |
| `ano_tecnologia` | ANO DE DESENVOLVIMENTO DE TECNOLOGIA | não |
| `resumo` | RESUMO DESCRITIVO | sim |
| `abrangencia_geografica` | ABRANGÊNCIA GEOGRÁFICA | sim |
| `impactos_gerais` | IMPACTOS GERAIS NA CADEIA PRODUTIVA OU ÁREA | sim |
| `econ_produtividade` | Econômicos — Incremento de Produtividade | sim |
| `econ_reducao_custos` | Econômicos — Redução de Custos | sim |
| `econ_expansao_area` | Econômicos — Expansão da Produção em Novas Áreas | sim |
| `econ_agregacao_valor` | Econômicos — Agregação de Valor | sim |
| `econ_memoria_calculo` | Econômicos — Memória de Cálculo | sim |
| `econ_fontes` | Econômicos — Fontes de Dados | sim |
| `social_emprego_desc` | Sociais — Aspecto Emprego (texto) | sim |
| `social_renda_desc` | Sociais — Aspecto Renda (texto) | sim |
| `social_bemestar_desc` | Sociais — Aspecto Bem-estar e Saúde (texto) | sim |
| `social_gestao_desc` | Sociais — Aspecto Gestão e Administração (texto) | sim |
| `social_conclusao` | Sociais — Conclusão | sim |
| `amb_eficiencia_desc` | Ambientais — Eficiência Tecnológica (texto) | sim |
| `amb_conservacao_desc` | Ambientais — Conservação Ambiental (texto) | sim |
| `amb_recuperacao_desc` | Ambientais — Recuperação Ambiental (texto) | sim |
| `amb_bemestar_animal_desc` | Ambientais — Bem-estar e Saúde Animal (texto) | sim |
| `amb_qualidade_produto_desc` | Ambientais — Qualidade do Produto (texto) | sim |
| `amb_conclusao` | Ambientais — Conclusão | sim |
| `publicacoes` | PUBLICAÇÕES E MATÉRIAS | não |
| `beneficio_economico_total` | soma dos benefícios econômicos (R$) calculados (backend) | — |
| `indice_social` | média dos coeficientes sociais aplicáveis (backend) | — |
| `indice_ambiental` | média dos coeficientes ambientais aplicáveis (backend) | — |
| `criado_em` | timestamp do servidor | — |
| `status` | `pendente_revisao` (default) | — |
| `versao` | versão da edição (backend; 1, 2, …; em branco = legado/v1) | — |

## Abas filhas (replace-all por `protocolo` + `versao`)

`versao` é a **última coluna** de cada aba versionada (acréscimo no fim para não
deslocar dados legados). A escrita substitui apenas o par (`protocolo`, `versao`)
da edição corrente — versões anteriores nunca são tocadas.

- `eixos`: `protocolo`, `eixo`, `versao`  — um registro por eixo marcado (≥1 obrigatório)
- `ods`: `protocolo`, `ods`, `versao`  — um registro por ODS marcado (≥1 obrigatório)
- `grade_social`: `protocolo`, `aspecto`, `coeficiente`, `valor`, `versao`
- `grade_ambiental`: `protocolo`, `aspecto`, `coeficiente`, `valor`, `versao`
- `parcerias`: `protocolo`, `instituicao`, `funcao`, `valor_investido`, `participacao_pct`, `versao`
- `econ_detalhe`: `protocolo`, `tipo`, `ano`, `anterior`, `atual`, `preco`, `custo`,
  `ganho_unitario`, `participacao_idr`, `area`, `ganho_liquido`, `beneficio`,
  `outros_estados_ha`, `outros_paises_ha`, `versao`  — uma linha por `tipo` preenchido
- `anexos`: `protocolo`, `tipo`, `nome_arquivo`, `drive_file_id`, `tamanho_bytes`, `criado_em`, `versao`
  — na edição sem novo upload, os anexos da versão anterior são herdados (carry-forward)
- `_log`: `timestamp`, `ip_hash`, `origin`, `acao`, `ref`, `detalhe`

`valor` ∈ `{ '-3','-1','0','1','3','NA' }` (string). `NA` = "Não se aplica".
`tipo` de anexo ∈ `{ 'foto_documento', 'planilha_complementar' }`.
`tipo` de `econ_detalhe` ∈ `{ 'produtividade', 'reducao_custos', 'expansao', 'agregacao' }`.
Campos calculados (`ganho_unitario`, `ganho_liquido`, `beneficio`) são derivados no
backend com as mesmas fórmulas da planilha (ver `form/src/data/economia.ts`).

## Payload JSON (frontend → Apps Script `doPost`)

Todos os escalares acima (exceto os gerados pelo backend) + arrays:

```jsonc
{
  "email": "...", "responsavel": "...", "titulo": "...",
  "diretoria_departamento": "...", "programa_projeto": "...",
  "coordenacao_equipe": "...", "ano_tecnologia": "...",
  "eixos": ["Competitividade e renda", ...],            // subset de EIXOS
  "ods": ["1. Erradicação da pobreza", ...],            // subset de ODS
  "resumo": "...", "abrangencia_geografica": "...",
  "impactos_gerais": "...",
  "econ_produtividade": "...", "econ_reducao_custos": "...",
  "econ_expansao_area": "...", "econ_agregacao_valor": "...",
  "econ_memoria_calculo": "...", "econ_fontes": "...",
  "parcerias": [{ "instituicao":"...", "funcao":"...", "valor_investido":0, "participacao_pct":0 }],
  "econ_detalhe": {
    "produtividade": { "ano":"2025", "anterior":0, "atual":0, "preco":0, "custo":0, "participacao_idr":0, "area":0, "outros_estados_ha":0, "outros_paises_ha":0 },
    "reducao_custos": { "ano":"2025", "anterior":0, "atual":0, "participacao_idr":0, "area":0, "outros_estados_ha":0, "outros_paises_ha":0 },
    "expansao":       { "ano":"2025", "anterior":0, "atual":0, "participacao_idr":0, "area":0, "outros_estados_ha":0, "outros_paises_ha":0 },
    "agregacao":      { "ano":"2025", "anterior":0, "atual":0, "participacao_idr":0, "area":0, "outros_estados_ha":0, "outros_paises_ha":0 }
  },
  "social_emprego_desc": "...", "social_renda_desc": "...",
  "social_bemestar_desc": "...", "social_gestao_desc": "...",
  "social_conclusao": "...",
  "grade_social":    [{ "aspecto":"emprego", "coeficiente":"Capacitação", "valor":"1" }, ...],
  "amb_eficiencia_desc":"...", "amb_conservacao_desc":"...",
  "amb_recuperacao_desc":"...", "amb_bemestar_animal_desc":"...",
  "amb_qualidade_produto_desc":"...", "amb_conclusao":"...",
  "grade_ambiental": [{ "aspecto":"eficiencia", "coeficiente":"Uso de energia", "valor":"NA" }, ...],
  "publicacoes": "...",
  "anexos": [{ "tipo":"planilha_complementar", "nome":"...", "mime":"...", "base64":"..." }, ...],
  "hp_token": "",               // honeypot (deve vir vazio; nome neutro p/ evitar autofill)
  "recaptcha_token": "...",
  "origin": "https://balanco-social-idrparana.github.io"
}
```

### Regras de validação (cliente E servidor)

- Escalares obrigatórios acima não vazios.
- `eixos.length >= 1`, `ods.length >= 1`.
- `grade_social` e `grade_ambiental` devem conter **uma entrada para cada
  coeficiente** definido em `form/src/data/grades.ts` (todas respondidas;
  `NA` conta como resposta). `valor` ∈ enum acima.
- Anexos são **opcionais** (parcerias e impactos econômicos agora são preenchidos
  no formulário). `parcerias` e `econ_detalhe` também são opcionais — preenche-se
  o que se aplica; `participacao_pct`/`participacao_idr` ∈ [0,100].
- MIME permitido: planilha (`.xlsx`, `.xls`), PDF, JPEG, PNG. Limites de
  tamanho em `apps-script/Config.gs`.

## Aspectos (chaves) e grupos de coeficientes

Ver `form/src/data/grades.ts` — fonte de verdade dos coeficientes. Chaves:

- Social: `emprego`, `renda`, `bemestar`, `gestao`
- Ambiental: `eficiencia`, `conservacao`, `recuperacao`, `bemestar_animal`, `qualidade_produto`
