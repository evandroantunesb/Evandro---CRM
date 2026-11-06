import "server-only";
import { carregarDocumentosClienteObra, type DocumentosClienteObraVM } from "@/lib/compras/dados-obra";
import { enderecoCompleto } from "@/lib/compras/faturamento";
import type { SupabaseServidor } from "@/lib/supabase/server";

/**
 * Dados e documentos para a NF do cliente (20261128100000_documentos_cliente_engenharia_administrativo.sql): nome,
 * CPF/CNPJ, inscrição estadual, e-mail e endereço (sem telefone, decisão da A1) e os documentos do cliente, só para
 * leitura. O banco só devolve para quem atua no Administrativo da obra (coordenador, gestor e admin inclusive).
 */

export type DadosNfClienteVM = {
  nome: string;
  pj: boolean;
  documento: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  endereco: string | null;
};

export type NfClienteObraVM = { cliente: DadosNfClienteVM; documentos: DocumentosClienteObraVM };

const limpo = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Nulo para quem não atua no Administrativo da obra. */
export async function carregarDadosNfCliente(supabase: SupabaseServidor, obraId: string): Promise<NfClienteObraVM | null> {
  const { data, error } = await supabase.rpc("dados_nf_cliente_obra", { p_obra_id: obraId });
  if (error) throw error;
  const l = data?.[0];
  if (!l) return null;
  const pj = l.tipo === "pj";
  const documentos = await carregarDocumentosClienteObra(supabase, { obraId, pj });
  return {
    cliente: {
      nome: limpo(l.nome) ?? "Cliente",
      pj,
      documento: limpo(l.documento),
      inscricaoEstadual: limpo(l.inscricao_estadual),
      email: limpo(l.email),
      endereco: enderecoCompleto(l),
    },
    documentos,
  };
}
