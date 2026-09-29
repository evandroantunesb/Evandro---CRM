import "server-only";
import { carregarLeadsParados, type LeadParado } from "@/lib/leads-parados";
import { carregarLeadsSemContato, type LeadSemContato } from "@/lib/leads-sem-contato";
import { carregarPropostasParadas, type PropostaParada } from "@/lib/propostas-paradas";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Configuracao } from "@/lib/crm";

export type { LeadParado, LeadSemContato, PropostaParada };

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
export type AtribuicaoPendente = {
  id: string;
  negocioId: string;
  negocioNumero: number;
  contatoNome: string;
  membroSugeridoId: string;
  membroSugeridoNome: string;
  expiraEm: string;
};

/** Leads que o rodízio sugeriu e ainda esperam aprovação (ou reatribuição) do gestor. */
export async function carregarAtribuicoesPendentes(empresaId: string): Promise<AtribuicaoPendente[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("atribuicoes_leads")
    .select(
      "id, expira_em, negocios!inner(id, numero, contatos(nome)), empresa_membros!atribuicoes_leads_membro_sugerido_id_fkey(id, perfis(nome))",
    )
    .eq("empresa_id", empresaId)
    .eq("status", "pendente")
    .order("expira_em");

  return (data ?? []).map((a) => {
    const negocio = a.negocios as unknown as { id: string; numero: number; contatos: { nome: string } | null };
    const membro = a.empresa_membros as unknown as { id: string; perfis: { nome: string } | null };
    return {
      id: a.id,
      negocioId: negocio.id,
      negocioNumero: negocio.numero,
      contatoNome: negocio.contatos?.nome ?? "(sem nome)",
      membroSugeridoId: membro.id,
      membroSugeridoNome: membro.perfis?.nome ?? "(sem nome)",
      expiraEm: a.expira_em,
    };
  });
}

export type TarefaAtrasada = {
  id: string;
  titulo: string;
  venceEm: string;
  negocioId: string | null;
  contatoNome: string | null;
  responsavelNome: string | null;
};

/** Tarefas em aberto com prazo vencido, da empresa toda — pra follow-up do gestor. */
export async function carregarTarefasAtrasadasLista(empresaId: string, config: Configuracao): Promise<TarefaAtrasada[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("tarefas")
    .select("id, titulo, vence_em, responsavel_id, negocios(id, contatos(nome))")
    .eq("empresa_id", empresaId)
    .is("concluida_em", null)
    .lt("vence_em", new Date().toISOString())
    .order("vence_em", { ascending: true })
    .limit(50);

  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  return (data ?? []).map((t) => {
    const negocio = t.negocios as unknown as { id: string; contatos: { nome: string } | null } | null;
    return {
      id: t.id,
      titulo: t.titulo,
      venceEm: t.vence_em,
      negocioId: negocio?.id ?? null,
      contatoNome: negocio?.contatos?.nome ?? null,
      responsavelNome: t.responsavel_id ? (nomeMembro.get(t.responsavel_id) ?? null) : null,
    };
  });
}

/** Negócios abertos sem mudança de etapa nem nota nova há dias — mesma regra de [[carregarLeadsParados]], empresa toda. */
export async function carregarLeadsParadosPainel(empresaId: string, diasLimite: number): Promise<LeadParado[]> {
  const supabase = await criarClienteServidor();
  return carregarLeadsParados(supabase, empresaId, { diasLimite });
}

/** Negócios abertos com proposta gerada sem atividade há dias — mesma regra de [[carregarPropostasParadas]], empresa toda. */
export async function carregarPropostasParadasPainel(empresaId: string, diasLimite: number): Promise<PropostaParada[]> {
  const supabase = await criarClienteServidor();
  return carregarPropostasParadas(supabase, empresaId, { diasLimite });
}

/** Leads novos sem nenhum contato registrado há horas — mesma regra de [[carregarLeadsSemContato]], empresa toda. */
export async function carregarLeadsSemContatoPainel(empresaId: string, horasLimite: number): Promise<LeadSemContato[]> {
  const supabase = await criarClienteServidor();
  return carregarLeadsSemContato(supabase, empresaId, { horasLimite });
}

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
