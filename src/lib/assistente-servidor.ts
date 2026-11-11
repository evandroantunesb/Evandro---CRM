import "server-only";
import { cache } from "react";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";

export type Onboarding = { passo_atual: number; pulados: number[]; concluido_em: string | null };

/**
 * Estado do assistente de primeiro acesso (20261205100000_assistente_primeiro_acesso.sql). Só o admin lê (RLS). Sem
 * linha (empresas de antes) ou erro: nulo — o app segue normal, sem levar ninguém ao assistente.
 */
export async function lerOnboarding(supabase: SupabaseServidor, empresaId: string): Promise<Onboarding | null> {
  const { data, error } = await supabase.from("empresa_onboarding").select("passo_atual, pulados, concluido_em").eq("empresa_id", empresaId).maybeSingle();
  if (error) {
    console.error("Não foi possível ler o assistente de primeiro acesso.", error);
    return null;
  }
  return data ?? null;
}

/** Só o admin, enquanto o assistente da empresa não foi concluído. */
export const precisaDoAssistente = (papel: string | undefined, o: Onboarding | null): boolean => papel === "admin" && !!o && !o.concluido_em;

/** Uma leitura por requisição, para a empresa em uso (só faz sentido para o admin). */
export const obterOnboarding = cache(async (): Promise<Onboarding | null> => {
  const { atual } = await obterSessao();
  if (atual?.papel === "admin") return lerOnboarding(await criarClienteServidor(), atual.empresaId);
  return null;
});
