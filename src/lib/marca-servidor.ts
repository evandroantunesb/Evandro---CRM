import "server-only";
import { cache } from "react";
import { marcaDoApp, type Marca } from "@/lib/marca-cores";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";

export type MarcaEmpresa = { marca: Marca | null; logoUrl: string | null };

const SEM_MARCA: MarcaEmpresa = { marca: null, logoUrl: null };
const EXPIRA_SEGUNDOS = 3600;

/**
 * Marca da empresa para o app (20261204100000_marca_da_empresa.sql): cores válidas da identidade da proposta e a URL
 * assinada da logo (de preferência a versão para fundo escuro; a política "marca: ler" deixa qualquer membro ativo
 * ler). Falha = padrão Raion, sem quebrar o app.
 */
export async function lerMarcaEmpresa(supabase: SupabaseServidor, empresaId: string): Promise<MarcaEmpresa> {
  const { data, error } = await supabase.rpc("marca_da_empresa", { p_empresa_id: empresaId });
  if (error) {
    console.error("Não foi possível ler a marca da empresa; seguindo com o padrão Raion.", error);
    return SEM_MARCA;
  }
  const linha = data?.[0];
  if (!linha) return SEM_MARCA;
  const caminho = linha.logo_escuro_url || linha.logo_url;
  const logo = caminho ? await supabase.storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS) : null;
  return { marca: marcaDoApp(linha), logoUrl: logo?.data?.signedUrl ?? null };
}

/** Uma leitura por requisição, para a empresa em uso. */
export const obterMarcaEmpresa = cache(async (): Promise<MarcaEmpresa> => {
  const { atual } = await obterSessao();
  if (!atual) return SEM_MARCA;
  return lerMarcaEmpresa(await criarClienteServidor(), atual.empresaId);
});
