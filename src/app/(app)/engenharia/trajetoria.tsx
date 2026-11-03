import Link from "next/link";
import { mesPorExtenso, resumirTrajetoria, type MesTrajetoria, type MetricaTrajetoria, type PessoaTrajetoria, type Trimestre } from "@/lib/engenharia-trajetoria";
import { hrefEngenharia, type EstadoEngenharia } from "./estado";

const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const decimal = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/**
 * Painel escuro da trajetória (o gráfico principal da tela, padrão "um cartão escuro por tela"). Pessoal: o que a
 * pessoa já concluiu na Engenharia, com acumulado, ritmo por trimestre e o próximo marco. Equipe: o que o setor já
 * entregou e quanto cada pessoa participou.
 */
export function Trajetoria({
  meses,
  pessoas,
  empresaNome,
  estado,
  mesAtual,
}: {
  meses: MesTrajetoria[];
  /** Presente só na visão Equipe. */
  pessoas?: PessoaTrajetoria[];
  empresaNome: string;
  estado: EstadoEngenharia;
  mesAtual: string;
}) {
  const equipe = pessoas != null;
  const r = resumirTrajetoria(meses, estado.metrica, mesAtual);
  const desde = r.desde ? (equipe ? "desde a primeira obra no sistema" : `desde a sua primeira obra, em ${mesPorExtenso(r.desde)}`) : null;

  return (
    <section id="trajetoria" aria-label={equipe ? "Trajetória da equipe" : "Sua trajetória"} className="flex scroll-mt-4 flex-col gap-6 rounded-2xl bg-carvao px-5 py-6 text-offwhite md:px-8 md:py-7">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-dourado uppercase">
          {equipe ? "Trajetória da equipe" : "Sua trajetória"}
          {desde && ` · ${desde}`}
        </p>
        <h2 className="mt-1.5 font-titulo text-2xl font-light tracking-tight">
          {equipe ? `O que a Engenharia já entregou na ${empresaNome}` : `O que você já construiu na ${empresaNome}`}
        </h2>
      </div>

      {r.totalObras === 0 ? (
        <p className="text-sm text-offwhite/70">
          {equipe
            ? "Nenhuma obra com a Engenharia concluída ainda. Os números aparecem aqui a partir da primeira conclusão."
            : "Sua trajetória começa na primeira obra concluída em que você atuou na Engenharia."}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-offwhite/12 sm:grid-cols-3">
            <Numero rotulo="Obras com a Engenharia concluída" valor={inteiro(r.totalObras)} rodape={`▲ ${inteiro(r.obrasNoMes)} neste mês`} />
            <Numero rotulo="Potência" valor={inteiro(r.totalKwp)} unidade="kWp" rodape={`▲ ${inteiro(r.kwpNoMes)} kWp neste mês`} />
            <Numero rotulo="Potência média por obra" valor={decimal(r.mediaKwp ?? 0)} unidade="kWp" rodape={`em ${inteiro(r.totalObras)} ${r.totalObras === 1 ? "obra" : "obras"}`} mudo />
          </dl>

          {equipe ? (
            pessoas.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3" aria-label="Por pessoa">
                {pessoas.map((p) => (
                  <li key={p.membroId} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3.5">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-dourado text-[13px] font-semibold text-carvao">
                      {iniciais(p.nome)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      <p className="text-xs text-offwhite/65 tabular-nums">
                        {inteiro(p.obras)} {p.obras === 1 ? "obra" : "obras"} · {inteiro(p.kwp)} kWp
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Graficos trimestres={r.trimestres} mediaAnteriores={r.mediaAnteriores} metrica={estado.metrica} estado={estado} marco={r.marco} />
          )}
        </>
      )}
    </section>
  );
}

function Numero({ rotulo, valor, unidade, rodape, mudo }: { rotulo: string; valor: string; unidade?: string; rodape: string; mudo?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-[#1a1a1c] p-5">
      <dt className="text-xs font-medium text-offwhite/65">{rotulo}</dt>
      <dd className="font-titulo text-4xl leading-none font-light tracking-tight tabular-nums">
        {valor}
        {unidade && <small className="ml-1.5 font-sans text-sm font-medium tracking-normal text-offwhite/70">{unidade}</small>}
      </dd>
      <dd className={`text-xs ${mudo ? "text-offwhite/55" : "font-semibold text-dourado"}`}>{rodape}</dd>
    </div>
  );
}

function Graficos({
  trimestres,
  mediaAnteriores,
  metrica,
  estado,
  marco,
}: {
  trimestres: Trimestre[];
  mediaAnteriores: number | null;
  metrica: MetricaTrajetoria;
  estado: EstadoEngenharia;
  marco: { proximo: number; falta: number; progresso: number };
}) {
  const unidade = metrica === "obras" ? "obras" : "kWp";
  const atual = trimestres.at(-1);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="O que mostrar" className="inline-flex gap-0.5 rounded-full border border-offwhite/15 bg-offwhite/6 p-1">
          {(["obras", "kwp"] as const).map((m) => (
            <Link
              key={m}
              href={`${hrefEngenharia(estado, { metrica: m })}#trajetoria`}
              scroll={false}
              aria-current={metrica === m ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] ${metrica === m ? "bg-dourado font-semibold text-carvao" : "font-medium text-offwhite/75 hover:text-offwhite"}`}
            >
              {m === "obras" ? "Obras" : "kWp"}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-offwhite/55">Desde o início, por trimestre · os filtros de 12 e 6 meses aparecem quando houver histórico</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Grafico
          sobre="O que você já fez"
          titulo={`${metrica === "obras" ? "Obras concluídas" : "Potência concluída"}, acumulado por trimestre`}
          valor={inteiro(atual?.acumulado ?? 0)}
          unidade={unidade}
          nota={`▲ ${inteiro(atual?.acumulado ?? 0)} ${unidade} desde o início`}
          barras={trimestres.map((t) => ({ rotulo: t.rotulo, valor: t.acumulado }))}
          alternarTextos
        />
        <Grafico
          sobre="Seu ritmo"
          titulo={`${metrica === "obras" ? "Obras concluídas" : "kWp concluídos"} por trimestre`}
          valor={inteiro(atual?.noTrecho ?? 0)}
          unidade={`${unidade} neste trimestre`}
          nota={mediaAnteriores == null ? "Primeiro trimestre com obras concluídas" : `Média dos trimestres anteriores: ${decimal(mediaAnteriores)} ${unidade}`}
          barras={trimestres.map((t) => ({ rotulo: t.rotulo, valor: t.noTrecho }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-xs font-medium text-offwhite/65">
          Próximo marco: <strong className="text-offwhite">{inteiro(marco.proximo)} {unidade}</strong> · faltam {inteiro(marco.falta)} {unidade}
        </p>
        <div
          role="progressbar"
          aria-label="Progresso até o próximo marco"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(marco.progresso * 100)}
          className="h-2.5 min-w-[200px] flex-1 overflow-hidden rounded-full bg-offwhite/12"
        >
          <div className="h-full rounded-full bg-dourado transition-[width] duration-700 ease-raion" style={{ width: `${Math.round(marco.progresso * 100)}%` }} />
        </div>
      </div>
    </>
  );
}

const ALTURA = 150;

/** Barras verticais por trimestre: o atual em dourado, os anteriores em dourado claro; número sobre a barra. */
function Grafico({
  sobre,
  titulo,
  valor,
  unidade,
  nota,
  barras,
  alternarTextos,
}: {
  sobre: string;
  titulo: string;
  valor: string;
  unidade: string;
  nota: string;
  barras: { rotulo: string; valor: number }[];
  /** No acumulado os números são longos: também alternam com os rótulos. */
  alternarTextos?: boolean;
}) {
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  const ultimo = barras.length - 1;
  // Com muitas barras, rótulo (e, no acumulado, o número) um sim, um não, a partir do atual, para não encavalar.
  const alterna = (k: number) => barras.length <= 6 || k % 2 === ultimo % 2;
  const mostra = (k: number) => !alternarTextos || alterna(k);
  return (
    <section aria-label={sobre} className="min-w-0 rounded-2xl bg-[#1a1a1c] p-5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-offwhite/55 uppercase">{sobre}</p>
      <p className="mt-1.5 mb-3.5 text-sm font-medium">{titulo}</p>
      <p className="font-titulo text-4xl leading-none font-light tracking-tight tabular-nums">
        {valor}
        <small className="ml-1.5 font-sans text-sm font-medium tracking-normal text-offwhite/70">{unidade}</small>
      </p>
      <p className="mt-0.5 mb-4 text-xs font-semibold text-dourado">{nota}</p>
      <div role="img" aria-label={barras.map((b) => `${b.rotulo}: ${inteiro(b.valor)}`).join(", ")} className="flex h-[178px] items-end gap-1.5 border-b border-offwhite/18">
        {barras.map((b, k) => (
          <div key={b.rotulo} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <b className="text-[10.5px] font-semibold whitespace-nowrap text-offwhite/75 tabular-nums">{mostra(k) ? inteiro(b.valor) : ""}</b>
            <span
              className="block w-full max-w-9 origin-bottom animate-crescer rounded-t-md"
              style={{ height: Math.max(6, Math.round((b.valor / maximo) * ALTURA)), background: k === ultimo ? "#d4af37" : "#eddb9f" }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5">
        {barras.map((b, k) => (
          <span key={b.rotulo} className="min-w-0 flex-1 text-center text-[11px] whitespace-nowrap text-offwhite/60">
            {alterna(k) ? b.rotulo : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
