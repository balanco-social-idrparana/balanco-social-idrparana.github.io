# Contrato de dados — Balanço Social IDR-Paraná 2025

Fonte: *Formulário de Relatório de Impactos para o Balanço Social 2025* (IDR-Paraná).
Uma submissão = um **relatório** de uma **ação ou tecnologia**. Metodologia de
impacto: **Ambitec-Agro** (escala `-3 | -1 | 0 | +1 | +3 | Não se aplica`).

Este documento é a **única fonte de verdade** dos nomes de campo. O schema do
frontend (`form/src/schema/relatorio.ts`) e o schema da planilha
(`apps-script/Sheets.gs`) DEVEM bater exatamente com os nomes abaixo.

> Não há CNPJ/CPF/CEP. Não há consentimento LGPD (formulário interno). Defesa
> anti-abuso: honeypot `website_url` + reCAPTCHA v3 (`recaptcha_token`) +
> validação de `origin` + rate-limit, conforme `gestaodeater`.

## Identificação do relatório

Sem chave natural estável (o título não é garantido único). O backend gera um
`protocolo` e **acrescenta** uma nova linha por submissão (append-only).

```
protocolo = 'BS2025-' + yyyyMMdd-HHmmss + '-' + random4
```

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
| `parcerias_confirmado` | PARCERIAS E COOPERAÇÕES (checkbox de confirmação) | sim |
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
| `indice_social` | média dos coeficientes sociais aplicáveis (backend) | — |
| `indice_ambiental` | média dos coeficientes ambientais aplicáveis (backend) | — |
| `criado_em` | timestamp do servidor | — |
| `status` | `pendente_revisao` (default) | — |

## Abas filhas (replace-all por `protocolo`)

- `eixos`: `protocolo`, `eixo`  — um registro por eixo marcado (≥1 obrigatório)
- `ods`: `protocolo`, `ods`  — um registro por ODS marcado (≥1 obrigatório)
- `grade_social`: `protocolo`, `aspecto`, `coeficiente`, `valor`
- `grade_ambiental`: `protocolo`, `aspecto`, `coeficiente`, `valor`
- `anexos`: `protocolo`, `tipo`, `nome_arquivo`, `drive_file_id`, `tamanho_bytes`, `criado_em`
- `_log`: `timestamp`, `ip_hash`, `origin`, `acao`, `ref`, `detalhe`

`valor` ∈ `{ '-3','-1','0','1','3','NA' }` (string). `NA` = "Não se aplica".
`tipo` de anexo ∈ `{ 'foto_documento', 'planilha_complementar' }`.

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
  "parcerias_confirmado": true,
  "impactos_gerais": "...",
  "econ_produtividade": "...", "econ_reducao_custos": "...",
  "econ_expansao_area": "...", "econ_agregacao_valor": "...",
  "econ_memoria_calculo": "...", "econ_fontes": "...",
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
  "website_url": "",            // honeypot (deve vir vazio)
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
- Anexo obrigatório: pelo menos um com `tipo='planilha_complementar'`.
  Fotos/documentos (`tipo='foto_documento'`) são opcionais.
- MIME permitido: planilha (`.xlsx`, `.xls`), PDF, JPEG, PNG. Limites de
  tamanho em `apps-script/Config.gs`.

## Aspectos (chaves) e grupos de coeficientes

Ver `form/src/data/grades.ts` — fonte de verdade dos coeficientes. Chaves:

- Social: `emprego`, `renda`, `bemestar`, `gestao`
- Ambiental: `eficiencia`, `conservacao`, `recuperacao`, `bemestar_animal`, `qualidade_produto`
