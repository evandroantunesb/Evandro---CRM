/**
 * Progresso de conquistas ainda bloqueadas (Evandro, 2026-10-04) —
 * `progresso_conquistas_membro()`, self-only, chama `contar_marco_membro()`
 * só internamente (sem reabrir o grant revogado na #128) e usa exatamente a
 * mesma soma de `avaliar_conquistas_pontos()` para `xp_acumulado`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let closer: Usuario;
let empresa: string;
let membroCloserId: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [admin, closer] = await Promise.all(["pc-admin", "pc-closer"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Progresso conquistas ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  membroCloserId = vinculos!.find((v) => v.user_id === closer.id)!.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente progresso conquistas", telefone: "45999991111" }).select("id").single();
  contato = c!.id;
});

async function criarConquistaXp(nome: string, valor: number) {
  const { data, error } = await admin.cliente
    .from("conquistas")
    .insert({ empresa_id: empresa, nome, criterio: { metrica: "xp_acumulado", valor }, xp_bonus: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function criarConquistaMarco(nome: string, marco: string, valor: number, ativaDesde = "1970-01-01T00:00:00Z") {
  const { data, error } = await admin.cliente
    .from("conquistas")
    .insert({ empresa_id: empresa, nome, criterio: { metrica: "marco_contagem", marco, valor }, xp_bonus: 0, ativa_desde: ativaDesde })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function progresso(cliente: Usuario["cliente"] = closer.cliente) {
  const { data, error } = await cliente.rpc("progresso_conquistas_membro", { p_empresa_id: empresa });
  if (error) throw error;
  return data!;
}

function linhaDe(dados: { conquista_id: string; realizado: number; alvo: number }[], conquistaId: string) {
  return dados.find((l) => l.conquista_id === conquistaId);
}

async function ganharNegocio(titulo: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroCloserId })
    .select("id")
    .single();
  if (error) throw error;
  await closer.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", data!.id);
  return data!.id as string;
}

describe("progresso_conquistas_membro: xp_acumulado usa exatamente o mesmo filtro de avaliar_conquistas_pontos()", () => {
  it("bônus de conquista (referencia_tipo = 'conquista') não entra no 'realizado' de xp_acumulado", async () => {
    const conquistaId = await criarConquistaXp("100 XP acumulado", 100);

    await servico.from("point_ledger").insert({
      empresa_id: empresa,
      membro_id: membroCloserId,
      xp: 60,
      moedas: 0,
      referencia_tipo: "teste",
      profile_at_event: "closer",
      estornado: false,
    });
    await servico.from("point_ledger").insert({
      empresa_id: empresa,
      membro_id: membroCloserId,
      xp: 9999, // se contasse, destravaria a conquista sozinho — exatamente o que não deve acontecer
      moedas: 0,
      referencia_tipo: "conquista",
      profile_at_event: "closer",
      estornado: false,
    });

    const linha = linhaDe(await progresso(), conquistaId);
    expect(linha).toBeDefined();
    expect(linha!.realizado).toBe(60); // só o crédito 'teste', nunca o bônus de conquista
    expect(linha!.alvo).toBe(100);
  });

  it("crédito estornado também não entra no 'realizado'", async () => {
    const conquistaId = await criarConquistaXp("50 XP acumulado (estorno)", 50);
    await servico.from("point_ledger").insert({
      empresa_id: empresa,
      membro_id: membroCloserId,
      xp: 50,
      moedas: 0,
      referencia_tipo: "teste",
      profile_at_event: "closer",
      estornado: true,
      estornado_em: new Date().toISOString(),
    });

    const linha = linhaDe(await progresso(), conquistaId);
    expect(linha!.realizado).toBe(0);
  });
});

describe("progresso_conquistas_membro: marco_contagem corresponde exatamente ao helper interno contar_marco_membro", () => {
  it("realizado de uma conquista marco_contagem reflete a contagem real de deal.won, via desbloqueio de um par-pino", async () => {
    // Mesma técnica de par-pino usada em gamificacao-conquistas-marco.test.ts: já que
    // contar_marco_membro não é chamável diretamente (revogada de authenticated na #128),
    // confirma-se o valor de 'realizado' pela borda exata entre uma conquista que desbloqueia
    // e outra, 1 marco acima, que ainda não desbloqueia.
    const pinoBaixo = await criarConquistaMarco("2 vendas (pino)", "deal.won", 2);
    const pinoAlto = await criarConquistaMarco("3 vendas (pino)", "deal.won", 3);

    await ganharNegocio("Venda progresso 1");
    await ganharNegocio("Venda progresso 2");

    const dados = await progresso();
    const linhaBaixo = linhaDe(dados, pinoBaixo);
    const linhaAlto = linhaDe(dados, pinoAlto);

    // pinoBaixo (valor=2) já foi desbloqueado por ter 2 vendas — não aparece mais como
    // "ainda bloqueada" na lista de progresso.
    expect(linhaBaixo).toBeUndefined();
    // pinoAlto (valor=3) ainda está bloqueado, com realizado=2 — exatamente a contagem real.
    expect(linhaAlto).toBeDefined();
    expect(linhaAlto!.realizado).toBe(2);
    expect(linhaAlto!.alvo).toBe(3);
  });
});

describe("progresso_conquistas_membro: self-only", () => {
  it("quem não é membro da empresa recebe lista vazia, nunca erro", async () => {
    const semEmpresa = await criarUsuario("pc-sem-empresa");
    const { data, error } = await semEmpresa.cliente.rpc("progresso_conquistas_membro", { p_empresa_id: empresa });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a função não aceita p_membro_id — não há forma de consultar o progresso de outro membro", async () => {
    // A assinatura da RPC só tem p_empresa_id — tentar passar p_membro_id é rejeitado pelo
    // PostgREST antes mesmo de chegar na função (parâmetro desconhecido não declarado nela).
    const args: Record<string, string> = { p_empresa_id: empresa, p_membro_id: "00000000-0000-0000-0000-000000000000" };
    const { error } = await closer.cliente.rpc("progresso_conquistas_membro", args as { p_empresa_id: string });
    expect(error).not.toBeNull();
  });
});

describe("progresso_conquistas_membro: conquista já desbloqueada nunca aparece como 'próxima'", () => {
  it("depois de desbloquear, a conquista deixa de aparecer na lista de progresso mesmo com mais XP depois", async () => {
    const conquistaId = await criarConquistaXp("20 XP (já desbloqueada)", 20);
    await servico.from("point_ledger").insert({
      empresa_id: empresa,
      membro_id: membroCloserId,
      xp: 20,
      moedas: 0,
      referencia_tipo: "teste",
      profile_at_event: "closer",
      estornado: false,
    });

    expect(linhaDe(await progresso(), conquistaId)).toBeDefined(); // ainda bloqueada: aparece no progresso

    // Simula o desbloqueio real (o motor de avaliação já cobre isso em outro teste;
    // aqui só se verifica que progresso_conquistas_membro respeita conquistas_desbloqueadas).
    await servico.from("conquistas_desbloqueadas").insert({ empresa_id: empresa, conquista_id: conquistaId, membro_id: membroCloserId });

    const linha = linhaDe(await progresso(), conquistaId);
    expect(linha).toBeUndefined(); // desbloqueada: nunca mais aparece como "próxima"
  });
});
