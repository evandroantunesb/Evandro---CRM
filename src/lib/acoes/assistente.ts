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
    // Só avança a partir do passo onde parou ou de um anterior: um passo à frente (URL antiga ou outra aba) volta para lá.
    if (posicao > o.passo_atual) redirect("/primeiro-acesso");
    const pulados = pular ? [...new Set([...o.pulados, posicao])] : o.pulados.filter((p) => p !== posicao);
    const { error } = await supabase
      .from("empresa_onboarding")
      .update({ passo_atual: Math.max(o.passo_atual, posicao + 1), pulados })
      .eq("empresa_id", atual.empresaId);
    // Sem gravar, não avança: a tela de erro do app mostra a mensagem e o admin tenta de novo.
    if (error) throw new Error("Não foi possível salvar o progresso do assistente. Tente de novo.");
  }
  redirect(destino(proximoPasso(passos, chave) ?? "revisar", rever));
}

/** "Começar a usar o Raion": conclui e leva ao Início (revendo, volta a Configurações). */
export async function concluirAssistente(rever: boolean): Promise<void> {
  const { atual } = await exigirPapel("admin");
  if (!rever) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("empresa_onboarding").update({ concluido_em: new Date().toISOString() }).eq("empresa_id", atual.empresaId).is("concluido_em", null);
    if (error) throw new Error("Não foi possível concluir o assistente. Tente de novo.");
  }
  redirect(rever ? "/configuracoes" : "/inicio");
}
