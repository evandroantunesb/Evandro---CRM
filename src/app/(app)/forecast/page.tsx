import Link from "next/link";
import { CabecalhoPagina, CLASSE_SEGMENTO_CABECALHO, CLASSE_VIDRO_CABECALHO, classeItemSegmentoCabecalho } from "@/components/cabecalho-pagina";
import { queryForecast, type FiltrosForecast } from "@/components/forecast/comum";
import { NumerosForecast, PorVendedor, PrevistoPorMes } from "@/components/forecast/graficos";
import { ForaDoForecast, ListaForecast, RegrasForecast } from "@/components/forecast/lista";
import { moedaCompacta } from "@/components/obras/completa";
import { carregarConfiguracao } from "@/lib/crm";
import { CATEGORIAS, mesesDoForecast, nomeDoMes, type Categoria } from "@/lib/forecast";
import { carregarForecast } from "@/lib/forecast-dados";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { NEGOCIOS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Forecast (desenho aprovado "Forecast"): negócios com chance real de fechar e o previsto para o mês atual e os dois
 * seguintes. Vendedor e SDR veem a própria carteira; admin e gestor abrem na equipe (o que a RLS mostra) e podem
 * trocar para a própria carteira.
 */
export default async function Forecast({ searchParams }: PageProps<"/forecast">) {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const params = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const hoje = hojeEmSaoPaulo();
  const meses = mesesDoForecast(hoje);
  const mesParam = um(params.mes);
  const categoriaParam = um(params.categoria);
  const veEquipe = atual.papel === "admin" || atual.papel === "gestor";
  const filtros: FiltrosForecast = {
    mes: meses.find((m) => m.slice(0, 7) === mesParam) ?? meses[0],
    categoria: CATEGORIAS.includes(categoriaParam as Categoria) ? (categoriaParam as Categoria) : undefined,
    carteira: veEquipe && um(params.carteira) === "minha" ? "minha" : undefined,
    todos: um(params.todos) === "1",
  };
  const minhaCarteira = !veEquipe || filtros.carteira === "minha";

  const config = await carregarConfiguracao(atual.empresaId);
  const supabase = await criarClienteServidor();
  const vm = await carregarForecast(supabase, {
    empresaId: atual.empresaId,
    hoje,
    etapas: config.etapas,
    diasParado: config.diasConsideradoParado,
    responsavelId: minhaCarteira ? atual.membroId : undefined,
  });

  const nomePorMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeDe = (id: string | null) => (id ? (nomePorMembro.get(id) ?? "—") : "Sem responsável");
  const mes = vm.meses.find((m) => m.mes === filtros.mes)!;
  const pctMeta = mes.meta > 0 ? Math.round((mes.ponderado / mes.meta) * 100) : null;

  // Exemplo das regras com as etapas reais do funil (as que têm chance), até quatro.
  const exemplo = config.etapas
    .filter((e) => e.ativa && e.chanceFechamento != null && !e.fechaComo)
    .slice(0, 4)
    .map((e) => `${e.nome} ${e.chanceFechamento}%`)
    .join(", ");

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Comercial · Forecast"
        titulo="Forecast"
        descricao="Negócios com chance real de fechar e quanto deve entrar em cada mês."
        acoes={
          <>
            {veEquipe && (
              <nav aria-label="Carteira" className={CLASSE_SEGMENTO_CABECALHO}>
                <Link
                  href={queryForecast({ ...filtros, carteira: "minha", todos: false }, meses[0])}
                  aria-current={minhaCarteira ? "page" : undefined}
                  className={classeItemSegmentoCabecalho(minhaCarteira)}
                >
                  Minha carteira
                </Link>
                <Link
                  href={queryForecast({ ...filtros, carteira: undefined, todos: false }, meses[0])}
                  aria-current={!minhaCarteira ? "page" : undefined}
                  className={classeItemSegmentoCabecalho(!minhaCarteira)}
                >
                  Equipe
                </Link>
              </nav>
            )}
            <Link href="/negocios" className={CLASSE_VIDRO_CABECALHO}>
              ‹ Negócios
            </Link>
          </>
        }
        valor={
          <p>
            <span className="block text-5xl leading-none font-light tracking-[-0.03em]">{moedaCompacta(mes.ponderado)}</span>
            <span className="mt-1 block font-sans text-[13px] tracking-normal text-offwhite/75">
              previstos para {nomeDoMes(mes.mes).toLowerCase()}
              {pctMeta != null && ` · ${pctMeta}% da meta`}
            </span>
          </p>
        }
      />

      <NumerosForecast mes={mes} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <PrevistoPorMes meses={vm.meses} />
        <PorVendedor
          mes={mes.mes}
          linhas={vm.porVendedor(mes.mes).map((v) => ({ nome: nomeDe(v.membroId), ponderado: v.ponderado, meta: v.meta }))}
        />
      </div>

      <ListaForecast vm={vm} filtros={filtros} mesAtual={meses[0]} nomeDe={nomeDe} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ForaDoForecast vm={vm} diasParado={config.diasConsideradoParado} />
        <RegrasForecast exemplo={exemplo ? `Ex.: ${exemplo}` : "Nenhuma etapa com chance ainda"} />
      </div>
    </div>
  );
}
