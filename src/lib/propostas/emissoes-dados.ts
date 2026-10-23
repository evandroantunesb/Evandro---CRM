import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Acesso à tabela `propostas_emissoes` (migration 20261022100000): linhas imutáveis, só SELECT e INSERT. */
export type EmissaoRow = Database["public"]["Tables"]["propostas_emissoes"]["Row"];
type EmissaoNova = Omit<Database["public"]["Tables"]["propostas_emissoes"]["Insert"], "tipo" | "token">;

type Cliente = SupabaseClient<Database>;

export async function buscarEmissaoPorToken(cliente: Cliente, token: string) {
  const { data, error } = await cliente.from("propostas_emissoes").select("*").eq("token", token).maybeSingle();
  return { emissao: data, erro: error };
}

export async function listarEmissoesDoNegocio(cliente: Cliente, negocioId: string) {
  const { data, error } = await cliente
    .from("propostas_emissoes")
    .select("id, versao, token, validade_ate, emitida_em, dados_sha256, pdf_sha256")
    .eq("negocio_id", negocioId)
    .order("versao", { ascending: false });
  return { emissoes: data ?? [], erro: error };
}

export async function ultimaVersaoDoNegocio(cliente: Cliente, negocioId: string) {
  const { data, error } = await cliente
    .from("propostas_emissoes")
    .select("versao")
    .eq("negocio_id", negocioId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { versao: data?.versao ?? 0, erro: error };
}

export async function inserirEmissao(cliente: Cliente, linha: EmissaoNova) {
  const { error } = await cliente.from("propostas_emissoes").insert(linha);
  return { erro: error };
}
