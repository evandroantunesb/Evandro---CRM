import Link from "next/link";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { ModosObras } from "@/components/obras/modos-obras";
import { hojeBrasilia } from "@/lib/obras/apresentacao/dados";
import { carregarAgenda, carregarEquipesInstalacao, carregarFeriadosPeriodo } from "@/lib/obras/agenda";
import {
  ROTULO_TIPO,
  TIPOS_EVENTO,
  diaDaInstalacao,
  diaDoMes,
  diasDoPeriodo,
  ehDataValida,
  eventosDoDia,
  filtrarEventos,
  fimDeSemana,
  navegar,
  nomeDiaCurto,
  nomeDiaLongo,
  tiposDaUrl,
  tituloPeriodo,
  type EventoAgenda,
  type ModoAgenda,
  type TipoEvento,
} from "@/lib/obras/agenda-regras";
import { GERIR_OBRAS, OBRAS, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Cor de cada tipo (prévia aprovada em 18/11/2026): instalação em carvão, material em dourado, vistoria em cinza. */
const ESTILO: Record<TipoEvento, string> = {
  instalacao: "bg-carvao text-offwhite",
  vistoria: "border-l-[3px] border-zinc-400 bg-zinc-100 text-texto",
  entrega_material: "border-l-[3px] border-dourado bg-amber-50 text-texto",
  entrega_contratada: "border border-carvao bg-superficie text-texto",
};
const PONTO: Record<TipoEvento, string> = {
  instalacao: "bg-carvao",
  vistoria: "bg-zinc-400",
  entrega_material: "bg-dourado",
  entrega_contratada: "border-2 border-carvao bg-superficie",
};

type Filtros = { modo: ModoAgenda; data: string; tipos: TipoEvento[]; equipe: string | null };

function href(f: Filtros, mudar: Partial<Filtros> = {}) {
  const x = { ...f, ...mudar };
  const q = new URLSearchParams();
  if (x.modo === "mes") q.set("modo", "mes");
  q.set("data", x.data);
  if (x.tipos.length) q.set("tipos", x.tipos.join(","));
  if (x.equipe) q.set("equipe", x.equipe);
  return `/obras/agenda?${q.toString()}`;
}

function linhaEvento(e: EventoAgenda, dia: string) {
  const parte = diaDaInstalacao(e, dia);
  const sub =
    e.tipo === "instalacao"
      ? [e.detalhe, parte].filter(Boolean).join(" · ")
      : e.tipo === "entrega_contratada" && e.alerta
        ? "Previsão passa da data"
        : `Obra nº ${e.obraNumero}`;
  return { titulo: `${ROTULO_TIPO[e.tipo].curto} · ${e.clienteNome}`, sub };
}

export default async function Agenda({ searchParams }: PageProps<"/obras/agenda">) {
  const { atual } = await exigirPapel(...OBRAS);
  const params = await searchParams;
  const hoje = hojeBrasilia();
  const filtros: Filtros = {
    modo: params.modo === "mes" ? "mes" : "semana",
    data: ehDataValida(params.data) ? params.data : hoje,
    tipos: tiposDaUrl(params.tipos),
    equipe: typeof params.equipe === "string" && /^[0-9a-f-]{36}$/.test(params.equipe) ? params.equipe : null,
  };
  const dias = diasDoPeriodo(filtros.modo, filtros.data);
  const de = dias[0];
  const ate = dias.at(-1)!;

  const supabase = await criarClienteServidor();
  const gerencia = pode(atual.papel, GERIR_OBRAS);
  const [todos, feriados, equipes] = await Promise.all([
    carregarAgenda(supabase, atual.empresaId, de, ate),
    carregarFeriadosPeriodo(supabase, atual.empresaId, de, ate),
    gerencia ? carregarEquipesInstalacao(supabase, atual.empresaId) : Promise.resolve([]),
  ]);
  const eventos = filtrarEventos(todos, filtros);
  const mesAtual = filtros.data.slice(0, 7);
  const diasComItens = dias.filter((d) => (filtros.modo === "semana" || d.slice(0, 7) === mesAtual) && (eventosDoDia(eventos, d).length > 0 || feriados.has(d)));

  const alternarTipo = (t: TipoEvento) => {
    const ativos = filtros.tipos.length ? filtros.tipos : [...TIPOS_EVENTO];
    const novos = ativos.includes(t) ? ativos.filter((x) => x !== t) : [...ativos, t];
    return href(filtros, { tipos: novos.length === TIPOS_EVENTO.length || novos.length === 0 ? [] : novos });
  };
  const tipoLigado = (t: TipoEvento) => filtros.tipos.length === 0 || filtros.tipos.includes(t);
  const chip = (ligado: boolean) =>
    `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${ligado ? "border-carvao/30 bg-superficie text-texto" : "border-linha bg-transparent text-zinc-400 line-through"}`;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Obras"
        titulo="Agenda"
        descricao="O que acontece na operação no período. Clique num item para abrir a obra."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <ModosObras modo="agenda" escuro hrefGestao="/obras" hrefApresentacao="/obras/apresentacao" hrefAgenda={href(filtros)} />
            {gerencia && (
              <Link href="/obras/agenda/equipes" className={CLASSE_ACAO_CABECALHO}>
                Equipes de instalação
              </Link>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Período" className="inline-flex rounded-full border border-linha bg-superficie p-0.5 text-sm">
          {(["semana", "mes"] as const).map((m) => (
            <Link
              key={m}
              href={href(filtros, { modo: m })}
              aria-current={filtros.modo === m ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 font-medium ${filtros.modo === m ? "bg-carvao text-offwhite" : "text-zinc-500 hover:text-texto"}`}
            >
              {m === "semana" ? "Semana" : "Mês"}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={href(filtros, { data: navegar(filtros.modo, filtros.data, -1) })} aria-label="Período anterior" className="grid size-8 place-items-center rounded-full border border-linha bg-superficie">
            ‹
          </Link>
          <h2 className="min-w-44 text-center font-titulo text-base font-bold text-texto">{tituloPeriodo(filtros.modo, filtros.data)}</h2>
          <Link href={href(filtros, { data: navegar(filtros.modo, filtros.data, 1) })} aria-label="Próximo período" className="grid size-8 place-items-center rounded-full border border-linha bg-superficie">
            ›
          </Link>
        </div>
        <Link href={href(filtros, { data: hoje })} className="inline-flex min-h-8 items-center rounded-full border border-linha bg-superficie px-3 text-xs font-medium">
          Hoje
        </Link>
        <div className="flex flex-wrap gap-1.5 lg:ml-auto">
          {TIPOS_EVENTO.map((t) => (
            <Link key={t} href={alternarTipo(t)} aria-pressed={tipoLigado(t)} className={chip(tipoLigado(t))}>
              <span aria-hidden className={`inline-block size-2.5 rounded-[3px] ${PONTO[t]}`} />
              {ROTULO_TIPO[t].plural}
            </Link>
          ))}
        </div>
      </div>

      {equipes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Equipe:</span>
          <Link href={href(filtros, { equipe: null })} className={chip(!filtros.equipe)}>
            Todas
          </Link>
          {equipes.map((eq) => (
            <Link key={eq.id} href={href(filtros, { equipe: eq.id })} className={chip(filtros.equipe === eq.id)}>
              {eq.nome}
            </Link>
          ))}
        </div>
      )}

      {/* Computador: grade da semana ou do mês. */}
      <div className="hidden overflow-hidden rounded-xl border border-linha bg-superficie md:grid md:grid-cols-7">
        {filtros.modo === "mes" &&
          ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => (
            <div key={d} className="border-b border-linha py-1.5 text-center text-[11px] uppercase tracking-wider text-zinc-500">
              {d}
            </div>
          ))}
        {dias.map((dia, i) => {
          const doDia = eventosDoDia(eventos, dia);
          const feriado = feriados.get(dia);
          const fora = filtros.modo === "mes" && dia.slice(0, 7) !== mesAtual;
          const limite = filtros.modo === "mes" ? 3 : doDia.length;
          return (
            <div
              key={dia}
              className={`flex flex-col gap-1.5 border-linha p-2 ${i % 7 ? "border-l" : ""} ${filtros.modo === "mes" ? "min-h-28 border-t" : "min-h-72"} ${
                feriado ? "bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgb(0_0_0/3%)_6px,rgb(0_0_0/3%)_12px)]" : fimDeSemana(dia) ? "bg-black/[2.5%]" : ""
              }`}
            >
              <div className="flex items-baseline justify-between text-xs text-zinc-500">
                <span>{filtros.modo === "semana" ? nomeDiaCurto(dia) : ""}</span>
                <span
                  className={`font-titulo text-base font-bold ${fora ? "text-zinc-300" : "text-texto"} ${dia === hoje ? "rounded-md bg-dourado px-1.5 text-carvao" : ""}`}
                >
                  {diaDoMes(dia)}
                </span>
              </div>
              {feriado && <p className="text-[10px] font-semibold text-dourado-texto">Feriado · {feriado}</p>}
              {doDia.slice(0, limite).map((e) => {
                const l = linhaEvento(e, dia);
                return (
                  <Link
                    key={`${e.tipo}-${e.obraId}`}
                    href={`/obras/${e.obraId}`}
                    className={`block rounded-lg px-2 py-1.5 text-xs leading-snug hover:opacity-90 ${ESTILO[e.tipo]} ${e.alerta ? "!border-erro" : ""}`}
                  >
                    <span className="line-clamp-2 font-medium">{l.titulo}</span>
                    {filtros.modo === "semana" && <span className={`block text-[11px] ${e.alerta ? "font-semibold text-erro" : "opacity-75"}`}>{l.sub}</span>}
                  </Link>
                );
              })}
              {doDia.length > limite && (
                <Link href={href(filtros, { modo: "semana", data: dia })} className="text-[11px] font-semibold text-dourado-texto">
                  +{doDia.length - limite}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Celular: lista por dia, só os dias com algo. */}
      <div className="flex flex-col gap-1 md:hidden">
        {diasComItens.length === 0 && <p className="painel p-5 text-center text-sm text-zinc-500">Nada agendado neste período.</p>}
        {diasComItens.map((dia) => {
          const doDia = eventosDoDia(eventos, dia);
          const feriado = feriados.get(dia);
          return (
            <section key={dia} aria-label={`${nomeDiaLongo(dia)}, ${diaDoMes(dia)}`}>
              <h3 className="mb-2 mt-3 flex justify-between font-titulo text-sm font-bold text-texto">
                <span>
                  {nomeDiaLongo(dia)}, {diaDoMes(dia)}
                  {dia === hoje ? " · hoje" : ""}
                </span>
                <span className="font-sans text-xs font-normal text-zinc-500">
                  {feriado ? `Feriado · ${feriado}` : `${doDia.length} ${doDia.length === 1 ? "item" : "itens"}`}
                </span>
              </h3>
              {doDia.map((e) => {
                const l = linhaEvento(e, dia);
                return (
                  <Link
                    key={`${e.tipo}-${e.obraId}`}
                    href={`/obras/${e.obraId}`}
                    className={`mb-2 flex gap-2.5 rounded-xl border bg-superficie p-3 text-sm ${e.alerta ? "border-erro" : "border-linha"}`}
                  >
                    <span aria-hidden className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-[3px] ${PONTO[e.tipo]}`} />
                    <span>
                      <span className="block font-medium text-texto">{l.titulo}</span>
                      <span className={`block text-xs ${e.alerta ? "text-erro" : "text-zinc-500"}`}>{l.sub}</span>
                    </span>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        Instalação: do início ao término agendados. Entrega contratada em vermelho: a previsão da obra passa da data. Listrado: feriado; cinza: fim de
        semana.
      </p>
    </div>
  );
}
