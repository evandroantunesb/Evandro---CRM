"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatarMoeda } from "@/lib/formatacao";
import { mensagemErro } from "@/lib/erros";
import { preencherModeloContrato, type DadosContrato } from "@/lib/contrato";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { STATUS_CONTRATO, type ResultadoAcao } from "@/lib/tipos";

export async function salvarModeloContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const conteudo = z.string().max(20000, "Modelo muito longo").safeParse(formData.get("conteudo"));
  if (!conteudo.success) return { ok: false, mensagem: "Modelo inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("modelos_contrato")
    .upsert({ empresa_id: atual.empresaId, conteudo: conteudo.data, atualizado_por: atual.membroId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o modelo.") };

  revalidatePath("/configuracoes/contrato");
  return { ok: true, mensagem: "Modelo salvo." };
}

/** Gera (ou regera, enquanto ainda for rascunho) o contrato do negócio a partir do modelo da empresa. */
export async function gerarContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  if (atual.papel === "sdr") return { ok: false, mensagem: "SDR não pode gerar contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const id = z.string().uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return { ok: false, mensagem: "Negócio inválido." };

  const supabase = await criarClienteServidor();
  const [{ data: modelo }, { data: negocio }, { data: calculo }, { data: empresa }, { data: existente }] = await Promise.all([
    supabase.from("modelos_contrato").select("conteudo").eq("empresa_id", atual.empresaId).maybeSingle(),
    supabase
      .from("negocios")
      .select("titulo, valor, contatos(nome, documento, endereco, cidade, uf, email, telefone)")
      .eq("id", id.data)
      .maybeSingle(),
    supabase.from("calculos_solares").select("kit_nome, kit_potencia_kwp").eq("negocio_id", id.data).maybeSingle(),
    supabase.from("empresas").select("nome, cnpj").eq("id", atual.empresaId).maybeSingle(),
    supabase.from("contratos").select("id, status").eq("negocio_id", id.data).maybeSingle(),
  ]);
  if (!modelo?.conteudo.trim()) return { ok: false, mensagem: "Cadastre o modelo de contrato em Configurações antes." };
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };
  if (existente && existente.status !== "rascunho") {
    return { ok: false, mensagem: "Este contrato já saiu do rascunho — o texto não muda mais automaticamente." };
  }

  const contato = negocio.contatos as unknown as {
    nome: string;
    documento: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    email: string | null;
    telefone: string | null;
  } | null;

  const dados: DadosContrato = {
    empresa_nome: empresa?.nome ?? "",
    empresa_cnpj: empresa?.cnpj ?? "",
    cliente_nome: contato?.nome ?? "",
    cliente_documento: contato?.documento ?? "",
    cliente_endereco: contato?.endereco ?? "",
    cliente_cidade: contato?.cidade ?? "",
    cliente_uf: contato?.uf ?? "",
    cliente_email: contato?.email ?? "",
    cliente_telefone: contato?.telefone ?? "",
    negocio_titulo: negocio.titulo,
    negocio_valor: negocio.valor != null ? formatarMoeda(negocio.valor) : "",
    kit_nome: calculo?.kit_nome ?? "",
    kit_potencia_kwp: calculo?.kit_potencia_kwp != null ? `${calculo.kit_potencia_kwp.toLocaleString("pt-BR")} kWp` : "",
    data_hoje: new Date().toLocaleDateString("pt-BR"),
  };
  const conteudoPreenchido = preencherModeloContrato(modelo.conteudo, dados);

  const { error } = await supabase.from("contratos").upsert(
    {
      empresa_id: atual.empresaId,
      negocio_id: id.data,
      conteudo: conteudoPreenchido,
      criado_por: atual.membroId,
      atualizado_por: atual.membroId,
    },
    { onConflict: "negocio_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar o contrato.") };

  revalidatePath(`/negocios/${id.data}`);
  return { ok: true, mensagem: "Contrato pronto." };
}

const esquemaConfirmarPagamento = z.object({
  negocioId: z.string().uuid(),
  contratoId: z.string().uuid(),
});

/**
 * Confirma o pagamento do contrato (pedido do Evandro, 2026-10-01): só gestor/admin, e
 * nunca quem é o próprio responsável pelo negócio — tudo validado no RPC `security
 * definer` (a RLS de `contratos` sozinha não bastaria, ver migration
 * 20261001250000_gamificacao_pagamento_confirmado.sql).
 */
export async function confirmarPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquemaConfirmarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_pagamento", { p_contrato_id: dados.data.contratoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível confirmar o pagamento.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Pagamento confirmado." };
}

const esquemaEstornarPagamento = esquemaConfirmarPagamento.extend({
  motivo: z.string().trim().min(1, "Informe o motivo do estorno.").max(1000),
});

export async function estornarConfirmacaoPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquemaEstornarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("estornar_confirmacao_pagamento", {
    p_contrato_id: dados.data.contratoId,
    p_motivo: dados.data.motivo,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível estornar a confirmação.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Confirmação de pagamento estornada." };
}

export async function atualizarStatusContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  if (atual.papel === "sdr") return { ok: false, mensagem: "SDR não pode alterar o status do contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const dados = z
    .object({ negocioId: z.string().uuid(), status: z.enum(STATUS_CONTRATO) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("contratos")
    .update({ status: dados.data.status, atualizado_por: atual.membroId })
    .eq("negocio_id", dados.data.negocioId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o status.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Status atualizado." };
}
