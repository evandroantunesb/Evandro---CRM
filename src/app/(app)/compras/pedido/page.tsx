import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormularioPedido } from "@/components/compras/formulario-pedido";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { acessaCompras, carregarFornecedores, carregarObraParaPedido, carregarPedidos, carregarTelaCompras } from "@/lib/compras/dados";
import { numeroPedido, pedidoEditavel } from "@/lib/compras/regras";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

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

  const [obra, pedidos, fornecedores] = await Promise.all([
    carregarObraParaPedido(supabase, { papel: atual.papel, obraId }),
    carregarPedidos(supabase, { empresaId: atual.empresaId, obraId }),
    carregarFornecedores(supabase, atual.empresaId),
  ]);
  if (!obra) notFound();
  const editado = pedidoId ? pedidos.find((p) => p.id === pedidoId) : undefined;
  if (pedidoId && (!editado || !pedidoEditavel(editado))) redirect(`/obras/${obraId}#pedidos-compra`);

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
        key={pedidoId ?? "novo"}
        obraId={obra.id}
        kit={obra.kit}
        orcamento={obra.orcamento}
        fornecedores={fornecedores}
        hoje={hojeEmSaoPaulo()}
        jaPedido={jaPedido}
        inicial={
          editado && {
            pedidoId: editado.id,
            fornecedor: editado.fornecedor,
            categoria: editado.categoria,
            entregaPrevista: editado.entregaPrevista,
            vencimento: editado.vencimento,
            numeroFornecedor: editado.numeroFornecedor ?? "",
            frete: editado.frete,
            itens: editado.itens.map((i) => ({ kitIndice: i.kitIndice, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
          }
        }
      />
    </div>
  );
}
