/**
 * Reconstrução causal das 5 métricas de Metas (Evandro, 2026-10-02, bloco seguinte ao
 * fechamento antifraude #103-#124). Ver `20261002200000_metas_realizado_causal.sql`:
 * - Receita/negócios ganhos: fechamento causal ATIVO (`deal.won` mais recente do negócio,
 *   sem `deal.reopened` depois) + deltas de `deal.value_corrected` do mesmo ciclo — modelo
 *   A, a receita pertence ao PERÍODO do `deal.won` original, nunca ao mês da correção.
 * - Conversão: só o fechamento causal ativo (`deal.won`/`deal.lost`), nunca o status/
 *   responsável ao vivo; reaberto sem novo fechamento não entra.
 * - Reuniões realizadas/tarefas concluídas: líquido da reversão simétrica da #120.
 * - Em todas, a atribuição usa o responsável CONGELADO no evento, nunca o atual.
 *
 * Cada teste usa um `empresa_membros.id` novo (via `novoMembro()`) pra "responsável" —
 * o período de meta usado é sempre "hoje", e vários testes rodam no mesmo dia, então
 * reaproveitar um membro entre testes somaria eventos de testes diferentes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { calcularRealizado, type Meta } from "@/lib/metas";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["mrc-admin", "mrc-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Metas realizado causal ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente metas causal" }).select("id").single();
  contato = c!.id;
});

let contadorMembro = 0;

/** Membro novo por teste (usuário novo + papel vendedor) — evita que testes
 * diferentes, no mesmo dia, somem eventos um do outro na métrica "hoje".
 * `empresa_membros` tem unique (empresa_id, user_id), então cada membro precisa
 * de um usuário próprio, não só uma linha nova apontando pro mesmo user_id. */
async function novoMembro() {
  contadorMembro += 1;
  const usuario = await criarUsuario(`mrc-membro-${contadorMembro}`);
  const { data, error } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor" }).select("id").single();
  if (error) throw error;
  return data!.id;
}

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function metaHoje(metrica: Meta["metrica"], membroId: string): Meta {
  const hoje = hojeStr();
  return { id: "meta-teste", titulo: "Meta de teste", metrica, empresaId: empresa, membroId, periodoInicio: hoje, periodoFim: hoje, ativa: true, valorAlvo: 1 };
}

async function criarNegocio(responsavelId: string, valor: number) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio metas ${sufixo}-${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId, valor })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function marcarStatus(negocioId: string, status: "ganho" | "perdido" | "aberto") {
  if (status === "perdido") {
    const { data: motivo } = await servico
      .from("motivos_perda")
      .upsert({ empresa_id: empresa, nome: "Motivo teste metas" }, { onConflict: "empresa_id,nome" })
      .select("id")
      .single();
    const { error } = await servico.from("negocios").update({ status, motivo_perda_id: motivo!.id }).eq("id", negocioId);
    if (error) throw error;
    return;
  }
  const { error } = await servico.from("negocios").update({ status }).eq("id", negocioId);
  if (error) throw error;
}

function criarTarefa(tipo: "ligacao" | "reuniao", responsavelId: string, venceEmIso: string) {
  return vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: `Tarefa metas ${sufixo}-${Math.random()}`, tipo, vence_em: venceEmIso, responsavel_id: responsavelId })
    .select("id")
    .single();
}

const PASSADO = new Date(Date.now() - 3600e3).toISOString();

describe("receita e negócios ganhos: fonte causal (deal.won ativo + value_corrected)", () => {
  it("negócio ganho credita o responsável congelado no deal.won, não o responsável ao vivo trocado depois", async () => {
    const membroA = await novoMembro();
    const membroB = await novoMembro();
    const negocioId = await criarNegocio(membroA, 50000);
    await marcarStatus(negocioId, "ganho");

    expect(await calcularRealizado(admin.cliente, metaHoje("receita", membroA))).toBe(50000);
    expect(await calcularRealizado(admin.cliente, metaHoje("negocios_ganhos", membroA))).toBe(1);

    // Troca de responsável ao vivo depois do ganho — não deve transferir a receita.
    await servico.from("negocios").update({ responsavel_id: membroB }).eq("id", negocioId);

    expect(await calcularRealizado(admin.cliente, metaHoje("receita", membroB))).toBe(0);
    expect(await calcularRealizado(admin.cliente, metaHoje("receita", membroA))).toBe(50000);
  });

  it("correção de valor (mesmo ciclo) soma o delta à receita, sem mudar a contagem de negócios ganhos", async () => {
    const membro = await novoMembro();
    const negocioId = await criarNegocio(membro, 50000);
    await marcarStatus(negocioId, "ganho");

    const { error } = await admin.cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: 60000, p_motivo: "Ajuste de teste" });
    expect(error).toBeNull();

    expect(await calcularRealizado(admin.cliente, metaHoje("receita", membro))).toBe(60000);
    expect(await calcularRealizado(admin.cliente, metaHoje("negocios_ganhos", membro))).toBe(1);
  });

  it("ganho→reaberto: o ciclo invalidado deixa de contar; novo ganho é um novo ciclo", async () => {
    const membro = await novoMembro();
    const negocioId = await criarNegocio(membro, 50000);
    await marcarStatus(negocioId, "ganho");
    await marcarStatus(negocioId, "aberto");
    await servico.from("negocios").update({ valor: 70000 }).eq("id", negocioId);
    await marcarStatus(negocioId, "ganho");

    // Só o ciclo novo (70000) conta; o ciclo antigo (50000) foi invalidado pela reabertura.
    expect(await calcularRealizado(admin.cliente, metaHoje("receita", membro))).toBe(70000);
    expect(await calcularRealizado(admin.cliente, metaHoje("negocios_ganhos", membro))).toBe(1);
  });
});

describe("conversão: só fechamento causal ativo", () => {
  it("ganho→reaberto→perdido conta como 1 perda (nunca como ganho+perda)", async () => {
    const membro = await novoMembro();
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");
    await marcarStatus(negocioId, "aberto");
    await marcarStatus(negocioId, "perdido");

    expect(await calcularRealizado(admin.cliente, metaHoje("conversao", membro))).toBe(0);
  });

  it("perdido→reaberto→ganho conta como 1 ganho", async () => {
    const membro = await novoMembro();
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "perdido");
    await marcarStatus(negocioId, "aberto");
    await marcarStatus(negocioId, "ganho");

    expect(await calcularRealizado(admin.cliente, metaHoje("conversao", membro))).toBe(100);
  });

  it("reaberto sem novo fechamento não entra na conversão", async () => {
    const membro = await novoMembro();
    const ganho = await criarNegocio(membro, 10000);
    await marcarStatus(ganho, "ganho");
    const reaberto = await criarNegocio(membro, 10000);
    await marcarStatus(reaberto, "ganho");
    await marcarStatus(reaberto, "aberto");

    // Só o negócio fechado (ganho) conta — o reaberto sem novo fechamento fica fora,
    // então a conversão é 100% (1/1), nunca 50% (1/2).
    expect(await calcularRealizado(admin.cliente, metaHoje("conversao", membro))).toBe(100);
  });
});

describe("reuniões realizadas e tarefas concluídas: líquido da reversão simétrica", () => {
  it("reunião concluída como 'realizada' conta; reaberta deixa de contar; concluída de novo volta a contar (líquido, nunca acumula)", async () => {
    const membro = await novoMembro();
    const { data: tarefa } = await criarTarefa("reuniao", membro, PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);
    expect(await calcularRealizado(admin.cliente, metaHoje("reunioes", membro))).toBe(1);

    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    expect(await calcularRealizado(admin.cliente, metaHoje("reunioes", membro))).toBe(0);

    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);
    expect(await calcularRealizado(admin.cliente, metaHoje("reunioes", membro))).toBe(1);
  });

  it("tarefa concluída credita o responsável congelado no task.completed, reatribuição ao vivo depois não transfere", async () => {
    const membroA = await novoMembro();
    const membroB = await novoMembro();
    const { data: tarefa } = await criarTarefa("ligacao", membroA, PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);

    expect(await calcularRealizado(admin.cliente, metaHoje("tarefas_concluidas", membroA))).toBe(1);

    await servico.from("tarefas").update({ responsavel_id: membroB }).eq("id", tarefa!.id);

    expect(await calcularRealizado(admin.cliente, metaHoje("tarefas_concluidas", membroB))).toBe(0);
    expect(await calcularRealizado(admin.cliente, metaHoje("tarefas_concluidas", membroA))).toBe(1);
  });
});

describe("receita — modelo A: período do deal.won original, mesmo com correção em outro mês", () => {
  it("ganhou em setembro, corrigiu em outubro: a receita causal de setembro já inclui o valor corrigido, outubro continua em zero", async () => {
    const membro = await novoMembro();
    const { data: dealWon, error: erroWon } = await servico
      .from("eventos")
      .insert({ empresa_id: empresa, tipo: "deal.won", entidade: "negocio", entidade_id: crypto.randomUUID(), payload: { valor: "50000", responsavel_id: membro }, created_at: "2026-09-15T12:00:00Z" })
      .select("id")
      .single();
    expect(erroWon).toBeNull();

    const { error: erroCorrecao } = await servico.from("eventos").insert({
      empresa_id: empresa,
      tipo: "deal.value_corrected",
      entidade: "negocio",
      entidade_id: crypto.randomUUID(),
      payload: { de: 50000, para: 55000, delta: 5000, evento_original_id: dealWon!.id },
      created_at: "2026-10-05T12:00:00Z",
    });
    expect(erroCorrecao).toBeNull();

    const metaSetembro: Meta = { id: "m-set", titulo: "Setembro", metrica: "receita", empresaId: empresa, membroId: membro, periodoInicio: "2026-09-01", periodoFim: "2026-09-30", ativa: true, valorAlvo: 1 };
    const metaOutubro: Meta = { ...metaSetembro, id: "m-out", titulo: "Outubro", periodoInicio: "2026-10-01", periodoFim: "2026-10-31" };

    expect(await calcularRealizado(admin.cliente, metaSetembro)).toBe(55000);
    expect(await calcularRealizado(admin.cliente, metaOutubro)).toBe(0);
  });
});

describe("permissão: a RPC replica a visibilidade da RLS de metas", () => {
  it("vendedor sem papel admin/gestor não pode consultar o realizado de outro colaborador", async () => {
    const outroMembro = await novoMembro();
    const meta = metaHoje("receita", outroMembro);
    await expect(calcularRealizado(vendedor.cliente, meta)).rejects.toThrow();
  });
});
