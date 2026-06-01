# Balanço Social — IDR-Paraná 2025

Sistema de coleta dos **relatórios de impacto** de ações e tecnologias do
Instituto de Desenvolvimento Rural do Paraná (IDR-Paraná), para compor o
**Balanço Social 2025**. Cada submissão é um relatório de uma ação ou
tecnologia, com avaliação de impactos econômicos, sociais e ambientais pela
metodologia **Ambitec-Agro** (escala `-3 | -1 | 0 | +1 | +3 | Não se aplica`).

Substitui o antigo Google Form por um formulário próprio (frontend estático)
ligado a um backend Google Apps Script que grava em uma planilha Google Sheets e
guarda os anexos no Google Drive.

## Componentes

| Diretório | O que é | Onde roda |
|---|---|---|
| `form/` | SPA pública do formulário de relatório (Vite + React + TS + Zod) | GitHub Pages |
| `apps-script/` | Backend Google Apps Script (`doPost` grava em Sheets/Drive; gera protocolo e acrescenta linha) | script.google.com |
| `docs/` | Documentação: contrato de dados, campos e deploy | — |

Banco de dados: planilha Google Sheets privada. Anexos: pasta privada no Google
Drive. Tudo acessado pelo Apps Script (deploy "Executar como: eu; quem pode
acessar: qualquer pessoa").

URL pública alvo: <https://balanco-social-idrparana.github.io> — o formulário é servido em
`/form/`.

## Por que esta arquitetura

- **Sem servidor pago, sem container**: GitHub Pages + Apps Script + Sheets
  cobrem o volume esperado (relatórios internos do IDR-Paraná).
- **Continuidade com a stack atual**: substitui um Google Form mantendo Sheets
  como base de dados, familiar às equipes.
- **Auditável**: o código é todo público; o que é sensível (ID da planilha, ID
  das pastas do Drive, chave secreta do reCAPTCHA) vive no `PropertiesService`
  do Apps Script, fora do Git.

## Segurança (resumo — detalhes em `docs/deploy.md`)

- Planilha e pastas do Drive **restritas** (não compartilhadas por link).
- IDs e segredos (`SHEET_ID`, `DRIVE_FOLDER_ID`, `BACKUP_FOLDER_ID`,
  `RECAPTCHA_SECRET`, `ALLOWED_ORIGIN`, `IP_HASH_SALT`) ficam no Script
  Properties do Apps Script.
- `doPost` valida honeypot (`website_url`), reCAPTCHA v3 (action
  `relatorio_bs`), `origin` e aplica rate limit por IP.
- Submissão é **append-only**: o backend gera um `protocolo`
  (`BS2025-yyyyMMdd-HHmmss-<rand4>`) e acrescenta uma linha por relatório.

## Estrutura de pastas

```
balanco-social/
├── form/                 # frontend (Vite + React + TS)
│   ├── src/              # schema, dados compartilhados e componentes
│   ├── public/           # ativos servidos (planilha complementar, orientações)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .env.example
├── apps-script/          # backend Google Apps Script (.gs)
├── docs/
│   ├── contrato-dados.md # fonte de verdade dos campos
│   ├── campos.md         # referência de campos e abas da planilha
│   └── deploy.md         # passo a passo de publicação
├── .github/workflows/    # CI: build do form e deploy no GitHub Pages
├── .gitignore
└── README.md
```

## Desenvolvimento local

Pré-requisito: Node 24 (ou compatível) e npm.

```bash
cd form
npm install

# Crie o arquivo de variáveis a partir do exemplo e preencha os valores.
cp .env.example .env.local

npm run dev
```

Variáveis necessárias (em `form/.env.local`):

- `VITE_API_URL` — URL pública (`/exec`) do Web App do Apps Script.
- `VITE_RECAPTCHA_SITE_KEY` — site key (pública) do reCAPTCHA v3.

Scripts disponíveis (`form/`):

- `npm run dev` — servidor de desenvolvimento Vite.
- `npm run build` — checagem de tipos (`tsc -b`) e build de produção.
- `npm run preview` — pré-visualiza o build de produção.
- `npm run audit` — auditoria de dependências de produção.

## Documentação

- **Campos do formulário e abas da planilha**: [`docs/campos.md`](docs/campos.md).
- **Contrato de dados (fonte de verdade dos nomes de campo)**:
  [`docs/contrato-dados.md`](docs/contrato-dados.md).
- **Publicação (planilha, Drive, Apps Script, reCAPTCHA, GitHub Pages)**:
  [`docs/deploy.md`](docs/deploy.md).
