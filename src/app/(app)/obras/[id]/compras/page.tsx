import { notFound } from "next/navigation";
import { CabecalhoPagina, CLASSE_VIDRO_CABECALHO } from "@/components/cabecalho-pagina";
import { ArquivosCompra } from "@/components/compras/arquivos-compra";
import { CartoesOrcamentos, FormularioOrcamento } from "@/components/compras/orcamentos";
import { comUnidade } from "@/components/obras/detalhe-obra";
import { Cartao } from "@/components/ui";
import { carregarFornecedores, carregarOrcamentosObra, carregarPedidos } from "@/lib/compras/dados";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Orçamentos e arquivos de compra da obra (desenho aprovado "Orçamentos e pedidos da obra";
 * 20261126100000_compras_orcamentos.sql). Vê quem vê os pedidos de compra da obra (Compras na obra, admin, gestor,
 * Administrativo e Operacional); escreve quem escreve em Compras na obra, depois do "Iniciar compra". O banco confere
 * de novo em cada gravação.
 */
export default async function ComprasDaObra({ params }: PageProps<"/obras/[id]/compras">) {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [obra, podeVer, pedidos, identidades, planejado, fornecedores] = await Promise.all([
    carregarDetalheObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id, membroId: atual.membroId }),
    supabase.rpc("pode_ver_pedidos_compra", { p_obra_id: id }),
    carregarPedidos(supabase, { empresaId: atual.empresaId, obraId: id }),
    supabase.rpc("identidade_membros", { p_empresa_id: atual.empresaId }),
    // A RLS devolve o planejado só a quem vê os custos da obra.
    supabase.from("obra_orcamento").select("planejado").eq("obra_id", id).eq("categoria", "equipamentos").maybeSingle(),
    carregarFornecedores(supabase, atual.empresaId),
  ]);
  for (const r of [podeVer, identidades, planejado]) if (r.error) throw r.error;
  if (!obra || podeVer.data !== true) notFound();

  const nomes = new Map((identidades.data ?? []).map((m) => [m.membro_id, m.nome]));
  const { orcamentos, arquivos } = await carregarOrcamentosObra(supabase, { obraId: id, pedidos, nomes });

  const { resumo, gestao } = obra;
  const hoje = hojeEmSaoPaulo();
  const statusCompras = obra.setores.find((s) => s.setor === "compras")?.status ?? null;
  const autorizacao = gestao?.setores.find((s) => s.setor === "compras")?.permissoes.autorizacao ?? null;
  const emAndamento = resumo.situacao === "em_andamento";
  const podeEscrever = autorizacao != null && emAndamento && statusCompras != null && statusCompras !== "a_comprar";
  const aguardaIniciar = autorizacao != null && emAndamento && statusCompras === "a_comprar";
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");
  const obraCompras = { obraId: id, empresaId: atual.empresaId };
  const ativos = orcamentos.filter((o) => !o.descartado);
  const previsto = planejado.data ? Number(planejado.data.planejado) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: `/obras/${id}#pedidos-compra`, rotulo: `Obra nº ${resumo.numero}` }}
        sobretitulo={`Obras · Obra nº ${resumo.numero} · Compras`}
        titulo={resumo.clienteNome}
        descricao={[local, comUnidade(resumo.potenciaKwp, "kWp")].filter(Boolean).join(" · ") || undefined}
        acoes={
          podeEscrever && (
            <a href="#anexar" className={CLASSE_VIDRO_CABECALHO}>
              + Anexar orçamento
            </a>
          )
        }
      />

      {aguardaIniciar && (
        <p className="rounded-xl bg-dourado/10 p-3 text-sm text-texto">Clique em &quot;Iniciar compra&quot; na ficha da obra para anexar orçamentos e arquivos.</p>
      )}

      <Cartao
        titulo={ativos.length === 0 ? "Orçamentos" : `${ativos.length} ${ativos.length === 1 ? "orçamento" : "orçamentos"} para esta obra`}
        acao={
          previsto != null && previsto > 0 ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">Previsto na venda (equipamentos): {formatarMoeda(previsto)}</span>
          ) : undefined
        }
      >
        <CartoesOrcamentos obra={obraCompras} orcamentos={orcamentos} hoje={hoje} fornecedores={fornecedores} podeEscrever={podeEscrever} />
      </Cartao>

      {podeEscrever && (
        <div id="anexar" className="scroll-mt-4">
          <Cartao titulo="Novo orçamento">
            <FormularioOrcamento obra={obraCompras} hoje={hoje} fornecedores={fornecedores} />
          </Cartao>
        </div>
      )}

      <Cartao titulo="Arquivos de compra">
        <ArquivosCompra
          obra={obraCompras}
          arquivos={arquivos}
          pedidos={pedidos.filter((p) => !p.cancelado).map((p) => ({ id: p.id, numero: p.numero, fornecedor: p.fornecedor }))}
          podeEscrever={podeEscrever}
        />
      </Cartao>

      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        &quot;Gerar pedido deste&quot; abre o novo pedido já com o fornecedor e a entrega do orçamento, e o orçamento fica ligado ao pedido. A nota fiscal
        continua no próprio pedido e vai para o Financeiro. Veem os orçamentos e arquivos: Compras, Administrativo, Operacional, gestor e admin.
      </p>
    </div>
  );
}
