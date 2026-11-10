import Link from "next/link";
import type { ReactNode } from "react";
import { formatarMoeda } from "@/lib/formatacao";
import type { CompletaVM, KpisCompleta, ObraCompletaVM } from "@/lib/obras/completa";
import { ROTULO_ETAPA_CURTO } from "@/lib/obras/cronograma";
import { Escalonamentos, PONTO, Regras, Sinal } from "./semaforo-ui";
import { ROTULO_COR, VISAO_SETORES, filtrarCompleta, queryCompleta, type CorSemaforo, type FiltroCor, type FiltrosCompleta } from "@/lib/obras/semaforo";

/**
 * Visão Completa de Obras, do desenho aprovado "Obras — Completa": faixa escura com as obras em execução, os sete
 * números, a barra do semáforo, a lista (vermelhas primeiro) e, abaixo, os escalonamentos abertos e as regras.
 * Exceção de cores só em Obras (CLAUDE.md): verde = energia, amarelo = dourado, vermelho = erro.
 */

const inteiro = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
const umaCasa = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const pct = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : ""}${umaCasa(Math.abs(v))}%`);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const kwp = (v: number | null) => (v == null ? null : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kWp`);

/** "R$ 2,15 mi", "R$ 460 mil", "R$ 950". */
export function moedaCompacta(v: number) {
  const n = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  const fmt = (x: number, casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(x);
  if (n >= 1_000_000) return `${sinal}R$ ${fmt(n / 1_000_000, 2)} mi`;
  if (n >= 1_000) return `${sinal}R$ ${fmt(n / 1_000, 0)} mil`;
  return `${sinal}R$ ${fmt(n, 0)}`;
}

export function Completa({
  completa,
  filtros,
  hoje,
  modos,
}: {
  completa: CompletaVM;
  filtros: FiltrosCompleta;
  hoje: string;
  modos: ReactNode;
}) {
  const { kpis, obras, escalonamentos } = completa;
  const visiveis = filtrarCompleta(obras, filtros);
  const query = queryCompleta(filtros);
  const concluidas = obras.filter((o) => o.concluida).length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-carvao px-5 py-6 text-offwhite md:px-7">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-dourado uppercase">Operação · Gestão · só admin e gestor</p>
          <h1 className="mt-1 font-titulo text-3xl font-light tracking-tight md:text-4xl">Obras</h1>
          <p className="mt-1 text-sm text-offwhite/75">Todas as obras da empresa, com o semáforo de prazo e custo.</p>
        </div>
        <div className="flex flex-col items-end gap-3.5">
          {modos}
          <div className="min-w-[220px] rounded-2xl border border-dourado/55 bg-dourado/12 px-[18px] py-3">
            <span className="block text-[11px] font-semibold tracking-[0.1em] text-dourado uppercase">Obras em execução</span>
            <span className="mt-1.5 block font-titulo text-[44px] leading-none font-light tracking-[-0.03em] tabular-nums">{kpis.emExecucao}</span>
            <span className="mt-1.5 block text-xs text-offwhite/80">
              {moedaCompacta(kpis.valorEmExecucao)} em execução · {kpis.concluidasNoMes} {kpis.concluidasNoMes === 1 ? "concluída" : "concluídas"} no mês
            </span>
          </div>
        </div>
      </section>

      <Numeros kpis={kpis} />

      <section className="rounded-2xl bg-carvao px-5 py-4 text-offwhite">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-offwhite/60 uppercase">Semáforo</p>
            <h2 className="font-titulo text-lg font-semibold">
              {kpis.emExecucao} {kpis.emExecucao === 1 ? "obra" : "obras"} em execução
            </h2>
          </div>
          <div className="flex flex-wrap gap-4 [&_span]:!text-offwhite/90">
            <Sinal cor="vermelha">{kpis.vermelhas} {kpis.vermelhas === 1 ? "vermelha" : "vermelhas"}</Sinal>
            <Sinal cor="amarela">{kpis.amarelas} {kpis.amarelas === 1 ? "amarela" : "amarelas"}</Sinal>
            <Sinal cor="verde">{kpis.verdes} {kpis.verdes === 1 ? "verde" : "verdes"}</Sinal>
          </div>
        </div>
        {kpis.emExecucao > 0 && (
          <div
            role="img"
            aria-label={`${kpis.vermelhas} vermelhas, ${kpis.amarelas} amarelas, ${kpis.verdes} verdes`}
            className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
          >
            <span className="h-full bg-erro" style={{ width: `${(kpis.vermelhas / kpis.emExecucao) * 100}%` }} />
            <span className="h-full bg-atencao" style={{ width: `${(kpis.amarelas / kpis.emExecucao) * 100}%` }} />
            <span className="h-full bg-energia" style={{ width: `${(kpis.verdes / kpis.emExecucao) * 100}%` }} />
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtro" className="inline-flex max-w-full flex-wrap rounded-lg border border-linha bg-superficie p-0.5 text-sm">
          {(
            [
              [undefined, "Todas", kpis.emExecucao],
              ["vermelha", "Vermelhas", null],
              ["amarela", "Amarelas", null],
              ["verde", "Verdes", null],
              ["concluidas", "Concluídas", null],
            ] as [FiltroCor | undefined, string, number | null][]
          ).map(([cor, rotulo, conta]) => {
            const ativo = filtros.cor === cor;
            const q = queryCompleta({ ...filtros, cor });
            return (
              <Link
                key={rotulo}
                href={`/obras${q ? `?${q}` : ""}`}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 ${ativo ? "bg-carvao font-medium text-offwhite" : "text-texto-2 hover:text-texto"}`}
              >
                {rotulo}
                {conta != null && <span className="ml-1.5 text-xs opacity-70">{conta}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 sm:flex-none">
        <Link href={`/obras?visao=${VISAO_SETORES}`} className="text-xs text-texto-2 underline hover:text-texto">
          Lista por setor
        </Link>
        <form action="/obras" className="flex min-w-0 flex-1 justify-end sm:flex-none">
          {filtros.cor && <input type="hidden" name="cor" value={filtros.cor} />}
          <input
            name="q"
            defaultValue={filtros.busca ?? ""}
            aria-label="Buscar obras"
            placeholder="Buscar cliente ou nº da obra"
            className="w-full rounded-lg border border-linha bg-superficie px-3 py-2 text-sm sm:min-w-[260px]"
          />
        </form>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-linha bg-superficie">
        {visiveis.length === 0 ? (
          <p className="p-6 text-center text-sm text-texto-2">
            {filtros.cor === "concluidas" && concluidas === 0 ? "Nenhuma obra concluída." : "Nenhuma obra com esses filtros."}
          </p>
        ) : (
          <TabelaObras obras={visiveis} query={query} />
        )}
        <p className="border-t border-linha px-4 py-3.5 text-xs text-texto-2">
          {filtros.cor === "concluidas" ? "Concluídas" : "Vermelhas primeiro"} · mostrando {visiveis.length} de{" "}
          {filtros.cor === "concluidas" ? concluidas : kpis.emExecucao}
        </p>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Escalonamentos itens={escalonamentos} hoje={hoje} />
        <Regras />
      </div>
    </div>
  );
}

function Numeros({ kpis }: { kpis: KpisCompleta }) {
  const semMargem = kpis.margemProjetadaPct == null;
  const itens: { rotulo: ReactNode; valor: string; classe?: string; rodape?: string; destaque?: boolean }[] = [
    { rotulo: <Rotulo cor="vermelha">Vermelhas</Rotulo>, valor: String(kpis.vermelhas), classe: "text-erro" },
    { rotulo: <Rotulo cor="amarela">Amarelas</Rotulo>, valor: String(kpis.amarelas), classe: "text-atencao-texto" },
    { rotulo: <Rotulo cor="verde">Verdes</Rotulo>, valor: String(kpis.verdes), classe: "text-energia" },
    { rotulo: "Escalonamentos abertos", valor: String(kpis.escalonamentosAbertos) },
    { rotulo: "Valor em execução", valor: moedaCompacta(kpis.valorEmExecucao) },
    // Sem obra com orçamento, nada de margem: "—" e o porquê.
    semMargem
      ? { rotulo: "Margem projetada", valor: "—", rodape: "Nenhuma obra com orçamento" }
      : { rotulo: "Margem projetada", valor: pct(kpis.margemProjetadaPct), rodape: `${moedaCompacta(kpis.margemProjetada)}, antes de impostos` },
    {
      rotulo: "Margem líquida prevista",
      valor: semMargem ? "—" : moedaCompacta(kpis.margemLiquida),
      classe: semMargem ? "text-texto" : kpis.margemLiquida < 0 ? "text-erro" : "text-energia",
      rodape: semMargem ? "Nenhuma obra com orçamento" : `${pct(kpis.margemLiquidaPct)} · depois de impostos e comissões`,
      destaque: true,
    },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-linha bg-linha gap-px sm:grid-cols-4 xl:grid-cols-7">
      {itens.map((k, i) => (
        <div key={i} className={`flex min-w-0 flex-col gap-1 px-4 py-3 ${k.destaque ? "bg-dourado/10" : "bg-superficie"}`}>
          <dt className="text-xs text-texto-2">{k.rotulo}</dt>
          <dd className={`font-titulo text-2xl font-light tracking-tight tabular-nums ${k.classe ?? "text-texto"}`}>{k.valor}</dd>
          {k.rodape && <p className="text-[11px] text-texto-2">{k.rodape}</p>}
        </div>
      ))}
    </dl>
  );
}

function Rotulo({ cor, children }: { cor: CorSemaforo; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden className={`size-2.5 rounded-full ${PONTO[cor]}`} />
      {children}
    </span>
  );
}

function Progresso({ valor }: { valor: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
        <span className="block h-full rounded-full bg-dourado" style={{ width: `${valor}%` }} />
      </span>
      <span className="text-xs text-texto-2 tabular-nums">{valor}%</span>
    </span>
  );
}

function Entrega({ o }: { o: ObraCompletaVM }) {
  return (
    <span className="tabular-nums">
      {ddmm(o.entregaPrevista)}
      {o.atrasoEntrega > 0 && <span className={`ml-1 font-semibold ${o.atrasoEntrega > 5 ? "text-erro" : "text-atencao-texto"}`}>+{o.atrasoEntrega} d</span>}
    </span>
  );
}

const custoClasse = (o: ObraCompletaVM) => (o.custoPct != null && o.custoPct > 100 ? "text-erro" : "");
const margemClasse = (o: ObraCompletaVM) => (o.margemPct != null && o.margemPct < 0 ? "text-erro" : "");

function TabelaObras({ obras, query }: { obras: ObraCompletaVM[]; query: string }) {
  const sufixo = query ? `?${query}` : "";
  const titulo = (o: ObraCompletaVM) => (
    <>
      <Link href={`/obras/${o.id}`} className="font-semibold text-texto underline-offset-2 hover:underline">
        #{o.numero} {o.clienteNome}
      </Link>
      <p className="text-xs text-texto-2">{[kwp(o.potenciaKwp), o.venda != null ? formatarMoeda(o.venda) : null].filter(Boolean).join(" · ")}</p>
    </>
  );
  const etapa = (o: ObraCompletaVM) => (o.concluida ? "Concluída" : o.etapaAtual ? ROTULO_ETAPA_CURTO[o.etapaAtual] : "—");
  const apresentar = (o: ObraCompletaVM) => (
    <Link href={`/obras/apresentacao/${o.id}${sufixo}`} className="font-medium whitespace-nowrap text-dourado-texto hover:underline">
      Apresentar →
    </Link>
  );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] tracking-[0.08em] text-texto-2 uppercase">
            <tr>
              {["Semáforo", "Obra", "Etapa atual", "Progresso", "Entrega", "Custo", "Margem", "Motivo", ""].map((c) => (
                <th key={c} className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {obras.map((o) => (
              <tr key={o.id} className="border-t border-linha align-middle">
                <td className="px-4 py-3">
                  <Sinal cor={o.cor}>{ROTULO_COR[o.cor]}</Sinal>
                </td>
                <td className="min-w-48 px-4 py-3">{titulo(o)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{etapa(o)}</td>
                <td className="px-4 py-3">
                  <Progresso valor={o.progresso} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Entrega o={o} />
                </td>
                <td className={`px-4 py-3 tabular-nums ${custoClasse(o)}`}>{o.custoPct == null ? "—" : `${inteiro(o.custoPct)}%`}</td>
                <td className={`px-4 py-3 tabular-nums ${margemClasse(o)}`}>{pct(o.margemPct)}</td>
                <td className="max-w-[220px] px-4 py-3 text-xs text-texto-2">{o.motivo ?? "—"}</td>
                <td className="px-4 py-3 text-right">{apresentar(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-linha md:hidden">
        {obras.map((o) => (
          <li key={o.id} className="flex flex-col gap-2 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{titulo(o)}</div>
              <Sinal cor={o.cor}>{ROTULO_COR[o.cor]}</Sinal>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-2">
              <span>{etapa(o)}</span>
              <Progresso valor={o.progresso} />
              <span>
                Entrega <Entrega o={o} />
              </span>
              <span className={custoClasse(o)}>Custo {o.custoPct == null ? "—" : `${inteiro(o.custoPct)}%`}</span>
              <span className={margemClasse(o)}>Margem {pct(o.margemPct)}</span>
            </div>
            {o.motivo && <p className="text-xs text-texto-2">{o.motivo}</p>}
            <div>{apresentar(o)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
