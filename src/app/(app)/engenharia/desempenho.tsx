import { CartaoRecolhivel } from "@/components/ui";
import { PERIODOS_INDICADORES, textoMediana, textoProporcao, type IndicadoresEngenharia } from "@/lib/engenharia-prazos-regras";
import { Aba } from "./carteira";
import { hrefEngenharia, type EstadoEngenharia } from "./estado";

/** Desempenho do período: medianas em dias úteis e proporções, com o tamanho da amostra. Sem amostra, "—". */
export function Desempenho({
  indicadores,
  estado,
  rotuloEtapa,
}: {
  indicadores: IndicadoresEngenharia;
  /** Secundário (spec v1.3): vem fechado; abre quando a pessoa escolhe um período. */
  estado: EstadoEngenharia;
  rotuloEtapa: (status: string) => string;
}) {
  const { etapas, protocoloAprovacao, exigencia, naoConformidade, conexao } = indicadores;
  const maiorMediana = Math.max(1, ...etapas.map((e) => e.mediana));
  const amostra = (n: number, um: string, varios: string) => (n === 0 ? "sem registros no período" : `${n} ${n === 1 ? um : varios}`);
  const linhas: [string, string, string][] = [
    ["Do protocolo à aprovação", textoMediana(protocoloAprovacao), amostra(protocoloAprovacao.n, "protocolo aprovado", "protocolos aprovados")],
    ["Protocolos com exigência", textoProporcao(exigencia), amostra(exigencia.total, "protocolo", "protocolos")],
    ["Vistorias com não conformidade", textoProporcao(naoConformidade), amostra(naoConformidade.total, "resultado de vistoria", "resultados de vistoria")],
    ["Da vistoria aprovada à conexão", textoMediana(conexao), amostra(conexao.n, "conexão", "conexões")],
  ];
  return (
    <CartaoRecolhivel titulo="Desempenho" resumo={`Tempos e proporções dos últimos ${estado.periodo} dias`} aberto={estado.periodoNaUrl}>
      <div className="flex flex-col gap-4">
        <nav aria-label="Período" className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          Últimos
          {PERIODOS_INDICADORES.map((p) => (
            <Aba key={p} href={hrefEngenharia(estado, { periodo: p, periodoNaUrl: true })} atual={p === estado.periodo}>
              {p} dias
            </Aba>
          ))}
        </nav>
        <p className="text-xs text-zinc-500">Tempos em mediana de dias úteis, sem contar o dia do marco. Só obras que você pode ver.</p>
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-linha sm:grid-cols-2">
          {linhas.map(([rotulo, valor, detalhe]) => (
            <div key={rotulo} className="flex flex-col gap-1 bg-superficie px-4 py-3">
              <dt className="text-xs font-medium text-texto-2">{rotulo}</dt>
              <dd className="font-titulo text-2xl font-light tracking-tight text-texto tabular-nums">{valor}</dd>
              <dd className="text-xs text-zinc-500">{detalhe}</dd>
            </div>
          ))}
        </dl>
        <section aria-label="Tempo em cada etapa">
          <h3 className="mb-2 text-sm font-medium text-texto">Tempo em cada etapa</h3>
          {etapas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma obra saiu de uma etapa no período.</p>
          ) : (
            // Barras horizontais em dourado (como os gráficos do Início): o comprimento é a mediana da etapa.
            <ul className="flex flex-col gap-3 text-sm">
              {etapas.map((e) => (
                <li key={e.etapa} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-texto">{rotuloEtapa(e.etapa)}</span>
                    <span className="text-zinc-600 tabular-nums">
                      {textoMediana({ mediana: e.mediana, n: e.n })} · {e.n} {e.n === 1 ? "obra" : "obras"}
                    </span>
                  </div>
                  <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-2">
                    <div
                      className="h-full rounded-full bg-dourado transition-[width] duration-700 ease-raion"
                      style={{ width: `${Math.max(2, (e.mediana / maiorMediana) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CartaoRecolhivel>
  );
}
