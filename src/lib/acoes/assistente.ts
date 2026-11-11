"use server";

import { redirect } from "next/navigation";
import { lerOnboarding } from "@/lib/assistente-servidor";
import { passosDoPlano, proximoPasso, type ChavePasso } from "@/lib/assistente";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";

const destino = (passo: ChavePasso, rever: boolean) => `/primeiro-acesso?passo=${passo}${rever ? "&rever=1" : ""}`;

/**
 * Avança o assistente (Continuar ou "Pular por agora"): grava a posição e os pulados e leva ao próximo passo. Revendo
 * (concluído ou aberto por Configurações), só navega, sem regravar.
 */
export async function avancarAssistente(chave: ChavePasso, pular: boolean, rever: boolean): Promise<void> {
  const { atual } = await exigirPapel("admin");
  const passos = passosDoPlano((await obterTelasEmpresa()).solo);
  const posicao = passos.indexOf(chave) + 1;
  if (posicao < 1) redirect("/primeiro-acesso");
  const supabase = await criarClienteServidor();
  const o = await lerOnboarding(supabase, atual.empresaId);
  if (o && !o.concluido_em && !rever) {
    const pulados = pular ? [...new Set([...o.pulados, posicao])] : o.pulados.filter((p) => p !== posicao);
    await supabase
      .from("empresa_onboarding")
      .update({ passo_atual: Math.max(o.passo_atual, posicao + 1), pulados })
      .eq("empresa_id", atual.empresaId);
  }
  redirect(destino(proximoPasso(passos, chave) ?? "revisar", rever));
}

/** "Começar a usar o Raion": conclui e leva ao Início (revendo, volta a Configurações). */
export async function concluirAssistente(rever: boolean): Promise<void> {
  const { atual } = await exigirPapel("admin");
  if (!rever) {
    const supabase = await criarClienteServidor();
    await supabase.from("empresa_onboarding").update({ concluido_em: new Date().toISOString() }).eq("empresa_id", atual.empresaId).is("concluido_em", null);
  }
  redirect(rever ? "/configuracoes" : "/inicio");
}
