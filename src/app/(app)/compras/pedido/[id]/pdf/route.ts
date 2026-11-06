import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { carregarObraParaPedido, carregarPedidos } from "@/lib/compras/dados";
import { carregarFaturamentoObra } from "@/lib/compras/dados-obra";
import { PedidoPdfDocument } from "@/lib/compras/pdf-pedido";
import { numeroPedido } from "@/lib/compras/regras";
import { formatarDataHora, hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PDF do pedido de compra, gerado na hora com os dados atuais (20261127100000_compras_pdf_documentos.sql). Só para quem
 * escreve em Compras na obra: o PDF leva os dados do cliente, que o banco só entrega a essas pessoas.
 */
export async function GET(_: Request, { params }: RouteContext<"/compras/pedido/[id]/pdf">) {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Pedido não encontrado.", { status: 404 });
  const supabase = await criarClienteServidor();

  const { data: base, error } = await supabase.from("compras_pedidos").select("obra_id, criado_por, created_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!base) return new NextResponse("Pedido não encontrado.", { status: 404 });

  const [pedidos, faturamento, obra, orcamentoRes, identidades] = await Promise.all([
    carregarPedidos(supabase, { empresaId: atual.empresaId, obraId: base.obra_id }),
    carregarFaturamentoObra(supabase, { obraId: base.obra_id, empresaId: atual.empresaId }),
    carregarObraParaPedido(supabase, { papel: atual.papel, obraId: base.obra_id }),
    supabase.from("compras_orcamentos").select("arquivo_id").eq("pedido_id", id).maybeSingle(),
    supabase.rpc("identidade_membros", { p_empresa_id: atual.empresaId }),
  ]);
  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) return new NextResponse("Pedido não encontrado.", { status: 404 });
  if (!faturamento.cliente) {
    return new NextResponse("O PDF do pedido é gerado por quem atua em Compras nesta obra.", { status: 403 });
  }
  let orcamentoArquivo: string | null = null;
  if (orcamentoRes.data?.arquivo_id) {
    const { data } = await supabase.from("compras_arquivos").select("nome").eq("id", orcamentoRes.data.arquivo_id).maybeSingle();
    orcamentoArquivo = data?.nome ?? null;
  }
  if (!obra) return new NextResponse("Pedido não encontrado.", { status: 404 });
  const autor = base.criado_por ? (identidades.data ?? []).find((m) => m.membro_id === base.criado_por)?.nome : null;

  const buffer = await renderToBuffer(
    PedidoPdfDocument({
      pedido,
      obraNumero: obra.numero,
      empresa: faturamento.empresa,
      cliente: faturamento.cliente,
      orcamentoArquivo,
      contato: autor ? `${autor} (${faturamento.empresa.nome})` : null,
      emitidoEm: hojeEmSaoPaulo(Date.parse(base.created_at)),
      geradoEm: formatarDataHora(new Date().toISOString()),
    }),
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pedido-${numeroPedido(pedido.numero)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
