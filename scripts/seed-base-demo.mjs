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
//   CRIAR_BASE_DEMO=sim node scripts/seed-base-demo.mjs    # cria a empresa demo de verdade
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL (admin da empresa de
// origem, vira admin da demo) e, só se esse admin for admin de mais de uma empresa,
// EMPRESA_ORIGEM_ID.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "vando12star@gmail.com";
const EMPRESA_ORIGEM_ID = process.env.EMPRESA_ORIGEM_ID || null;
const CRIAR_BASE_DEMO = process.env.CRIAR_BASE_DEMO === "sim";
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
// 2. Configuração copiada da empresa de origem
//
// Inventário do que a empresa demo JÁ GANHA dos gatilhos de `empresas` ao nascer
// (não é copiado, para não duplicar):
//   - criar_padroes_empresa(): funil "Vendas" + 4 etapas e 9 origens;
//   - criar_motivos_padrao(): 7 motivos de perda;
//   - criar_parametros_calculadora_padrao(): 1 linha de parametros_calculadora
//     (valores padrão — sobrescritos abaixo com os da origem, via UPDATE).
// Nada de gamificação, modelos, kits ou recompensas nasce com a empresa.
//
// Copiado (só o que está ativo na origem), pela sessão do admin — mesmo caminho e
// mesmas policies das telas de Gamificação > Administração:
//   gamification_rules, niveis_gamificacao, conquistas, recompensas.
// Não copiado: modelos de contrato/proposta e identidade da proposta (texto e logos
// da empresa real), kits, etiquetas, equipes, formulários de captura.
//
// Nenhuma linha é copiada por JSON cru: cada registro é remontado campo a campo, e
// `condicao`/`criterio` só passam se usarem campos conhecidos do catálogo atual
// (src/lib/gamificacao.ts) e nenhum UUID — um ID de outra empresa nunca é levado
// para a demo. Hoje nenhum campo de condição do catálogo guarda ID (nem de etapa),
// então não há o que remapear; se aparecer, o script bloqueia em vez de copiar.
// ---------------------------------------------------------------------------

// União de EVENTOS_GAMIFICACAO[].campos em src/lib/gamificacao.ts.
const CAMPOS_CONDICAO_CONHECIDOS = new Set(["valor", "tipo", "no_prazo", "resultado"]);
// Marcados `naoPontuavel` ou `legado` no mesmo catálogo.
const EVENTOS_NAO_PONTUAVEIS = new Set(["deal.created", "deal.stage_changed", "deal.owner_changed", "task.created", "note.created", "deal.first_contact_done"]);
const METRICAS_CONQUISTA = new Set(["xp_acumulado", "marco_contagem"]);
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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

async function lerAtivos(tabela, origemId, filtrarAtiva = true) {
  let consulta = db.from(tabela).select("*").eq("empresa_id", origemId);
  if (filtrarAtiva) consulta = consulta.eq("ativa", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return data ?? [];
}

async function carregarConfiguracaoOrigem(origemId) {
  const [regras, niveis, conquistas, recompensas] = await Promise.all([
    lerAtivos("gamification_rules", origemId),
    lerAtivos("niveis_gamificacao", origemId),
    lerAtivos("conquistas", origemId),
    lerAtivos("recompensas", origemId),
  ]);
  const { data: parametros, error: eParam } = await db.from("parametros_calculadora").select(PARAMETROS_COPIADOS.join(", ")).eq("empresa_id", origemId).single();
  if (eParam) throw eParam;

  const bloqueios = [];
  const avisos = [];

  const regrasDemo = [];
  for (const r of regras) {
    let condicao = null;
    if (r.condicao !== null && r.condicao !== undefined) {
      const c = r.condicao;
      const chaves = c && typeof c === "object" && !Array.isArray(c) ? Object.keys(c).sort().join(",") : "";
      if (chaves !== "campo,operador,valor") {
        bloqueios.push(`regra "${r.nome}": condição em formato inesperado (${JSON.stringify(c)}).`);
        continue;
      }
      if (!CAMPOS_CONDICAO_CONHECIDOS.has(c.campo) || UUID_RE.test(String(c.valor))) {
        bloqueios.push(`regra "${r.nome}": condição ${c.campo} ${c.operador} ${c.valor} usa campo fora do catálogo ou um ID — não é copiada às cegas.`);
        continue;
      }
      condicao = { campo: c.campo, operador: c.operador, valor: c.valor };
    }
    if (EVENTOS_NAO_PONTUAVEIS.has(r.evento_tipo)) {
      avisos.push(`regra "${r.nome}" (${r.evento_tipo}: ${r.xp} XP / ${r.moedas} moedas) é de evento marcado como não pontuável/legado no catálogo atual — será copiada como está ativa na origem.`);
    }
    regrasDemo.push({
      nome: r.nome,
      evento_tipo: r.evento_tipo,
      xp: r.xp,
      moedas: r.moedas,
      perfil_aplicavel: r.perfil_aplicavel,
      condicao,
      limite_periodo: r.limite_periodo,
      limite_quantidade: r.limite_quantidade,
      unica_por_negocio: r.unica_por_negocio,
    });
  }

  const conquistasDemo = [];
  for (const c of conquistas) {
    const k = c.criterio;
    const valido =
      k && typeof k === "object" && METRICAS_CONQUISTA.has(k.metrica) && Number.isInteger(k.valor) && (k.metrica !== "marco_contagem" || typeof k.marco === "string");
    if (!valido || UUID_RE.test(JSON.stringify(k))) {
      bloqueios.push(`conquista "${c.nome}": critério em formato inesperado ou com ID (${JSON.stringify(k)}).`);
      continue;
    }
    conquistasDemo.push({
      nome: c.nome,
      descricao: c.descricao,
      icone: c.icone,
      criterio: k.metrica === "marco_contagem" ? { metrica: k.metrica, marco: k.marco, valor: k.valor } : { metrica: k.metrica, valor: k.valor },
      xp_bonus: c.xp_bonus,
      perfil_aplicavel: c.perfil_aplicavel,
    });
  }

  const niveisDemo = niveis.map((n) => ({ nivel: n.nivel, nome: n.nome, xp_minimo: n.xp_minimo }));
  const recompensasDemo = recompensas.map((r) => ({
    nome: r.nome,
    descricao: r.descricao,
    custo_moedas: r.custo_moedas,
    estoque: r.estoque,
    limite_por_membro: r.limite_por_membro,
    validade_ate: r.validade_ate,
  }));

  if (!regrasDemo.length) avisos.push("a origem não tem nenhuma regra de gamificação ativa — a demo não vai gerar XP.");
  if (!niveisDemo.length) avisos.push("a origem não tem níveis ativos.");

  return { regras: regrasDemo, niveis: niveisDemo, conquistas: conquistasDemo, recompensas: recompensasDemo, parametros, bloqueios, avisos };
}

function imprimirPlano({ origemId, origemNome, config, demoExistente }) {
  console.log(`\nEmpresa de origem (só leitura): ${origemNome} (empresa_id=${origemId})`);
  console.log(`Empresa a criar: "${NOME_EMPRESA_DEMO}" — situação ativa, sem plano de cobrança (aparece na cobrança com R$ 0).`);
  console.log("\nCriado automaticamente pelos gatilhos de `empresas` (não copiado):");
  console.log('  funil "Vendas" + 4 etapas (viram as 4 primeiras das 9 do funil demo), 9 origens, 7 motivos de perda, parâmetros da calculadora (valores padrão).');
  console.log("\nCopiado da origem pela sessão do admin (só registros ativos, remontados campo a campo):");
  console.log(`  regras de gamificação: ${config.regras.length}`);
  for (const r of config.regras) {
    const cond = r.condicao ? ` [se ${r.condicao.campo} ${r.condicao.operador} ${r.condicao.valor}]` : "";
    console.log(`    - ${r.nome}: ${r.evento_tipo} → ${r.xp} XP / ${r.moedas} moedas${r.perfil_aplicavel ? ` (perfil ${r.perfil_aplicavel})` : ""}${cond}`);
  }
  console.log(`  níveis: ${config.niveis.length} · conquistas: ${config.conquistas.length} · recompensas: ${config.recompensas.length}`);
  console.log(`  parâmetros da calculadora: ${PARAMETROS_COPIADOS.length} campos (UPDATE na linha criada pelo gatilho)`);
  console.log("Não copiado: modelos de contrato/proposta, identidade da proposta, kits, etiquetas, equipes, formulários de captura.");
  console.log(`\nUsuários fictícios: ${PESSOAS.length} (${demoExistente.usuariosDemo.length} já existem no Auth e serão reaproveitados, com a senha de demonstração redefinida).`);
  for (const p of PESSOAS) console.log(`  - ${p.nome} <${p.email}> — papel=${p.papel}, perfil_gamificacao=${p.perfil_gamificacao}`);

  if (config.avisos.length) {
    console.log("\nAvisos:");
    for (const a of config.avisos) console.log(`  ⚠ ${a}`);
  }
}

async function copiarConfiguracao(clienteAdmin, demoId, demoAdminMembroId, config) {
  const lotes = [
    ["gamification_rules", config.regras.map((r) => ({ ...r, empresa_id: demoId, criado_por: demoAdminMembroId }))],
    ["niveis_gamificacao", config.niveis.map((n) => ({ ...n, empresa_id: demoId }))],
    ["conquistas", config.conquistas.map((c) => ({ ...c, empresa_id: demoId }))],
    ["recompensas", config.recompensas.map((r) => ({ ...r, empresa_id: demoId, criado_por: demoAdminMembroId }))],
  ];
  for (const [tabela, linhas] of lotes) {
    if (!linhas.length) continue;
    const { error } = await clienteAdmin.from(tabela).insert(linhas);
    if (error) throw new Error(`Falha ao copiar ${tabela}: ${error.message}`);
    console.log(`  ${tabela}: ${linhas.length}`);
  }
  const { error: eParam } = await clienteAdmin.from("parametros_calculadora").update(config.parametros).eq("empresa_id", demoId);
  if (eParam) throw new Error(`Falha ao copiar parâmetros da calculadora: ${eParam.message}`);
  console.log("  parametros_calculadora: atualizados");
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

  // Primeiro contato do SDR: o gatilho criar_tarefa_primeiro_contato_sdr() já criou a
  // tarefa "Realizar primeiro contato" ao inserir o negócio com Gabriel (papel sdr) como
  // responsável. Gabriel conclui pela própria sessão, igual a alternarConclusao() em
  // src/lib/acoes/tarefas.ts (preparar_tarefa() valida o resultado e registrar_tarefa()
  // emite task.completed) — antes do handoff.
  if (deal.viaSdr) {
    const { data: tarefasSdr, error: eTarefasSdr } = await clienteCriador
      .from("tarefas")
      .select("id")
      .eq("negocio_id", negocioId)
      .eq("responsavel_id", pessoas.gabriel.membroId)
      .eq("titulo", "Realizar primeiro contato")
      .is("concluida_em", null);
    if (eTarefasSdr) throw eTarefasSdr;
    await falhaSe(
      tarefasSdr.length !== 1,
      `Esperava 1 tarefa automática de primeiro contato no negócio ${negocioId}, achei ${tarefasSdr.length} — confira se Gabriel está com papel 'sdr'.`,
    );
    const { error: eConcluir } = await clienteCriador
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" })
      .eq("id", tarefasSdr[0].id);
    if (eConcluir) throw eConcluir;
  }

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
  // --- Só leitura: tudo o que pode bloquear é checado antes da primeira escrita. ---
  const usuariosAuth = await listarUsuariosAuth();
  const { adminUserId, origemId, origemNome } = await resolverAdminEOrigem(usuariosAuth);
  const demoExistente = await encontrarDemoExistente(usuariosAuth);
  const config = await carregarConfiguracaoOrigem(origemId);
  const plano35 = montarPlano();

  imprimirPlano({ origemId, origemNome, config, demoExistente });

  const bloqueios = [...config.bloqueios];
  for (const e of demoExistente.porNome) bloqueios.push(`já existe empresa "${e.nome}" (empresa_id=${e.id}, situação ${e.situacao}) — a Base Demo não é recriada nem duplicada.`);
  for (const v of demoExistente.vinculosAtivos) {
    const email = demoExistente.usuariosDemo.find((u) => u.id === v.user_id)?.email;
    bloqueios.push(`${email} já é membro ativo da empresa "${v.empresas?.nome}" (empresa_id=${v.empresa_id}).`);
  }
  if (plano35.length !== 35) bloqueios.push(`plano gerou ${plano35.length} negócios, esperava 35.`);

  if (bloqueios.length) {
    console.log("\nBLOQUEIOS — nada foi criado:");
    for (const b of bloqueios) console.log(`  ✗ ${b}`);
    process.exit(1);
  }

  if (!CRIAR_BASE_DEMO) {
    console.log("\nCRIAR_BASE_DEMO não está definido como 'sim' — nada foi criado. Dry run encerrado.");
    return;
  }

  // --- Escritas: só dentro da empresa demo nova. ---
  console.log(`\nCRIAR_BASE_DEMO=sim — criando "${NOME_EMPRESA_DEMO}"...`);
  const { demoId: empresaId, demoAdminMembroId: adminMembroId } = await criarEmpresaDemo(adminUserId);
  const clienteAdmin = await clienteComo(ADMIN_EMAIL);

  console.log("\nMontando o funil de 9 etapas...");
  const { funilId, etapas: etapasDemo } = await montarFunilDemo(clienteAdmin, empresaId);
  const etapas = etapasDemo.map((e) => ({ ...e, funilId }));

  console.log("\nCopiando a configuração da origem (sessão do admin)...");
  await copiarConfiguracao(clienteAdmin, empresaId, adminMembroId, config);

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
  const faltando = [...ORIGENS_POOL.filter((o) => !origensPorNome.has(o)), ...MOTIVOS_PERDA.filter((m) => !motivosPerdaPorNome.has(m))];
  await falhaSe(faltando.length > 0, `Origens/motivos padrão ausentes na empresa demo: ${faltando.join(", ")}.`);

  const ctx = { empresaId, etapas, parametros, pessoas, motivosPerdaPorNome, origensPorNome };

  console.log("\nCriando os 35 negócios (sessões reais, eventos/gamificação disparados pelos gatilhos)...");
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

  console.log(`\nConcluído. Empresa "${NOME_EMPRESA_DEMO}" (empresa_id=${empresaId}) — ${ADMIN_EMAIL} acessa pelo seletor de empresa do menu.`);
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
