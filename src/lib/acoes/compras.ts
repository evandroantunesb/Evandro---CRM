"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { revalidarCompras } from "./compras-comum";
import { CATEGORIAS_CUSTO_OBRA } from "@/lib/obras/custos";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Compras, P1 (20261125100000_compras_pedidos.sql). Cada ação só valida a forma e chama a RPC: quem pode (quem atua em
 * Compras na obra, coordenador, gestor ou admin), obra cancelada ou pausada, nota fiscal da pasta certa, status
 * automático e auditoria ficam no banco. Arquivo nunca passa por Server Action: o navegador envia ao Storage e a ação
 * recebe só o caminho.
 */

const uuid = z.string().uuid();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const dinheiro = z.number({ message: "Valor inválido." }).finite().min(0, "Valor inválido.");

const revalidar = revalidarCompras;

async function chamar<T = unknown>(
  obraId: string,
  rpc: () => PromiseLike<{ data?: T; error: unknown }>,
  padrao: string,
  sucesso: string,
): Promise<ResultadoAcao & { id?: string }> {
  const { data: retorno, error } = await rpc();
  if (error) return { ok: false, mensagem: mensagemErro(error as never, padrao) };
  revalidar(obraId);
  return { ok: true, mensagem: sucesso, ...(typeof retorno === "string" ? { id: retorno } : {}) };
}

export async function iniciarCompra(obraId: string): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  if (!uuid.safeParse(obraId).success) return { ok: false, mensagem: "Obra inválida." };
  const supabase = await criarClienteServidor();
  return chamar(obraId, () => supabase.rpc("iniciar_compra_obra", { p_obra_id: obraId }), "Não foi possível iniciar a compra.", "Compra iniciada.");
}

const esquemaItem = z.object({
  kitIndice: z.number().int().min(0).nullable(),
  descricao: z.string().trim().min(1, "Informe a descrição de cada item.").max(200, "Descrição do item muito longa."),
  unidade: z.string().trim().min(1).max(20, "Unidade muito longa."),
  quantidade: z.number({ message: "Quantidade inválida." }).finite().positive("Informe uma quantidade maior que zero em cada item."),
  valorUnitario: dinheiro,
});

const esquemaPedido = z.object({
  obraId: uuid,
  pedidoId: uuid.nullable(),
  /** "Gerar pedido deste": o pedido novo nasce ligado ao orçamento. */
  orcamentoId: uuid.nullable().optional(),
  fornecedor: z.string().trim().min(2, "Informe o fornecedor.").max(120, "Nome do fornecedor muito longo."),
  categoria: z.enum(CATEGORIAS_CUSTO_OBRA, "Escolha a categoria."),
  entregaPrevista: data,
  vencimento: data,
  numeroFornecedor: z.string().trim().max(60, "Número do pedido no fornecedor muito longo."),
  frete: dinheiro,
  freteModalidade: z.enum(["cif", "fob"], "Escolha o frete: CIF ou FOB."),
  faturarPara: z.enum(["cliente", "empresa"], "Escolha em nome de quem faturar."),
  /** Nulo = entrega no endereço do faturamento. */
  entrega: z
    .object({
      endereco: z.string().trim().min(5, "Informe o endereço de entrega.").max(300, "Endereço de entrega muito longo."),
      recebe: z.string().trim().min(2, "Informe quem recebe a entrega.").max(120, "Nome de quem recebe muito longo."),
      telefone: z.string().trim().max(30, "Telefone muito longo."),
    })
    .nullable(),
  observacao: z.string().trim().max(500, "As observações têm no máximo 500 caracteres."),
  itens: z.array(esquemaItem).min(1, "Inclua ao menos um item no pedido.").max(100, "Um pedido tem no máximo 100 itens."),
});

/** Cria (sem `pedidoId`) ou edita o pedido. */
export async function salvarPedidoCompra(dados: z.input<typeof esquemaPedido>): Promise<ResultadoAcao & { id?: string }> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaPedido.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const comum = {
    p_fornecedor: d.data.fornecedor,
    p_categoria: d.data.categoria,
    p_entrega_prevista: d.data.entregaPrevista,
    p_vencimento: d.data.vencimento,
    p_numero_fornecedor: d.data.numeroFornecedor,
    p_frete: d.data.freteModalidade === "cif" ? 0 : d.data.frete,
    p_frete_modalidade: d.data.freteModalidade,
    p_faturar_para: d.data.faturarPara,
    ...(d.data.observacao ? { p_observacao: d.data.observacao } : {}),
    ...(d.data.entrega
      ? {
          p_entrega_endereco: d.data.entrega.endereco,
          p_entrega_recebe: d.data.entrega.recebe,
          ...(d.data.entrega.telefone ? { p_entrega_telefone: d.data.entrega.telefone } : {}),
        }
      : {}),
    p_itens: d.data.itens.map((i) => ({
      kit_indice: i.kitIndice,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade,
      valor_unitario: i.valorUnitario,
    })),
  };
  const pedidoId = d.data.pedidoId;
  if (pedidoId) {
    const r = await chamar(
      d.data.obraId,
      () => supabase.rpc("editar_pedido_compra", { p_pedido_id: pedidoId, ...comum }),
      "Não foi possível salvar o pedido.",
      "Pedido salvo.",
    );
    return r.ok ? { ...r, id: pedidoId } : r;
  }
  return chamar(
    d.data.obraId,
    () => supabase.rpc("criar_pedido_compra", { p_obra_id: d.data.obraId, ...comum, ...(d.data.orcamentoId ? { p_orcamento_id: d.data.orcamentoId } : {}) }),
    "Não foi possível fazer o pedido.",
    "Pedido feito.",
  );
}

const esquemaCancelar = z.object({
  obraId: uuid,
  pedidoId: uuid,
  motivo: z.string().trim().min(3, "Explique o motivo (pelo menos 3 caracteres).").max(300, "Motivo muito longo."),
});

export async function cancelarPedidoCompra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaCancelar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () => supabase.rpc("cancelar_pedido_compra", { p_pedido_id: d.data.pedidoId, p_motivo: d.data.motivo }),
    "Não foi possível cancelar o pedido.",
    "Pedido cancelado.",
  );
}

const esquemaNf = z.object({
  obraId: uuid,
  pedidoId: uuid,
  numero: z.string().trim().min(1, "Informe o número da nota.").max(60, "Número da nota muito longo."),
  valor: z.number({ message: "Valor inválido." }).finite().positive("Informe o valor da nota."),
  arquivo: z.object({ caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) }),
});

/** Depois que o navegador enviou a nota ao Storage. */
export async function registrarNfPedido(dados: z.input<typeof esquemaNf>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaNf.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("registrar_nf_pedido_compra", {
        p_pedido_id: d.data.pedidoId,
        p_nf_numero: d.data.numero,
        p_nf_valor: d.data.valor,
        p_caminho: d.data.arquivo.caminho,
        p_nome: d.data.arquivo.nome,
      }),
    "Não foi possível registrar a nota fiscal.",
    "Nota fiscal registrada. A conta a pagar foi lançada no Financeiro.",
  );
}

const esquemaRecebimento = z.object({
  obraId: uuid,
  pedidoId: uuid,
  itens: z.array(z.object({ itemId: uuid, quantidade: z.number().finite().min(0, "Quantidade inválida.") })).min(1),
});

export async function registrarRecebimentoPedido(dados: z.input<typeof esquemaRecebimento>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaRecebimento.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  return chamar(
    d.data.obraId,
    () =>
      supabase.rpc("registrar_recebimento_pedido_compra", {
        p_pedido_id: d.data.pedidoId,
        p_itens: d.data.itens.map((i) => ({ item_id: i.itemId, quantidade: i.quantidade })),
      }),
    "Não foi possível registrar o recebimento.",
    "Recebimento registrado.",
  );
}

const esquemaAtendimento = z.object({ setor: z.enum(["administrativo", "operacional", "nenhum"]) });

/** Configurações: quem atende Compras quando a empresa não tem ninguém no setor (só o admin; o banco confere). */
export async function definirAtendimentoCompras(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = esquemaAtendimento.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Escolha uma opção." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_atendimento_compras", {
    p_empresa_id: atual.empresaId,
    p_setor: d.data.setor === "nenhum" ? undefined : d.data.setor,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  revalidatePath("/configuracoes", "layout");
  revalidatePath("/compras");
  return { ok: true, mensagem: "Salvo." };
}
