# Deploy

Ordem para colocar tudo no ar a partir de um repositório zerado. O sistema tem
duas partes: o **frontend** (formulário, publicado no GitHub Pages) e o
**backend** (Google Apps Script + Sheets + Drive).

## 0. Conta Google institucional

Tudo (planilha, Drive, Apps Script) deve pertencer a **uma conta Google
institucional** dedicada ao Balanço Social do IDR-Paraná. Não use conta pessoal:
quando a pessoa sair da instituição, o sistema cai junto.

## 1. Criar planilha e pastas no Drive

Na conta institucional:

1. Crie uma planilha "Balanço Social IDR-Paraná 2025 — Relatórios" — anote o
   **SHEET_ID** (parte da URL entre `/d/` e `/edit`).
2. Crie uma pasta "Balanço Social — Anexos" — anote o **DRIVE_FOLDER_ID**.
3. Crie uma pasta "Balanço Social — Backups" — anote o **BACKUP_FOLDER_ID**.
4. Na planilha e em ambas as pastas: *Compartilhar → Restrito* (NÃO "Qualquer
   pessoa com o link").

As abas da planilha (`relatorios`, `eixos`, `ods`, `grade_social`,
`grade_ambiental`, `anexos`, `_log`) são criadas pelo Apps Script no primeiro
envio, conforme o esquema em `apps-script/Sheets.gs`. Os nomes de campo devem
bater com `docs/contrato-dados.md`.

## 2. Apps Script (backend)

1. Em <https://script.google.com> → **Novo projeto**.
2. Cole o conteúdo dos arquivos de `apps-script/` (por exemplo `Code.gs`,
   `Sheets.gs`, `Drive.gs`, `Validacao.gs`, `Config.gs`) em arquivos com os
   mesmos nomes no editor.
3. Substitua o `appsscript.json` pelo do repositório (*Configurações do projeto*
   → marcar "Mostrar arquivo de manifesto appsscript.json no editor").
4. *Configurações do projeto → Propriedades do script* — adicione:
   - `SHEET_ID` — ID da planilha (passo 1.1).
   - `DRIVE_FOLDER_ID` — ID da pasta de anexos (passo 1.2).
   - `BACKUP_FOLDER_ID` — ID da pasta de backups (passo 1.3).
   - `RECAPTCHA_SECRET` — secret key do reCAPTCHA v3 (passo 3).
   - `ALLOWED_ORIGIN` = `https://balanco-social-idrparana.github.io`
   - `IP_HASH_SALT` — string aleatória de 32+ caracteres (usada para anonimizar
     o IP no `_log`).
5. *Implantar → Nova implantação → Tipo: aplicativo da Web*:
   - Descrição: ex. "Balanço Social — relatorio_bs".
   - Executar como: **Eu**.
   - Quem pode acessar: **Qualquer pessoa**.
   - Anote a **URL** terminada em `/exec` — é o `VITE_API_URL`.

A submissão é append-only: o `doPost` valida honeypot (`website_url`),
reCAPTCHA v3 (action `relatorio_bs`), `origin` e rate limit; gera o `protocolo`
(`BS2025-yyyyMMdd-HHmmss-<rand4>`) e acrescenta uma linha em `relatorios`,
regravando as abas filhas por `protocolo`.

## 3. reCAPTCHA v3

1. Acesse <https://www.google.com/recaptcha/admin/create>.
2. Tipo: **reCAPTCHA v3**.
3. Domínios: `balanco-social-idrparana.github.io` e `localhost` (para desenvolvimento).
4. Anote:
   - **Site key** (pública) → vai para o frontend como `VITE_RECAPTCHA_SITE_KEY`.
   - **Secret key** → vai para o Apps Script como `RECAPTCHA_SECRET` (passo 2.4).
5. O frontend executa o reCAPTCHA com a action `relatorio_bs`; o backend valida
   action e score.

## 4. GitHub (frontend + Pages)

A organização é `balanco-social-idrparana` e o repositório é `balanco-social-idrparana.github.io`,
de modo que o site é servido em `https://balanco-social-idrparana.github.io/` e o
formulário em `https://balanco-social-idrparana.github.io/form/`.

1. Crie o repositório (público) e suba o código.
2. *Settings → Pages → Source: **GitHub Actions***.
3. *Settings → Secrets and variables → Actions → New repository secret*:
   - `VITE_API_URL` = URL `/exec` do passo 2.5.
   - `VITE_RECAPTCHA_SITE_KEY` = site key do passo 3.4.
4. *Settings → Branches → Branch protection rule* em `main`: exigir PR, exigir
   status checks (audit) e proibir force-push.
5. *Settings → Code security → Dependabot alerts* + *Dependabot security
   updates*: ativar.
6. Um push em `main` (ou *Run workflow* manual) dispara `pages.yml`, que faz o
   build do `form/` com `BASE_URL=/form/` e publica:
   - Página índice em `https://balanco-social-idrparana.github.io/`
   - Formulário em `https://balanco-social-idrparana.github.io/form/`

## 5. Acionador de backup semanal

No projeto do Apps Script (passo 2):

1. *Acionadores* (ícone de relógio) → **Adicionar acionador**.
2. Função a executar: `backupSemanal`.
3. Origem do evento: **Baseado no tempo** → temporizador semanal.
4. Salve. A função exporta a planilha para a pasta `BACKUP_FOLDER_ID`.

## 6. Verificações pós-deploy

- [ ] Abrir o formulário em `/form/` e enviar um relatório fictício completo.
- [ ] Conferir a nova linha em `relatorios` e as linhas nas abas filhas
      (`eixos`, `ods`, `grade_social`, `grade_ambiental`, `anexos`) com o mesmo
      `protocolo`.
- [ ] Conferir o registro em `_log`.
- [ ] Conferir o anexo `planilha_complementar` na pasta privada do Drive.
- [ ] `curl -X POST <VITE_API_URL>` sem token e com origin errado → erro/recusa.
- [ ] Enviar relatórios em sequência rápida do mesmo IP → rate limit recusa.
- [ ] Tentar enviar um `.exe` renomeado para `.pdf` → recusado.
- [ ] Rodar `backupSemanal` manualmente uma vez → backup aparece na pasta.

## Rotação / troca de conta dona

1. Na conta nova: criar planilha e pastas idênticas.
2. Atualizar as Propriedades do script no Apps Script (sem trocar o código).
3. Re-implantar reaproveitando a URL (*Gerenciar implantações → Editar*).
4. Nenhuma alteração no GitHub é necessária.
