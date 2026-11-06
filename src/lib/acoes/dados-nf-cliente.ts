"use server";

import { z } from "zod";
import { carregarDadosNfCliente, type NfClienteObraVM } from "@/lib/financeiro/dados-nf-cliente";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Dados e documentos para a NF do cliente de uma obra, sob demanda (aba Notas fiscais da tela Financeiro, ao abrir a
 * linha). Só leitura: o banco devolve nulo a quem não atua no Administrativo da obra.
 */
export async function buscarDadosNfCliente(obraId: string): Promise<NfClienteObraVM | null> {
  await exigirPapel(...GERIR_OBRAS);
  if (!z.string().uuid().safeParse(obraId).success) return null;
  const supabase = await criarClienteServidor();
  return carregarDadosNfCliente(supabase, obraId);
}
