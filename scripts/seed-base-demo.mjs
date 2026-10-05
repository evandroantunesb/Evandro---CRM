// Base fictícia de demonstração: reseta vendedores/dados comerciais existentes
// e semeia 4 closers + 1 SDR fictícios, 35 negócios, 90 dias de histórico
// visual, ganhos/perdas/pagamentos/comissões e gamificação — tudo através dos
// mecanismos reais do CRM (triggers, RPCs, sessões autenticadas de cada
// membro). Nunca insere diretamente em `point_ledger` nem em `eventos` com um
// tipo que o motor credite pontos sem a ação real correspondente ter
// acontecido.
//
// Desenho aprovado por Evandro em 2026-10-05 (ver
// /mnt/project-files/auditorias/{diagnostico,desenho}-base-demo-2026-10-05.md).
//
// DESTRUTIVO: com CONFIRMAR_RESET_DEMO=sim, apaga todo `empresa_membros` com
// papel='vendedor' da empresa do ADMIN_EMAIL — e, em cascata, todos os
// negócios/contatos/point_ledger/metas/comissões/conquistas desses membros —
// antes de semear os 5 fictícios. SEM a flag, só mostra o que seria apagado
// (dry run) e sai sem mudar nada. Nunca toca na linha do admin.
//
// Uso:
//   node scripts/seed-base-demo.mjs                         # dry run
//   CONFIRMAR_RESET_DEMO=sim SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     ADMIN_EMAIL=... node scripts/seed-base-demo.mjs        # reset + seed de verdade
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "vando12star@gmail.com";
const CONFIRMAR_RESET_DEMO = process.env.CONFIRMAR_RESET_DEMO === "sim";
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
// 1. Empresa / admin
// ---------------------------------------------------------------------------

async function resolverEmpresaEAdmin() {
  const { data: usuarios, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const admin = usuarios.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  await falhaSe(!admin, `Não achei nenhum usuário com e-mail ${ADMIN_EMAIL}.`);

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .select("id, empresa_id")
    .eq("user_id", admin.id)
    .eq("papel", "admin")
    .limit(1)
    .maybeSingle();
  if (eMembro) throw eMembro;
  await falhaSe(!membro, `${ADMIN_EMAIL} não é admin de nenhuma empresa.`);

  return { empresaId: membro.empresa_id, adminMembroId: membro.id, adminUserId: admin.id };
}

// ---------------------------------------------------------------------------
// 2. Reset — dry run por padrão, só apaga com CONFIRMAR_RESET_DEMO=sim
// ---------------------------------------------------------------------------

async function planoDeLimpeza(empresaId, adminMembroId) {
  const { data: vendedores, error } = await db
    .from("empresa_membros")
    .select("id, user_id, perfis(nome, email)")
    .eq("empresa_id", empresaId)
    .eq("papel", "vendedor");
  if (error) throw error;

  await falhaSe(
    vendedores.some((v) => v.id === adminMembroId),
    "Proteção: o admin apareceu na lista de vendedores a remover — abortando sem apagar nada.",
  );

  const membroIds = vendedores.map((v) => v.id);
  let negocioIds = [];
  if (membroIds.length) {
    const { data: negocios, error: eNeg } = await db
      .from("negocios")
      .select("id")
      .eq("empresa_id", empresaId)
      .or(`responsavel_id.in.(${membroIds.join(",")}),criado_por.in.(${membroIds.join(",")})`);
    if (eNeg) throw eNeg;
    negocioIds = (negocios ?? []).map((n) => n.id);
  }

  return { vendedores, membroIds, negocioIds };
}

async function imprimirPlano({ vendedores, negocioIds }) {
  console.log(`\nVendedores/SDR que seriam removidos (${vendedores.length}):`);
  for (const v of vendedores) {
    console.log(`  - ${v.perfis?.nome ?? "(sem nome)"} <${v.perfis?.email ?? "sem e-mail"}> (empresa_membros.id=${v.id})`);
  }
  console.log(`Negócios que seriam apagados (cascata: histórico, atividades, propostas, contratos, tarefas, notas, handoffs): ${negocioIds.length}`);
  console.log("Isso também apaga em cascata, por membro removido: point_ledger, conquistas_desbloqueadas, resgates, metas, comissoes_calculadas, notificacoes.");
  console.log("Preservado, sem alteração: admin, empresas, funis (etapas são substituídas no passo seguinte), origens, motivos_perda, gamification_rules, niveis_gamificacao, conquistas, recompensas, logs_auditoria.");
}

async function executarLimpeza(empresaId, { membroIds, negocioIds }) {
  if (negocioIds.length) {
    console.log(`Apagando eventos de ${negocioIds.length} negócio(s) antigos...`);
    const { error: eEventos } = await db.from("eventos").delete().eq("empresa_id", empresaId).eq("entidade", "negocio").in("entidade_id", negocioIds);
    if (eEventos) throw eEventos;

    console.log(`Apagando ${negocioIds.length} negócio(s) antigos (cascata)...`);
    const { error: eNegocios } = await db.from("negocios").delete().in("id", negocioIds);
    if (eNegocios) throw eNegocios;
  }

  console.log("Apagando contatos órfãos...");
  const { data: contatosOrfaos, error: eBuscaContatos } = await db
    .from("contatos")
    .select("id, negocios!left(id)")
    .eq("empresa_id", empresaId);
  if (eBuscaContatos) throw eBuscaContatos;
  const idsOrfaos = (contatosOrfaos ?? []).filter((c) => !c.negocios?.length).map((c) => c.id);
  if (idsOrfaos.length) {
    const { error: eDelContatos } = await db.from("contatos").delete().in("id", idsOrfaos);
    if (eDelContatos) throw eDelContatos;
  }
  console.log(`  ${idsOrfaos.length} contato(s) órfão(s) apagado(s).`);

  if (membroIds.length) {
    console.log(`Apagando ${membroIds.length} empresa_membros (vendedores/SDR) antigos (cascata: point_ledger, metas, comissões, conquistas, resgates, notificações)...`);
    const { error: eMembros } = await db.from("empresa_membros").delete().in("id", membroIds);
    if (eMembros) throw eMembros;
  }

  console.log("Apagando equipes órfãs...");
  const { data: equipes, error: eEquipes } = await db.from("equipes").select("id, equipe_membros!left(membro_id)").eq("empresa_id", empresaId);
  if (eEquipes) throw eEquipes;
  const equipesOrfas = (equipes ?? []).filter((e) => !e.equipe_membros?.length).map((e) => e.id);
  if (equipesOrfas.length) {
    const { error: eDelEquipes } = await db.from("equipes").delete().in("id", equipesOrfas);
    if (eDelEquipes) throw eDelEquipes;
  }
  console.log(`  ${equipesOrfas.length} equipe(s) órfã(s) apagada(s).`);
}

// ---------------------------------------------------------------------------
// 3. Funil de 9 etapas — substitui as 4 atuais (instrução explícita do
//    Evandro: dados atuais não são reais, sem motivo pra manter redundância).
// ---------------------------------------------------------------------------

const ETAPAS_DEMO = [
  { nome: "Novo Lead", inicial: true, fecha_como: null },
  { nome: "Qualificação", inicial: false, fecha_como: null },
  { nome: "Contato Realizado", inicial: false, fecha_como: null },
  { nome: "Levantamento/Diagnóstico", inicial: false, fecha_como: null },
  { nome: "Proposta Enviada", inicial: false, fecha_como: null },
  { nome: "Follow-up", inicial: false, fecha_como: null },
  { nome: "Negociação", inicial: false, fecha_como: null },
  { nome: "Assinado", inicial: false, fecha_como: "ganho" },
  { nome: "Pago", inicial: false, fecha_como: null },
];

async function recriarFunil(empresaId) {
  const { data: funil, error: eFunil } = await db.from("funis").select("id").eq("empresa_id", empresaId).order("ordem").limit(1).single();
  if (eFunil) throw eFunil;

  console.log(`Removendo as etapas atuais do funil "Vendas" (funil_id=${funil.id})...`);
  const { error: eDelEtapas } = await db.from("etapas").delete().eq("funil_id", funil.id);
  if (eDelEtapas) throw eDelEtapas;

  console.log("Criando as 9 etapas do funil de demonstração...");
  const { data: etapas, error: eInsEtapas } = await db
    .from("etapas")
    .insert(ETAPAS_DEMO.map((e, i) => ({ empresa_id: empresaId, funil_id: funil.id, nome: e.nome, ordem: i + 1, inicial: e.inicial, fecha_como: e.fecha_como })))
    .select("id, nome, ordem")
    .order("ordem");
  if (eInsEtapas) throw eInsEtapas;

  return { funilId: funil.id, etapas };
}

// ---------------------------------------------------------------------------
// 4. Pessoas
// ---------------------------------------------------------------------------

const PESSOAS = [
  { chave: "lucas", nome: "Lucas Martins", email: "lucas.martins.demo@raioncrm-demo.com.br", perfil_gamificacao: "closer" },
  { chave: "mariana", nome: "Mariana Costa", email: "mariana.costa.demo@raioncrm-demo.com.br", perfil_gamificacao: "closer" },
  { chave: "rafael", nome: "Rafael Almeida", email: "rafael.almeida.demo@raioncrm-demo.com.br", perfil_gamificacao: "closer" },
  { chave: "bruno", nome: "Bruno Ferreira", email: "bruno.ferreira.demo@raioncrm-demo.com.br", perfil_gamificacao: "closer" },
  { chave: "gabriel", nome: "Gabriel Santos", email: "gabriel.santos.demo@raioncrm-demo.com.br", perfil_gamificacao: "sdr" },
];

async function garantirMembro(empresaId, { nome, email, perfil_gamificacao }) {
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
    await db.from("empresa_membros").update({ perfil_gamificacao, ativo: true, status: "ativo" }).eq("id", membroExistente.id);
    return { membroId: membroExistente.id, userId: usuario.id };
  }

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .insert({ empresa_id: empresaId, user_id: usuario.id, papel: "vendedor", perfil_gamificacao, tipo_vendedor: "interno", status: "ativo", ativo: true })
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

async function executarNegocio(ctx, deal) {
  const { empresaId, etapas, parametros, pessoas, motivosPerdaPorNome, origensPorNome } = ctx;
  const closer = pessoas[deal.closer];
  const criador = deal.viaSdr ? pessoas.gabriel : closer;
  const clienteCriador = await clienteComo(criador.email);

  const dataCriacao = hA(deal.diasAtrasCriacao);
  const kit = kitDoTier(deal.tier, parametros);
  const tierInfo = TIERS[deal.tier];

  const { data: contatoRow, error: eContato } = await clienteCriador
    .from("contatos")
    .insert({ empresa_id: empresaId, ...deal.contato })
    .select("id")
    .single();
  if (eContato) throw eContato;

  const origemId = origensPorNome.get(deal.origemNome);
  const { data: negocioRow, error: eNegocio } = await clienteCriador
    .from("negocios")
    .insert({
      empresa_id: empresaId,
      titulo: `${deal.tier.startsWith("comercial") ? "Sistema solar comercial" : "Sistema solar residencial"} — ${deal.contato.nome}`,
      contato_id: contatoRow.id,
      funil_id: etapas[0].funilId,
      etapa_id: etapas[0].id,
      origem_id: origemId,
      responsavel_id: criador.membroId,
      valor: kit.preco,
      status: "aberto",
      created_at: dataCriacao,
    })
    .select("id")
    .single();
  if (eNegocio) throw eNegocio;
  const negocioId = negocioRow.id;
  await retrodatarEtapaAtual(negocioId, etapas[0].id, dataCriacao);

  const { error: eCalculo } = await db.from("calculos_solares").insert({
    empresa_id: empresaId,
    negocio_id: negocioId,
    kit_id: null,
    kit_nome: kit.nome,
    kit_potencia_kwp: arredondar((tierInfo.modulos * tierInfo.potenciaModuloW) / 1000, 2),
    kit_preco: kit.preco,
    tipo_ligacao: tierInfo.ligacao,
    consumo_medio_kwh: tierInfo.consumo,
    tarifa_kwh: kit.tarifaKwh,
    produtividade_kwh_kwp_mes: kit.parametros.produtividade_kwh_kwp_mes,
    percentual_fio_b: kit.parametros.percentual_fio_b,
    disponibilidade_kwh: kit.parametros[DISPONIBILIDADE_COLUNA[tierInfo.ligacao]],
    ...calcular({
      potenciaKwp: (tierInfo.modulos * tierInfo.potenciaModuloW) / 1000,
      precoKit: kit.preco,
      consumoMedioKwh: tierInfo.consumo,
      tarifaKwh: kit.tarifaKwh,
      produtividadeKwhKwpMes: kit.parametros.produtividade_kwh_kwp_mes,
      percentualFioB: kit.parametros.percentual_fio_b,
      disponibilidadeKwh: kit.parametros[DISPONIBILIDADE_COLUNA[tierInfo.ligacao]],
    }),
  });
  if (eCalculo) throw eCalculo;
  await db.from("kit_componentes").insert(kit.componentes.map((c, i) => ({ empresa_id: empresaId, negocio_id: negocioId, ordem: i, ...c })));
  await db.from("propostas").insert({ empresa_id: empresaId, negocio_id: negocioId });

  // Handoff SDR → closer: Gabriel cria, closer aceita (transfere responsavel_id de verdade).
  if (deal.viaSdr) {
    const { data: handoff, error: eHandoff } = await clienteCriador
      .from("handoffs")
      .insert({
        empresa_id: empresaId,
        negocio_id: negocioId,
        contato_id: contatoRow.id,
        de_membro_id: pessoas.gabriel.membroId,
        para_membro_id: closer.membroId,
        status_qualificacao: "qualificado",
        qualificacao_snapshot: { origem: deal.origemNome, motivo: "lead qualificado pelo SDR" },
      })
      .select("id")
      .single();
    if (eHandoff) throw eHandoff;
    const clienteFechador = await clienteComo(closer.email);
    const { error: eAceite } = await clienteFechador.rpc("aceitar_handoff", { p_handoff_id: handoff.id });
    if (eAceite) throw eAceite;
  }

  // Avança as etapas de verdade, na sessão do closer (responsável a partir daqui),
  // com timestamps retrodatados espalhados entre a criação e a etapa final.
  // Índices 7 ("Assinado") e 8 ("Pago") nunca entram neste loop genérico — são
  // tratados abaixo, exclusivamente pelo bloco de ganho (é ali que o negócio
  // vira 'ganho' de verdade, nunca antes, e onde o contrato é criado/assinado
  // antes de mover pra "Assinado").
  const etapaIntermediariaFinal = Math.min(deal.etapaFinal, 6);
  const clienteCloser = await clienteComo(closer.email);
  const diasTotal = Math.max(deal.diasAtrasCriacao - 2, deal.etapaFinal + 1);
  const passo = deal.etapaFinal > 0 ? diasTotal / (deal.etapaFinal + 1) : 0;
  for (let idx = 1; idx <= etapaIntermediariaFinal; idx++) {
    const diasAtrasEntrada = Math.max(1, Math.round(deal.diasAtrasCriacao - passo * idx));
    const dataSaida = hA(diasAtrasEntrada);
    await moverEtapa(clienteCloser, negocioId, etapas[idx].id, { backdateSaidaAnteriorIso: dataSaida, backdateEntradaIso: dataSaida });
  }

  // Fecha ganho/perdido pela sessão real do closer.
  if (deal.resultado === "perdido") {
    const motivoId = motivosPerdaPorNome.get(deal.motivoNome);
    const { error } = await clienteCloser.from("negocios").update({ status: "perdido", motivo_perda_id: motivoId }).eq("id", negocioId);
    if (error) throw error;
    return { negocioId, closer: closer.membroId, resultado: deal.resultado };
  }

  if (deal.resultado === "ganho_pago" || deal.resultado === "ganho_aguardando") {
    // etapas[7] = "Assinado" (fecha_como='ganho') — status vira 'ganho' nesse exato passo,
    // nunca antes (instrução explícita: ganho só na assinatura).
    const dataAssinatura = hA(Math.max(5, deal.diasAtrasCriacao - Math.round(passo * 7)));
    await moverEtapa(clienteCloser, negocioId, etapas[7].id, { backdateSaidaAnteriorIso: dataAssinatura, backdateEntradaIso: dataAssinatura });

    const { data: modelo } = await db.from("modelos_contrato").select("conteudo").eq("empresa_id", empresaId).maybeSingle();
    const { data: contratoRascunho, error: eContratoIns } = await clienteCloser
      .from("contratos")
      .insert({ empresa_id: empresaId, negocio_id: negocioId, conteudo: modelo?.conteudo || "Contrato de instalação de sistema fotovoltaico — demonstração." })
      .select("id")
      .single();
    if (eContratoIns) throw eContratoIns;
    const { error: eAssinar } = await clienteCloser.from("contratos").update({ status: "assinado" }).eq("id", contratoRascunho.id);
    if (eAssinar) throw eAssinar;

    if (deal.resultado === "ganho_pago") {
      const dataPago = hA(Math.max(2, deal.diasAtrasCriacao - Math.round(passo * 8)));
      await moverEtapa(clienteCloser, negocioId, etapas[8].id, { backdateSaidaAnteriorIso: dataPago, backdateEntradaIso: dataPago });

      const clienteAdmin = await clienteComo(ADMIN_EMAIL);
      const { error: ePagamento } = await clienteAdmin.rpc("confirmar_pagamento", { p_contrato_id: contratoRascunho.id });
      if (ePagamento) throw ePagamento;
    }
    return { negocioId, closer: closer.membroId, resultado: deal.resultado, contratoId: contratoRascunho.id, valor: kit.preco };
  }

  return { negocioId, closer: closer.membroId, resultado: deal.resultado };
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

async function garantirPlanoComissao(empresaId, membroId) {
  const referencia = primeiroDiaDoMes(AGORA);
  const { data: existente } = await db.from("planos_comissao").select("id").eq("empresa_id", empresaId).eq("membro_id", membroId).eq("ativo", true).maybeSingle();
  if (existente) return existente.id;
  const { data, error } = await db
    .from("planos_comissao")
    .insert({
      empresa_id: empresaId,
      membro_id: membroId,
      salario_base: 0,
      tipo_calculo: "percentual",
      faixas: [
        { resultado_minimo: 0, resultado_maximo: 50000, valor: 3 },
        { resultado_minimo: 50000, resultado_maximo: null, valor: 4 },
      ],
      ativo: true,
      vigencia_inicio: referencia,
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
    const planoId = await garantirPlanoComissao(empresaId, membroId);
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

async function criarMetas(empresaId, adminMembroId, pessoas, alvosPorChave) {
  const inicio = primeiroDiaDoMes(AGORA);
  const fim = new Date(Date.UTC(AGORA.getUTCFullYear(), AGORA.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const nomeMes = new Date(inicio).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  for (const chave of ["lucas", "mariana", "rafael", "bruno"]) {
    const membroId = pessoas[chave].membroId;
    const { data: existente } = await db.from("metas").select("id").eq("empresa_id", empresaId).eq("membro_id", membroId).eq("metrica", "receita").eq("ativa", true).lte("periodo_inicio", fim).gte("periodo_fim", inicio).maybeSingle();
    if (existente) continue;
    const { error } = await db.from("metas").insert({
      empresa_id: empresaId,
      titulo: `Meta comercial de ${nomeMes}`,
      metrica: "receita",
      membro_id: membroId,
      periodo_inicio: inicio,
      periodo_fim: fim,
      valor_alvo: alvosPorChave[chave],
      ativa: true,
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

  console.log("\n-- 6. XP/pontos reais por membro (point_ledger, só lançamentos não estornados) --");
  const { data: lancamentos, error: eLedger } = await db
    .from("point_ledger")
    .select("membro_id, xp, moedas")
    .eq("empresa_id", empresaId)
    .eq("estornado", false)
    .in("membro_id", [...closerIds, pessoas.gabriel.membroId]);
  if (eLedger) throw eLedger;
  const xpPorMembro = {};
  for (const l of lancamentos) xpPorMembro[l.membro_id] = (xpPorMembro[l.membro_id] ?? 0) + l.xp;

  const { data: niveis } = await db.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", empresaId).order("xp_minimo", { ascending: true });
  function nivelDe(xp) {
    let atual = null;
    for (const n of niveis ?? []) {
      if (xp >= n.xp_minimo) atual = n;
    }
    return atual ? `nível ${atual.nivel}${atual.nome ? ` (${atual.nome})` : ""}` : "sem nível configurado";
  }

  const rankingTodos = [...closers, "gabriel"].map((c) => ({ chave: c, nome: pessoas[c].nome, xp: xpPorMembro[pessoas[c].membroId] ?? 0 }));
  rankingTodos.sort((a, b) => b.xp - a.xp);
  for (const r of rankingTodos) console.log(`  ${r.nome}: ${r.xp} XP — ${nivelDe(r.xp)}`);

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
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Resolvendo empresa do admin...");
  const { empresaId, adminMembroId } = await resolverEmpresaEAdmin();
  console.log(`empresa_id = ${empresaId}`);

  const plano = await planoDeLimpeza(empresaId, adminMembroId);
  await imprimirPlano(plano);

  if (!CONFIRMAR_RESET_DEMO) {
    console.log("\nCONFIRMAR_RESET_DEMO não está definido como 'sim' — nada foi apagado ou criado. Dry run encerrado.");
    return;
  }

  console.log("\nCONFIRMAR_RESET_DEMO=sim — prosseguindo com a limpeza real.");
  await executarLimpeza(empresaId, plano);

  const { funilId, etapas: etapasCriadas } = await recriarFunil(empresaId);
  const etapas = etapasCriadas.map((e) => ({ ...e, funilId }));

  console.log("\nCriando os 5 membros fictícios...");
  const pessoas = { adminMembroId };
  for (const p of PESSOAS) {
    console.log(`- ${p.nome}`);
    pessoas[p.chave] = { ...p, ...(await garantirMembro(empresaId, p)) };
  }

  const { data: parametros, error: eParam } = await db.from("parametros_calculadora").select("*").eq("empresa_id", empresaId).single();
  if (eParam) throw eParam;

  const { data: motivos } = await db.from("motivos_perda").select("id, nome").eq("empresa_id", empresaId);
  const motivosPerdaPorNome = new Map((motivos ?? []).map((m) => [m.nome, m.id]));
  const { data: origens } = await db.from("origens").select("id, nome").eq("empresa_id", empresaId);
  const origensPorNome = new Map((origens ?? []).map((o) => [o.nome, o.id]));

  const ctx = { empresaId, etapas, parametros, pessoas, motivosPerdaPorNome, origensPorNome };

  console.log("\nCriando os 35 negócios (sessões reais, eventos/gamificação disparados pelos gatilhos)...");
  const plano35 = montarPlano();
  await falhaSe(plano35.length !== 35, `Plano gerou ${plano35.length} negócios, esperava 35 — abortando antes de criar qualquer um.`);
  const resultados = [];
  for (const deal of plano35) {
    const r = await executarNegocio(ctx, deal);
    resultados.push(r);
    console.log(`  ${deal.closer}: negócio ${r.negocioId} (${deal.resultado})`);
  }

  console.log("\nCalculando e fechando comissões do mês atual (closers)...");
  const comissoes = await calcularEFecharComissoes(empresaId, pessoas, new Set(["lucas", "mariana"]));
  for (const c of comissoes) console.log(`  ${c.chave}: resultado apurado R$ ${c.resultadoApurado} → comissão R$ ${arredondar(c.valorTotal, 2)}${c.fechada ? " (fechada)" : ""}`);

  console.log("\nCriando metas de receita do mês atual...");
  await criarMetas(empresaId, adminMembroId, pessoas, { lucas: 90000, mariana: 70000, rafael: 45000, bruno: 35000 });

  await validarPosSeed(empresaId, pessoas);

  console.log("\nConcluído.");
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
