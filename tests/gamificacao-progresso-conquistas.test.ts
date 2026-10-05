/**
 * Progresso de conquistas ainda bloqueadas (Evandro, 2026-10-04) —
 * `progresso_conquistas_membro()`, self-only, chama `contar_marco_membro()`
 * só internamente (sem reabrir o grant revogado na #128) e usa exatamente a
 * mesma soma de `avaliar_conquistas_pontos()` para `xp_acumulado`.
 *
 * `point_ledger` e `conquistas_desbloqueadas` só podem ser escritos pelas próprias
 * funções do motor (insert/update/delete revogados até de `service_role` —
 * `20260926100000_gamificacao_pontos.sql` e `20260926110000_gamificacao_niveis_
 * conquistas.sql`, proteção antifraude da #128) — por isso todo XP e todo
 * desbloqueio aqui vêm do pipeline real (regra genérica via `eventos`, ou negócio
 * ganho/reaberto), nunca de insert direto nessas tabelas. Cada teste usa um membro
 * novo para que o total acumulado de XP (que é por membro, não por conquista) seja
 * sempre previsível.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  admin = await criarUsuario("pc-admin");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Progresso conquistas ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente progresso conquistas", telefone: "45999991111" }).select("id").single();
  contato = c!.id;
});

async function criarMembro(nomeBase: string) {
  const usuario = await criarUsuario(nomeBase);
  const { data, error } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor", perfil_gamificacao: "closer" })
    .select("id")
    .single();
  if (error) throw error;
  return { usuario, membroId: data!.id as string };
}

async function criarConquistaXp(nome: string, valor: number) {
  const { data, error } = await admin.cliente
    .from("conquistas")
    .insert({ empresa_id: empresa, nome, criterio: { metrica: "xp_acumulado", valor }, xp_bonus: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function criarConquistaMarco(nome: string, marco: string, valor: number, opts: { xpBonus?: number; ativaDesde?: string } = {}) {
  const { data, error } = await admin.cliente
    .from("conquistas")
    .insert({ empresa_id: empresa, nome, criterio: { metrica: "marco_contagem", marco, valor }, xp_bonus: opts.xpBonus ?? 0, ativa_desde: opts.ativaDesde ?? "1970-01-01T00:00:00Z" })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function progresso(usuario: Usuario) {
  const { data, error } = await usuario.cliente.rpc("progresso_conquistas_membro", { p_empresa_id: empresa });
  if (error) throw error;
  return data!;
}

function linhaDe(dados: { conquista_id: string; realizado: number; alvo: number }[], conquistaId: string) {
  return dados.find((l) => l.conquista_id === conquistaId);
}

async function criarRegraGenerica(nome: string, tipo: string, xp: number) {
  const { error } = await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome, evento_tipo: tipo, xp, moedas: 0 });
  if (error) throw error;
}

async function emitirEventoGenerico(tipo: string, atorUserId: string) {
  const { error } = await servico.from("eventos").insert({ empresa_id: empresa, tipo, ator_id: atorUserId, entidade: "teste", entidade_id: randomUUID() });
  if (error) throw error;
}

async function ganharNegocio(titulo: string, usuario: Usuario, membroId: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await usuario.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id as string;
}

async function reabrirNegocio(negocioId: string, usuario: Usuario) {
  const { error } = await usuario.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
  if (error) throw error;
}

describe("progresso_conquistas_membro: xp_acumulado usa exatamente o mesmo filtro de avaliar_conquistas_pontos()", () => {
  it("bônus de conquista (referencia_tipo = 'conquista') não entra no 'realizado' de xp_acumulado", async () => {
    const { usuario, membroId } = await criarMembro("pc-bonus-excl");
    const conquistaId = await criarConquistaXp("100 XP acumulado", 100);

    await criarRegraGenerica("Crédito plano (bônus excl.)", "pc.credito-bonus-excl", 60);
    await emitirEventoGenerico("pc.credito-bonus-excl", usuario.id); // +60 xp comum

    // Conquista marco que bonifica 9999 XP — se esse bônus entrasse no realizado do
    // xp_acumulado, destravaria a conquista de 100 sozinho, exatamente o que não deve acontecer.
    await criarConquistaMarco("1ª venda (bônus 9999)", "deal.won", 1, { xpBonus: 9999 });
    await ganharNegocio("Venda bônus excl.", usuario, membroId); // desbloqueia a conquista marco, credita só o bônus

    const linha = linhaDe(await progresso(usuario), conquistaId);
    expect(linha).toBeDefined();
    expect(linha!.realizado).toBe(60); // só o crédito comum, nunca o bônus de conquista
    expect(linha!.alvo).toBe(100);
  });

  it("crédito estornado também não entra no 'realizado'", async () => {
    const { usuario, membroId } = await criarMembro("pc-estorno-excl");
    // Alvo (100) deliberadamente maior que o crédito (50): o crédito nunca cruza o
    // limiar, então a conquista nunca desbloqueia de verdade e continua visível no
    // progresso depois do estorno — só assim dá pra observar realizado 50 → 0. Um
    // alvo igual ao crédito desbloquearia a conquista de verdade no próprio ganho
    // (permanência de marco: nunca é revogada depois, mesmo com o XP estornado).
    const conquistaId = await criarConquistaXp("100 XP acumulado (estorno)", 100);

    await criarRegraGenerica("Venda (estorno excl.)", "deal.won", 50);
    const negocioId = await ganharNegocio("Venda estorno excl.", usuario, membroId); // +50 xp comum

    expect(linhaDe(await progresso(usuario), conquistaId)?.realizado).toBe(50); // antes do estorno

    await reabrirNegocio(negocioId, usuario); // estorno automático (deal.won) do XP desse negócio

    const linha = linhaDe(await progresso(usuario), conquistaId);
    expect(linha).toBeDefined(); // ainda bloqueada (nunca cruzou o limiar) — continua visível
    expect(linha!.realizado).toBe(0); // único crédito do membro foi estornado
  });
});

describe("progresso_conquistas_membro: marco_contagem corresponde exatamente ao helper interno contar_marco_membro", () => {
  it("realizado de uma conquista marco_contagem reflete a contagem real de deal.won, via desbloqueio de um par-pino", async () => {
    // Mesma técnica de par-pino usada em gamificacao-conquistas-marco.test.ts: já que
    // contar_marco_membro não é chamável diretamente (revogada de authenticated na #128),
    // confirma-se o valor de 'realizado' pela borda exata entre uma conquista que desbloqueia
    // e outra, 1 marco acima, que ainda não desbloqueia.
    const { usuario, membroId } = await criarMembro("pc-marco-pino");
    const pinoBaixo = await criarConquistaMarco("2 vendas (pino)", "deal.won", 2);
    const pinoAlto = await criarConquistaMarco("3 vendas (pino)", "deal.won", 3);

    await ganharNegocio("Venda progresso 1", usuario, membroId);
    await ganharNegocio("Venda progresso 2", usuario, membroId);

    const dados = await progresso(usuario);
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
    const { usuario } = await criarMembro("pc-self-only");
    const args: Record<string, string> = { p_empresa_id: empresa, p_membro_id: "00000000-0000-0000-0000-000000000000" };
    const { error } = await usuario.cliente.rpc("progresso_conquistas_membro", args as { p_empresa_id: string });
    expect(error).not.toBeNull();
  });
});

describe("progresso_conquistas_membro: conquista já desbloqueada nunca aparece como 'próxima'", () => {
  it("depois de cruzar o limiar de verdade (desbloqueio real), a conquista deixa de aparecer na lista de progresso", async () => {
    const { usuario } = await criarMembro("pc-ja-desbloqueada");
    const conquistaId = await criarConquistaXp("20 XP (já desbloqueada)", 20);

    expect(linhaDe(await progresso(usuario), conquistaId)?.realizado).toBe(0); // ainda bloqueada: aparece no progresso, realizado 0

    await criarRegraGenerica("Crédito que cruza o limiar", "pc.credito-desbloqueio", 25);
    await emitirEventoGenerico("pc.credito-desbloqueio", usuario.id); // +25 >= alvo(20): o motor desbloqueia de verdade neste insert

    const linha = linhaDe(await progresso(usuario), conquistaId);
    expect(linha).toBeUndefined(); // desbloqueada de verdade: nunca mais aparece como "próxima"
  });
});
