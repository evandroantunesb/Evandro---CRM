"use server";

import { revalidatePath } from "next/cache";
import { lerDadosEmpresa } from "@/lib/dados-empresa";
import { mensagemErro } from "@/lib/erros";
import { problemaCoresIdentidade } from "@/lib/marca-cores";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Ações dos passos 1 e 2 do assistente de primeiro acesso. Gravam só os campos do passo (o resto da identidade da
 * proposta — rodapé, capa — fica como está), nas mesmas tabelas de Configurações.
 */

/** Passo 1: nome de exibição e WhatsApp (identidade da proposta) e CNPJ (empresa). */
export async function salvarDadosEmpresa(dados: { nome: string; cnpj: string; whatsapp: string }): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const lido = lerDadosEmpresa(dados);
  if (!lido.ok) return lido;
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_identidades")
    .upsert({ empresa_id: atual.empresaId, nome_exibicao: lido.dados.nome, whatsapp: lido.dados.whatsapp, atualizado_por: atual.membroId }, { onConflict: "empresa_id" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar os dados da empresa.") };
  const { error: erroCnpj } = await supabase.rpc("salvar_cnpj_empresa", { p_empresa_id: atual.empresaId, p_cnpj: lido.dados.cnpj ?? "" });
  if (erroCnpj) return { ok: false, mensagem: mensagemErro(erroCnpj, "Não foi possível salvar o CNPJ.") };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Dados salvos." };
}

/** Passo 2: logo de fundo escuro (caminho já enviado pelo navegador) e as duas cores, com o contraste conferido. */
export async function salvarMarcaEmpresa(dados: { logoEscuro: string | null; corPrimaria: string; corDestaque: string }): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const hex = /^#[0-9a-fA-F]{6}$/;
  if ((dados.corPrimaria && !hex.test(dados.corPrimaria)) || (dados.corDestaque && !hex.test(dados.corDestaque))) {
    return { ok: false, mensagem: "Use uma cor no formato #RRGGBB." };
  }
  const problema = problemaCoresIdentidade(dados.corPrimaria, dados.corDestaque);
  if (problema) return { ok: false, mensagem: problema };
  if (dados.logoEscuro && !dados.logoEscuro.startsWith(`${atual.empresaId}/`)) return { ok: false, mensagem: "Logo inválida. Envie de novo." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("proposta_identidades").upsert(
    {
      empresa_id: atual.empresaId,
      cor_primaria: dados.corPrimaria || null,
      cor_destaque: dados.corDestaque || null,
      ...(dados.logoEscuro !== null ? { logo_escuro_url: dados.logoEscuro || null } : {}),
      atualizado_por: atual.membroId,
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar a marca.") };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Marca salva." };
}
