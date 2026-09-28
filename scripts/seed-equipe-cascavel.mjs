// Popula 3 vendedores de teste ("Equipe Cascavel") com negócios e propostas
// simuladas, pra visualizar Kanban/gamificação com dados reais.
//
// Idempotente: rodar de novo não duplica nada que já foi criado (vendedores,
// equipe e negócios são identificados por e-mail/nome/título antes de inserir).
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-equipe-cascavel.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "vando12star@gmail.com";
const SENHA_VENDEDORES_TESTE = "123456";

/** Regras padrão de gamificação, criadas só se a empresa não tiver nenhuma regra ativa. */
const REGRAS_PADRAO_GAMIFICACAO = [
  { nome: "Negócio criado", evento_tipo: "deal.created", pontos: 5 },
  { nome: "Etapa do funil avançada", evento_tipo: "deal.stage_changed", pontos: 2 },
  { nome: "Negócio ganho", evento_tipo: "deal.won", pontos: 50 },
  { nome: "Tarefa concluída", evento_tipo: "task.completed", pontos: 3 },
  { nome: "Nota registrada", evento_tipo: "note.created", pontos: 1 },
];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
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

async function falhaSe(condicao, mensagem) {
  if (condicao) {
    console.error(mensagem);
    process.exit(1);
  }
}

async function resolverEmpresa() {
  const { data: usuarios, error: eUsuarios } = await db.auth.admin.listUsers({ perPage: 200 });
  if (eUsuarios) throw eUsuarios;
  const admin = usuarios.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  await falhaSe(!admin, `Não achei nenhum usuário com e-mail ${ADMIN_EMAIL}.`);

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .select("empresa_id")
    .eq("user_id", admin.id)
    .eq("papel", "admin")
    .limit(1)
    .maybeSingle();
  if (eMembro) throw eMembro;
  await falhaSe(!membro, `${ADMIN_EMAIL} não é admin de nenhuma empresa.`);

  return membro.empresa_id;
}

async function garantirVendedor(empresaId, { nome, email }) {
  const { data: existentes } = await db.auth.admin.listUsers({ perPage: 200 });
  let usuario = existentes.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!usuario) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error) throw error;
    usuario = data.user;
    console.log(`  usuário criado: ${email}`);
  } else {
    console.log(`  usuário já existia: ${email}`);
  }

  const { data: membroExistente } = await db
    .from("empresa_membros")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (membroExistente) {
    console.log(`  já era membro da empresa (empresa_membros.id=${membroExistente.id})`);
    return { membroId: membroExistente.id, userId: usuario.id, novo: false };
  }

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .insert({ empresa_id: empresaId, user_id: usuario.id, papel: "vendedor", tipo_vendedor: "interno", status: "ativo" })
    .select("id")
    .single();
  if (eMembro) throw eMembro;
  console.log(`  adicionado à empresa (empresa_membros.id=${membro.id})`);
  return { membroId: membro.id, userId: usuario.id, novo: true };
}

/** Define uma senha conhecida pro vendedor de teste poder logar (senão nasce com senha aleatória, irrecuperável). */
async function garantirSenhaConhecida(userId, senha) {
  const { error } = await db.auth.admin.updateUserById(userId, { password: senha });
  if (error) throw error;
  console.log(`  senha definida: ${senha}`);
}

/** Cria as regras padrão de gamificação só se a empresa ainda não tiver nenhuma regra ativa. */
async function garantirRegrasPadrao(empresaId, adminEmail) {
  const { data: existentes, error } = await db.from("gamification_rules").select("id").eq("empresa_id", empresaId).eq("ativa", true).limit(1);
  if (error) throw error;
  if (existentes && existentes.length > 0) return false;

  const clienteAdmin = await clienteComoAdmin(adminEmail);
  const { error: eInsert } = await clienteAdmin
    .from("gamification_rules")
    .insert(REGRAS_PADRAO_GAMIFICACAO.map((r) => ({ empresa_id: empresaId, ...r, ativa: true })));
  if (eInsert) throw eInsert;
  console.log(`Regras padrão de gamificação criadas: ${REGRAS_PADRAO_GAMIFICACAO.map((r) => r.nome).join(", ")}`);
  return true;
}

async function garantirEquipe(empresaId, nome, membroIds) {
  let { data: equipe } = await db.from("equipes").select("id").eq("empresa_id", empresaId).eq("nome", nome).maybeSingle();
  if (!equipe) {
    const { data, error } = await db.from("equipes").insert({ empresa_id: empresaId, nome }).select("id").single();
    if (error) throw error;
    equipe = data;
    console.log(`Equipe "${nome}" criada (id=${equipe.id})`);
  } else {
    console.log(`Equipe "${nome}" já existia (id=${equipe.id})`);
  }

  for (const membroId of membroIds) {
    const { data: existente } = await db
      .from("equipe_membros")
      .select("equipe_id")
      .eq("equipe_id", equipe.id)
      .eq("membro_id", membroId)
      .maybeSingle();
    if (existente) continue;
    const { error } = await db.from("equipe_membros").insert({ empresa_id: empresaId, equipe_id: equipe.id, membro_id: membroId, e_gestor: false });
    if (error) throw error;
  }
  return equipe.id;
}

async function carregarEtapas(empresaId) {
  const { data: funil, error: eFunil } = await db.from("funis").select("id").eq("empresa_id", empresaId).order("ordem").limit(1).single();
  if (eFunil) throw eFunil;
  const { data: etapas, error: eEtapas } = await db
    .from("etapas")
    .select("id, nome, ordem")
    .eq("funil_id", funil.id)
    .eq("ativa", true)
    .order("ordem");
  if (eEtapas) throw eEtapas;
  await falhaSe(!etapas.length, "O funil padrão não tem etapas ativas.");
  return { funilId: funil.id, etapas };
}

async function carregarParametrosCalculadora(empresaId) {
  const { data, error } = await db.from("parametros_calculadora").select("*").eq("empresa_id", empresaId).single();
  if (error) throw error;
  return data;
}

async function carregarRegrasAtivas(empresaId) {
  const { data, error } = await db.from("gamification_rules").select("*").eq("empresa_id", empresaId).eq("ativa", true);
  if (error) throw error;
  return data ?? [];
}

/**
 * gamification_rules só aceita insert/update/delete de usuários autenticados
 * com papel admin (revogado até de service_role, ver migration) — então pra
 * criar regras aqui é preciso agir como o próprio admin, não como service role.
 * Gera um magic link pro admin e troca por uma sessão de verdade, sem senha.
 */
async function clienteComoAdmin(adminEmail) {
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: adminEmail });
  if (error) throw error;
  const tokenHash = link.properties?.hashed_token;
  if (!tokenHash) throw new Error("Não recebi hashed_token do generateLink pro admin.");

  const clienteVerificacao = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: sessao, error: eVerify } = await clienteVerificacao.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (eVerify) throw eVerify;

  const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: eSessao } = await clienteAdmin.auth.setSession({
    access_token: sessao.session.access_token,
    refresh_token: sessao.session.refresh_token,
  });
  if (eSessao) throw eSessao;
  return clienteAdmin;
}

async function garantirNegocioComProposta(empresaId, { titulo, contato, negocio, kit, gerarProposta, vendedorUserId }) {
  const { data: existente } = await db.from("negocios").select("id").eq("empresa_id", empresaId).eq("titulo", titulo).maybeSingle();

  let negocioRow;
  let negocioJaExistia = false;
  // tipo_ligacao só existe em calculos_solares, não em negocios.
  const { tipo_ligacao, ...negocioParaInserir } = negocio;

  if (existente) {
    negocioJaExistia = true;
    negocioRow = existente;
    console.log(`  negócio "${titulo}" já existia`);
  } else {
    const { data: contatoRow, error: eContato } = await db
      .from("contatos")
      .insert({ empresa_id: empresaId, ...contato })
      .select("id")
      .single();
    if (eContato) throw eContato;

    const { data: novoNegocio, error: eNegocio } = await db
      .from("negocios")
      .insert({ empresa_id: empresaId, titulo, contato_id: contatoRow.id, ...negocioParaInserir })
      .select("id")
      .single();
    if (eNegocio) throw eNegocio;
    negocioRow = novoNegocio;
    console.log(`  negócio "${titulo}" criado (${negocio.status})`);
  }

  if (gerarProposta) {
    // Se o negócio já existia (ex.: reexecução após falha parcial), só gera a
    // proposta se ainda não tiver sido gerada — pra ser seguro reexecutar.
    if (negocioJaExistia) {
      const { data: calculoExistente } = await db
        .from("calculos_solares")
        .select("negocio_id")
        .eq("negocio_id", negocioRow.id)
        .maybeSingle();
      if (calculoExistente) {
        console.log(`    proposta já existia — pulando`);
        return { negocioId: negocioRow.id, novo: false, vendedorUserId };
      }
      console.log(`    negócio sem proposta (falha parcial anterior) — gerando agora`);
    }
    const potenciaKwp = kit.componentes.filter((c) => c.tipo === "modulo").reduce((soma, c) => soma + (c.potencia_w * c.quantidade) / 1000, 0);
    const disponibilidadeCol = DISPONIBILIDADE_COLUNA[tipo_ligacao];
    const calculo = calcular({
      potenciaKwp,
      precoKit: kit.preco,
      consumoMedioKwh: negocio.consumo_medio_kwh,
      tarifaKwh: kit.tarifaKwh,
      produtividadeKwhKwpMes: kit.parametros.produtividade_kwh_kwp_mes,
      percentualFioB: kit.parametros.percentual_fio_b,
      disponibilidadeKwh: kit.parametros[disponibilidadeCol],
    });

    const { error: eCalculo } = await db.from("calculos_solares").insert({
      empresa_id: empresaId,
      negocio_id: negocioRow.id,
      kit_id: null,
      kit_nome: kit.nome,
      kit_potencia_kwp: arredondar(potenciaKwp, 2),
      kit_preco: kit.preco,
      tipo_ligacao,
      consumo_medio_kwh: negocio.consumo_medio_kwh,
      tarifa_kwh: kit.tarifaKwh,
      produtividade_kwh_kwp_mes: kit.parametros.produtividade_kwh_kwp_mes,
      percentual_fio_b: kit.parametros.percentual_fio_b,
      disponibilidade_kwh: kit.parametros[disponibilidadeCol],
      geracao_estimada_kwh_mes: calculo.geracaoEstimadaKwhMes,
      kwh_faturado: calculo.kwhFaturado,
      kwh_compensado: calculo.kwhCompensado,
      custo_fio_b: calculo.custoFioB,
      conta_sem_solar: calculo.contaSemSolar,
      conta_com_solar: calculo.contaComSolar,
      economia_mensal: calculo.economiaMensal,
      payback_meses: calculo.paybackMeses,
    });
    if (eCalculo) throw eCalculo;

    const { error: eKit } = await db
      .from("kit_componentes")
      .insert(kit.componentes.map((c, i) => ({ empresa_id: empresaId, negocio_id: negocioRow.id, ordem: i, ...c })));
    if (eKit) throw eKit;

    const { error: eProposta } = await db.from("propostas").insert({ empresa_id: empresaId, negocio_id: negocioRow.id });
    if (eProposta) throw eProposta;
    console.log(`    proposta simulada gerada (kit ${arredondar(potenciaKwp, 2)} kWp)`);
  }

  return { negocioId: negocioRow.id, novo: !negocioJaExistia, vendedorUserId };
}

/**
 * Registra o evento (dispara o motor de gamificação) se ainda não tiver sido
 * registrado antes pra esse negócio — checagem por eventos existentes, não só
 * por "negócio novo", pra também funcionar como backfill quando as regras são
 * criadas depois dos negócios já existirem.
 *
 * A checagem exige o mesmo ator_id: negócios/tarefas têm gatilho próprio que
 * já cria um evento automático no insert, mas com ator_id nulo quando quem
 * insere é a service role (sem auth.uid()) — e o motor de gamificação ignora
 * eventos com ator_id nulo. Sem essa condição, esse evento automático "sem
 * dono" seria confundido com o evento já registrado e o insert manual abaixo
 * (o único capaz de gerar pontos) seria pulado silenciosamente.
 */
async function registrarEvento(empresaId, { tipo, atorUserId, negocioId }, regrasPorTipo) {
  if (!regrasPorTipo.has(tipo)) return;

  const { data: existente } = await db
    .from("eventos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("tipo", tipo)
    .eq("entidade", "negocio")
    .eq("entidade_id", negocioId)
    .eq("ator_id", atorUserId)
    .maybeSingle();
  if (existente) return;

  const { error } = await db.from("eventos").insert({
    empresa_id: empresaId,
    tipo,
    ator_id: atorUserId,
    entidade: "negocio",
    entidade_id: negocioId,
    payload: {},
  });
  if (error) throw error;
  console.log(`    evento "${tipo}" registrado (regra de gamificação ativa)`);
}

async function main() {
  console.log("Resolvendo empresa do admin...");
  const empresaId = await resolverEmpresa();
  console.log(`empresa_id = ${empresaId}`);

  const { funilId, etapas } = await carregarEtapas(empresaId);
  const etapaPorOrdem = (i) => etapas[Math.min(i, etapas.length - 1)].id;
  const parametros = await carregarParametrosCalculadora(empresaId);
  await garantirRegrasPadrao(empresaId, ADMIN_EMAIL);
  const regras = await carregarRegrasAtivas(empresaId);
  const regrasPorTipo = new Map(regras.map((r) => [r.evento_tipo, r]));
  console.log(`Regras de gamificação ativas: ${[...regrasPorTipo.keys()].join(", ") || "nenhuma"}`);

  const perfis = [
    { chave: "alto", nome: "Camila Fernandes", email: "camila.fernandes.teste@raioncrm-demo.com.br" },
    { chave: "medio", nome: "Rafael Souza", email: "rafael.souza.teste@raioncrm-demo.com.br" },
    { chave: "baixo", nome: "Bruno Lima", email: "bruno.lima.teste@raioncrm-demo.com.br" },
  ];

  console.log("\nCriando vendedores...");
  const vendedores = {};
  for (const perfil of perfis) {
    console.log(`- ${perfil.nome} (${perfil.chave})`);
    vendedores[perfil.chave] = { ...perfil, ...(await garantirVendedor(empresaId, perfil)) };
    await garantirSenhaConhecida(vendedores[perfil.chave].userId, SENHA_VENDEDORES_TESTE);
  }

  console.log("\nCriando equipe...");
  await garantirEquipe(
    empresaId,
    "Equipe Cascavel",
    perfis.map((p) => vendedores[p.chave].membroId),
  );

  const contatoBase = (nome, sobrenome, cidade = "Cascavel", uf = "PR") => ({
    nome: `${nome} ${sobrenome}`,
    telefone: "45999" + String(Math.floor(100000 + Math.random() * 900000)),
    email: `${nome.toLowerCase()}.${sobrenome.toLowerCase()}@exemplo.com.br`,
    documento: String(Math.floor(10000000000 + Math.random() * 89999999999)),
    cidade,
    uf,
  });

  const kitPadrao = (modulos, potenciaModuloW, precoPorWp) => {
    const potenciaKwp = (modulos * potenciaModuloW) / 1000;
    return {
      nome: `Kit ${modulos}x ${potenciaModuloW}W`,
      preco: Math.round(potenciaKwp * 1000 * precoPorWp),
      tarifaKwh: 0.92,
      parametros,
      componentes: [
        { tipo: "modulo", descricao: `Módulo fotovoltaico ${potenciaModuloW}W`, potencia_w: potenciaModuloW, quantidade: modulos },
        { tipo: "inversor", descricao: "Inversor string", potencia_w: null, quantidade: 1 },
      ],
    };
  };

  console.log("\n--- Camila Fernandes (alto desempenho) ---");
  const rGanho = await garantirNegocioComProposta(empresaId, {
    titulo: "Sistema solar residencial — Cliente Cascavel Alto 1",
    contato: contatoBase("Marcos", "Almeida"),
    negocio: {
      funil_id: funilId,
      etapa_id: etapaPorOrdem(3),
      responsavel_id: vendedores.alto.membroId,
      criado_por: vendedores.alto.membroId,
      status: "ganho",
      valor: 27800,
      descricao: "Negócio de teste — venda fechada, gerado pra popular o painel de gamificação.",
      tipo_ligacao: "trifasico",
      consumo_medio_kwh: 620,
      unidade_consumidora: "10029384756",
    },
    kit: kitPadrao(16, 550, 1.1),
    gerarProposta: true,
  });
  await registrarEvento(empresaId, { tipo: "deal.created", atorUserId: vendedores.alto.userId, negocioId: rGanho.negocioId }, regrasPorTipo);
  await registrarEvento(empresaId, { tipo: "deal.won", atorUserId: vendedores.alto.userId, negocioId: rGanho.negocioId }, regrasPorTipo);

  for (const [i, [titulo, kw, consumo, etapaIdx, valor]] of [
    ["Sistema solar residencial — Cliente Cascavel Alto 2", 10, 380, 3, 19800],
    ["Sistema solar comercial — Cliente Cascavel Alto 3", 18, 950, 3, 32000],
  ].entries()) {
    const r = await garantirNegocioComProposta(empresaId, {
      titulo,
      contato: contatoBase("Cliente", `AltoTeste${i + 2}`),
      negocio: {
        funil_id: funilId,
        etapa_id: etapaPorOrdem(etapaIdx),
        responsavel_id: vendedores.alto.membroId,
        criado_por: vendedores.alto.membroId,
        status: "aberto",
        valor,
        descricao: "Negócio de teste — proposta enviada, aguardando decisão do cliente.",
        tipo_ligacao: "trifasico",
        consumo_medio_kwh: consumo,
      },
      kit: kitPadrao(Math.round((kw * 1000) / 550), 550, 1.1),
      gerarProposta: true,
    });
    await registrarEvento(empresaId, { tipo: "deal.created", atorUserId: vendedores.alto.userId, negocioId: r.negocioId }, regrasPorTipo);
  }

  console.log("\n--- Rafael Souza (médio desempenho) ---");
  for (const [i, [titulo, kw, consumo, etapaIdx, valor]] of [
    ["Sistema solar residencial — Cliente Cascavel Médio 1", 6, 320, 1, 12500],
    ["Sistema solar residencial — Cliente Cascavel Médio 2", 8, 410, 2, 15800],
    ["Sistema solar residencial — Cliente Cascavel Médio 3", 7, 350, 3, 14200],
  ].entries()) {
    const r = await garantirNegocioComProposta(empresaId, {
      titulo,
      contato: contatoBase("Cliente", `MedioTeste${i + 1}`),
      negocio: {
        funil_id: funilId,
        etapa_id: etapaPorOrdem(etapaIdx),
        responsavel_id: vendedores.medio.membroId,
        criado_por: vendedores.medio.membroId,
        status: "aberto",
        valor,
        descricao: "Negócio de teste — boa prospecção, em andamento no funil.",
        tipo_ligacao: "bifasico",
        consumo_medio_kwh: consumo,
      },
      kit: kitPadrao(Math.round((kw * 1000) / 550), 550, 1.1),
      gerarProposta: true,
    });
    await registrarEvento(empresaId, { tipo: "deal.created", atorUserId: vendedores.medio.userId, negocioId: r.negocioId }, regrasPorTipo);
  }

  console.log("\n--- Bruno Lima (baixo desempenho) ---");
  for (const [i, [titulo, kw, consumo, etapaIdx, valor]] of [
    ["Sistema solar residencial — Cliente Cascavel Baixo 1", 4, 220, 0, 8200],
    ["Sistema solar residencial — Cliente Cascavel Baixo 2", 5, 260, 0, 9500],
    ["Sistema solar residencial — Cliente Cascavel Baixo 3", 4, 210, 1, 8000],
  ].entries()) {
    const r = await garantirNegocioComProposta(empresaId, {
      titulo,
      contato: contatoBase("Cliente", `BaixoTeste${i + 1}`),
      negocio: {
        funil_id: funilId,
        etapa_id: etapaPorOrdem(etapaIdx),
        responsavel_id: vendedores.baixo.membroId,
        criado_por: vendedores.baixo.membroId,
        status: "aberto",
        valor,
        descricao: "Negócio de teste — lead recente, pouca movimentação ainda.",
        tipo_ligacao: "monofasico",
        consumo_medio_kwh: consumo,
      },
      kit: kitPadrao(Math.round((kw * 1000) / 550), 550, 1.1),
      gerarProposta: true,
    });
    await registrarEvento(empresaId, { tipo: "deal.created", atorUserId: vendedores.baixo.userId, negocioId: r.negocioId }, regrasPorTipo);
  }

  console.log("\nConcluído.");
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
