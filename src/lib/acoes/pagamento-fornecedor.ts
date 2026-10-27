"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const uuid = z.string().uuid();

export async function autorizarPagamentoFornecedor(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = z.object({
    obraId: uuid, pedidoId: uuid,
    valor: z.string().trim().min(1),
    justificativa: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const valor = Number(dados.data.valor);
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, mensagem: "Informe um valor positivo." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("autorizar_pagamento_fornecedor", {
    p_pedido_id: dados.data.pedidoId,
    p_valor: valor,
    p_justificativa: dados.data.justificativa || undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível autorizar o pagamento.") };
  revalidatePath(`/obras/${dados.data.obraId}`);
  return { ok: true, mensagem: "Pagamento ao fornecedor autorizado." };
}

const arquivo = z.object({
  obraId: uuid,
  pagamentoId: uuid,
  tipo: z.enum(["comprovante", "nota_fiscal"]),
  caminho: z.string().min(1).max(250),
  nome: z.string().trim().min(1).max(200),
  valor: z.string().trim().optional(),
});

export async function registrarArquivoPagamentoFornecedor(entrada: unknown): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const dados = arquivo.safeParse(entrada);
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const valor = d.tipo === "comprovante" ? Number(d.valor) : undefined;
  if (d.tipo === "comprovante" && (!Number.isFinite(valor) || !valor || valor <= 0)) {
    return { ok: false, mensagem: "Informe o valor pago." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_arquivo_pagamento_fornecedor", {
    p_pagamento_id: d.pagamentoId, p_tipo: d.tipo, p_caminho: d.caminho,
    p_nome: d.nome, p_valor_pago: valor,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o documento financeiro.") };
  revalidatePath(`/obras/${d.obraId}`);
  revalidatePath("/obras");
  return { ok: true, mensagem: d.tipo === "comprovante" ? "Comprovante registrado." : "Nota fiscal do fornecedor anexada." };
}
