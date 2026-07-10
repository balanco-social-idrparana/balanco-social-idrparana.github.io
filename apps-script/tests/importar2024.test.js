'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, ORIGIN_PADRAO } = require('./harness');

// Monta uma linha da planilha de respostas de 2024 (74 colunas, na ordem do
// formulário). Valores de grade distintos por posição para verificar o
// mapeamento posicional aspecto→coeficiente.
function linha2024(over) {
  over = over || {};
  const row = new Array(74).fill('');
  row[0] = '5/13/2025 14:26:32';
  row[1] = over.email !== undefined ? over.email : 'lucatelli@idr.pr.gov.br';
  row[2] = 'Marcos Antonio Lucatelli';
  row[3] = over.titulo !== undefined ? over.titulo : 'Cadeia da uva na RMC';
  row[4] = 'Lais Adamuchio';
  row[5] = 'Fruticultura';
  row[6] = 'Laís Adamuchio / Marcos';
  row[7] = '2016';
  row[8] = over.eixos !== undefined ? over.eixos
    : 'Competitividade e renda, Segurança alimentar e nutricional';
  // ODS com vírgula interna no rótulo — não pode ser split ingênuo por vírgula.
  row[9] = over.ods !== undefined ? over.ods
    : '2. Fome zero e agricultura sustentável, 9. Indústria, inovação e infraestrutura';
  row[10] = 'Resumo 2024';
  row[11] = 'Sul da RMC';
  row[12] = 'Cooperante, Embrapa (texto livre de parcerias)';
  row[13] = 'Impactos gerais 2024';
  for (let c = 14; c <= 19; c++) row[c] = 'Econ col ' + c;
  // Social: emprego(4), renda(3), bemestar(3), gestao(5)
  row[20] = 'desc emprego';
  row[21] = '3'; row[22] = '+1'; row[23] = '0'; row[24] = 'Não se aplica';
  row[25] = 'desc renda';
  row[26] = '-1'; row[27] = '-3'; row[28] = over.rendaUltimo !== undefined ? over.rendaUltimo : '1';
  row[29] = 'desc bemestar';
  row[30] = '0'; row[31] = '0'; row[32] = '0';
  row[33] = 'desc gestao';
  for (let c = 34; c <= 38; c++) row[c] = '1';
  // Ambiental: eficiencia(8), conservacao(5), recuperacao(4), bemestar_animal(4), qualidade(6)
  row[39] = 'desc eficiencia';
  for (let c = 40; c <= 47; c++) row[c] = '0';
  row[48] = 'desc conservacao';
  for (let c = 49; c <= 53; c++) row[c] = '0';
  row[54] = 'desc recuperacao';
  for (let c = 55; c <= 58; c++) row[c] = '0';
  row[59] = 'desc bemestar animal';
  for (let c = 60; c <= 63; c++) row[c] = '0';
  row[64] = 'desc qualidade';
  for (let c = 65; c <= 70; c++) row[c] = '0';
  row[71] = 'Publicacoes 2024';
  row[72] = 'foto.jpg';
  row[73] = 'planilha.xlsx';
  return row;
}

// mapearLinha2024_ cria objetos DENTRO do vm (outro realm); o round-trip por
// JSON os traz para o realm do teste (deepEqual cross-realm falharia por
// protótipo) e ainda confirma que o resultado é serializável.
function mapear(env, over) {
  return JSON.parse(JSON.stringify(env.ctx.mapearLinha2024_(linha2024(over))));
}

// ─── Mapeamento posicional 2024 → RelatorioInput ─────────────────────────────

test('mapearLinha2024_ mapeia identificação, eixos e ODS (com vírgula interna)', () => {
  const env = criarAmbiente();
  const m = mapear(env);
  assert.equal(m.email, 'lucatelli@idr.pr.gov.br');
  assert.equal(m.dados.titulo, 'Cadeia da uva na RMC');
  assert.equal(m.dados.diretoria_departamento, 'Lais Adamuchio');
  assert.equal(m.dados.programa_projeto, 'Fruticultura');
  assert.equal(m.dados.ano_tecnologia, '2016');
  assert.deepEqual(m.dados.eixos, ['Competitividade e renda', 'Segurança alimentar e nutricional']);
  assert.deepEqual(m.dados.ods, [
    '2. Fome zero e agricultura sustentável',
    '9. Indústria, inovação e infraestrutura'
  ]);
});

test('mapearLinha2024_ casa a grade por posição, renomeando o último de Emprego', () => {
  const env = criarAmbiente();
  const m = mapear(env);
  const emprego = m.dados.grade_social.filter((g) => g.aspecto === 'emprego');
  assert.deepEqual(emprego, [
    { aspecto: 'emprego', coeficiente: 'Capacitação', valor: '3' },
    { aspecto: 'emprego', coeficiente: 'Oportunidade de emprego local qualificado', valor: '1' },
    { aspecto: 'emprego', coeficiente: 'Oferta de emprego', valor: '0' },
    // 2024 "Condição do trabalhador" → 2025 "Qualidade do emprego"; "Não se aplica" → NA
    { aspecto: 'emprego', coeficiente: 'Qualidade do emprego', valor: 'NA' }
  ]);
  // Ambiental completa: 27 coeficientes.
  assert.equal(m.dados.grade_ambiental.length, 27);
});

test('mapearLinha2024_ omite coeficiente sem resposta (grade fica incompleta)', () => {
  const env = criarAmbiente();
  const m = mapear(env, { rendaUltimo: '' });
  const renda = m.dados.grade_social.filter((g) => g.aspecto === 'renda');
  assert.equal(renda.length, 2); // o 3º coeficiente (vazio) foi omitido
});

test('mapearLinha2024_ deixa conclusões vazias e parcerias/econ_detalhe padrão', () => {
  const env = criarAmbiente();
  const m = mapear(env);
  assert.equal(m.dados.social_conclusao, '');
  assert.equal(m.dados.amb_conclusao, '');
  assert.deepEqual(m.dados.parcerias, []);
  assert.equal(m.dados.econ_detalhe.produtividade.ano, '2025');
  assert.equal(m.dados.social_emprego_desc, 'desc emprego');
  assert.equal(m.dados.amb_qualidade_produto_desc, 'desc qualidade');
  assert.equal(m.dados.publicacoes, 'Publicacoes 2024');
});

test('relatório de 2024 pré-preenchido só falta as conclusões (grade completa)', () => {
  const env = criarAmbiente();
  // Preenche o último coeficiente de renda para a grade social ficar completa.
  const m = mapear(env, { rendaUltimo: '1' });
  const r = env.post(Object.assign(
    { acao: 'enviar', origin: ORIGIN_PADRAO, recaptcha_token: 'relatorio_bs' },
    m.dados
  ));
  assert.equal(r._status, 400, JSON.stringify(r));
  // As conclusões não existiam em 2024 → é só o que o autor precisa completar.
  assert.deepEqual((r.campos || []).sort(), ['amb_conclusao', 'social_conclusao']);
});

// ─── Ações web listar2024 / carregar2024 (gate por e-mail) ───────────────────

function seedImport2024(env) {
  const aba = env.ctx.garantirCabecalho(env.planilha, 'import_2024');
  const regs = [
    { id: 'BS2024-001', email: 'lucatelli@idr.pr.gov.br', titulo: 'Cadeia da uva na RMC' },
    { id: 'BS2024-002', email: 'lucatelli@idr.pr.gov.br', titulo: 'Outra ação do autor' },
    { id: 'BS2024-003', email: 'outro@idr.pr.gov.br', titulo: 'Ação de terceiro' }
  ].map((r) => ({
    id: r.id,
    email_norm: env.ctx.normalizarEmail(r.email),
    email: r.email,
    responsavel: 'Responsável',
    titulo: r.titulo,
    diretoria_departamento: 'Diretoria',
    programa_projeto: 'Programa',
    dados_json: JSON.stringify({ titulo: r.titulo, email: r.email, resumo: 'resumo' })
  }));
  const linhas = regs.map((r) => env.ctx.montarLinha('import_2024', r));
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, env.ctx.SCHEMA.import_2024.length).setValues(linhas);
}

function req(env, corpo) {
  return env.post(Object.assign({ origin: ORIGIN_PADRAO, recaptcha_token: 'carregar_bs' }, corpo));
}

test('listar2024 devolve só os relatórios do próprio e-mail', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'listar2024', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.equal(r.itens.length, 2);
  assert.deepEqual(r.itens.map((x) => x.id).sort(), ['BS2024-001', 'BS2024-002']);
  assert.equal(r.itens[0].titulo.length > 0, true);
});

test('listar2024 para e-mail sem relatórios devolve lista vazia', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'listar2024', email: 'ninguem@idr.pr.gov.br' });
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.deepEqual(r.itens, []);
});

test('listar2024 sem tabela import_2024 devolve lista vazia (não quebra)', () => {
  const env = criarAmbiente();
  const r = req(env, { acao: 'listar2024', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.deepEqual(r.itens, []);
});

test('carregar2024 devolve os dados para o autor', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'carregar2024', id: 'BS2024-001', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 200, JSON.stringify(r));
  assert.equal(r.dados.titulo, 'Cadeia da uva na RMC');
});

test('carregar2024 de outro autor devolve 404 (gate por e-mail)', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'carregar2024', id: 'BS2024-003', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 404, JSON.stringify(r));
});

test('carregar2024 com id inexistente devolve 404', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'carregar2024', id: 'BS2024-999', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 404, JSON.stringify(r));
});

test('carregar2024 com id em formato inválido devolve 400', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  const r = req(env, { acao: 'carregar2024', id: 'x</script>', email: 'lucatelli@idr.pr.gov.br' });
  assert.equal(r._status, 400, JSON.stringify(r));
});

test('listar2024/carregar2024 com e-mail inválido devolvem 400', () => {
  const env = criarAmbiente();
  seedImport2024(env);
  assert.equal(req(env, { acao: 'listar2024', email: 'sem-arroba' })._status, 400);
  assert.equal(req(env, { acao: 'carregar2024', id: 'BS2024-001', email: 'sem-arroba' })._status, 400);
});
