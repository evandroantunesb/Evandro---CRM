import { AlarmClock, BellRing, CalendarX, CirclePause, HardHat, Hourglass, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListaTarefasSetor } from "@/components/tarefas-setor";
import { Cartao, Selo } from "@/components/ui";
import { carregarChecklistsAptos } from "@/lib/engenharia-checklist";
import {
  diasDesde,
  montarCentralEngenharia,
  montarKanbanEngenharia,
  type ColunaKanbanEngenharia,
  type ObraNaEngenharia,
} from "@/lib/engenharia-regras";
import { carregarIndicadoresEngenharia, carregarPrazosObras } from "@/lib/engenharia-prazos";
import {
  PERIODOS_INDICADORES,
  lerPeriodo,
  seloPrazo,
  textoMediana,
  textoProporcao,
  type IndicadoresEngenharia,
  type PeriodoIndicadores,
  type PrazoObra,
} from "@/lib/engenharia-prazos-regras";
import { carregarStatusProtocolos, contarExigenciasAbertas } from "@/lib/engenharia-protocolos";
import type { StatusProtocolo } from "@/lib/engenharia-protocolos-regras";
import { carregarAcoesVistoria } from "@/lib/engenharia-vistoria";
import { carregarObras, type ObraListaVM } from "@/lib/obras/dados";
import { ROTULO_ESTADO_SETOR, rotuloStatus } from "@/lib/obras/rotulos";
import { ENGENHARIA, OBRAS, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor, contarAbasTarefasSetor } from "@/lib/tarefas-setor";
import { ROTULO_FILTRO_TAREFAS_SETOR, type FiltroTarefasSetor, type TarefaSetorVM } from "@/lib/tarefas-setor-regras";

// Sem "Pedidas por mim": a Engenharia vê o que é do setor, não o que pediu a outros.
const FILTROS = ["abertas", "minhas", "fila", "concluidas"] as const satisfies readonly FiltroTarefasSetor[];
type Filtro = (typeof FILTROS)[number];
const VAZIO: Record<Filtro, string> = {
  abertas: "Nenhuma tarefa de Engenharia aberta.",
  minhas: "Nenhuma tarefa com você.",
  fila: "Nenhuma tarefa esperando alguém assumir.",
  concluidas: "Nenhuma tarefa concluída.",
};

const formatarPotencia = (kwp: number | null) =>
  kwp == null ? "" : ` · ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kwp)} kWp`;

const ha = (desde: string | null) => {
  if (!desde) return null;
  const dias = diasDesde(desde);
  return dias === 0 ? "desde hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`;
};

type VisaoCarteira = "lista" | "kanban";

/** Link da Central guardando a visão da carteira e o período dos indicadores (padrões ficam fora da URL). */
const hrefCentral = ({ carteira, periodo }: { carteira: VisaoCarteira; periodo: PeriodoIndicadores }) => {
  const q = new URLSearchParams();
  if (carteira === "kanban") q.set("carteira", "kanban");
  if (periodo !== 30) q.set("periodo", String(periodo));
  return q.size ? `/engenharia?${q}` : "/engenharia";
};

// Etapas em que o checklist decide entre "Pronto para protocolo" e as fases anteriores (antes do protocolo).
const ETAPAS_ANTES_DO_PROTOCOLO = new Set(["a_iniciar", "projeto_em_elaboracao"]);

// No contexto da Engenharia, a tarefa de obra abre o card da obra para o engenheiro, não a tela de Obras.
const paraCard = (t: TarefaSetorVM): TarefaSetorVM =>
  t.obraId ? { ...t, referencia: { ...t.referencia, href: `/engenharia/${t.obraId}` } } : t;

/**
 * Central da Engenharia: abre no que exige ação de quem entrou (tarefas e obras), depois o que espera terceiros e a
 * carteira por etapa; as abas de tarefas ficam em `?ver=`. Admin e gestor acompanham; `operacao` vê só se atua em
 * Engenharia. Tudo sob RLS: a tela não decide permissão, só monta o que chega.
 */
export default async function Engenharia({ searchParams }: PageProps<"/engenharia">) {
  const { atual } = await exigirPapel(...ENGENHARIA);
  const { ver, periodo: periodoBruto, carteira: carteiraBruta } = await searchParams;
  const periodo = lerPeriodo(periodoBruto);
  const carteira: VisaoCarteira = carteiraBruta === "kanban" ? "kanban" : "lista";
  const filtro = (FILTROS as readonly string[]).includes(ver as string) ? (ver as Filtro) : null;
  const supabase = await criarClienteServidor();

  const { data: meusSetores } = await supabase
    .from("membro_setores_obra")
    .select("setor, capacidade")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", atual.membroId)
    .eq("setor", "engenharia");
  const atua = (meusSetores ?? []).length > 0;
  const coordenaSetor = (meusSetores ?? []).some((s) => s.capacidade === "coordenar");

  if (atual.papel === "operacao" && !atua) {
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Engenharia</h1>
        <p className="text-sm text-zinc-600">Você não atua em Engenharia nesta empresa. Peça ao admin para configurar em Configurações › Usuários.</p>
      </div>
    );
  }

  const [{ tarefas, membrosPorSetor }, porAba, obras, exigencias, acoesVistoria, prazos, indicadores] = await Promise.all([
    carregarTarefasSetor(supabase, {
      empresaId: atual.empresaId,
      membroId: atual.membroId,
      papel: atual.papel,
      filtro: filtro ?? "abertas",
      setor: "engenharia",
    }),
    contarAbasTarefasSetor(supabase, atual.empresaId, atual.membroId, "engenharia"),
    // As obras só entram na Central; as abas de tarefas não as usam.
    filtro ? null : carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, membroId: atual.membroId }).then((r) => r.obras),
    filtro ? null : contarExigenciasAbertas(supabase, atual.empresaId),
    filtro ? null : carregarAcoesVistoria(supabase, atual.empresaId),
    filtro ? null : carregarPrazosObras(supabase, atual.empresaId),
    filtro ? null : carregarIndicadoresEngenharia(supabase, atual.empresaId, periodo),
  ]);
  const listaTarefas = tarefas.map(paraCard);

  // Só o Kanban precisa dos protocolos e do checklist (fases "Pronto para protocolo" e "Conexão / vistoria").
  const [protocolos, checklistsAptos] =
    obras && carteira === "kanban"
      ? await Promise.all([
          carregarStatusProtocolos(supabase, atual.empresaId),
          carregarChecklistsAptos(
            supabase,
            atual.empresaId,
            obras
              .filter((o) => o.situacao === "em_andamento")
              .filter((o) => ETAPAS_ANTES_DO_PROTOCOLO.has(o.setores.find((s) => s.setor === "engenharia")?.status ?? ""))
              .map((o) => o.id),
          ),
        ])
      : [null, null];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="sobretitulo">Obras · Engenharia</p>
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Engenharia</h1>
        <p className="text-sm text-zinc-500">O que precisa de você hoje, o que espera terceiros e as obras por etapa do projeto.</p>
        {atual.papel === "operacao" && (
          <p className="mt-1 text-sm text-zinc-700">Você atua em Engenharia como {coordenaSetor ? "coordenador" : "executor"}.</p>
        )}
      </div>

      <nav aria-label="Visão" className="flex flex-wrap gap-2">
        <Aba href="/engenharia" atual={filtro === null}>
          Central
        </Aba>
        {FILTROS.map((f) => (
          <Aba key={f} href={`/engenharia?ver=${f}`} atual={f === filtro} contagem={f === "concluidas" ? 0 : porAba[f]}>
            {ROTULO_FILTRO_TAREFAS_SETOR[f]}
          </Aba>
        ))}
      </nav>

      {filtro || !obras ? (
        <Cartao titulo={`${ROTULO_FILTRO_TAREFAS_SETOR[filtro ?? "abertas"]} (${tarefas.length})`}>
          <ListaTarefasSetor tarefas={listaTarefas} membrosPorSetor={membrosPorSetor} vazio={VAZIO[filtro ?? "abertas"]} />
        </Cartao>
      ) : (
        <Central
          tarefas={listaTarefas}
          membrosPorSetor={membrosPorSetor}
          obras={obras}
          exigencias={exigencias ?? new Map()}
          acoesVistoria={acoesVistoria ?? new Map()}
          prazos={prazos ?? new Map()}
          indicadores={indicadores ?? null}
          periodo={periodo}
          carteira={carteira}
          protocolos={protocolos ?? new Map()}
          checklistsAptos={checklistsAptos ?? new Set()}
          membroId={atual.membroId}
          podeVerObras={pode(atual.papel, OBRAS)}
          // Definir responsável é do admin e do coordenador (quem a RPC deixa gerir a obra); o gestor só acompanha.
          coordena={atual.papel === "admin" || coordenaSetor}
        />
      )}
    </div>
  );
}

function Central({
  tarefas,
  membrosPorSetor,
  obras,
  exigencias,
  acoesVistoria,
  prazos,
  indicadores,
  periodo,
  carteira,
  protocolos,
  checklistsAptos,
  membroId,
  podeVerObras,
  coordena,
}: {
  tarefas: TarefaSetorVM[];
  membrosPorSetor: Parameters<typeof ListaTarefasSetor>[0]["membrosPorSetor"];
  obras: ObraListaVM[];
  exigencias: ReadonlyMap<string, number>;
  acoesVistoria: ReadonlyMap<string, string>;
  prazos: ReadonlyMap<string, PrazoObra[]>;
  indicadores: IndicadoresEngenharia | null;
  periodo: PeriodoIndicadores;
  carteira: VisaoCarteira;
  protocolos: ReadonlyMap<string, readonly StatusProtocolo[]>;
  checklistsAptos: ReadonlySet<string>;
  membroId: string;
  podeVerObras: boolean;
  coordena: boolean;
}) {
  const { acoes, comTerceiros, grupos } = montarCentralEngenharia(obras, (s) => rotuloStatus("engenharia", s), { coordena, exigencias, acoesVistoria });

  // Minhas tarefas e as da fila que eu posso assumir; o resto do setor fica nas abas.
  const tarefasMinhas = tarefas.filter((t) => t.responsavel?.id === membroId || (!t.responsavel && t.podeAgir));
  const atrasadas = tarefas.filter((t) => t.atrasada).length;
  const totalObras = grupos.reduce((n, g) => n + g.obras.length, 0);
  const paradas = grupos.reduce((n, g) => n + g.obras.filter((o) => o.estado === "parado").length, 0);
  const nada = tarefasMinhas.length === 0 && acoes.length === 0;
  // Como a carteira, vem do banco: obras em curso com algum prazo vencido, sem o limite de linhas da lista.
  const prazosVencidos = [...prazos.values()].filter((lista) => lista.some((p) => p.diasRestantes < 0)).length;

  const numeros: [string, number, LucideIcon][] = [
    // Carteira e paradas vêm do banco (sem o limite de linhas da lista); se ele falhar, contam a lista.
    ["Obras na Engenharia", indicadores?.carteira.total ?? totalObras, HardHat],
    ["Precisam de você", tarefasMinhas.length + acoes.length, BellRing],
    ["Aguardando terceiros", comTerceiros.length, Hourglass],
    ["Paradas", indicadores?.carteira.paradas ?? paradas, CirclePause],
    ["Prazos vencidos", prazosVencidos, CalendarX],
    ["Tarefas atrasadas", atrasadas, AlarmClock],
  ];

  return (
    <>
      {/* Indicadores numa superfície só, separados por fios (como no Início), sem um cartão por número. */}
      <div className="painel overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-linha sm:grid-cols-3 lg:grid-cols-6">
          {numeros.map(([rotulo, valor, Icone]) => (
            <div key={rotulo} className="flex min-w-0 flex-col gap-2 bg-superficie p-4 md:p-5">
              <dt className="flex min-w-0 items-center gap-2 text-xs font-medium text-texto-2">
                <Icone size={15} className="shrink-0 text-dourado-texto" aria-hidden />
                <span className="truncate">{rotulo}</span>
              </dt>
              <dd className="font-titulo text-3xl font-light tracking-tight text-texto tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Cartao titulo="Precisa de você">
        {nada ? (
          <p className="text-sm text-zinc-500">Nenhuma ação pendente para você agora.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {tarefasMinhas.length > 0 && (
              <section aria-label="Tarefas">
                <h3 className="mb-2 text-sm font-medium text-texto">
                  Tarefas <span className="text-zinc-500">({tarefasMinhas.length})</span>
                </h3>
                <ListaTarefasSetor tarefas={tarefasMinhas} membrosPorSetor={membrosPorSetor} vazio="" />
              </section>
            )}
            {acoes.length > 0 && (
              <section aria-label="Próximas ações nas obras">
                <h3 className="mb-2 text-sm font-medium text-texto">
                  Obras <span className="text-zinc-500">({acoes.length})</span>
                </h3>
                <ListaObras obras={acoes} prazos={prazos} acao />
              </section>
            )}
          </div>
        )}
      </Cartao>

      <Cartao titulo={`Aguardando terceiros (${comTerceiros.length})`}>
        {comTerceiros.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma obra esperando cliente, fornecedor ou concessionária.</p>
        ) : (
          <ListaObras obras={comTerceiros} prazos={prazos} acao />
        )}
      </Cartao>

      <Cartao
        titulo={`Obras na Engenharia (${totalObras})`}
        acao={
          <nav aria-label="Visão da carteira" className="flex gap-2">
            <Aba href={hrefCentral({ carteira: "lista", periodo })} atual={carteira === "lista"}>
              Lista
            </Aba>
            <Aba href={hrefCentral({ carteira: "kanban", periodo })} atual={carteira === "kanban"}>
              Kanban
            </Aba>
          </nav>
        }
      >
        {carteira === "kanban" ? (
          <Kanban
            colunas={montarKanbanEngenharia(obras, (s) => rotuloStatus("engenharia", s), { exigencias, acoesVistoria, protocolos, checklistsAptos })}
            prazos={prazos}
          />
        ) : totalObras === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma obra em andamento na Engenharia.</p>
        ) : (
          <div role="region" aria-label="Carteira por etapa" className="flex flex-col gap-5">
            {grupos
              .filter((g) => g.obras.length > 0)
              .map((g) => (
                <section key={g.status} aria-label={g.rotulo}>
                  <h3 className="mb-2 text-sm font-medium text-texto">
                    {g.rotulo} <span className="text-zinc-500">({g.obras.length})</span>
                  </h3>
                  <ListaObras obras={g.obras} prazos={prazos} />
                </section>
              ))}
            {podeVerObras && (
              <Link href="/obras" className="w-fit text-sm text-zinc-600 underline hover:text-zinc-900">
                Ver carteira completa em Obras
              </Link>
            )}
          </div>
        )}
      </Cartao>

      {indicadores && (
        <Desempenho indicadores={indicadores} periodo={periodo} carteira={carteira} rotuloEtapa={(s) => rotuloStatus("engenharia", s)} />
      )}
    </>
  );
}

/** Desempenho do período: medianas em dias úteis e proporções, com o tamanho da amostra. Sem amostra, "—". */
function Desempenho({
  indicadores,
  periodo,
  carteira,
  rotuloEtapa,
}: {
  indicadores: IndicadoresEngenharia;
  periodo: PeriodoIndicadores;
  carteira: VisaoCarteira;
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
    <Cartao titulo="Desempenho">
      <div className="flex flex-col gap-4">
        <nav aria-label="Período" className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          Últimos
          {PERIODOS_INDICADORES.map((p) => (
            <Aba key={p} href={hrefCentral({ carteira, periodo: p })} atual={p === periodo}>
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
    </Cartao>
  );
}

/**
 * Carteira em colunas por fase (spec v1.3, seção 31). Só leitura: o cartão abre o card da obra, onde está o trabalho;
 * não há arrastar. No celular as fases ficam uma embaixo da outra; da largura média em diante, lado a lado com rolagem
 * dentro do quadro.
 */
function Kanban({ colunas, prazos }: { colunas: ColunaKanbanEngenharia[]; prazos: ReadonlyMap<string, PrazoObra[]> }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-zinc-500">A fase vem do que foi registrado na obra (etapa, checklist, protocolo e exigências). Para mudar, abra a obra.</p>
      <div role="region" aria-label="Kanban da carteira" className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2">
        {colunas.map((c) => (
          <section key={c.fase} aria-label={c.rotulo} className="flex flex-col gap-2 md:w-64 md:shrink-0">
            <h3 className="text-sm font-medium text-texto">
              {c.rotulo} <span className="text-zinc-500">({c.obras.length})</span>
            </h3>
            {c.obras.length === 0 ? (
              <p className="rounded-lg border border-dashed border-linha px-3 py-2 text-xs text-zinc-500">Nenhuma obra.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.obras.map((o) => (
                  <li key={o.id}>
                    <CartaoKanban obra={o} prazos={prazos.get(o.id) ?? []} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function CartaoKanban({ obra: o, prazos }: { obra: ObraNaEngenharia; prazos: PrazoObra[] }) {
  const tempo = ha(o.desde);
  return (
    <article className="flex flex-col gap-1.5 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-sm transition-colors duration-200 ease-raion hover:border-dourado/60">
      <p className="font-medium break-words text-texto">
        Obra #{o.numero} · {o.clienteNome}
      </p>
      <p className="text-xs text-zinc-500">
        {o.cidadeUf}
        {formatarPotencia(o.potenciaKwp)}
      </p>
      {o.proximaAcao && <p className="text-zinc-700">{o.proximaAcao}</p>}
      <p className="text-xs text-zinc-500">
        {o.principalNome ?? "Sem responsável"}
        {tempo ? ` · ${o.aguardando ? "aguardando" : "na etapa"} ${tempo}` : ""}
      </p>
      {(o.aguardando || o.estado === "parado" || prazos.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {o.aguardando && <Selo tom="atencao">{o.aguardando}</Selo>}
          {o.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
          {prazos.map((p) => {
            const selo = seloPrazo(p);
            return (
              <Selo key={p.chave} tom={selo.tom}>
                {selo.texto}
              </Selo>
            );
          })}
        </div>
      )}
      <Link
        href={`/engenharia/${o.id}`}
        aria-label={`Continuar a obra #${o.numero}`}
        className="mt-1 w-fit text-sm font-medium text-texto underline decoration-dourado underline-offset-4 hover:decoration-2"
      >
        Continuar
      </Link>
    </article>
  );
}

/** Linhas de obra. Com `acao`, destaca a próxima ação e a etapa; na carteira, só os dados da obra. */
function ListaObras({ obras, prazos, acao = false }: { obras: ObraNaEngenharia[]; prazos: ReadonlyMap<string, PrazoObra[]>; acao?: boolean }) {
  return (
    <ul className="divide-y divide-linha rounded-lg border border-linha">
      {obras.map((o) => {
        const tempo = ha(o.desde);
        return (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="min-w-0">
              {acao && o.proximaAcao && <p className="font-medium text-texto">{o.proximaAcao}</p>}
              <p className={`break-words ${acao ? "text-zinc-700" : "font-medium text-texto"}`}>
                <Link href={`/engenharia/${o.id}`} className="hover:underline">
                  Obra #{o.numero} · {o.clienteNome}
                </Link>
              </p>
              <p className="text-xs text-zinc-500">
                {acao ? o.statusRotulo : o.cidadeUf}
                {!acao && formatarPotencia(o.potenciaKwp)}
                {o.principalNome ? ` · ${o.principalNome}` : " · Sem responsável"}
                {tempo ? ` · ${o.aguardando ? "aguardando" : "na etapa"} ${tempo}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {o.aguardando && <Selo tom="atencao">{o.aguardando}</Selo>}
              {o.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
              {(prazos.get(o.id) ?? []).map((p) => {
                const selo = seloPrazo(p);
                return (
                  <Selo key={p.chave} tom={selo.tom}>
                    {selo.texto}
                  </Selo>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Aba({ href, atual, contagem = 0, children }: { href: string; atual: boolean; contagem?: number; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={atual ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${atual ? "border-dourado bg-dourado/10 text-texto" : "border-linha text-zinc-600 hover:border-dourado"}`}
    >
      {children}
      {contagem > 0 && (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-dourado px-1.5 text-xs font-semibold text-carvao">
          {contagem}
        </span>
      )}
    </Link>
  );
}
