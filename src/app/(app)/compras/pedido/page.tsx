import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormularioPedido } from "@/components/compras/formulario-pedido";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { carregarFaturamentoObra } from "@/lib/compras/dados-obra";
import { acessaCompras, carregarFornecedores, carregarObraParaPedido, carregarPedidos, carregarTelaCompras } from "@/lib/compras/dados";
import { ROTULO_COBERTURA } from "@/lib/compras/orcamentos-regras";
import { numeroPedido, pedidoEditavel } from "@/lib/compras/regras";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Novo pedido de compra (ou edição de um pedido ainda sem nota e sem recebimento). Sem `?obra=`, a pessoa escolhe entre
 * as obras em que pode fazer pedido. O banco decide de novo quem pode e o que vale.
 */
export default async function PedidoCompra({ searchParams }: PageProps<"/compras/pedido">) {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  if (!(await acessaCompras(supabase, atual.empresaId, atual.papel))) redirect("/inicio");
  const params = await searchParams;
  const obraId = typeof params.obra === "string" ? params.obra : null;
  const pedidoId = typeof params.pedido === "string" ? params.pedido : null;
  const orcamentoId = !pedidoId && typeof params.orcamento === "string" && UUID.test(params.orcamento) ? params.orcamento : null;

  if (!obraId) {
    const { obrasParaPedido } = await carregarTelaCompras(supabase, { empresaId: atual.empresaId, papel: atual.papel, membroId: atual.membroId });
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <CabecalhoPagina detalhe voltar={{ href: "/compras", rotulo: "Compras" }} sobretitulo="Compras · Novo pedido" titulo="Pedido de compra" descricao="Escolha a obra." />
        <section className="painel p-4 md:p-6">
          {obrasParaPedido.length === 0 ? (
            <p className="text-sm text-texto-2">Nenhuma obra em cotação com você. Inicie a compra de uma obra na aba &quot;A comprar&quot;.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha">
              {obrasParaPedido.map((o) => (
                <li key={o.id} className="py-2 first:pt-0 last:pb-0">
                  <Link href={`/compras/pedido?obra=${o.id}`} className="text-sm font-medium text-texto hover:underline">
                    {o.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const [obra, pedidos, fornecedores, orcamentoRes, faturamento] = await Promise.all([
    carregarObraParaPedido(supabase, { papel: atual.papel, obraId }),
    carregarPedidos(supabase, { empresaId: atual.empresaId, obraId }),
    carregarFornecedores(supabase, atual.empresaId),
    // "Gerar pedido deste": o orçamento da obra (a RLS decide quem lê; o banco confere de novo ao criar).
    orcamentoId
      ? supabase
          .from("compras_orcamentos")
          .select("id, fornecedor, entrega_prevista, valor_total, cobertura, itens_descricao, pedido_id, descartado_em, frete_modalidade, frete")
          .eq("id", orcamentoId)
          .eq("obra_id", obraId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    carregarFaturamentoObra(supabase, { obraId, empresaId: atual.empresaId }),
  ]);
  if (orcamentoRes.error) throw orcamentoRes.error;
  if (!obra) notFound();
  const editado = pedidoId ? pedidos.find((p) => p.id === pedidoId) : undefined;
  if (pedidoId && (!editado || !pedidoEditavel(editado))) redirect(`/obras/${obraId}#pedidos-compra`);
  // Orçamento descartado ou que já virou pedido ativo: volta para a lista de orçamentos.
  const orc = orcamentoRes.data;
  const pedidoDoOrcamento = orc?.pedido_id ? pedidos.find((p) => p.id === orc.pedido_id) : undefined;
  if (orcamentoId && (!orc || orc.descartado_em || (pedidoDoOrcamento && !pedidoDoOrcamento.cancelado))) redirect(`/obras/${obraId}/compras`);

  const jaPedido: Record<number, number> = {};
  for (const p of pedidos) {
    if (p.cancelado || p.id === pedidoId) continue;
    for (const i of p.itens) if (i.kitIndice != null) jaPedido[i.kitIndice] = (jaPedido[i.kitIndice] ?? 0) + i.quantidade;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: `/obras/${obra.id}#pedidos-compra`, rotulo: `Obra nº ${obra.numero}` }}
        sobretitulo={editado ? `Compras · ${numeroPedido(editado.numero)}` : "Compras · Novo pedido"}
        titulo="Pedido de compra"
        descricao={`${obra.clienteNome} · obra #${obra.numero}${obra.cidade ? ` · ${obra.cidade}` : ""}. Os itens vêm do kit vendido: ajuste quantidades e preços, tire o que não vem deste fornecedor e acrescente o que faltar.`}
      />
      <FormularioPedido
        key={pedidoId ?? orcamentoId ?? "novo"}
        obraId={obra.id}
        kit={obra.kit}
        orcamento={obra.orcamento}
        fornecedores={fornecedores}
        hoje={hojeEmSaoPaulo()}
        jaPedido={jaPedido}
        faturamento={faturamento}
        doOrcamento={
          orc
            ? {
                id: orc.id,
                fornecedor: orc.fornecedor,
                entregaPrevista: orc.entrega_prevista,
                valorTotal: Number(orc.valor_total),
                itens: orc.cobertura === "parte" ? (orc.itens_descricao ?? ROTULO_COBERTURA.parte) : ROTULO_COBERTURA.kit_completo,
                freteModalidade: orc.frete_modalidade === "fob" ? "fob" : "cif",
                frete: Number(orc.frete),
              }
            : undefined
        }
        inicial={
          editado && {
            pedidoId: editado.id,
            fornecedor: editado.fornecedor,
            categoria: editado.categoria,
            entregaPrevista: editado.entregaPrevista,
            vencimento: editado.vencimento,
            numeroFornecedor: editado.numeroFornecedor ?? "",
            frete: editado.frete,
            freteModalidade: editado.freteModalidade,
            faturarPara: editado.faturarPara,
            entrega: editado.entrega,
            observacao: editado.observacao ?? "",
            itens: editado.itens.map((i) => ({ kitIndice: i.kitIndice, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
          }
        }
      />
    </div>
  );
}
