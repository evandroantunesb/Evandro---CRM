import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Etapa = {
  id: string;
  funilId: string;
  nome: string;
  ordem: number;
  inicial: boolean;
  ativa: boolean;
  camposObrigatorios: string[];
};
export type Funil = { id: string; nome: string; ativo: boolean };
export type Origem = { id: string; nome: string; cor: string | null; ativa: boolean };
export type ItemLista = { id: string; nome: string; ativo: boolean };
export type Etiqueta = { id: string; nome: string; cor: string | null; ativa: boolean };
export type MembroResumo = { id: string; nome: string; papel: string; ativo: boolean };
export type KitSolar = { id: string; nome: string; potenciaKwp: number; preco: number; descricao: string | null; ativo: boolean };

/** Configurações da empresa usadas em quase todas as telas do CRM. */
export async function carregarConfiguracao(empresaId: string) {
  const supabase = await criarClienteServidor();
  const [funis, etapas, origens, membros, motivos, etiquetas, kits] = await Promise.all([
    supabase.from("funis").select("id, nome, ativo").eq("empresa_id", empresaId).order("ordem").order("created_at"),
    supabase
      .from("etapas")
      .select("id, funil_id, nome, ordem, inicial, ativa, campos_obrigatorios")
      .eq("empresa_id", empresaId)
      .order("ordem"),
    supabase.from("origens").select("id, nome, cor, ativa").eq("empresa_id", empresaId).order("nome"),
    supabase.from("empresa_membros").select("id, papel, ativo, perfis(nome, email)").eq("empresa_id", empresaId),
    supabase.from("motivos_perda").select("id, nome, ativo").eq("empresa_id", empresaId).order("created_at"),
    supabase.from("etiquetas").select("id, nome, cor, ativa").eq("empresa_id", empresaId).order("nome"),
    supabase
      .from("kits_solares")
      .select("id, nome, potencia_kwp, preco, descricao, ativo")
      .eq("empresa_id", empresaId)
      .order("potencia_kwp"),
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
      camposObrigatorios: e.campos_obrigatorios,
    })) as Etapa[],
    origens: (origens.data ?? []) as Origem[],
    membros: (membros.data ?? [])
      .map((m) => {
        const p = m.perfis as unknown as { nome: string; email: string } | null;
        return { id: m.id, nome: p?.nome || p?.email || "(sem nome)", papel: m.papel, ativo: m.ativo };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) as MembroResumo[],
    motivos: (motivos.data ?? []) as ItemLista[],
    etiquetas: (etiquetas.data ?? []) as Etiqueta[],
    kits: (kits.data ?? []).map((k) => ({
      id: k.id,
      nome: k.nome,
      potenciaKwp: k.potencia_kwp,
      preco: k.preco,
      descricao: k.descricao,
      ativo: k.ativo,
    })) as KitSolar[],
  };
}

export {
  formatarMoeda,
  formatarDataHora,
  formatarPrazo,
  situacaoPrazo,
  prazoParaIso,
  tempoDesde,
} from "@/lib/formatacao";
