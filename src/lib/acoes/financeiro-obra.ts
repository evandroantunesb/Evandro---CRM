"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { MENSAGEM_NUMERO_BR, lerNumeroBr } from "@/lib/formatacao";
import { CATEGORIAS_CUSTO_OBRA } from "@/lib/obras/custos";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Contas a pagar da obra e nota fiscal do cliente (20261121100000_contas_pagar_obra.sql). Cada ação só valida a forma e
 * chama a RPC: quem pode (Administrativo da obra ou admin), obra cancelada, anexo da pasta certa e auditoria ficam no
 * banco. Arquivo nunca passa por Server Action: o navegador envia ao Storage e a ação recebe só o caminho.
 * `exigirPapel(...GERIR_OBRAS)` só corta cedo quem nunca escreve.
 */

const uuid = z.string().uuid();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const caminho = z.string().min(1).max(400);
const nome = z.string().trim().min(1).max(200);
const motivo = z.string().trim().min(3, "Explique o motivo (pelo menos 3 caracteres).").max(300, "Motivo muito longo.");

function revalidar(obraId: string) {
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/apresentacao/${obraId}`);
  revalidatePath("/obras");
  revalidatePath("/financeiro");
}

async function chamar(obraId: string, rpc: () => PromiseLike<{ error: unknown }>, padrao: string, sucesso: string): Promise<ResultadoAcao> {
  const { error } = await rpc();
  if (error) return { ok: false, mensagem: mensagemErro(error as never, padrao) };
  revalidar(obraId);
  return { ok: true, mensagem: sucesso };
}

const esquemaConta = z.object({
  obraId: uuid,
  fornecedor: z.string().trim().min(2, "Informe o fornecedor.").max(120, "Nome do fornecedor muito longo."),
  categoria: z.enum(CATEGORIAS_CUSTO_OBRA, "Escolha a categoria."),
  descricao: z.string().trim().max(300, "Descrição muito longa."),
  valor: z
    .string()
    .trim()
    .transform((v) => lerNumeroBr(v))
    .pipe(z.number({ message: `Valor inválido. ${MENSAGEM_NUMERO_BR}` }).positive("Informe um valor maior que zero.")),
  vencimento: data,
});

export async function lancarContaPagar(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaConta.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("lancar_conta_pagar_obra", {
        p_obra_id: d.data.obraId,
        p_fornecedor: d.data.fornecedor,
        p_categoria: d.data.categoria,
        p_descricao: d.data.descricao,
        p_valor: d.data.valor,
        p_vencimento: d.data.vencimento,
      }),
    "Não foi possível lançar o pagamento.",
    "Pagamento lançado.",
  );
}

const esquemaPagamento = z.object({
  obraId: uuid,
  contaId: uuid,
  pagoEm: data,
  comprovante: z.object({ caminho, nome }),
  nf: z.object({ caminho, nome }).nullable(),
});

/** Depois que o navegador enviou o comprovante (e, se houver, a nota) ao Storage. */
export async function registrarPagamentoConta(dados: z.input<typeof esquemaPagamento>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaPagamento.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("registrar_pagamento_conta_pagar", {
        p_conta_id: d.data.contaId,
        p_pago_em: d.data.pagoEm,
        p_comprovante_caminho: d.data.comprovante.caminho,
        p_comprovante_nome: d.data.comprovante.nome,
        p_nf_caminho: d.data.nf?.caminho,
        p_nf_nome: d.data.nf?.nome,
      }),
    "Não foi possível registrar o pagamento.",
    "Pagamento registrado.",
  );
}

const esquemaAnexo = z.object({ obraId: uuid, contaId: uuid, caminho, nome });

export async function anexarNfConta(dados: z.input<typeof esquemaAnexo>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaAnexo.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados inválidos." };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("anexar_nf_conta_pagar", { p_conta_id: d.data.contaId, p_caminho: d.data.caminho, p_nome: d.data.nome }),
    "Não foi possível anexar a nota fiscal.",
    "Nota fiscal anexada.",
  );
}

const esquemaEncerrar = z.object({ obraId: uuid, contaId: uuid, motivo });

export async function cancelarContaPagar(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaEncerrar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("cancelar_conta_pagar", { p_conta_id: d.data.contaId, p_motivo: d.data.motivo }),
    "Não foi possível cancelar.",
    "Pagamento cancelado.",
  );
}

export async function estornarPagamentoConta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaEncerrar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("estornar_pagamento_conta_pagar", { p_conta_id: d.data.contaId, p_motivo: d.data.motivo }),
    "Não foi possível estornar.",
    "Pagamento estornado. O custo saiu da obra.",
  );
}

const esquemaNfCliente = z.object({ obraId: uuid, caminho, nome });

export async function anexarNfCliente(dados: z.input<typeof esquemaNfCliente>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaNfCliente.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados inválidos." };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("anexar_nf_cliente_obra", { p_obra_id: d.data.obraId, p_caminho: d.data.caminho, p_nome: d.data.nome }),
    "Não foi possível anexar a nota fiscal do cliente.",
    "Nota fiscal do cliente anexada.",
  );
}
