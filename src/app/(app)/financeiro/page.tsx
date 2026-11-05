import { CalendarClock, FileText, HandCoins, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Indicadores, type Indicador } from "@/app/(app)/negocios/indicadores";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { LancarConta } from "@/components/financeiro/formularios";
import { FOCO } from "@/components/ui";
import { LIMITE_PAGOS, atuaNoAdministrativo, carregarFinanceiro } from "@/lib/financeiro/dados";
import { ABAS_FINANCEIRO, abaEscolhida, abasVisiveis, acessoFinanceiro, filtrarPorBusca, kpisFinanceiro, type AbaFinanceiro } from "@/lib/financeiro/regras";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { FINANCEIRO, VER_NEGOCIO_DA_OBRA, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaPagamento } from "./linha-pagamento";
import { NotasPendentes, TabelaAPagar, TabelaPagos } from "./tabelas";

/**
 * Financeiro (desenho aprovado "Perfis · Administrativo › Financeiro", A2b): contas a pagar a fornecedores de todas as
 * obras, pagamentos do cliente a confirmar (a antiga /pagamentos), notas fiscais pendentes e pagos. Admin e gestor veem
 * tudo; quem é da Operação vê as quatro abas se atua no Administrativo, ou só "Pagamentos a confirmar" se confere
 * pagamento pelo Operacional. Escrever segue a ficha da obra: Administrativo da obra ou admin; o banco decide de novo.
 */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function Financeiro({ searchParams }: PageProps<"/financeiro">) {
  const { atual } = await exigirPapel(...FINANCEIRO);
  const params = await searchParams;
  const supabase = await criarClienteServidor();

  const [administrativo, confirma] =
    atual.papel === "operacao"
      ? await Promise.all([
          atuaNoAdministrativo(supabase, atual.empresaId, atual.membroId),
          supabase.rpc("confirma_pagamento_cliente", { p_empresa_id: atual.empresaId }).then((r) => r.data === true),
        ])
      : [false, false];
  const acesso = acessoFinanceiro({ papel: atual.papel, atuaNoAdministrativo: administrativo, confirmaPagamento: confirma });
  const visiveis = abasVisiveis(acesso);
  const aba = abaEscolhida(params.aba, visiveis);
  if (!aba) redirect("/inicio");

  const busca = typeof params.q === "string" ? params.q.trim() : "";
  const hoje = hojeEmSaoPaulo();
  const dados = await carregarFinanceiro(supabase, { empresaId: atual.empresaId, papel: atual.papel, membroId: atual.membroId, ...acesso });
  const abreNegocio = pode(atual.papel, VER_NEGOCIO_DA_OBRA);
  const podeLancar = dados.obrasParaLancar.length > 0;

  const k = kpisFinanceiro({
    abertas: dados.abertas,
    hoje,
    aConfirmar: dados.pagamentosAConfirmar.length,
    nfFornecedor: dados.nfFornecedor.length,
    nfCliente: dados.nfCliente.length,
  });
  const indicadores: Indicador[] = [
    { Icone: CalendarClock, legenda: "A pagar em 7 dias", valor: formatarMoeda(k.proximos.valor), rodape: plural(k.proximos.quantidade, "pagamento", "pagamentos") },
    { Icone: TriangleAlert, legenda: "Vencidos", valor: formatarMoeda(k.vencidos.valor), rodape: plural(k.vencidos.quantidade, "pagamento", "pagamentos") },
    { Icone: HandCoins, legenda: "Pagamentos do cliente a confirmar", valor: String(k.aConfirmar), rodape: "informados pelo vendedor" },
    { Icone: FileText, legenda: "Notas fiscais pendentes", valor: String(k.notas.total), rodape: `${k.notas.fornecedor} de fornecedor · ${k.notas.cliente} do cliente` },
  ];

  const contagem: Record<AbaFinanceiro, number | null> = {
    "a-pagar": dados.abertas.length,
    confirmar: dados.pagamentosAConfirmar.length,
    notas: k.notas.total,
    pagos: null,
  };
  const href = (destino: AbaFinanceiro, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...(destino !== visiveis[0] ? { aba: destino } : {}), ...(busca && destino !== "confirmar" ? { q: busca } : {}), ...extra }).toString();
    return `/financeiro${q ? `?${q}` : ""}`;
  };
  const lancar = params.lancar === "1" && podeLancar;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Operação · Administrativo"
        titulo="Financeiro"
        descricao={
          acesso.completo
            ? "Pagamentos do cliente para confirmar, fornecedores a pagar e notas fiscais das obras."
            : "Vendas com contrato assinado em que o vendedor informou o pagamento. Ao confirmar, a venda passa a contar para pontos e comissão e a obra é criada."
        }
        acoes={
          podeLancar ? (
            <Link href={`${href("a-pagar", { lancar: "1" })}#lancar`} className={CLASSE_ACAO_CABECALHO}>
              <Plus size={16} aria-hidden />
              Lançar pagamento
            </Link>
          ) : undefined
        }
      />

      {acesso.completo && <Indicadores itens={indicadores} />}

      {visiveis.length > 1 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <nav aria-label="Seção" className="flex gap-1 overflow-x-auto border-b border-linha">
            {ABAS_FINANCEIRO.filter((a) => visiveis.includes(a.valor)).map((a) => {
              const n = contagem[a.valor];
              return (
                <Link
                  key={a.valor}
                  href={href(a.valor)}
                  aria-current={aba === a.valor ? "page" : undefined}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${FOCO} ${
                    aba === a.valor ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
                  }`}
                >
                  {a.rotulo}
                  {n != null && ` (${n})`}
                </Link>
              );
            })}
          </nav>
          {aba !== "confirmar" && (
            <form role="search" action="/financeiro" className="flex gap-2">
              {aba !== visiveis[0] && <input type="hidden" name="aba" value={aba} />}
              <input
                type="search"
                name="q"
                defaultValue={busca}
                aria-label="Buscar"
                placeholder="Buscar por fornecedor, cliente ou obra"
                className={`min-h-11 w-full rounded-xl border border-linha bg-superficie px-3 text-sm text-texto md:w-80 ${FOCO}`}
              />
            </form>
          )}
        </div>
      )}

      {aba === "a-pagar" && lancar && <LancarConta obras={dados.obrasParaLancar} hoje={hoje} fornecedores={dados.fornecedores} aberto />}

      <section aria-label={ABAS_FINANCEIRO.find((a) => a.valor === aba)?.rotulo} className="painel overflow-hidden">
        {aba === "a-pagar" && <TabelaAPagar contas={filtrarPorBusca(dados.abertas, busca)} empresaId={atual.empresaId} hoje={hoje} busca={busca} />}
        {aba === "pagos" && <TabelaPagos contas={filtrarPorBusca(dados.pagas, busca)} empresaId={atual.empresaId} busca={busca} />}
        {aba === "notas" && (
          <NotasPendentes fornecedor={filtrarPorBusca(dados.nfFornecedor, busca)} cliente={filtrarPorBusca(dados.nfCliente, busca)} empresaId={atual.empresaId} busca={busca} />
        )}
        {aba === "confirmar" &&
          (dados.pagamentosAConfirmar.length === 0 ? (
            <p className="p-6 text-sm text-texto-2">Nenhum pagamento esperando confirmação. Quando um vendedor informar um pagamento, ele aparece aqui.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha p-4 md:p-6">
              {dados.pagamentosAConfirmar.map((p) => (
                <LinhaPagamento key={p.avisoId} pagamento={p} abreNegocio={abreNegocio} />
              ))}
            </ul>
          ))}
      </section>

      {aba === "a-pagar" && (
        <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
          Registrar o pagamento pede a data e o comprovante; a nota fiscal do fornecedor pode vir depois. Cada pagamento entra como custo real da obra, na
          categoria dele.
        </p>
      )}
      {aba === "pagos" && dados.pagas.length >= LIMITE_PAGOS && <p className="text-xs text-texto-2">Mostrando os {LIMITE_PAGOS} pagamentos mais recentes.</p>}
    </div>
  );
}
