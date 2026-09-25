import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Etapa = { id: string; funilId: string; nome: string; ordem: number; inicial: boolean; ativa: boolean };
export type Funil = { id: string; nome: string; ativo: boolean };
export type Origem = { id: string; nome: string; cor: string | null; ativa: boolean };
export type MembroResumo = { id: string; nome: string; papel: string; ativo: boolean };

/** Configurações da empresa usadas em quase todas as telas do CRM. */
export async function carregarConfiguracao(empresaId: string) {
  const supabase = await criarClienteServidor();
  const [funis, etapas, origens, membros] = await Promise.all([
    supabase.from("funis").select("id, nome, ativo").eq("empresa_id", empresaId).order("ordem").order("created_at"),
    supabase
      .from("etapas")
      .select("id, funil_id, nome, ordem, inicial, ativa")
      .eq("empresa_id", empresaId)
      .order("ordem"),
    supabase.from("origens").select("id, nome, cor, ativa").eq("empresa_id", empresaId).order("nome"),
    supabase.from("empresa_membros").select("id, papel, ativo, perfis(nome, email)").eq("empresa_id", empresaId),
  ]);

  return {
    funis: (funis.data ?? []) as Funil[],
    etapas: (etapas.data ?? []).map((e) => ({
      id: e.id,
      funilId: e.funil_id,
      nome: e.nome,
      ordem: e.ordem,
      inicial: e.inicial,
      ativa: e.ativa,
    })) as Etapa[],
    origens: (origens.data ?? []) as Origem[],
    membros: (membros.data ?? [])
      .map((m) => {
        const p = m.perfis as unknown as { nome: string; email: string } | null;
        return { id: m.id, nome: p?.nome || p?.email || "(sem nome)", papel: m.papel, ativo: m.ativo };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) as MembroResumo[],
  };
}

export function formatarMoeda(valor: number | null | undefined) {
  if (valor == null) return "";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** "há 3 dias", usado no card do Kanban. */
export function tempoDesde(iso: string, agora = Date.now()) {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
