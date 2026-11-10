import type { SupabaseServidor } from "@/lib/supabase/server";
import type { MaterialKitVM } from "./precificacao-kit";
import { ehCategoriaMaterial } from "./precos";

/** Materiais que quem monta o kit pode escolher (acesso comercial; sem custo). Vazio se a empresa não tem tabela. */
export async function carregarMateriaisKit(supabase: SupabaseServidor, empresaId: string): Promise<MaterialKitVM[]> {
  const { data, error } = await supabase.rpc("materiais_para_kit", { p_empresa_id: empresaId });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    nome: m.nome,
    categoria: ehCategoriaMaterial(m.categoria) ? m.categoria : "outros",
    unidade: m.unidade,
    potenciaW: m.potencia_w == null ? null : Number(m.potencia_w),
    temPreco: m.tem_preco,
    dataPreco: m.data_preco,
  }));
}

/** Itens do kit, materiais para o editor (sem custo) e o preço sugerido gravado do negócio (P4b). */
export async function carregarKitDaFicha(supabase: SupabaseServidor, empresaId: string, negocioId: string) {
  const [{ data: componentes }, materiaisKit, { data: precificacao }] = await Promise.all([
    supabase
      .from("kit_componentes")
      .select("tipo, descricao, potencia_w, quantidade, material_id, preco_venda_manual")
      .eq("negocio_id", negocioId)
      .order("ordem"),
    carregarMateriaisKit(supabase, empresaId).catch((): MaterialKitVM[] => []),
    supabase.from("negocio_precificacao").select("preco_sugerido").eq("negocio_id", negocioId).maybeSingle(),
  ]);
  return {
    componentes,
    materiaisKit,
    precoSugeridoKit: precificacao?.preco_sugerido == null ? null : Number(precificacao.preco_sugerido),
  };
}
