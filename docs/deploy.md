# Deploy

Ordem para colocar tudo no ar a partir de um repositório zerado. O sistema tem
duas partes: o **frontend** (formulário, publicado no GitHub Pages) e o
**backend** (Google Apps Script + Sheets + Drive).

## 0. Conta Google institucional

Tudo (planilha, Drive, Apps Script) deve pertencer a **uma conta Google
institucional** dedicada ao Balanço Social do IDR-Paraná. Não use conta pessoal:
quando a pessoa sair da instituição, o sistema cai junto.

## 1. Criar planilha e pastas no Drive

Na conta institucional, o caminho recomendado é deixar o próprio script criar
os recursos: após o passo 2, execute **`configurarRecursos`** (Setup.gs). Ele
cria a planilha "Balanço Social IDR-Paraná 2025 — Banco", as pastas de anexos
e backups, grava os IDs nas Script Properties e aplica cabeçalhos e formatos.
Criar os recursos pelo script também garante que eles fiquem acessíveis com o
escopo mínimo `drive.file` (ver seção 6.2).

Se preferir criar manualmente:

1. Crie uma planilha "Balanço Social IDR-Paraná 2025 — Banco" — anote o
   **SHEET_ID** (parte da URL entre `/d/` e `/edit`).
2. Crie uma pasta "Balanço Social — Anexos" — anote o **DRIVE_FOLDER_ID**.
3. Crie uma pasta "Balanço Social — Backups" — anote o **BACKUP_FOLDER_ID**.

Em qualquer caso: na planilha e em ambas as pastas, *Compartilhar → Restrito*
(NÃO "Qualquer pessoa com o link").

As 9 abas da planilha (`relatorios`, `eixos`, `ods`, `grade_social`,
`grade_ambiental`, `parcerias`, `econ_detalhe`, `anexos`, `_log`) são criadas
por `configurarRecursos` (ou no primeiro envio), conforme o esquema em
`apps-script/Sheets.gs`. Os nomes de campo devem bater com
`docs/contrato-dados.md`.

## 2. Apps Script (backend)

1. Em <https://script.google.com> → **Novo projeto**.
2. Cole o conteúdo de **todos** os arquivos de `apps-script/` — `Code.gs`,
   `Sheets.gs`, `Drive.gs`, `Validacao.gs`, `Dominio.gs`, `Config.gs`,
   `Setup.gs` e `Importar2024.gs` — em arquivos com os mesmos nomes no editor.
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

### Caminho preferencial: clasp

Em vez de colar arquivo por arquivo, use o `clasp` para manter repositório e
script sincronizados:

```bash
cd apps-script
cp .clasp.example.json .clasp.json  # ignorado pelo Git
# preencha o scriptId (Apps Script → Configurações do projeto → ID do script)
npx clasp login
npx clasp push
```

O `apps-script/.claspignore` já exclui `tests/**` e `.clasp.example.json` do
push — o harness de testes é código Node e **não** pode ir para o Web App
(quebraria o `doPost` com `require is not defined`). Confira que o push não
lista nenhum arquivo de `tests/`.

### Como o backend defende o envio

A submissão é append-only: o `doPost` verifica o reCAPTCHA v3 **no servidor** —
token + action (`relatorio_bs` em envio/edição; `carregar_bs` nas leituras:
carregar, `listar2024` e `carregar2024`) + hostname. O corte de score é deliberadamente baixo (**0.1**): em rede
corporativa (muitos usuários reais atrás do mesmo IP/proxy) um corte alto
reprovava pessoas reais; é ajustável sem deploy via Script Property
`RECAPTCHA_MIN_SCORE`. Completam a defesa: `origin` como fricção leve,
rate-limits por e-mail/IP + **tetos globais por hora** (padrão 150 envios/h e
600 consultas/h no app inteiro, em janela horária fixa; ajustáveis sem deploy
via Script Properties `RATE_GLOBAL_HOURLY` / `RATE_GLOBAL_LOAD_HOURLY` — suba-os
na semana do prazo final se houver `429` legítimo), validação estrita de
domínio/grades, verificação de magic bytes nos anexos, escape anti-fórmula e
`LockService`.

No envio o backend gera o `protocolo` (`BS2025-yyyyMMdd-HHmmss-<rand4>`, com
verificação de unicidade) e acrescenta uma linha em `relatorios`. A
edição (`acao: 'editar'`) acrescenta uma **nova versão** do mesmo protocolo; as
abas filhas são regravadas por (`protocolo`, `versao`), preservando o histórico.

## 3. reCAPTCHA v3

1. Acesse <https://www.google.com/recaptcha/admin/create>.
2. Tipo: **reCAPTCHA v3**.
3. Domínios: `balanco-social-idrparana.github.io` e `localhost` (para desenvolvimento).
4. Anote:
   - **Site key** (pública) → vai para o frontend como `VITE_RECAPTCHA_SITE_KEY`.
   - **Secret key** → vai para o Apps Script como `RECAPTCHA_SECRET` (passo 2.4).
5. O frontend executa o reCAPTCHA com as actions `relatorio_bs` (envio/edição) e
   `carregar_bs` (carregar para editar); o backend valida action, hostname e
   score. O formulário exibe, acima do botão de envio, um aviso de privacidade
   com a atribuição do reCAPTCHA (links para a Política de Privacidade e os
   Termos do Google).

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
   o status check **CI / build** (job `build` de `.github/workflows/ci.yml`,
   que roda build + testes do form e do backend + `npm audit` em `pull_request`
   e em push na `main`) e proibir force-push.
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
4. Salve. A função exporta a planilha para a pasta `BACKUP_FOLDER_ID` e faz a
   rotação automática: cópias mais antigas que **8 semanas** vão para a lixeira
   (`LIMITS.BACKUP_RETENCAO_SEMANAS` em `apps-script/Config.gs`).

## 5.1 Reaproveitamento dos relatórios de 2024 (opcional)

Permite que o autor de um relatório de 2024 comece um relatório **novo** de 2025
já preenchido com os dados do ano anterior (só revisa e atualiza o que mudou).
Como 2024 não tinha protocolo, a busca é por **e-mail**: o formulário lista os
relatórios daquele e-mail e o autor escolhe qual reaproveitar.

Os dados de 2024 ficam num **snapshot** na aba `import_2024` do banco, populado
uma vez pela função de manutenção `importar2024` (`apps-script/Importar2024.gs`).
Depois de importado, o recurso não depende mais da planilha original.

1. *Configurações do projeto → Propriedades do script* — adicione:
   - `IMPORT_2024_SHEET_ID` — ID da **Planilha Google** de respostas de 2024.
     `SpreadsheetApp.openById` só abre Planilhas Google nativas; se a fonte for
     um `.xlsx`, abra-a e faça *Arquivo → Salvar como Planilhas Google*, e use o
     ID da cópia.
   - `IMPORT_2024_TAB` *(opcional)* — nome da aba de respostas detalhadas.
     Padrão: `Respostas ao formulário 2`.
2. A conta que roda o script precisa ter acesso de leitura a essa planilha.
3. No editor, execute **`importar2024`** uma vez. Ele valida o cabeçalho (âncoras
   de coluna), mapeia cada linha para o formato de 2025 e grava em `import_2024`.
   O log informa quantos relatórios foram importados e eventuais avisos
   (e-mails ausentes, registros truncados). É **idempotente**: reexecutar
   reescreve a aba do zero.
4. *Implantar → Gerenciar implantações → Editar → Nova versão* (reaproveita a URL
   `/exec`). No reCAPTCHA admin nada muda (as ações `listar2024`/`carregar2024`
   usam a action `carregar_bs`, já registrada). Rebuild/redeploy do frontend.

O que **não** é importado (o autor completa no formulário de 2025): as conclusões
social e ambiental, as parcerias (em 2024 eram texto livre; em 2025 é lista
estruturada), os valores econômicos detalhados (seção 4) e os anexos. Coeficientes
de grade sem resposta em 2024 ficam em branco. Privacidade (LGPD): `import_2024`
guarda e-mails e textos; as ações web só devolvem os relatórios cujo e-mail bate
com o informado (o autor só vê os próprios).

## 6. Verificações pós-deploy

- [ ] Abrir o formulário em `/form/` e enviar um relatório fictício completo.
- [ ] Conferir a nova linha em `relatorios` e as linhas nas abas filhas
      (`eixos`, `ods`, `grade_social`, `grade_ambiental`, `parcerias`,
      `econ_detalhe`, `anexos`) com o mesmo `protocolo`.
- [ ] Conferir o registro em `_log`.
- [ ] Conferir os anexos `foto_documento` na pasta privada do Drive (a UI só
      envia anexos desse tipo; os dados da planilha complementar são
      preenchidos na seção 4 do formulário).
- [ ] `curl -X POST <VITE_API_URL>` sem token e com origin errado → erro/recusa.
- [ ] Enviar relatórios em sequência rápida do mesmo IP → rate limit recusa.
- [ ] Tentar enviar um `.exe` renomeado para `.pdf` → recusado.
- [ ] Rodar `backupSemanal` manualmente uma vez → backup aparece na pasta.
- [ ] No formulário, abrir "Editar usando o protocolo", informar o protocolo do
      teste + o e-mail usado → o formulário carrega preenchido.
- [ ] Alterar um campo e salvar → resposta indica `v2`; conferir nova linha em
      `relatorios` com mesmo `protocolo` e `versao=2`, e abas filhas com `versao=2`
      (as linhas `versao=1` permanecem intactas).
- [ ] Tentar carregar com e-mail errado → `404` ("não encontrado para este e-mail").
- [ ] *(Se usar o import de 2024)* No formulário, abrir "Preencheu um relatório em
      2024? Reaproveitar os dados", informar um e-mail com relatórios de 2024 →
      a lista aparece; escolher um → o formulário abre pré-preenchido como
      relatório **novo** (sem protocolo, com o aviso de revisão).

## 6.1 Atualizar um deployment já existente (migração do versionamento)

Para um banco que já tinha dados antes do versionamento:

1. Cole/atualize os arquivos de `apps-script/` no editor (em especial `Code.gs`,
   `Sheets.gs`, `Config.gs`, `Validacao.gs`).
2. Execute `configurarRecursos` **uma vez** — ele acrescenta a coluna `versao` no
   **fim** de cada aba (sem deslocar dados existentes). Linhas antigas ficam com
   `versao` em branco e são tratadas como **v1**.
3. *Implantar → Gerenciar implantações → Editar → Nova versão* (reaproveita a URL
   `/exec`, não muda o `VITE_API_URL`).
4. No reCAPTCHA admin, nenhuma mudança é necessária (a action `carregar_bs` usa a
   mesma chave). Rebuild/redeploy do frontend pelo GitHub Actions.

## 6.2 Mudança de escopo OAuth (`auth/drive` → `auth/drive.file`)

O `appsscript.json` passou a pedir o escopo restrito
`https://www.googleapis.com/auth/drive.file` (acesso apenas aos arquivos
criados pelo próprio script) em vez do escopo amplo `auth/drive`. Ao atualizar
o deployment será preciso **reautorizar** o script. A planilha e as pastas
foram criadas pelo próprio script (`configurarRecursos`), então continuam
acessíveis com o escopo restrito. Se `backupSemanal` falhar com erro de
permissão após a troca, execute `configurarRecursos` novamente; em último
caso, reverta temporariamente para `auth/drive`.

## 7. Operação, retenção e acesso mínimo

- **Backups**: rotação automática — cópias mais antigas que 8 semanas vão para
  a lixeira (`LIMITS.BACKUP_RETENCAO_SEMANAS`).
- **Limpar dados de teste**: `limparDadosDeTeste` (em `Setup.gs`) exige a
  Script Property `CONFIRMAR_LIMPEZA=SIM-APAGAR-TUDO` (guarda de uso único,
  apagada após a execução) e grava um backup antes de apagar.
- **Após mudar o schema**: reexecute `configurarRecursos` — além de criar/
  atualizar as abas, ele aplica formato de texto (`@`) às colunas de texto,
  evitando que o Sheets converta textos como `03/2021` em data.
- **Acesso mínimo**: planilha e pastas ficam "Restrito". A equipe de revisão do
  Balanço Social recebe acesso **somente leitura**; registre quem tem acesso.
  A planilha contém e-mails crus e o `_log` de auditoria — quando possível,
  compartilhe uma visão/cópia sem a coluna `email`.

## Rotação / troca de conta dona

1. Na conta nova: criar planilha e pastas idênticas.
2. Atualizar as Propriedades do script no Apps Script (sem trocar o código).
3. Re-implantar reaproveitando a URL (*Gerenciar implantações → Editar*).
4. Nenhuma alteração no GitHub é necessária.
