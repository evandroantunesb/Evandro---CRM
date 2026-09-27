import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Configuracao } from "@/lib/crm";

type LinhaNegocio = {
  status: "aberto" | "ganho" | "perdido";
  valor: number | null;
  origem_id: string | null;
  etapa_id: string;
  funil_id: string;
  responsavel_id: string | null;
};

export type IndicadorOrigem = { nome: string; total: number };
export type IndicadorEtapa = { funil: string; etapa: string; ordem: number; total: number; valor: number };
export type IndicadorVendedor = { nome: string; abertos: number; ganhos: number; perdidos: number; valorGanho: number; atrasadas: number };

export async function carregarIndicadores(empresaId: string, config: Configuracao) {
  const supabase = await criarClienteServidor();
  const [{ data: negocios }, { data: tarefasAtrasadas }] = await Promise.all([
    supabase
      .from("negocios")
      .select("status, valor, origem_id, etapa_id, funil_id, responsavel_id")
      .eq("empresa_id", empresaId)
      .limit(10000),
    supabase
      .from("tarefas")
      .select("responsavel_id")
      .eq("empresa_id", empresaId)
      .is("concluida_em", null)
      .lt("vence_em", new Date().toISOString())
      .limit(10000),
  ]);

  const linhas = (negocios ?? []) as LinhaNegocio[];
  const nomeOrigem = new Map(config.origens.map((o) => [o.id, o.nome]));
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const etapaPorId = new Map(config.etapas.map((e) => [e.id, e]));
  const funilPorId = new Map(config.funis.map((f) => [f.id, f.nome]));

  const porOrigem = new Map<string, number>();
  for (const n of linhas) {
    const nome = n.origem_id ? (nomeOrigem.get(n.origem_id) ?? "Origem removida") : "Sem origem";
    porOrigem.set(nome, (porOrigem.get(nome) ?? 0) + 1);
  }

  const porEtapa = new Map<string, IndicadorEtapa>();
  for (const n of linhas) {
    if (n.status !== "aberto") continue;
    const etapa = etapaPorId.get(n.etapa_id);
    const chave = `${n.funil_id}:${n.etapa_id}`;
    const atual = porEtapa.get(chave) ?? {
      funil: funilPorId.get(n.funil_id) ?? "—",
      etapa: etapa?.nome ?? "Etapa removida",
      ordem: etapa?.ordem ?? 0,
      total: 0,
      valor: 0,
    };
    atual.total += 1;
    atual.valor += n.valor ?? 0;
    porEtapa.set(chave, atual);
  }
  const listaPorEtapa = [...porEtapa.values()].sort((a, b) =>
    a.funil === b.funil ? a.ordem - b.ordem : a.funil.localeCompare(b.funil, "pt-BR"),
  );

  const atrasadasPorMembro = new Map<string, number>();
  for (const t of tarefasAtrasadas ?? []) {
    if (!t.responsavel_id) continue;
    atrasadasPorMembro.set(t.responsavel_id, (atrasadasPorMembro.get(t.responsavel_id) ?? 0) + 1);
  }

  const porVendedor = new Map<string, IndicadorVendedor>();
  for (const n of linhas) {
    if (!n.responsavel_id) continue;
    const nome = nomeMembro.get(n.responsavel_id) ?? "Removido";
    const atual = porVendedor.get(n.responsavel_id) ?? {
      nome,
      abertos: 0,
      ganhos: 0,
      perdidos: 0,
      valorGanho: 0,
      atrasadas: atrasadasPorMembro.get(n.responsavel_id) ?? 0,
    };
    if (n.status === "aberto") atual.abertos += 1;
    else if (n.status === "ganho") {
      atual.ganhos += 1;
      atual.valorGanho += n.valor ?? 0;
    } else atual.perdidos += 1;
    porVendedor.set(n.responsavel_id, atual);
  }
  const listaPorVendedor = [...porVendedor.values()].sort((a, b) => b.valorGanho - a.valorGanho);

  const ganhos = linhas.filter((n) => n.status === "ganho");
  const perdidos = linhas.filter((n) => n.status === "perdido");

  return {
    porOrigem: [...porOrigem.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total) as IndicadorOrigem[],
    porEtapa: listaPorEtapa,
    ganhos: { total: ganhos.length, valor: ganhos.reduce((s, n) => s + (n.valor ?? 0), 0) },
    perdidos: { total: perdidos.length, valor: perdidos.reduce((s, n) => s + (n.valor ?? 0), 0) },
    porVendedor: listaPorVendedor,
    tarefasAtrasadas: (tarefasAtrasadas ?? []).length,
  };
}
