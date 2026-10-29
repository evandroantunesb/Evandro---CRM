// Base fictícia de demonstração: cria uma empresa SEPARADA ("Raion Solar Demo") e semeia
// 4 closers + 1 SDR fictícios, 35 negócios, 90 dias de histórico visual,
// ganhos/perdas/pagamentos/comissões e gamificação — tudo através dos mecanismos
// reais do CRM (triggers, RPCs, sessões autenticadas de cada membro). Nunca insere
// em `point_ledger`, `eventos` nem `conquistas_desbloqueadas`.
//
// Desenho aprovado por Evandro em 2026-10-05; estratégia "empresa separada" aprovada
// no mesmo dia, depois do diagnóstico de dependências da limpeza.
//
// NÃO APAGA NADA. Nenhuma linha de nenhuma empresa existente é removida ou alterada:
// a empresa de origem (onde ADMIN_EMAIL é admin) só é LIDA, para copiar a configuração
// de gamificação e os parâmetros da calculadora. Tudo o que é escrito nasce dentro da
// empresa demo nova.
//
// Uso:
//   node scripts/seed-base-demo.mjs                        # dry run: valida e mostra o plano
//                                                          # (com a demo já existente: diagnostica
//                                                          #  e mostra o plano de retomada)
//   CRIAR_BASE_DEMO=sim node scripts/seed-base-demo.mjs    # cria a empresa demo de verdade
//   RETOMAR_BASE_DEMO=sim node scripts/seed-base-demo.mjs  # completa uma demo parcial, só o que falta
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL (admin da empresa de
// origem, vira admin da demo) e, só se esse admin for admin de mais de uma empresa,
// EMPRESA_ORIGEM_ID.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "vando12star@gmail.com";
const EMPRESA_ORIGEM_ID = process.env.EMPRESA_ORIGEM_ID || null;
const CRIAR_BASE_DEMO = process.env.CRIAR_BASE_DEMO === "sim";
const RETOMAR_BASE_DEMO = process.env.RETOMAR_BASE_DEMO === "sim";
const NOME_EMPRESA_DEMO = "Raion Solar Demo";
const SENHA_DEMO = "123456";
const UM_DIA_MS = 24 * 60 * 60 * 1000;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const AGORA = new Date();

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function hA(dias) {
  return new Date(AGORA.getTime() - dias * UM_DIA_MS).toISOString();
}

async function falhaSe(condicao, mensagem) {
  if (condicao) {
    console.error(mensagem);
    process.exit(1);
  }
}

/** Mesma fórmula de src/lib/calculadora.ts calcular() — mantida em sincronia manualmente. */
function calcular({ potenciaKwp, precoKit, consumoMedioKwh, tarifaKwh, produtividadeKwhKwpMes, percentualFioB, disponibilidadeKwh }) {
  const geracaoEstimadaKwhMes = potenciaKwp * produtividadeKwhKwpMes;
  let kwhFaturado = Math.max(consumoMedioKwh - geracaoEstimadaKwhMes, disponibilidadeKwh);
  kwhFaturado = Math.min(kwhFaturado, consumoMedioKwh);
  const kwhCompensado = Math.max(consumoMedioKwh - kwhFaturado, 0);
  const custoFioB = kwhCompensado * tarifaKwh * percentualFioB;
  const contaSemSolar = consumoMedioKwh * tarifaKwh;
  const contaComSolar = kwhFaturado * tarifaKwh + custoFioB;
  const economiaMensal = contaSemSolar - contaComSolar;
  return {
    geracaoEstimadaKwhMes: arredondar(geracaoEstimadaKwhMes, 2),
    kwhFaturado: arredondar(kwhFaturado, 2),
    kwhCompensado: arredondar(kwhCompensado, 2),
    custoFioB: arredondar(custoFioB, 2),
    contaSemSolar: arredondar(contaSemSolar, 2),
    contaComSolar: arredondar(contaComSolar, 2),
    economiaMensal: arredondar(economiaMensal, 2),
    paybackMeses: economiaMensal > 0 ? arredondar(precoKit / economiaMensal, 1) : null,
  };
}

const DISPONIBILIDADE_COLUNA = {
  monofasico: "disponibilidade_mono_kwh",
  bifasico: "disponibilidade_bi_kwh",
  trifasico: "disponibilidade_tri_kwh",
};

// ---------------------------------------------------------------------------
// Sessões reais — gamification_rules, confirmar_pagamento, fechar_comissao,
// calcular_receita_causal_comissao e aceitar_handoff só aceitam `authenticated`
// (revogados de service_role), e o motor de gamificação só credita eventos com
// `auth.uid()` preenchido — então toda ação que deve gerar XP/eventos reais
// roda com a sessão de verdade do membro responsável, nunca com a service role.
// ---------------------------------------------------------------------------
const sessoesPorEmail = new Map();

async function clienteComo(email) {
  if (sessoesPorEmail.has(email)) return sessoesPorEmail.get(email);
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const tokenHash = link.properties?.hashed_token;
  if (!tokenHash) throw new Error(`Não recebi hashed_token do generateLink pra ${email}.`);

  const clienteVerificacao = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: sessao, error: eVerify } = await clienteVerificacao.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (eVerify) throw eVerify;

  const cliente = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: eSessao } = await cliente.auth.setSession({
    access_token: sessao.session.access_token,
    refresh_token: sessao.session.refresh_token,
  });
  if (eSessao) throw eSessao;
  sessoesPorEmail.set(email, cliente);
  return cliente;
}

// ---------------------------------------------------------------------------
// 1. Admin, empresa de origem e checagem de duplicidade (só leitura)
// ---------------------------------------------------------------------------

async function listarUsuariosAuth() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users;
}

async function resolverAdminEOrigem(usuariosAuth) {
  const admin = usuariosAuth.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  await falhaSe(!admin, `Não achei nenhum usuário com e-mail ${ADMIN_EMAIL}.`);

  const { data: vinculos, error } = await db
    .from("empresa_membros")
    .select("empresa_id, empresas(nome)")
    .eq("user_id", admin.id)
    .eq("papel", "admin")
    .eq("ativo", true);
  if (error) throw error;
  const candidatas = vinculos.filter((v) => v.empresas?.nome !== NOME_EMPRESA_DEMO);

  let origem;
  if (EMPRESA_ORIGEM_ID) {
    origem = candidatas.find((v) => v.empresa_id === EMPRESA_ORIGEM_ID);
    await falhaSe(!origem, `${ADMIN_EMAIL} não é admin ativo da empresa EMPRESA_ORIGEM_ID=${EMPRESA_ORIGEM_ID}.`);
  } else {
    await falhaSe(!candidatas.length, `${ADMIN_EMAIL} não é admin ativo de nenhuma empresa para servir de origem da configuração.`);
    await falhaSe(
      candidatas.length > 1,
      `${ADMIN_EMAIL} é admin de ${candidatas.length} empresas (${candidatas.map((c) => `${c.empresas?.nome} = ${c.empresa_id}`).join("; ")}). ` +
        "Defina EMPRESA_ORIGEM_ID com a empresa cuja configuração deve ser copiada.",
    );
    origem = candidatas[0];
  }
  return { adminUserId: admin.id, origemId: origem.empresa_id, origemNome: origem.empresas?.nome ?? "(sem nome)" };
}

// Não existe slug nem coluna própria para marcar a empresa demo (e não vale criar
// migration só para isso). Os identificadores estáveis disponíveis são o nome exato da
// empresa e os e-mails fixos dos 5 fictícios — o script recusa rodar se qualquer um
// dos dois já estiver em uso, em vez de criar "Raion Solar Demo 2".
async function encontrarDemoExistente(usuariosAuth) {
  const { data: porNome, error } = await db.from("empresas").select("id, nome, situacao").eq("nome", NOME_EMPRESA_DEMO);
  if (error) throw error;

  const emailsDemo = new Set(PESSOAS.map((p) => p.email.toLowerCase()));
  const usuariosDemo = usuariosAuth.filter((u) => emailsDemo.has(u.email?.toLowerCase()));
  let vinculosAtivos = [];
  if (usuariosDemo.length) {
    const { data, error: eVinc } = await db
      .from("empresa_membros")
      .select("empresa_id, user_id, empresas(nome)")
      .in(
        "user_id",
        usuariosDemo.map((u) => u.id),
      )
      .eq("ativo", true);
    if (eVinc) throw eVinc;
    vinculosAtivos = data ?? [];
  }
  return { porNome: porNome ?? [], usuariosDemo, vinculosAtivos };
}

// ---------------------------------------------------------------------------
// 2. Configuração da empresa demo
//
// Inventário do que a empresa demo JÁ GANHA dos gatilhos de `empresas` ao nascer
// (não é recriado, para não duplicar):
//   - criar_padroes_empresa(): funil "Vendas" + 4 etapas e 9 origens;
//   - criar_motivos_padrao(): 7 motivos de perda;
//   - criar_parametros_calculadora_padrao(): 1 linha de parametros_calculadora
//     (valores padrão — sobrescritos com os da empresa de origem, via UPDATE).
// Nada de gamificação, modelos, kits ou recompensas nasce com a empresa.
//
// A gamificação da demo é PRÓPRIA (aprovada por Evandro em 2026-10-05), não copiada
// da origem: a origem não tem níveis/conquistas ativos e suas regras ativas são de
// eventos não pontuáveis. Usa só eventos pontuáveis do catálogo atual
// (src/lib/gamificacao.ts) e é criada pela sessão do admin — mesmo caminho e mesmas
// policies das telas de Gamificação > Administração. A empresa de origem não é tocada.
// Não copiado: modelos de contrato/proposta e identidade da proposta (texto e logos
// da empresa real), kits, etiquetas, equipes, formulários de captura.
// ---------------------------------------------------------------------------

// Marcados `naoPontuavel` ou `legado` em src/lib/gamificacao.ts — guarda contra regra
// da demo cair num deles por engano.
const EVENTOS_NAO_PONTUAVEIS = new Set(["deal.created", "deal.stage_changed", "deal.owner_changed", "task.created", "note.created", "deal.first_contact_done"]);
// Exigem teto (EVENTOS_TETO_OBRIGATORIO) — sem ele o motor ignora a regra.
const EVENTOS_TETO_OBRIGATORIO = new Set(["task.completed", "reuniao.realizada", "visita.realizada"]);

const REGRAS_DEMO = [
  { nome: "Entrou em negociação", evento_tipo: "deal.negotiation_started", perfil_aplicavel: "closer", xp: 10, moedas: 0, unica_por_negocio: true },
  { nome: "Negócio ganho", evento_tipo: "deal.won", perfil_aplicavel: "closer", xp: 20, moedas: 0, unica_por_negocio: true },
  {
    nome: "Venda acima de R$ 50 mil",
    evento_tipo: "deal.won",
    perfil_aplicavel: "closer",
    xp: 20,
    moedas: 0,
    unica_por_negocio: true,
    condicao: { campo: "valor", operador: ">=", valor: "50000" },
  },
  { nome: "Contrato assinado", evento_tipo: "contrato.assinado", perfil_aplicavel: "closer", xp: 50, moedas: 40, unica_por_negocio: true },
  { nome: "Pagamento confirmado", evento_tipo: "pagamento.confirmado", perfil_aplicavel: "closer", xp: 30, moedas: 30, unica_por_negocio: true },
  { nome: "Reunião realizada", evento_tipo: "reuniao.realizada", perfil_aplicavel: "closer", xp: 10, moedas: 0, limite_periodo: "dia", limite_quantidade: 5 },
  { nome: "Lead entregue para vendas", evento_tipo: "handoff.created", perfil_aplicavel: "sdr", xp: 5, moedas: 0, unica_por_negocio: true },
  { nome: "Oportunidade aceita", evento_tipo: "oportunidade_aceita", perfil_aplicavel: "sdr", xp: 10, moedas: 5, unica_por_negocio: true },
  { nome: "Lead entregue virou venda", evento_tipo: "handoff.won", perfil_aplicavel: "sdr", xp: 30, moedas: 20, unica_por_negocio: true },
  { nome: "Contrato da oportunidade originada", evento_tipo: "handoff.contrato_assinado", perfil_aplicavel: "sdr", xp: 20, moedas: 0, unica_por_negocio: true },
  {
    nome: "Primeiro contato realizado",
    evento_tipo: "task.completed",
    perfil_aplicavel: "sdr",
    xp: 2,
    moedas: 0,
    condicao: { campo: "resultado", operador: "=", valor: "contato_realizado" },
    limite_periodo: "dia",
    limite_quantidade: 20,
  },
  { nome: "Negócio qualificado", evento_tipo: "deal.qualified", perfil_aplicavel: "sdr", xp: 5, moedas: 0, unica_por_negocio: true },
];

const NIVEIS_DEMO = [
  { nivel: 1, nome: "Iniciante", xp_minimo: 0 },
  { nivel: 2, nome: "Bronze", xp_minimo: 100 },
  { nivel: 3, nome: "Prata", xp_minimo: 250 },
  { nivel: 4, nome: "Ouro", xp_minimo: 450 },
  { nivel: 5, nome: "Diamante", xp_minimo: 700 },
];

const CONQUISTAS_DEMO = [
  { nome: "Primeira assinatura", icone: "✍️", descricao: "Assinou o primeiro contrato.", criterio: { metrica: "marco_contagem", marco: "contrato.assinado", valor: 1 }, perfil_aplicavel: "closer", xp_bonus: 10 },
  { nome: "Cinco contratos", icone: "🏅", descricao: "Assinou cinco contratos.", criterio: { metrica: "marco_contagem", marco: "contrato.assinado", valor: 5 }, perfil_aplicavel: "closer", xp_bonus: 30 },
  { nome: "Primeiro pagamento", icone: "💰", descricao: "Teve o primeiro pagamento confirmado.", criterio: { metrica: "marco_contagem", marco: "pagamento.confirmado", valor: 1 }, perfil_aplicavel: "closer", xp_bonus: 10 },
  { nome: "Negociador", icone: "🤝", descricao: "Levou cinco negócios à negociação.", criterio: { metrica: "marco_contagem", marco: "deal.negotiation_started", valor: 5 }, perfil_aplicavel: "closer", xp_bonus: 15 },
  { nome: "Ponte de vendas", icone: "🌉", descricao: "Três leads entregues viraram venda.", criterio: { metrica: "marco_contagem", marco: "handoff.won", valor: 3 }, perfil_aplicavel: "sdr", xp_bonus: 20 },
  // Bônus 0 de propósito: conquista por XP não alimenta o próprio XP.
  { nome: "Rumo ao Ouro", icone: "🥇", descricao: "Acumulou 500 XP.", criterio: { metrica: "xp_acumulado", valor: 500 }, perfil_aplicavel: null, xp_bonus: 0 },
  { nome: "Qualificador", icone: "🎯", descricao: "Qualificou cinco negócios.", criterio: { metrica: "marco_contagem", marco: "deal.qualified", valor: 5 }, perfil_aplicavel: "sdr", xp_bonus: 10 },
];

const RECOMPENSAS_DEMO = [
  { nome: "Café da manhã especial", descricao: "Café da manhã para a equipe por conta da empresa.", custo_moedas: 80 },
  { nome: "Vale-presente R$ 100", descricao: "Vale-presente em loja parceira.", custo_moedas: 200 },
  { nome: "Meio período de folga", descricao: "Meio período de folga, combinado com o gestor.", custo_moedas: 400 },
];

// Resultado esperado pelo plano dos 35 negócios com a configuração acima (XP inclui
// o bônus das conquistas). Só para conferência — nunca é escrito em lugar nenhum.
const ESPERADO_POR_PESSOA = {
  lucas: { xp: 605, nivel: "Ouro", moedas: 290 },
  mariana: { xp: 420, nivel: "Prata", moedas: 220 },
  rafael: { xp: 210, nivel: "Bronze", moedas: 110 },
  bruno: { xp: 130, nivel: "Bronze", moedas: 70 },
  gabriel: { xp: 355, nivel: "Prata", moedas: 125 },
};

const PARAMETROS_COPIADOS = [
  "comissao_percentual",
  "custo_engenharia",
  "custo_instalacao_por_modulo",
  "custo_material_ca_por_kwp",
  "disponibilidade_bi_kwh",
  "disponibilidade_mono_kwh",
  "disponibilidade_tri_kwh",
  "percentual_fio_b",
  "produtividade_kwh_kwp_mes",
];

function conferirGamificacaoDemo() {
  const bloqueios = [];
  for (const r of REGRAS_DEMO) {
    if (EVENTOS_NAO_PONTUAVEIS.has(r.evento_tipo)) bloqueios.push(`regra "${r.nome}" usa evento não pontuável ${r.evento_tipo}.`);
    if (EVENTOS_TETO_OBRIGATORIO.has(r.evento_tipo) && !(r.limite_periodo && r.limite_quantidade)) bloqueios.push(`regra "${r.nome}" precisa de teto.`);
  }
  for (let i = 1; i < NIVEIS_DEMO.length; i++) {
    if (NIVEIS_DEMO[i].xp_minimo <= NIVEIS_DEMO[i - 1].xp_minimo) bloqueios.push("níveis com XP mínimo fora de ordem.");
  }
  return bloqueios;
}

async function carregarParametrosOrigem(origemId) {
  const { data, error } = await db.from("parametros_calculadora").select(PARAMETROS_COPIADOS.join(", ")).eq("empresa_id", origemId).single();
  if (error) throw error;
  return data;
}

function imprimirPlano({ origemId, origemNome, demoExistente }) {
  console.log(`\nEmpresa de origem (só leitura, fonte dos parâmetros da calculadora): ${origemNome} (empresa_id=${origemId})`);
  if (demoExistente.porNome.length) console.log(`Empresa demo: "${NOME_EMPRESA_DEMO}" já existe — é reaproveitada (ver plano de retomada abaixo).`);
  else console.log(`Empresa a criar: "${NOME_EMPRESA_DEMO}" — situação ativa, sem plano de cobrança (aparece na cobrança com R$ 0).`);
  console.log("\nCriado automaticamente pelos gatilhos de `empresas` (não recriado):");
  console.log('  funil "Vendas" + 4 etapas (viram as 4 primeiras das 9 do funil demo), 9 origens, 7 motivos de perda, parâmetros da calculadora.');
  console.log(`Copiado da origem: parâmetros da calculadora (${PARAMETROS_COPIADOS.length} campos, UPDATE na linha criada pelo gatilho).`);
  console.log("Não copiado: gamificação da origem, modelos de contrato/proposta, identidade da proposta, kits, etiquetas, equipes, formulários de captura.");

  console.log("\nGamificação própria da demo (criada pela sessão do admin):");
  console.log(`  regras (${REGRAS_DEMO.length}):`);
  for (const r of REGRAS_DEMO) {
    const cond = r.condicao ? ` se ${r.condicao.campo} ${r.condicao.operador} ${r.condicao.valor}` : "";
    const teto = r.limite_periodo ? ` · teto ${r.limite_quantidade}/${r.limite_periodo}` : "";
    console.log(`    - ${r.nome}: ${r.evento_tipo}${cond} [${r.perfil_aplicavel}] → ${r.xp} XP / ${r.moedas} moedas${teto}`);
  }
  console.log(`  níveis: ${NIVEIS_DEMO.map((n) => `${n.nome} ${n.xp_minimo}`).join(" · ")}`);
  console.log(`  conquistas (${CONQUISTAS_DEMO.length}):`);
  for (const c of CONQUISTAS_DEMO) {
    const k = c.criterio;
    const crit = k.metrica === "xp_acumulado" ? `XP acumulado ≥ ${k.valor}` : `${k.marco} ≥ ${k.valor}`;
    console.log(`    - ${c.nome}: ${crit}${c.perfil_aplicavel ? ` [${c.perfil_aplicavel}]` : ""} · bônus ${c.xp_bonus} XP`);
  }
  console.log(`  recompensas: ${RECOMPENSAS_DEMO.map((r) => `${r.nome} (${r.custo_moedas})`).join(" · ")}`);
  console.log("  esperado após o seed:");
  for (const [chave, e] of Object.entries(ESPERADO_POR_PESSOA)) console.log(`    ${chave}: ${e.xp} XP · ${e.nivel} · ${e.moedas} moedas`);

  const situacaoUsuarios = demoExistente.porNome.length
    ? "na retomada só são validados — nada é alterado neles"
    : `${demoExistente.usuariosDemo.length} já existem no Auth e serão reaproveitados, com a senha de demonstração redefinida`;
  console.log(`\nUsuários fictícios: ${PESSOAS.length} (${situacaoUsuarios}).`);
  for (const p of PESSOAS) console.log(`  - ${p.nome} <${p.email}> — papel=${p.papel}, perfil_gamificacao=${p.perfil_gamificacao}`);
}

async function configurarEmpresaDemo(clienteAdmin, demoId, demoAdminMembroId, parametrosOrigem) {
  const lotes = [
    ["gamification_rules", REGRAS_DEMO.map((r) => ({ condicao: null, limite_periodo: null, limite_quantidade: null, unica_por_negocio: false, ...r, empresa_id: demoId, criado_por: demoAdminMembroId }))],
    ["niveis_gamificacao", NIVEIS_DEMO.map((n) => ({ ...n, empresa_id: demoId }))],
    ["conquistas", CONQUISTAS_DEMO.map((c) => ({ ...c, empresa_id: demoId }))],
    ["recompensas", RECOMPENSAS_DEMO.map((r) => ({ ...r, empresa_id: demoId, criado_por: demoAdminMembroId }))],
  ];
  for (const [tabela, linhas] of lotes) {
    const { error } = await clienteAdmin.from(tabela).insert(linhas);
    if (error) throw new Error(`Falha ao criar ${tabela}: ${error.message}`);
    console.log(`  ${tabela}: ${linhas.length}`);
  }
  const { error: eParam } = await clienteAdmin.from("parametros_calculadora").update(parametrosOrigem).eq("empresa_id", demoId);
  if (eParam) throw new Error(`Falha ao copiar parâmetros da calculadora: ${eParam.message}`);
  console.log("  parametros_calculadora: copiados da origem");
}

// ---------------------------------------------------------------------------
// 3. Empresa demo, vínculo do admin e funil de 9 etapas
// ---------------------------------------------------------------------------

/** Mesmo caminho de criarEmpresa() em src/app/(app)/super-admin/actions.ts. */
async function criarEmpresaDemo(adminUserId) {
  const { data: empresa, error } = await db.from("empresas").insert({ nome: NOME_EMPRESA_DEMO, created_by: adminUserId }).select("id").single();
  if (error) throw error;
  console.log(`  empresa criada: empresa_id=${empresa.id}`);

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .insert({ empresa_id: empresa.id, user_id: adminUserId, papel: "admin" })
    .select("id")
    .single();
  if (eMembro) throw new Error(`Empresa demo criada (empresa_id=${empresa.id}), mas o admin não foi vinculado: ${eMembro.message}`);
  console.log(`  ${ADMIN_EMAIL} vinculado como admin (empresa_membros.id=${membro.id})`);
  return { demoId: empresa.id, demoAdminMembroId: membro.id };
}

const ETAPAS_PADRAO_EMPRESA = ["Novo lead", "Contato feito", "Visita agendada", "Proposta enviada"];

const ETAPAS_DEMO = [
  { nome: "Novo Lead", fecha_como: null, marca_negociacao: false },
  { nome: "Qualificação", fecha_como: null, marca_negociacao: false },
  { nome: "Contato Realizado", fecha_como: null, marca_negociacao: false },
  { nome: "Levantamento / Diagnóstico", fecha_como: null, marca_negociacao: false },
  { nome: "Proposta Enviada", fecha_como: null, marca_negociacao: false },
  { nome: "Follow-up", fecha_como: null, marca_negociacao: false },
  { nome: "Negociação", fecha_como: null, marca_negociacao: true },
  { nome: "Assinado", fecha_como: "ganho", marca_negociacao: false },
  { nome: "Pago", fecha_como: null, marca_negociacao: false },
];

/**
 * Sem apagar nada: as 4 etapas que o gatilho acabou de criar (empresa nova, sem nenhum
 * negócio) viram as 4 primeiras do funil demo, e as outras 5 são acrescentadas — pela
 * sessão do admin, como em Configurações > Funis e etapas.
 */
async function montarFunilDemo(clienteAdmin, demoId) {
  const { data: funis, error: eFunis } = await db.from("funis").select("id").eq("empresa_id", demoId);
  if (eFunis) throw eFunis;
  await falhaSe(funis.length !== 1, `Esperava 1 funil criado pelo gatilho na empresa demo, achei ${funis.length}.`);
  const funilId = funis[0].id;

  const { data: padrao, error: ePadrao } = await db.from("etapas").select("id, nome, ordem").eq("funil_id", funilId).order("ordem");
  if (ePadrao) throw ePadrao;
  await falhaSe(
    padrao.map((e) => e.nome).join("|") !== ETAPAS_PADRAO_EMPRESA.join("|"),
    `Etapas padrão da empresa demo diferentes do esperado (${padrao.map((e) => e.nome).join(", ")}).`,
  );

  for (let i = 0; i < padrao.length; i++) {
    const { nome, fecha_como, marca_negociacao } = ETAPAS_DEMO[i];
    const { error } = await clienteAdmin.from("etapas").update({ nome, fecha_como, marca_negociacao }).eq("id", padrao[i].id);
    if (error) throw error;
  }
  const novas = ETAPAS_DEMO.slice(padrao.length).map((e, i) => ({ empresa_id: demoId, funil_id: funilId, ordem: padrao.length + i + 1, inicial: false, ...e }));
  const { error: eNovas } = await clienteAdmin.from("etapas").insert(novas);
  if (eNovas) throw eNovas;

  const { data: etapas, error: eEtapas } = await db.from("etapas").select("id, nome, ordem").eq("funil_id", funilId).order("ordem");
  if (eEtapas) throw eEtapas;
  await falhaSe(
    etapas.map((e) => e.nome).join("|") !== ETAPAS_DEMO.map((e) => e.nome).join("|"),
    `Funil demo não ficou como planejado (${etapas.map((e) => e.nome).join(", ")}).`,
  );
  return { funilId, etapas };
}

// ---------------------------------------------------------------------------
// 4. Pessoas
// ---------------------------------------------------------------------------

const PESSOAS = [
  { chave: "lucas", nome: "Lucas Martins", email: "lucas.martins.demo@raioncrm-demo.com.br", papel: "vendedor", perfil_gamificacao: "closer" },
  { chave: "mariana", nome: "Mariana Costa", email: "mariana.costa.demo@raioncrm-demo.com.br", papel: "vendedor", perfil_gamificacao: "closer" },
  { chave: "rafael", nome: "Rafael Almeida", email: "rafael.almeida.demo@raioncrm-demo.com.br", papel: "vendedor", perfil_gamificacao: "closer" },
  { chave: "bruno", nome: "Bruno Ferreira", email: "bruno.ferreira.demo@raioncrm-demo.com.br", papel: "vendedor", perfil_gamificacao: "closer" },
  { chave: "gabriel", nome: "Gabriel Santos", email: "gabriel.santos.demo@raioncrm-demo.com.br", papel: "sdr", perfil_gamificacao: "sdr" },
];

async function garantirMembro(empresaId, { nome, email, papel, perfil_gamificacao }) {
  // tipo_vendedor só faz sentido pra papel vendedor (validar_membro() preenche 'interno' se faltar).
  const tipo_vendedor = papel === "vendedor" ? "interno" : null;
  const { data: existentes } = await db.auth.admin.listUsers({ perPage: 200 });
  let usuario = existentes.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!usuario) {
    const { data, error } = await db.auth.admin.createUser({ email, password: SENHA_DEMO, email_confirm: true, user_metadata: { nome } });
    if (error) throw error;
    usuario = data.user;
    console.log(`  usuário criado: ${email}`);
  } else {
    await db.auth.admin.updateUserById(usuario.id, { password: SENHA_DEMO });
    console.log(`  usuário já existia, senha redefinida: ${email}`);
  }

  const { data: membroExistente } = await db.from("empresa_membros").select("id").eq("empresa_id", empresaId).eq("user_id", usuario.id).maybeSingle();
  if (membroExistente) {
    await db.from("empresa_membros").update({ papel, perfil_gamificacao, tipo_vendedor, ativo: true, status: "ativo" }).eq("id", membroExistente.id);
    return { membroId: membroExistente.id, userId: usuario.id };
  }

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .insert({ empresa_id: empresaId, user_id: usuario.id, papel, perfil_gamificacao, tipo_vendedor, status: "ativo", ativo: true })
    .select("id")
    .single();
  if (eMembro) throw eMembro;
  console.log(`  adicionado à empresa (empresa_membros.id=${membro.id})`);
  return { membroId: membro.id, userId: usuario.id };
}

// ---------------------------------------------------------------------------
// 5. Kits / tiers de valor e potência
// ---------------------------------------------------------------------------

const TIERS = {
  resid_p: { modulos: 8, potenciaModuloW: 550, precoPorWp: 3.6, consumo: 320, ligacao: "bifasico" }, // ~4.4kWp, ~R$16k
  resid_g: { modulos: 16, potenciaModuloW: 550, precoPorWp: 3.9, consumo: 650, ligacao: "trifasico" }, // ~8.8kWp, ~R$34k
  comercial_p: { modulos: 40, potenciaModuloW: 580, precoPorWp: 2.7, consumo: 3200, ligacao: "trifasico" }, // ~23kWp, ~R$61k
  comercial_g: { modulos: 90, potenciaModuloW: 580, precoPorWp: 2.3, consumo: 7800, ligacao: "trifasico" }, // ~52kWp, ~R$120k
};

function kitDoTier(tier, parametros) {
  const t = TIERS[tier];
  return {
    nome: `Kit ${t.modulos}x ${t.potenciaModuloW}W`,
    preco: Math.round(((t.modulos * t.potenciaModuloW) / 1000) * 1000 * t.precoPorWp),
    tarifaKwh: 0.94,
    parametros,
    componentes: [
      { tipo: "modulo", descricao: `Módulo fotovoltaico ${t.potenciaModuloW}W`, potencia_w: t.potenciaModuloW, quantidade: t.modulos },
      { tipo: "inversor", descricao: "Inversor string", potencia_w: null, quantidade: 1 },
    ],
  };
}

const CIDADES = [
  ["Cascavel", "PR"],
  ["Toledo", "PR"],
  ["Foz do Iguaçu", "PR"],
  ["Medianeira", "PR"],
];
const MOTIVOS_PERDA = ["Preço", "Fechou com concorrente", "Financiamento negado", "Sem retorno do cliente", "Desistiu do projeto"];
const ORIGENS_POOL = ["Meta Ads", "Google Ads", "Indicação", "Site", "Prospecção ativa", "Evento", "Parceiro"];

function contatoFicticio(seq, cidadeIdx) {
  const [cidade, uf] = CIDADES[cidadeIdx % CIDADES.length];
  return {
    nome: `Cliente Demo ${seq}`,
    telefone: "45999" + String(100000 + seq * 137).slice(-6),
    email: `cliente.demo${seq}@exemplo.com.br`,
    documento: String(10000000000 + seq * 9973),
    cidade,
    uf,
  };
}

// ---------------------------------------------------------------------------
// 6. Plano dos 35 negócios — aprovado por Evandro 2026-10-05, com os ajustes:
//    ganho só entra em "Assinado" (índice 7); 7 avançam a "Pago" + pagamento
//    confirmado + comissão real; 5 ficam "Assinado" aguardando pagamento.
// ---------------------------------------------------------------------------

// Fila de etapas-alvo "em andamento" na distribuição aprovada (afunilada):
// Novo Lead×4, Qualificação×3, Contato Realizado×3, Levantamento×3, Proposta×3, Follow-up×1, Negociação×1 = 18.
// Ordem decrescente de propósito: consumida em sequência por closer (Lucas primeiro,
// Bruno por último, mesma ordem de PLANO_CLOSERS), dá os negócios mais avançados (logo
// com mais `deal.stage_changed` reais) pro melhor desempenho e os mais recentes/rasos
// pro de desempenho mais baixo — reforça o ranking com eventos reais, não hardcode de XP.
const FILA_ANDAMENTO = [6, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0];

const PLANO_CLOSERS = [
  { chave: "lucas", ganhoPago: 3, ganhoAguardando: 2, perdidos: 1, andamento: 4, viaSdr: 2, tierGanho: ["comercial_g", "resid_g", "resid_g", "comercial_p", "resid_g"] },
  { chave: "mariana", ganhoPago: 2, ganhoAguardando: 2, perdidos: 1, andamento: 4, viaSdr: 2, tierGanho: ["resid_g", "comercial_p", "resid_g", "resid_p"] },
  { chave: "rafael", ganhoPago: 1, ganhoAguardando: 1, perdidos: 1, andamento: 5, viaSdr: 1, tierGanho: ["resid_g", "resid_p"] },
  { chave: "bruno", ganhoPago: 1, ganhoAguardando: 0, perdidos: 2, andamento: 5, viaSdr: 0, tierGanho: ["resid_p"] },
];

function montarPlano() {
  const plano = [];
  let seqContato = 1;
  const filaAndamento = [...FILA_ANDAMENTO];
  let origemIdx = 0;
  let motivoIdx = 0;
  const viaSdrAlvo = { lucas: 2, mariana: 2, rafael: 1, bruno: 0 };

  for (const closer of PLANO_CLOSERS) {
    let ganhosFeitos = 0;
    const totalGanhos = closer.ganhoPago + closer.ganhoAguardando;

    for (let i = 0; i < totalGanhos; i++) {
      const pago = i < closer.ganhoPago;
      const viaSdr = viaSdrAlvo[closer.chave] > 0;
      if (viaSdr) viaSdrAlvo[closer.chave]--;
      plano.push({
        closer: closer.chave,
        resultado: pago ? "ganho_pago" : "ganho_aguardando",
        etapaFinal: pago ? 8 : 7,
        tier: closer.tierGanho[ganhosFeitos] ?? "resid_p",
        contato: contatoFicticio(seqContato++, seqContato),
        origemNome: ORIGENS_POOL[origemIdx++ % ORIGENS_POOL.length],
        viaSdr,
        diasAtrasCriacao: pago ? 60 + ganhosFeitos * 6 : 35 + ganhosFeitos * 5,
      });
      ganhosFeitos++;
    }

    for (let i = 0; i < closer.perdidos; i++) {
      const etapaPerda = 2 + (motivoIdx % 4); // perde entre "Contato Realizado" e "Follow-up"
      plano.push({
        closer: closer.chave,
        resultado: "perdido",
        etapaFinal: etapaPerda,
        tier: i % 2 === 0 ? "resid_g" : "resid_p",
        contato: contatoFicticio(seqContato++, seqContato),
        origemNome: ORIGENS_POOL[origemIdx++ % ORIGENS_POOL.length],
        motivoNome: MOTIVOS_PERDA[motivoIdx++ % MOTIVOS_PERDA.length],
        diasAtrasCriacao: 15 + i * 12,
      });
    }

    for (let i = 0; i < closer.andamento; i++) {
      const etapaAlvo = filaAndamento.shift() ?? 0;
      plano.push({
        closer: closer.chave,
        resultado: "andamento",
        etapaFinal: etapaAlvo,
        tier: "resid_p",
        contato: contatoFicticio(seqContato++, seqContato),
        origemNome: ORIGENS_POOL[origemIdx++ % ORIGENS_POOL.length],
        diasAtrasCriacao: Math.max(2, 38 - etapaAlvo * 5 - i * 2),
      });
    }
  }

  return plano;
}

// ---------------------------------------------------------------------------
// 7. Execução de um negócio: cria, avança etapas de verdade (sessão do
//    closer), fecha ganho/perdido, retrodata o que é seguro retrodatar
//    (negocios.created_at, negocios.etapa_desde e historico_etapas.entrou_em/
//    saiu_em). `negocios.updated_at` nunca retrodata (gatilho `tocar_updated_at`
//    sobrescreve com `now()` em qualquer update, mesmo os nossos). `atividades`
//    e `eventos` são imutáveis até pra service_role — então a "Linha do tempo"
//    do negócio e o Extrato de pontos sempre mostram a data real da execução
//    do seed, nunca uma data passada.
// ---------------------------------------------------------------------------

async function retrodatarEtapaAtual(negocioId, etapaId, dataIso) {
  const { error: e1 } = await db
    .from("historico_etapas")
    .update({ entrou_em: dataIso })
    .eq("negocio_id", negocioId)
    .eq("etapa_id", etapaId)
    .is("saiu_em", null);
  if (e1) throw e1;
  // `negocios.updated_at` não é retrodatável: o gatilho `tocar_updated_at()` (BEFORE
  // UPDATE) sobrescreve com `now()` incondicionalmente em qualquer update, mesmo este —
  // por isso nem tentamos passá-lo aqui. Só `etapa_desde` fica com a data cosmética.
  const { error: e2 } = await db.from("negocios").update({ etapa_desde: dataIso }).eq("id", negocioId);
  if (e2) throw e2;
}

async function moverEtapa(clienteCloser, negocioId, etapaId, { backdateSaidaAnteriorIso, backdateEntradaIso }) {
  if (backdateSaidaAnteriorIso) {
    await db.from("historico_etapas").update({ saiu_em: backdateSaidaAnteriorIso }).eq("negocio_id", negocioId).is("saiu_em", null);
  }
  const { error } = await clienteCloser.from("negocios").update({ etapa_id: etapaId }).eq("id", negocioId);
  if (error) throw error;
  if (backdateEntradaIso) {
    await retrodatarEtapaAtual(negocioId, etapaId, backdateEntradaIso);
  }
}

const TITULO_TAREFA_SDR = "Realizar primeiro contato";

function tituloNegocio(deal) {
  return `${deal.tier.startsWith("comercial") ? "Sistema solar comercial" : "Sistema solar residencial"} — ${deal.contato.nome}`;
}

/** Mesmo mapeamento campo a campo de src/lib/acoes/calculadora.ts (colunas em snake_case). */
function linhaCalculoSolar(empresaId, negocioId, deal, kit) {
  const tierInfo = TIERS[deal.tier];
  const potenciaKwp = (tierInfo.modulos * tierInfo.potenciaModuloW) / 1000;
  const disponibilidadeKwh = kit.parametros[DISPONIBILIDADE_COLUNA[tierInfo.ligacao]];
  const resultado = calcular({
    potenciaKwp,
    precoKit: kit.preco,
    consumoMedioKwh: tierInfo.consumo,
    tarifaKwh: kit.tarifaKwh,
    produtividadeKwhKwpMes: kit.parametros.produtividade_kwh_kwp_mes,
    percentualFioB: kit.parametros.percentual_fio_b,
    disponibilidadeKwh,
  });
  return {
    empresa_id: empresaId,
    negocio_id: negocioId,
    kit_id: null,
    kit_nome: kit.nome,
    kit_potencia_kwp: arredondar(potenciaKwp, 2),
    kit_preco: kit.preco,
    tipo_ligacao: tierInfo.ligacao,
    consumo_medio_kwh: tierInfo.consumo,
    tarifa_kwh: kit.tarifaKwh,
    produtividade_kwh_kwp_mes: kit.parametros.produtividade_kwh_kwp_mes,
    percentual_fio_b: kit.parametros.percentual_fio_b,
    disponibilidade_kwh: disponibilidadeKwh,
    geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
    kwh_faturado: resultado.kwhFaturado,
    kwh_compensado: resultado.kwhCompensado,
    custo_fio_b: resultado.custoFioB,
    conta_sem_solar: resultado.contaSemSolar,
    conta_com_solar: resultado.contaComSolar,
    economia_mensal: resultado.economiaMensal,
    payback_meses: resultado.paybackMeses,
  };
}

/** Datas cosméticas do negócio — mesma conta para criação e retomada. */
function cronogramaDeal(deal) {
  const diasTotal = Math.max(deal.diasAtrasCriacao - 2, deal.etapaFinal + 1);
  const passo = deal.etapaFinal > 0 ? diasTotal / (deal.etapaFinal + 1) : 0;
  return {
    dataCriacao: hA(deal.diasAtrasCriacao),
    entradaEtapa: (idx) => hA(Math.max(1, Math.round(deal.diasAtrasCriacao - passo * idx))),
    dataAssinatura: hA(Math.max(5, deal.diasAtrasCriacao - Math.round(passo * 7))),
    dataPago: hA(Math.max(2, deal.diasAtrasCriacao - Math.round(passo * 8))),
  };
}

/**
 * Passos de um negócio do plano, na ordem em que o seed os executa. Cada um diz, a
 * partir do estado lido do banco, se já está feito — é o que permite retomar um
 * negócio parcial sem repetir nem pular nenhuma ação.
 */
function passosDoNegocio(deal, etapas, pessoas, estado) {
  const closer = pessoas[deal.closer];
  const idxEtapa = estado.negocio ? etapas.findIndex((e) => e.id === estado.negocio.etapa_id) : -1;
  const handoff = estado.handoffs[0] ?? null;
  const contrato = estado.contratos[0] ?? null;
  const ganho = deal.resultado === "ganho_pago" || deal.resultado === "ganho_aguardando";
  const alvoIntermediario = Math.min(deal.etapaFinal, 6);

  const passos = [
    { chave: "contato", feito: !!estado.contato },
    { chave: "negocio", feito: !!estado.negocio },
    { chave: "calculo", feito: estado.calculos > 0 },
    { chave: "kit", feito: estado.kits > 0 },
    { chave: "proposta", feito: estado.propostas > 0 },
  ];
  if (deal.viaSdr) {
    passos.push(
      { chave: "tarefa_sdr", feito: estado.tarefasSdr.length === 1 && !!estado.tarefasSdr[0].concluida_em && estado.tarefasSdr[0].resultado === "contato_realizado" },
      { chave: "handoff", feito: !!handoff },
      { chave: "aceite", feito: handoff?.status === "aceito" && estado.negocio?.responsavel_id === closer.membroId },
    );
  }
  passos.push({ chave: "etapas", feito: idxEtapa >= alvoIntermediario });
  if (deal.resultado === "perdido") passos.push({ chave: "perda", feito: estado.negocio?.status === "perdido" });
  if (ganho) {
    passos.push(
      { chave: "assinado_etapa", feito: idxEtapa >= 7 && estado.negocio?.status === "ganho" },
      { chave: "contrato", feito: !!contrato },
      { chave: "assinatura", feito: contrato?.status === "assinado" },
    );
  }
  if (deal.resultado === "ganho_pago") {
    passos.push({ chave: "pago_etapa", feito: idxEtapa === 8 }, { chave: "pagamento", feito: estado.confirmacoesAtivas > 0 });
  }
  return { passos, idxEtapa, alvoIntermediario };
}

/** Confere se o estado existente de um negócio é coerente com o plano; devolve os problemas. */
function divergenciasDoNegocio(deal, etapas, pessoas, estado) {
  const problemas = [];
  const closer = pessoas[deal.closer];
  const criador = deal.viaSdr ? pessoas.gabriel : closer;
  const { passos, idxEtapa } = passosDoNegocio(deal, etapas, pessoas, estado);

  const primeiroPendente = passos.findIndex((p) => !p.feito);
  if (primeiroPendente >= 0) {
    const adiantados = passos.slice(primeiroPendente + 1).filter((p) => p.feito);
    if (adiantados.length) problemas.push(`passos fora de ordem: ${adiantados.map((p) => p.chave).join(", ")} feitos antes de ${passos[primeiroPendente].chave}`);
  }
  if (estado.contatosMesmoNome > 1) problemas.push(`${estado.contatosMesmoNome} contatos com o nome "${deal.contato.nome}"`);
  if (estado.negociosDoContato > 1) problemas.push(`${estado.negociosDoContato} negócios para o mesmo contato`);
  if (estado.calculos > 1 || estado.propostas > 1) problemas.push("cálculo/proposta duplicados");
  if (estado.kits > 0 && estado.kits !== 2) problemas.push(`kit com ${estado.kits} componentes (esperado 2)`);
  if (estado.handoffs.length > 1 || estado.contratos.length > 1 || estado.confirmacoesAtivas > 1) problemas.push("handoff/contrato/pagamento duplicados");
  if (deal.viaSdr ? estado.tarefasSdr.length > 1 : estado.tarefasSdr.length > 0) problemas.push(`${estado.tarefasSdr.length} tarefa(s) automática(s) de primeiro contato`);
  if (estado.handoffs[0] && (estado.handoffs[0].para_membro_id !== closer.membroId || estado.handoffs[0].de_membro_id !== pessoas.gabriel.membroId)) problemas.push("handoff com origem/destino diferente do plano");

  const n = estado.negocio;
  if (n) {
    if (n.titulo !== tituloNegocio(deal)) problemas.push(`título diferente do plano ("${n.titulo}")`);
    if (n.contato_id !== estado.contato?.id) problemas.push("negócio ligado a outro contato");
    if (idxEtapa < 0) problemas.push("negócio numa etapa fora do funil demo");
    if (idxEtapa > deal.etapaFinal) problemas.push(`negócio além da etapa final do plano (${etapas[idxEtapa]?.nome})`);
    const aceito = estado.handoffs[0]?.status === "aceito";
    const responsavelEsperado = deal.viaSdr && !aceito ? criador.membroId : closer.membroId;
    if (n.responsavel_id !== responsavelEsperado) problemas.push("responsável diferente do esperado nesse ponto do fluxo");
    if (n.status === "ganho" && deal.resultado === "perdido") problemas.push("negócio ganho, mas o plano é perda");
    if (n.status === "perdido" && deal.resultado !== "perdido") problemas.push("negócio perdido, mas o plano é ganho/andamento");
    if (n.status === "ganho" && deal.resultado === "andamento") problemas.push("negócio ganho, mas o plano é em andamento");
  }
  return problemas;
}

async function executarNegocio(ctx, deal, estadoExistente) {
  const { empresaId, etapas, parametros, pessoas, motivosPerdaPorNome, origensPorNome } = ctx;
  const estado = estadoExistente ?? estadoVazio();
  const closer = pessoas[deal.closer];
  const criador = deal.viaSdr ? pessoas.gabriel : closer;
  const clienteCriador = await clienteComo(criador.email);
  const clienteCloser = await clienteComo(closer.email);
  const kit = kitDoTier(deal.tier, parametros);
  const datas = cronogramaDeal(deal);
  const { passos, idxEtapa, alvoIntermediario } = passosDoNegocio(deal, etapas, pessoas, estado);
  const pendente = new Set(passos.filter((p) => !p.feito).map((p) => p.chave));
  const executados = [];

  let contatoId = estado.contato?.id;
  if (pendente.has("contato")) {
    const { data, error } = await clienteCriador.from("contatos").insert({ empresa_id: empresaId, ...deal.contato }).select("id").single();
    if (error) throw error;
    contatoId = data.id;
    executados.push("contato");
  }

  let negocioId = estado.negocio?.id;
  if (pendente.has("negocio")) {
    const { data, error } = await clienteCriador
      .from("negocios")
      .insert({
        empresa_id: empresaId,
        titulo: tituloNegocio(deal),
        contato_id: contatoId,
        funil_id: etapas[0].funilId,
        etapa_id: etapas[0].id,
        origem_id: origensPorNome.get(deal.origemNome),
        responsavel_id: criador.membroId,
        valor: kit.preco,
        status: "aberto",
        created_at: datas.dataCriacao,
      })
      .select("id")
      .single();
    if (error) throw error;
    negocioId = data.id;
    await retrodatarEtapaAtual(negocioId, etapas[0].id, datas.dataCriacao);
    executados.push("negocio");
  }

  if (pendente.has("calculo")) {
    const { error } = await db.from("calculos_solares").insert(linhaCalculoSolar(empresaId, negocioId, deal, kit));
    if (error) throw error;
    executados.push("calculo");
  }
  if (pendente.has("kit")) {
    const { error } = await db.from("kit_componentes").insert(kit.componentes.map((c, i) => ({ empresa_id: empresaId, negocio_id: negocioId, ordem: i, ...c })));
    if (error) throw error;
    executados.push("kit");
  }
  if (pendente.has("proposta")) {
    const { error } = await db.from("propostas").insert({ empresa_id: empresaId, negocio_id: negocioId });
    if (error) throw error;
    executados.push("proposta");
  }

  // Primeiro contato do SDR: o gatilho criar_tarefa_primeiro_contato_sdr() cria a
  // tarefa "Realizar primeiro contato" ao inserir o negócio com Gabriel (papel sdr) como
  // responsável. Gabriel conclui pela própria sessão, igual a alternarConclusao() em
  // src/lib/acoes/tarefas.ts (preparar_tarefa() valida o resultado e registrar_tarefa()
  // emite task.completed) — antes do handoff. Na retomada, conclui a tarefa que já existe.
  if (pendente.has("tarefa_sdr")) {
    const { data: tarefas, error: eTarefas } = await clienteCriador
      .from("tarefas")
      .select("id")
      .eq("negocio_id", negocioId)
      .eq("responsavel_id", pessoas.gabriel.membroId)
      .eq("titulo", TITULO_TAREFA_SDR)
      .is("concluida_em", null);
    if (eTarefas) throw eTarefas;
    await falhaSe(tarefas.length !== 1, `Esperava 1 tarefa automática aberta de primeiro contato no negócio ${negocioId}, achei ${tarefas.length}.`);
    const { error } = await clienteCriador.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefas[0].id);
    if (error) throw error;
    executados.push("tarefa_sdr");
  }

  // Handoff SDR → closer: Gabriel cria, closer aceita (transfere responsavel_id de verdade).
  let handoffId = estado.handoffs[0]?.id;
  if (pendente.has("handoff")) {
    const { data, error } = await clienteCriador
      .from("handoffs")
      .insert({
        empresa_id: empresaId,
        negocio_id: negocioId,
        contato_id: contatoId,
        de_membro_id: pessoas.gabriel.membroId,
        para_membro_id: closer.membroId,
        status_qualificacao: "qualificado",
        qualificacao_snapshot: { origem: deal.origemNome, motivo: "lead qualificado pelo SDR" },
      })
      .select("id")
      .single();
    if (error) throw error;
    handoffId = data.id;
    executados.push("handoff");
  }
  if (pendente.has("aceite")) {
    const { error } = await clienteCloser.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    if (error) throw error;
    executados.push("aceite");
  }

  // Avança as etapas de verdade, na sessão do closer, a partir da etapa atual.
  // Índices 7 ("Assinado") e 8 ("Pago") nunca entram neste loop — o negócio só vira
  // 'ganho' no bloco de ganho, ao entrar em "Assinado".
  if (pendente.has("etapas")) {
    for (let idx = Math.max(idxEtapa, 0) + 1; idx <= alvoIntermediario; idx++) {
      const data = datas.entradaEtapa(idx);
      await moverEtapa(clienteCloser, negocioId, etapas[idx].id, { backdateSaidaAnteriorIso: data, backdateEntradaIso: data });
    }
    executados.push("etapas");
  }

  if (pendente.has("perda")) {
    const { error } = await clienteCloser.from("negocios").update({ status: "perdido", motivo_perda_id: motivosPerdaPorNome.get(deal.motivoNome) }).eq("id", negocioId);
    if (error) throw error;
    executados.push("perda");
  }

  // etapas[7] = "Assinado" (fecha_como='ganho') — status vira 'ganho' nesse passo.
  if (pendente.has("assinado_etapa")) {
    await moverEtapa(clienteCloser, negocioId, etapas[7].id, { backdateSaidaAnteriorIso: datas.dataAssinatura, backdateEntradaIso: datas.dataAssinatura });
    executados.push("assinado_etapa");
  }
  let contratoId = estado.contratos[0]?.id;
  if (pendente.has("contrato")) {
    const { data: modelo } = await db.from("modelos_contrato").select("conteudo").eq("empresa_id", empresaId).maybeSingle();
    const { data, error } = await clienteCloser
      .from("contratos")
      .insert({ empresa_id: empresaId, negocio_id: negocioId, conteudo: modelo?.conteudo || "Contrato de instalação de sistema fotovoltaico — demonstração." })
      .select("id")
      .single();
    if (error) throw error;
    contratoId = data.id;
    executados.push("contrato");
  }
  if (pendente.has("assinatura")) {
    const { error } = await clienteCloser.from("contratos").update({ status: "assinado" }).eq("id", contratoId);
    if (error) throw error;
    executados.push("assinatura");
  }
  if (pendente.has("pago_etapa")) {
    await moverEtapa(clienteCloser, negocioId, etapas[8].id, { backdateSaidaAnteriorIso: datas.dataPago, backdateEntradaIso: datas.dataPago });
    executados.push("pago_etapa");
  }
  if (pendente.has("pagamento")) {
    const clienteAdmin = await clienteComo(ADMIN_EMAIL);
    const { error } = await clienteAdmin.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    if (error) throw error;
    executados.push("pagamento");
  }

  return { negocioId, executados };
}

function estadoVazio() {
  return { contato: null, negocio: null, calculos: 0, kits: 0, propostas: 0, tarefasSdr: [], handoffs: [], contratos: [], confirmacoesAtivas: 0, contatosMesmoNome: 0, negociosDoContato: 0 };
}

// ---------------------------------------------------------------------------
// 8. Comissões reais — plano por closer + cálculo causal (mês atual, único
//    período em que `calcular_receita_causal_comissao` pode dar valor ≠ 0,
//    porque lê só `eventos`, que é imutável e carimbado com a data real de
//    hoje — ver desenho). Fecha 2 comissões pra mostrar o estado "fechada".
// ---------------------------------------------------------------------------

function primeiroDiaDoMes(data) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// `planos_comissao` é versionado por `vigencia_inicio` (não tem coluna `ativo`) e a
// escrita é revogada de service_role — o plano nasce pela sessão do admin, igual a
// src/app/(app)/configuracoes/comissoes/actions.ts.
async function garantirPlanoComissao(clienteAdmin, empresaId, membroId, criadoPor) {
  const referencia = primeiroDiaDoMes(AGORA);
  const { data: vigente, error: eVigente } = await db
    .from("planos_comissao")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("membro_id", membroId)
    .lte("vigencia_inicio", referencia)
    .order("vigencia_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eVigente) throw eVigente;
  if (vigente) return vigente.id;
  const { data, error } = await clienteAdmin
    .from("planos_comissao")
    .insert({
      empresa_id: empresaId,
      membro_id: membroId,
      vigencia_inicio: referencia,
      salario_base: 0,
      tipo_calculo: "percentual",
      faixas: [
        { resultado_minimo: 0, resultado_maximo: 50000, valor: 3 },
        { resultado_minimo: 50000, resultado_maximo: null, valor: 4 },
      ],
      criado_por: criadoPor,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function calcularEFecharComissoes(empresaId, pessoas, fechar) {
  const referencia = primeiroDiaDoMes(AGORA);
  const inicioMes = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth(), 1));
  const fimExclusivo = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth() + 1, 1));
  const clienteAdmin = await clienteComo(ADMIN_EMAIL);

  const resultados = [];
  for (const chave of ["lucas", "mariana", "rafael", "bruno"]) {
    const membroId = pessoas[chave].membroId;
    // Retomada: comissão já fechada não é recalculada nem fechada de novo (mesma regra de calcularComissaoMes()).
    const { data: existente, error: eExistente } = await db
      .from("comissoes_calculadas")
      .select("status, resultado_apurado, valor_total")
      .eq("empresa_id", empresaId)
      .eq("membro_id", membroId)
      .eq("referencia", referencia)
      .maybeSingle();
    if (eExistente) throw eExistente;
    if (existente?.status === "fechada") {
      resultados.push({ chave, resultadoApurado: existente.resultado_apurado, valorTotal: existente.valor_total, fechada: true });
      continue;
    }
    const planoId = await garantirPlanoComissao(clienteAdmin, empresaId, membroId, pessoas.adminMembroId);
    const { data: resultadoApurado, error: eCalc } = await clienteAdmin.rpc("calcular_receita_causal_comissao", {
      p_empresa_id: empresaId,
      p_membro_id: membroId,
      p_desde: inicioMes.toISOString(),
      p_ate_exclusivo: fimExclusivo.toISOString(),
    });
    if (eCalc) throw eCalc;

    const { data: plano } = await db.from("planos_comissao").select("tipo_calculo, faixas, salario_base").eq("id", planoId).single();
    const faixas = plano.faixas;
    const faixa = faixas.find((f) => resultadoApurado >= f.resultado_minimo && (f.resultado_maximo === null || resultadoApurado < f.resultado_maximo)) ?? null;
    const valorComissao = faixa ? (plano.tipo_calculo === "percentual" ? resultadoApurado * (faixa.valor / 100) : resultadoApurado * faixa.valor) : 0;
    const valorTotal = (plano.salario_base ?? 0) + valorComissao;

    const { data: comissao, error: eUpsert } = await clienteAdmin
      .from("comissoes_calculadas")
      .upsert(
        {
          empresa_id: empresaId,
          membro_id: membroId,
          plano_id: planoId,
          referencia,
          resultado_apurado: resultadoApurado ?? 0,
          salario_base: plano.salario_base ?? 0,
          valor_comissao: valorComissao,
          valor_total: valorTotal,
          faixa_aplicada: faixa,
          calculado_por: pessoas.adminMembroId,
        },
        { onConflict: "empresa_id,membro_id,referencia" },
      )
      .select("id")
      .single();
    if (eUpsert) throw eUpsert;

    if (fechar.has(chave)) {
      const { error: eFechar } = await clienteAdmin.rpc("fechar_comissao", { p_comissao_id: comissao.id });
      if (eFechar) throw eFechar;
    }
    resultados.push({ chave, resultadoApurado, valorTotal, fechada: fechar.has(chave) });
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// 9. Metas do mês atual (receita) — mesma lógica de scripts/seed-metas-vendedores.mjs,
//    só com alvo calibrado abaixo do resultado esperado de cada closer.
// ---------------------------------------------------------------------------

// Escrita em `metas` é revogada de service_role: a meta nasce pela sessão do admin,
// com os mesmos campos de criarMeta() em src/app/(app)/configuracoes/metas/actions.ts.
async function criarMetas(empresaId, adminMembroId, pessoas, alvosPorChave) {
  const clienteAdmin = await clienteComo(ADMIN_EMAIL);
  const inicio = primeiroDiaDoMes(AGORA);
  const fim = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const nomeMes = new Date(inicio).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  for (const chave of ["lucas", "mariana", "rafael", "bruno"]) {
    const membroId = pessoas[chave].membroId;
    const { data: existente } = await db.from("metas").select("id").eq("empresa_id", empresaId).eq("membro_id", membroId).eq("metrica", "receita").eq("ativa", true).lte("periodo_inicio", fim).gte("periodo_fim", inicio).maybeSingle();
    if (existente) continue;
    const { error } = await clienteAdmin.from("metas").insert({
      empresa_id: empresaId,
      titulo: `Meta comercial de ${nomeMes}`,
      metrica: "receita",
      membro_id: membroId,
      periodo_inicio: inicio,
      periodo_fim: fim,
      valor_alvo: alvosPorChave[chave],
      criado_por: adminMembroId,
    });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// 10. Validação pós-seed — lê o resultado real do banco (point_ledger, não
//    contagem de eventos) e confere contra os números que o Evandro aprovou.
//    Roda sempre no final de uma execução real; só reporta, nunca corrige
//    nada sozinha (um valor fora do esperado é um problema a investigar, não
//    a "ajustar" escrevendo em point_ledger).
// ---------------------------------------------------------------------------

async function validarPosSeed(empresaId, pessoas) {
  console.log("\n=== Validação pós-seed ===");
  const closers = ["lucas", "mariana", "rafael", "bruno"];
  const closerIds = closers.map((c) => pessoas[c].membroId);

  console.log("\n-- 1. Membros fictícios --");
  const { data: membros, error: eMembros } = await db
    .from("empresa_membros")
    .select("id, papel, perfil_gamificacao, perfis(nome, email)")
    .eq("empresa_id", empresaId)
    .in("id", [...closerIds, pessoas.gabriel.membroId]);
  if (eMembros) throw eMembros;
  await falhaSe(membros.length !== 5, `Esperava 5 membros fictícios, achei ${membros.length}.`);
  for (const m of membros) console.log(`  ${m.perfis?.nome} — papel=${m.papel}, perfil_gamificacao=${m.perfil_gamificacao}`);
  const esperadoPorMembroId = new Map(PESSOAS.map((p) => [pessoas[p.chave].membroId, p]));
  const divergentes = membros.filter((m) => {
    const esperado = esperadoPorMembroId.get(m.id);
    return m.papel !== esperado.papel || m.perfil_gamificacao !== esperado.perfil_gamificacao;
  });
  if (divergentes.length) console.log(`  ⚠ papel/perfil diferente do esperado: ${divergentes.map((m) => m.perfis?.nome).join(", ")}`);

  console.log("\n-- 2/3. Negócios: total, status e distribuição por vendedor --");
  const { data: negocios, error: eNeg } = await db
    .from("negocios")
    .select("id, status, responsavel_id, valor")
    .eq("empresa_id", empresaId)
    .in("responsavel_id", closerIds);
  if (eNeg) throw eNeg;
  await falhaSe(negocios.length !== 35, `Esperava 35 negócios, achei ${negocios.length}.`);
  const porStatus = { aberto: 0, ganho: 0, perdido: 0 };
  const porCloser = {};
  for (const n of negocios) {
    porStatus[n.status] = (porStatus[n.status] ?? 0) + 1;
    porCloser[n.responsavel_id] = (porCloser[n.responsavel_id] ?? 0) + 1;
  }
  console.log(`  total=${negocios.length}, ganhos=${porStatus.ganho}, perdidos=${porStatus.perdido}, em andamento=${porStatus.aberto}`);
  for (const c of closers) console.log(`  ${c}: ${porCloser[pessoas[c].membroId] ?? 0} negócio(s)`);

  console.log("\n-- 4. Ganhos pagos (confirmacoes_pagamento ativa) --");
  const negocioIdsGanhos = negocios.filter((n) => n.status === "ganho").map((n) => n.id);
  let totalPagos = 0;
  if (negocioIdsGanhos.length) {
    const { data: pagos, error: ePagos } = await db
      .from("confirmacoes_pagamento")
      .select("negocio_id")
      .eq("empresa_id", empresaId)
      .in("negocio_id", negocioIdsGanhos)
      .is("estornado_em", null);
    if (ePagos) throw ePagos;
    totalPagos = pagos.length;
  }
  console.log(`  pagos=${totalPagos} (esperado: 7)`);

  console.log("\n-- 5. Handoffs do Gabriel --");
  const { data: handoffs, error: eHandoffs } = await db.from("handoffs").select("id, para_membro_id").eq("empresa_id", empresaId).eq("de_membro_id", pessoas.gabriel.membroId);
  if (eHandoffs) throw eHandoffs;
  console.log(`  total=${handoffs.length} (esperado: 5)`);
  const { data: tarefasSdr, error: eTarefasSdr } = await db
    .from("tarefas")
    .select("concluida_em, resultado")
    .eq("empresa_id", empresaId)
    .eq("responsavel_id", pessoas.gabriel.membroId)
    .eq("titulo", "Realizar primeiro contato");
  if (eTarefasSdr) throw eTarefasSdr;
  const concluidasSdr = tarefasSdr.filter((t) => t.concluida_em && t.resultado === "contato_realizado").length;
  console.log(`  tarefas de primeiro contato: ${tarefasSdr.length}, concluídas com contato_realizado: ${concluidasSdr} (esperado: 5 e 5)`);
  if (concluidasSdr !== tarefasSdr.length) console.log("  ⚠ há tarefa de primeiro contato do Gabriel em aberto (vai aparecer como atrasada).");

  console.log("\n-- 6. XP/pontos reais por membro (point_ledger, só lançamentos não estornados) --");
  const { data: lancamentos, error: eLedger } = await db
    .from("point_ledger")
    .select("membro_id, xp, moedas")
    .eq("empresa_id", empresaId)
    .eq("estornado", false)
    .in("membro_id", [...closerIds, pessoas.gabriel.membroId]);
  if (eLedger) throw eLedger;
  const xpPorMembro = {};
  const moedasPorMembro = {};
  for (const l of lancamentos) {
    xpPorMembro[l.membro_id] = (xpPorMembro[l.membro_id] ?? 0) + l.xp;
    moedasPorMembro[l.membro_id] = (moedasPorMembro[l.membro_id] ?? 0) + l.moedas;
  }

  const { data: niveis } = await db.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", empresaId).order("xp_minimo", { ascending: true });
  function nivelDe(xp) {
    let atual = null;
    for (const n of niveis ?? []) {
      if (xp >= n.xp_minimo) atual = n;
    }
    return atual ? `nível ${atual.nivel}${atual.nome ? ` (${atual.nome})` : ""}` : "sem nível configurado";
  }

  // O ranking da tela é separado por perfil (abas Closer e SDR): Gabriel não concorre com os closers.
  for (const c of [...closers, "gabriel"]) {
    const membroId = pessoas[c].membroId;
    const xp = xpPorMembro[membroId] ?? 0;
    const moedas = moedasPorMembro[membroId] ?? 0;
    const esperado = ESPERADO_POR_PESSOA[c];
    const nivel = nivelDe(xp);
    const confere = xp === esperado.xp && moedas === esperado.moedas && nivel.includes(esperado.nivel);
    console.log(
      `  ${pessoas[c].nome}: ${xp} XP — ${nivel} — ${moedas} moedas` +
        (confere ? " (confere)" : ` ⚠ esperado ${esperado.xp} XP · ${esperado.nivel} · ${esperado.moedas} moedas`),
    );
  }

  const xpClosers = closers.map((c) => xpPorMembro[pessoas[c].membroId] ?? 0);
  const ordemOk = xpClosers.every((v, i) => i === 0 || v <= xpClosers[i - 1]);
  console.log(
    ordemOk
      ? "  RANKING OK: Lucas > Mariana > Rafael > Bruno, confirmado no point_ledger real."
      : `  ATENÇÃO — ranking real não ficou Lucas>Mariana>Rafael>Bruno (XP: ${closers.map((c, i) => `${c}=${xpClosers[i]}`).join(", ")}). Não corrigido automaticamente — revisar regras ativas (gamification_rules) antes de prosseguir.`,
  );

  console.log("\n-- 7. Metas do mês atual --");
  const clienteAdmin = await clienteComo(ADMIN_EMAIL);
  const inicioMes = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth(), 1));
  const fimExclusivo = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth() + 1, 1));
  const { data: metas, error: eMetas } = await db.from("metas").select("membro_id, valor_alvo").eq("empresa_id", empresaId).in("membro_id", closerIds).eq("ativa", true);
  if (eMetas) throw eMetas;
  for (const c of closers) {
    const meta = metas.find((m) => m.membro_id === pessoas[c].membroId);
    if (!meta) {
      console.log(`  ${c}: sem meta ativa encontrada`);
      continue;
    }
    const { data: realizado, error: eReal } = await clienteAdmin.rpc("calcular_realizado_meta", {
      p_empresa_id: empresaId,
      p_membro_id: pessoas[c].membroId,
      p_metrica: "receita",
      p_desde: inicioMes.toISOString(),
      p_ate_exclusivo: fimExclusivo.toISOString(),
    });
    if (eReal) throw eReal;
    console.log(`  ${c}: alvo R$ ${meta.valor_alvo} — realizado R$ ${arredondar(realizado ?? 0, 2)}`);
  }

  console.log("\n-- 8. Comissões calculadas --");
  const referencia = primeiroDiaDoMes(AGORA);
  const { data: comissoes, error: eComissoes } = await db
    .from("comissoes_calculadas")
    .select("membro_id, resultado_apurado, valor_total, status")
    .eq("empresa_id", empresaId)
    .eq("referencia", referencia)
    .in("membro_id", closerIds);
  if (eComissoes) throw eComissoes;
  for (const c of closers) {
    const com = comissoes.find((x) => x.membro_id === pessoas[c].membroId);
    if (!com) {
      console.log(`  ${c}: nenhuma comissão calculada`);
      continue;
    }
    console.log(`  ${c}: resultado apurado R$ ${com.resultado_apurado} — comissão R$ ${com.valor_total} — status=${com.status}`);
  }

  console.log("\n=== Fim da validação pós-seed ===");
}

// ---------------------------------------------------------------------------
// 11. Retomada de uma Base Demo parcial (RETOMAR_BASE_DEMO=sim)
//
// Só leitura até o fim desta seção: valida que a demo existente é exatamente o que
// este script criaria (empresa, admin, membros, funil, gamificação, parâmetros) e
// que os negócios existentes são um prefixo do plano, com no máximo o último
// incompleto e coerente. Qualquer divergência é bloqueio — nada é corrigido,
// apagado ou recriado; a retomada só faz os passos que faltam, pelos fluxos reais.
// ---------------------------------------------------------------------------

const chaveCondicao = (c) => (c ? [c.campo, c.operador, String(c.valor)] : null);
const chaveCriterio = (k) => [k.metrica, k.marco ?? null, Number(k.valor)];

function chaveRegra(r) {
  return JSON.stringify([
    r.nome,
    r.evento_tipo,
    r.perfil_aplicavel ?? null,
    r.xp,
    r.moedas,
    chaveCondicao(r.condicao),
    r.limite_periodo ?? null,
    r.limite_quantidade ?? null,
    !!r.unica_por_negocio,
    r.ativa ?? true,
  ]);
}

function compararConjuntos(rotulo, existentes, esperados, bloqueios) {
  const a = [...existentes].sort();
  const b = [...esperados].sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) bloqueios.push(`${rotulo} da demo diferente da configuração do script (existem ${a.length}, esperado ${b.length}).`);
}

async function lerTudo(tabela, colunas, empresaId) {
  const { data, error } = await db.from(tabela).select(colunas).eq("empresa_id", empresaId);
  if (error) throw error;
  return data ?? [];
}

async function avaliarDemoExistente({ demoExistente, adminUserId, parametrosOrigem, plano }) {
  const bloqueios = [];
  await falhaSe(demoExistente.porNome.length !== 1, `Esperava exatamente 1 empresa "${NOME_EMPRESA_DEMO}", achei ${demoExistente.porNome.length}.`);
  const empresa = demoExistente.porNome[0];
  const empresaId = empresa.id;
  if (empresa.situacao !== "ativa") bloqueios.push(`empresa demo com situação ${empresa.situacao}.`);
  for (const v of demoExistente.vinculosAtivos) {
    if (v.empresa_id !== empresaId) bloqueios.push(`usuário fictício também é membro ativo de "${v.empresas?.nome}" (empresa_id=${v.empresa_id}).`);
  }

  // Membros: exatamente o admin + os 5 fictícios, ativos, com papel/perfil do plano.
  const membros = await lerTudo("empresa_membros", "id, user_id, papel, perfil_gamificacao, status, ativo, perfis(email)", empresaId);
  const pessoas = {};
  const admin = membros.find((m) => m.user_id === adminUserId);
  if (!admin || admin.papel !== "admin" || !admin.ativo) bloqueios.push(`${ADMIN_EMAIL} não é admin ativo da demo.`);
  else pessoas.adminMembroId = admin.id;
  for (const p of PESSOAS) {
    const m = membros.find((x) => x.perfis?.email?.toLowerCase() === p.email.toLowerCase());
    if (!m) {
      bloqueios.push(`membro ${p.nome} não existe na demo.`);
      continue;
    }
    if (m.papel !== p.papel || m.perfil_gamificacao !== p.perfil_gamificacao || !m.ativo || m.status !== "ativo") {
      bloqueios.push(`membro ${p.nome} com papel=${m.papel}, perfil=${m.perfil_gamificacao}, ativo=${m.ativo}, status=${m.status} (esperado ${p.papel}/${p.perfil_gamificacao}, ativo).`);
    }
    pessoas[p.chave] = { ...p, membroId: m.id, userId: m.user_id };
  }
  const conhecidos = new Set([admin?.id, ...PESSOAS.map((p) => pessoas[p.chave]?.membroId)]);
  const extras = membros.filter((m) => !conhecidos.has(m.id));
  if (extras.length) bloqueios.push(`membros fora do plano na demo: ${extras.map((m) => m.perfis?.email ?? m.id).join(", ")}.`);

  // Funil: 1 funil com as 9 etapas do plano.
  const funis = await lerTudo("funis", "id", empresaId);
  let etapas = [];
  if (funis.length !== 1) bloqueios.push(`demo com ${funis.length} funis (esperado 1).`);
  else {
    const { data, error } = await db.from("etapas").select("id, nome, ordem, inicial, fecha_como, marca_negociacao, ativa").eq("funil_id", funis[0].id).order("ordem");
    if (error) throw error;
    etapas = data.map((e) => ({ ...e, funilId: funis[0].id }));
    const iguais =
      etapas.length === ETAPAS_DEMO.length &&
      etapas.every((e, i) => e.nome === ETAPAS_DEMO[i].nome && (e.fecha_como ?? null) === ETAPAS_DEMO[i].fecha_como && e.marca_negociacao === ETAPAS_DEMO[i].marca_negociacao && e.inicial === (i === 0) && e.ativa);
    if (!iguais) bloqueios.push(`funil da demo diferente do plano (${etapas.map((e) => e.nome).join(", ")}).`);
  }

  // Gamificação e parâmetros: idênticos à configuração do script.
  const regras = await lerTudo("gamification_rules", "nome, evento_tipo, perfil_aplicavel, xp, moedas, condicao, limite_periodo, limite_quantidade, unica_por_negocio, ativa", empresaId);
  compararConjuntos("regras de gamificação", regras.map(chaveRegra), REGRAS_DEMO.map(chaveRegra), bloqueios);
  const niveis = await lerTudo("niveis_gamificacao", "nivel, nome, xp_minimo, ativa", empresaId);
  compararConjuntos("níveis", niveis.map((n) => JSON.stringify([n.nivel, n.nome, n.xp_minimo, n.ativa])), NIVEIS_DEMO.map((n) => JSON.stringify([n.nivel, n.nome, n.xp_minimo, true])), bloqueios);
  const conquistas = await lerTudo("conquistas", "nome, criterio, perfil_aplicavel, xp_bonus, ativa", empresaId);
  compararConjuntos(
    "conquistas",
    conquistas.map((c) => JSON.stringify([c.nome, chaveCriterio(c.criterio), c.perfil_aplicavel ?? null, c.xp_bonus, c.ativa])),
    CONQUISTAS_DEMO.map((c) => JSON.stringify([c.nome, chaveCriterio(c.criterio), c.perfil_aplicavel ?? null, c.xp_bonus, true])),
    bloqueios,
  );
  const recompensas = await lerTudo("recompensas", "nome, custo_moedas, ativa", empresaId);
  compararConjuntos("recompensas", recompensas.map((r) => JSON.stringify([r.nome, r.custo_moedas, r.ativa])), RECOMPENSAS_DEMO.map((r) => JSON.stringify([r.nome, r.custo_moedas, true])), bloqueios);
  const { data: parametrosDemo, error: eParam } = await db.from("parametros_calculadora").select(PARAMETROS_COPIADOS.join(", ")).eq("empresa_id", empresaId).single();
  if (eParam) throw eParam;
  const paramDiferentes = PARAMETROS_COPIADOS.filter((c) => Number(parametrosDemo[c]) !== Number(parametrosOrigem[c]));
  if (paramDiferentes.length) bloqueios.push(`parâmetros da calculadora diferentes da origem: ${paramDiferentes.join(", ")}.`);

  // Negócios: estado de cada negócio do plano, identificado pelo nome determinístico do contato.
  const [contatos, negocios, calculos, kits, propostas, tarefas, handoffs, contratos, confirmacoes, metas, planos, comissoes] = await Promise.all([
    lerTudo("contatos", "id, nome", empresaId),
    lerTudo("negocios", "id, titulo, contato_id, etapa_id, status, responsavel_id", empresaId),
    lerTudo("calculos_solares", "negocio_id", empresaId),
    lerTudo("kit_componentes", "negocio_id", empresaId),
    lerTudo("propostas", "negocio_id", empresaId),
    lerTudo("tarefas", "negocio_id, titulo, responsavel_id, concluida_em, resultado", empresaId),
    lerTudo("handoffs", "id, negocio_id, status, de_membro_id, para_membro_id", empresaId),
    lerTudo("contratos", "id, negocio_id, status", empresaId),
    lerTudo("confirmacoes_pagamento", "negocio_id, estornado_em", empresaId),
    lerTudo("metas", "id", empresaId),
    lerTudo("planos_comissao", "id", empresaId),
    lerTudo("comissoes_calculadas", "id", empresaId),
  ]);
  const contar = (linhas, negocioId) => linhas.filter((l) => l.negocio_id === negocioId).length;

  const nomesPlano = new Set(plano.map((d) => d.contato.nome));
  const contatosFora = contatos.filter((c) => !nomesPlano.has(c.nome));
  if (contatosFora.length) bloqueios.push(`contatos fora do plano: ${contatosFora.map((c) => c.nome).join(", ")}.`);
  const negociosUsados = new Set();

  const estados = plano.map((deal) => {
    const doNome = contatos.filter((c) => c.nome === deal.contato.nome);
    const contato = doNome[0] ?? null;
    const doContato = contato ? negocios.filter((n) => n.contato_id === contato.id) : [];
    const negocio = doContato[0] ?? null;
    if (negocio) negociosUsados.add(negocio.id);
    const nid = negocio?.id;
    return {
      contato,
      negocio,
      calculos: nid ? contar(calculos, nid) : 0,
      kits: nid ? contar(kits, nid) : 0,
      propostas: nid ? contar(propostas, nid) : 0,
      tarefasSdr: nid ? tarefas.filter((t) => t.negocio_id === nid && t.titulo === TITULO_TAREFA_SDR) : [],
      handoffs: nid ? handoffs.filter((h) => h.negocio_id === nid) : [],
      contratos: nid ? contratos.filter((c) => c.negocio_id === nid) : [],
      confirmacoesAtivas: nid ? confirmacoes.filter((c) => c.negocio_id === nid && !c.estornado_em).length : 0,
      contatosMesmoNome: doNome.length,
      negociosDoContato: doContato.length,
    };
  });
  const negociosFora = negocios.filter((n) => !negociosUsados.has(n.id));
  if (negociosFora.length) bloqueios.push(`negócios fora do plano: ${negociosFora.map((n) => n.titulo).join(", ")}.`);

  // Prefixo do plano: completos, depois no máximo 1 parcial, depois nada.
  const situacoes = estados.map((estado, i) => {
    if (!estado.contato && !estado.negocio) return { tipo: "novo" };
    const { passos } = passosDoNegocio(plano[i], etapas, pessoas, estado);
    const pendentes = passos.filter((p) => !p.feito).map((p) => p.chave);
    return { tipo: pendentes.length ? "parcial" : "completo", pendentes };
  });
  const primeiroNaoCompleto = situacoes.findIndex((s) => s.tipo !== "completo");
  const fim = primeiroNaoCompleto < 0 ? situacoes.length : primeiroNaoCompleto;
  for (let i = fim + 1; i < situacoes.length; i++) {
    if (situacoes[i].tipo !== "novo") bloqueios.push(`negócio ${i + 1} do plano (${plano[i].contato.nome}) existe, mas o ${fim + 1} ainda não está completo.`);
  }
  if (etapas.length === ETAPAS_DEMO.length && Object.keys(pessoas).length === PESSOAS.length + 1) {
    estados.forEach((estado, i) => {
      if (situacoes[i].tipo === "novo") return;
      for (const p of divergenciasDoNegocio(plano[i], etapas, pessoas, estado)) bloqueios.push(`negócio ${i + 1} (${plano[i].contato.nome}): ${p}.`);
    });
  }

  const todosCompletos = situacoes.every((s) => s.tipo === "completo");
  if (!todosCompletos && (metas.length || planos.length || comissoes.length)) {
    bloqueios.push(`já existem metas/planos/comissões (${metas.length}/${planos.length}/${comissoes.length}) com negócios ainda incompletos.`);
  }

  return { empresaId, pessoas, etapas, estados, situacoes, bloqueios };
}

function imprimirPlanoRetomada({ empresaId, situacoes, plano }) {
  console.log(`\nBase Demo existente encontrada: "${NOME_EMPRESA_DEMO}" (empresa_id=${empresaId}).`);
  const completos = situacoes.filter((s) => s.tipo === "completo").length;
  const parcial = situacoes.findIndex((s) => s.tipo === "parcial");
  const novos = situacoes.filter((s) => s.tipo === "novo").length;
  console.log(`Negócios do plano: ${completos} completos · ${parcial >= 0 ? 1 : 0} parcial · ${novos} a criar.`);
  if (parcial >= 0) {
    const d = plano[parcial];
    console.log(`  parcial: negócio ${parcial + 1} — ${d.contato.nome} (${d.closer}, ${d.resultado}${d.viaSdr ? ", via SDR" : ""})`);
    console.log(`  passos que faltam, nesta ordem: ${situacoes[parcial].pendentes.join(" → ")}`);
  }
  console.log("Depois: comissões (planos pela sessão do admin), metas e validação pós-seed. Nada existente é apagado ou recriado.");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function contextoNegocios(empresaId, etapas, pessoas) {
  const { data: parametros, error: eParam } = await db.from("parametros_calculadora").select("*").eq("empresa_id", empresaId).single();
  if (eParam) throw eParam;
  const { data: motivos } = await db.from("motivos_perda").select("id, nome").eq("empresa_id", empresaId);
  const motivosPerdaPorNome = new Map((motivos ?? []).map((m) => [m.nome, m.id]));
  const { data: origens } = await db.from("origens").select("id, nome").eq("empresa_id", empresaId);
  const origensPorNome = new Map((origens ?? []).map((o) => [o.nome, o.id]));
  const faltando = [...ORIGENS_POOL.filter((o) => !origensPorNome.has(o)), ...MOTIVOS_PERDA.filter((m) => !motivosPerdaPorNome.has(m))];
  await falhaSe(faltando.length > 0, `Origens/motivos padrão ausentes na empresa demo: ${faltando.join(", ")}.`);
  return { empresaId, etapas, parametros, pessoas, motivosPerdaPorNome, origensPorNome };
}

async function executarNegociosEFechamento(ctx, plano, estados) {
  const { empresaId, pessoas } = ctx;
  console.log("\nNegócios (sessões reais, eventos/gamificação disparados pelos gatilhos)...");
  for (let i = 0; i < plano.length; i++) {
    const deal = plano[i];
    const r = await executarNegocio(ctx, deal, estados?.[i]);
    const feito = r.executados.length ? r.executados.join(", ") : "já completo — nada a fazer";
    console.log(`  ${i + 1}. ${deal.closer}: negócio ${r.negocioId} (${deal.resultado}) — ${feito}`);
  }

  console.log("\nCalculando e fechando comissões do mês atual (closers)...");
  const comissoes = await calcularEFecharComissoes(empresaId, pessoas, new Set(["lucas", "mariana"]));
  for (const c of comissoes) console.log(`  ${c.chave}: resultado apurado R$ ${c.resultadoApurado} → comissão R$ ${arredondar(c.valorTotal, 2)}${c.fechada ? " (fechada)" : ""}`);

  console.log("\nCriando metas de receita do mês atual...");
  await criarMetas(empresaId, pessoas.adminMembroId, pessoas, { lucas: 90000, mariana: 70000, rafael: 45000, bruno: 35000 });

  await validarPosSeed(empresaId, pessoas);
  console.log(`\nConcluído. Empresa "${NOME_EMPRESA_DEMO}" (empresa_id=${empresaId}) — ${ADMIN_EMAIL} acessa pelo seletor de empresa do menu.`);
}

function encerrarComBloqueios(bloqueios) {
  console.log("\nBLOQUEIOS — nada foi escrito:");
  for (const b of bloqueios) console.log(`  ✗ ${b}`);
  process.exit(1);
}

async function main() {
  await falhaSe(CRIAR_BASE_DEMO && RETOMAR_BASE_DEMO, "CRIAR_BASE_DEMO e RETOMAR_BASE_DEMO não podem ser usadas juntas — abortando sem escrever nada.");

  // --- Só leitura: tudo o que pode bloquear é checado antes da primeira escrita. ---
  const usuariosAuth = await listarUsuariosAuth();
  const { adminUserId, origemId, origemNome } = await resolverAdminEOrigem(usuariosAuth);
  const demoExistente = await encontrarDemoExistente(usuariosAuth);
  const parametrosOrigem = await carregarParametrosOrigem(origemId);
  const plano35 = montarPlano();

  imprimirPlano({ origemId, origemNome, demoExistente });

  const bloqueios = conferirGamificacaoDemo();
  if (plano35.length !== 35) bloqueios.push(`plano gerou ${plano35.length} negócios, esperava 35.`);

  // --- Demo já existe: só diagnóstico + plano de retomada; escreve só com RETOMAR_BASE_DEMO=sim. ---
  if (demoExistente.porNome.length) {
    if (CRIAR_BASE_DEMO) bloqueios.push(`já existe empresa "${NOME_EMPRESA_DEMO}" — ela não é recriada nem duplicada; para continuá-la, use RETOMAR_BASE_DEMO=sim.`);
    const avaliacao = await avaliarDemoExistente({ demoExistente, adminUserId, parametrosOrigem, plano: plano35 });
    imprimirPlanoRetomada({ empresaId: avaliacao.empresaId, situacoes: avaliacao.situacoes, plano: plano35 });
    bloqueios.push(...avaliacao.bloqueios);
    if (bloqueios.length) encerrarComBloqueios(bloqueios);
    if (!RETOMAR_BASE_DEMO) {
      console.log("\nRETOMAR_BASE_DEMO não está definido como 'sim' — nada foi escrito. Dry run da retomada encerrado.");
      return;
    }
    console.log(`\nRETOMAR_BASE_DEMO=sim — retomando "${NOME_EMPRESA_DEMO}" (empresa e configuração existentes são reaproveitadas)...`);
    const ctx = await contextoNegocios(avaliacao.empresaId, avaliacao.etapas, avaliacao.pessoas);
    await executarNegociosEFechamento(ctx, plano35, avaliacao.estados);
    return;
  }

  // --- Demo não existe: criação. ---
  if (RETOMAR_BASE_DEMO) bloqueios.push(`não existe empresa "${NOME_EMPRESA_DEMO}" para retomar.`);
  for (const v of demoExistente.vinculosAtivos) {
    const email = demoExistente.usuariosDemo.find((u) => u.id === v.user_id)?.email;
    bloqueios.push(`${email} já é membro ativo da empresa "${v.empresas?.nome}" (empresa_id=${v.empresa_id}).`);
  }
  if (bloqueios.length) encerrarComBloqueios(bloqueios);

  if (!CRIAR_BASE_DEMO) {
    console.log("\nCRIAR_BASE_DEMO não está definido como 'sim' — nada foi criado. Dry run encerrado.");
    return;
  }

  console.log(`\nCRIAR_BASE_DEMO=sim — criando "${NOME_EMPRESA_DEMO}"...`);
  const { demoId: empresaId, demoAdminMembroId: adminMembroId } = await criarEmpresaDemo(adminUserId);
  const clienteAdmin = await clienteComo(ADMIN_EMAIL);

  console.log("\nMontando o funil de 9 etapas...");
  const { funilId, etapas: etapasDemo } = await montarFunilDemo(clienteAdmin, empresaId);
  const etapas = etapasDemo.map((e) => ({ ...e, funilId }));

  console.log("\nCriando a gamificação da demo e copiando os parâmetros da calculadora (sessão do admin)...");
  await configurarEmpresaDemo(clienteAdmin, empresaId, adminMembroId, parametrosOrigem);

  console.log("\nCriando os 5 membros fictícios...");
  const pessoas = { adminMembroId };
  for (const p of PESSOAS) {
    console.log(`- ${p.nome}`);
    pessoas[p.chave] = { ...p, ...(await garantirMembro(empresaId, p)) };
  }

  const ctx = await contextoNegocios(empresaId, etapas, pessoas);
  await executarNegociosEFechamento(ctx, plano35, null);
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
