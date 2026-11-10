import "server-only";
import { cache } from "react";
import { marcaDoApp, type Marca } from "@/lib/marca-cores";
import { obterSessao } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";

export type MarcaEmpresa = { marca: Marca | null; logoUrl: string | null };

const SEM_MARCA: MarcaEmpresa = { marca: null, logoUrl: null };
const EXPIRA_SEGUNDOS = 3600;

/**
 * Assina a logo com a chave de serviço. Só é chamada com o caminho que `marca_da_empresa` devolveu, isto é, depois de o
 * banco confirmar que quem pede é membro ativo da empresa: a política "marca: ler" do Storage é só do comercial
 * (blindagem de 07/10), e o papel operacao também vê a logo na barra.
 */
async function assinarComServico(caminho: string): Promise<string | null> {
  try {
    const { data } = await criarClienteAdmin().storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Marca da empresa para o app (20261204100000_marca_da_empresa.sql): cores válidas da identidade da proposta e a logo
 * de fundo escuro (a de fundo claro ficaria ilegível na barra; sem ela, a do Raion — decisão de 10/11/2026). Falha =
 * padrão Raion, sem quebrar o app.
 */
export async function lerMarcaEmpresa(
  supabase: SupabaseServidor,
  empresaId: string,
  assinarLogo: (caminho: string) => Promise<string | null> = assinarComServico,
): Promise<MarcaEmpresa> {
  const { data, error } = await supabase.rpc("marca_da_empresa", { p_empresa_id: empresaId });
  if (error) {
    console.error("Não foi possível ler a marca da empresa; seguindo com o padrão Raion.", error);
    return SEM_MARCA;
  }
  const linha = data?.[0];
  if (!linha) return SEM_MARCA;
  return { marca: marcaDoApp(linha), logoUrl: linha.logo_escuro_url ? await assinarLogo(linha.logo_escuro_url) : null };
}

/** Uma leitura por requisição, para a empresa em uso. */
export const obterMarcaEmpresa = cache(async (): Promise<MarcaEmpresa> => {
  const { atual } = await obterSessao();
  if (!atual) return SEM_MARCA;
  return lerMarcaEmpresa(await criarClienteServidor(), atual.empresaId);
});
