import { Briefcase, CalendarClock, Plus, Search, Settings2, Thermometer, TrendingUp, Wallet, X } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Botao, CLASSE_ENTRADA, Campo, Selecao } from "@/components/ui";
import {
  carregarConfiguracao,
  fimDaSemana,
  formatarMoeda,
  inicioDoDia,
  situacaoPrazo,
  tempoDesde,
} from "@/lib/crm";
import { COOKIE_VISAO_NEGOCIOS, exigirPapel } from "@/lib/sessao";
import { FILTRAR_NEGOCIOS_POR_RESPONSAVEL, NEGOCIOS, REGRAS_TEMPERATURA, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTemperaturas, type TemperaturaNegocio } from "@/lib/temperatura";
import { NovoNegocio, type TipoNegocio } from "@/components/novo-negocio";
import { eletropostoDisponivel } from "@/lib/eletroposto-servidor";
import { BotaoFiltros } from "./filtros";
import { Indicadores, type Indicador } from "./indicadores";
import { Kanban, type Card } from "./kanban";
import { ListaArquivados, ListaFechados, ListaNegocios } from "./lista";
import { VisaoToggle } from "./visao-toggle";

function dataLimite(diasAtras: number) {
  return new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString();
}

function agoraMs() {
  return Date.now();
}

export default async function Negocios({ searchParams }: PageProps<"/negocios">) {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const filtros = await searchParams;
  const texto = (k: string) => (typeof filtros[k] === "string" ? (filtros[k] as string) : "");

  const config = await carregarConfiguracao(atual.empresaId);
  const funisAtivos = config.funis.filter((f) => f.ativo);
  const funil = funisAtivos.find((f) => f.id === texto("funil")) ?? funisAtivos[0];
  if (!funil) return <p className="text-sm text-zinc-600">Nenhum funil ativo. Peça ao admin para criar um.</p>;

  const colunas = config.etapas.filter((e) => e.funilId === funil.id && e.ativa);
  // "arquivado" (P1a-0): só os arquivados, de qualquer situação. Nas demais visões eles ficam de fora.
  const status = (["aberto", "ganho", "perdido", "arquivado"] as const).find((s) => s === texto("status")) ?? "aberto";
  const etiqueta = config.etiquetas.find((e) => e.id === texto("etiqueta"));
  const etapaFiltro = colunas.find((e) => e.id === texto("etapa"));
  const valorMin = texto("valorMin") ? Number(texto("valorMin")) : null;
  const valorMax = texto("valorMax") ? Number(texto("valorMax")) : null;
  const atrasados = texto("atrasados") === "1";
  const semProxima = texto("semProxima") === "1";

  const visao = (["kanban", "lista"] as const).find((v) => v === texto("visao")) ?? ((await cookies()).get(COOKIE_VISAO_NEGOCIOS)?.value as "kanban" | "lista" | undefined) ?? "kanban";

  const supabase = await criarClienteServidor();
  const eletroposto = await eletropostoDisponivel(supabase, atual);
  const consultaBase = supabase
    .from("negocios")
    .select(
      `id, numero, titulo, tipo, valor, etapa_id, etapa_desde, updated_at, origem_id, responsavel_id, fechado_em, motivo_perda_id,
       arquivado_em, motivo_arquivamento, contatos!inner(nome, telefone, email), negocio_etiquetas${etiqueta ? "!inner" : ""}(etiqueta_id)`,
    )
    .eq("empresa_id", atual.empresaId)
    .eq("funil_id", funil.id);
  let consulta = (
    status === "arquivado"
      ? consultaBase.not("arquivado_em", "is", null).order("arquivado_em", { ascending: false })
      : consultaBase
          .eq("status", status)
          .is("arquivado_em", null)
          .order(status === "aberto" ? "etapa_desde" : "fechado_em", { ascending: false })
  ).limit(500);
  if (texto("responsavel")) consulta = consulta.eq("responsavel_id", texto("responsavel"));
  if (texto("origem")) consulta = consulta.eq("origem_id", texto("origem"));
  if (etiqueta) consulta = consulta.eq("negocio_etiquetas.etiqueta_id", etiqueta.id);
  if (etapaFiltro) consulta = consulta.eq("etapa_id", etapaFiltro.id);
  if (texto("criadoDe")) consulta = consulta.gte("created_at", texto("criadoDe"));
  if (texto("criadoAte")) consulta = consulta.lte("created_at", `${texto("criadoAte")}T23:59:59`);
  if (valorMin != null && Number.isFinite(valorMin)) consulta = consulta.gte("valor", valorMin);
  if (valorMax != null && Number.isFinite(valorMax)) consulta = consulta.lte("valor", valorMax);
  const busca = texto("q")
    .replace(/[%,()]/g, "")
    .trim();
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    consulta = consulta.or(
      [
        `nome.ilike.%${busca}%`,
        `email.ilike.%${busca}%`,
        ...(digitos.length >= 4 ? [`telefone_digitos.like.%${digitos}%`] : []),
      ].join(","),
      { referencedTable: "contatos" },
    );
  }
  const trintaDiasAtras = dataLimite(30);
  const [{ data }, { data: pendentes }, { data: notas }, { count: ganhos30d }, { count: perdidos30d }] = await Promise.all([
    consulta,
    // Tarefas em aberto dos negócios, para o indicador de próxima ação no card.
    supabase
      .from("tarefas")
      .select("negocio_id, vence_em, titulo")
      .eq("empresa_id", atual.empresaId)
      .is("concluida_em", null)
      .not("negocio_id", "is", null)
      .order("vence_em")
      .limit(5000),
    // Contagem de comentários (notas) por negócio, pro ícone de balão no card.
    supabase.from("notas").select("negocio_id").eq("empresa_id", atual.empresaId).limit(5000),
    // Contagens pra taxa de conversão (só faz sentido na visão "aberto").
    status === "aberto"
      ? supabase
          .from("negocios")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", atual.empresaId)
          .eq("funil_id", funil.id)
          .eq("status", "ganho")
          .gte("fechado_em", trintaDiasAtras)
      : { count: 0 },
    status === "aberto"
      ? supabase
          .from("negocios")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", atual.empresaId)
          .eq("funil_id", funil.id)
          .eq("status", "perdido")
          .gte("fechado_em", trintaDiasAtras)
      : { count: 0 },
  ]);

  // Temperatura só existe para negócio aberto (o banco ignora os demais).
  const temperaturas = status === "aberto" ? await carregarTemperaturas(supabase, (data ?? []).map((n) => n.id)) : new Map();
  let cards = montarCards(data ?? [], config, pendentes ?? [], notas ?? [], temperaturas, eletroposto);
  if (atrasados) cards = cards.filter((c) => c.tarefa === "atrasada");
  if (semProxima) cards = cards.filter((c) => c.tarefa === "nenhuma");

  const podeFiltrarResponsavel = pode(atual.papel, FILTRAR_NEGOCIOS_POR_RESPONSAVEL);

  // Base de todos os filtros ativos, usada para montar os links (alternância de visão, chips, limpar filtros)
  // sem perder o que já está escolhido.
  const baseParams: Record<string, string> = {};
  for (const [chave, valor] of Object.entries({
    funil: funil.id,
    status,
    q: busca,
    responsavel: texto("responsavel"),
    origem: texto("origem"),
    etiqueta: etiqueta?.id ?? "",
    etapa: etapaFiltro?.id ?? "",
    criadoDe: texto("criadoDe"),
    criadoAte: texto("criadoAte"),
    valorMin: texto("valorMin"),
    valorMax: texto("valorMax"),
    atrasados: atrasados ? "1" : "",
    semProxima: semProxima ? "1" : "",
  })) {
    if (valor) baseParams[chave] = valor;
  }
  const paraQuery = (params: Record<string, string>) => new URLSearchParams(params).toString();
  const queryVisao = paraQuery(baseParams);
  const linkLimpar = `/negocios?${paraQuery({ funil: funil.id, status, ...(visao !== "kanban" ? { visao } : {}) })}`;

  const chips: { rotulo: string; remover: string }[] = [];
  const semChave = (...chaves: string[]) => {
    const p = { ...baseParams };
    for (const c of chaves) delete p[c];
    return `/negocios?${paraQuery(p)}${visao !== "kanban" ? `${paraQuery(p) ? "&" : ""}visao=${visao}` : ""}`;
  };
  if (busca) chips.push({ rotulo: `Busca: "${busca}"`, remover: semChave("q") });
  if (texto("responsavel")) {
    const nome = config.membros.find((m) => m.id === texto("responsavel"))?.nome ?? "";
    chips.push({ rotulo: `Responsável: ${nome}`, remover: semChave("responsavel") });
  }
  if (texto("origem")) {
    const nome = config.origens.find((o) => o.id === texto("origem"))?.nome ?? "";
    chips.push({ rotulo: `Origem: ${nome}`, remover: semChave("origem") });
  }
  if (etiqueta) chips.push({ rotulo: `Etiqueta: ${etiqueta.nome}`, remover: semChave("etiqueta") });
  if (etapaFiltro) chips.push({ rotulo: `Etapa: ${etapaFiltro.nome}`, remover: semChave("etapa") });
  if (texto("criadoDe") || texto("criadoAte")) {
    chips.push({ rotulo: "Período de criação", remover: semChave("criadoDe", "criadoAte") });
  }
  if (texto("valorMin") || texto("valorMax")) {
    chips.push({ rotulo: "Faixa de valor", remover: semChave("valorMin", "valorMax") });
  }
  if (atrasados) chips.push({ rotulo: "Com tarefa atrasada", remover: semChave("atrasados") });
  if (semProxima) chips.push({ rotulo: "Sem próxima atividade", remover: semChave("semProxima") });

  // Filtros da janela "Filtros" que estão em uso (a busca e a situação ficam à vista, fora da contagem).
  const filtrosAtivos = [
    texto("responsavel"),
    texto("origem"),
    etiqueta,
    etapaFiltro,
    texto("criadoDe") || texto("criadoAte"),
    texto("valorMin") || texto("valorMax"),
    atrasados,
    semProxima,
  ].filter(Boolean).length;
  const situacoes = [
    { valor: "aberto", rotulo: "Em andamento" },
    { valor: "ganho", rotulo: "Ganhos" },
    { valor: "perdido", rotulo: "Perdidos" },
    { valor: "arquivado", rotulo: "Arquivados" },
  ] as const;
  const linkSituacao = (s: (typeof situacoes)[number]["valor"]) =>
    `/negocios?${paraQuery({ ...baseParams, status: s })}${visao !== "kanban" ? `&visao=${visao}` : ""}`;

  const agora = agoraMs();
  const indicadores: Indicador[] = [
    { Icone: Briefcase, valor: String(cards.length), legenda: "Negócios em andamento" },
    {
      Icone: Wallet,
      valor: formatarMoeda(cards.reduce((soma, c) => soma + (c.valorNumerico ?? 0), 0)) || "R$ 0,00",
      legenda: "Valor potencial",
    },
    {
      Icone: TrendingUp,
      valor: (() => {
        const fechados = (ganhos30d ?? 0) + (perdidos30d ?? 0);
        return fechados > 0 ? `${Math.round(((ganhos30d ?? 0) / fechados) * 100)}%` : "—";
      })(),
      legenda: "Taxa de conversão (30 dias)",
    },
    {
      Icone: CalendarClock,
      valor: String(
        cards.filter(
          (c) => c.tarefaVenceEm && new Date(c.tarefaVenceEm).getTime() >= inicioDoDia(agora) && new Date(c.tarefaVenceEm).getTime() <= fimDaSemana(agora),
        ).length,
      ),
      legenda: "Vencem esta semana",
    },
  ];

  return (
    <div className="flex animate-entrar flex-col gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Negócios</h1>
          <p className="text-sm text-texto-2">{funisAtivos.length > 1 ? `Funil ${funil.nome}` : "Seu funil de vendas, etapa por etapa."}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {status === "aberto" && <VisaoToggle visao={visao} query={queryVisao ? `${queryVisao}&` : ""} />}
          {atual.papel === "admin" && (
            <Link
              href="/configuracoes/funil"
              aria-label="Editar etapas"
              title="Editar etapas"
              className="hidden min-h-9 items-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-sm font-medium text-texto transition-colors hover:border-dourado md:inline-flex"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              Editar etapas
            </Link>
          )}
          {pode(atual.papel, REGRAS_TEMPERATURA) && (
            <Link
              href="/configuracoes/temperatura"
              aria-label="Regras de temperatura"
              title="Regras de temperatura"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-sm font-medium text-texto transition-colors hover:border-dourado md:min-h-9"
            >
              <Thermometer className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">Temperatura</span>
            </Link>
          )}
          <NovoNegocio
            href={`/negocios/novo?funil=${funil.id}`}
            eletroposto={eletroposto}
            aria-label="Adicionar negócio"
            className="inline-flex min-h-11 w-11 items-center justify-center gap-1.5 rounded-lg bg-acao px-0 py-2 text-sm font-medium text-sobre-acao transition-[background-color,transform] duration-200 ease-raion outline-none hover:bg-acao-forte focus-visible:ring-2 focus-visible:ring-dourado/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fundo active:scale-[0.98] md:min-h-9 md:w-auto md:px-4"
          >
            <Plus className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
            <span className="hidden md:inline">Adicionar negócio</span>
          </NovoNegocio>
        </div>
      </header>

      <nav aria-label="Situação" className="-mx-4 flex gap-1 overflow-x-auto border-b border-linha px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {situacoes.map((s) => (
          <Link
            key={s.valor}
            href={linkSituacao(s.valor)}
            aria-current={status === s.valor ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${
              status === s.valor ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
            }`}
          >
            {s.rotulo}
          </Link>
        ))}
      </nav>

      <form className="flex flex-col gap-3" action="/negocios">
        <input type="hidden" name="status" value={status} />
        {visao !== "kanban" && <input type="hidden" name="visao" value={visao} />}
        {funisAtivos.length <= 1 && <input type="hidden" name="funil" value={funil.id} />}
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-2" aria-hidden />
            <input name="q" type="search" defaultValue={busca} placeholder="Buscar por nome, telefone ou e-mail" className={`${CLASSE_ENTRADA} w-full pl-9 text-sm`} />
          </label>
          <BotaoFiltros ativos={filtrosAtivos}>
            {funisAtivos.length > 1 && (
              <Selecao rotulo="Funil" name="funil" defaultValue={funil.id}>
                {funisAtivos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
            )}
            {podeFiltrarResponsavel && (
              <Selecao rotulo="Responsável" name="responsavel" defaultValue={texto("responsavel")}>
                <option value="">Todos os responsáveis</option>
                {config.membros
                  .filter((m) => m.ativo)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </Selecao>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Selecao rotulo="Etapa" name="etapa" defaultValue={etapaFiltro?.id ?? ""}>
                <option value="">Todas as etapas</option>
                {colunas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
              <Selecao rotulo="Origem" name="origem" defaultValue={texto("origem")}>
                <option value="">Todas as origens</option>
                {config.origens.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
              {config.etiquetas.length > 0 && (
                <Selecao rotulo="Etiqueta" name="etiqueta" defaultValue={etiqueta?.id ?? ""}>
                  <option value="">Todas as etiquetas</option>
                  {config.etiquetas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Criado de" type="date" name="criadoDe" defaultValue={texto("criadoDe")} />
              <Campo rotulo="Criado até" type="date" name="criadoAte" defaultValue={texto("criadoAte")} />
              <Campo rotulo="Valor mínimo" type="number" name="valorMin" defaultValue={texto("valorMin")} min={0} />
              <Campo rotulo="Valor máximo" type="number" name="valorMax" defaultValue={texto("valorMax")} min={0} />
            </div>
            <div className="flex flex-col gap-1 text-sm text-texto">
              <label className="flex min-h-11 items-center gap-2.5">
                <input type="checkbox" name="atrasados" value="1" defaultChecked={atrasados} className="h-4 w-4" />
                Só com tarefa atrasada
              </label>
              <label className="flex min-h-11 items-center gap-2.5">
                <input type="checkbox" name="semProxima" value="1" defaultChecked={semProxima} className="h-4 w-4" />
                Sem próxima atividade
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={linkLimpar}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linha text-sm font-medium text-texto hover:border-dourado md:min-h-9"
              >
                Limpar
              </Link>
              <Botao type="submit">Aplicar filtros</Botao>
            </div>
          </BotaoFiltros>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <Link
                key={c.rotulo}
                href={c.remover}
                aria-label={`Remover filtro ${c.rotulo}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-superficie-2 px-3 text-xs text-texto transition-colors hover:bg-linha"
              >
                {c.rotulo}
                <X size={12} aria-hidden />
              </Link>
            ))}
            <Link href={linkLimpar} className="px-2 text-xs text-texto-2 underline underline-offset-2 hover:text-texto">
              Limpar filtros
            </Link>
          </div>
        )}
      </form>
      {status === "aberto" && <Indicadores itens={indicadores} />}
      {status === "arquivado" ? (
        <ListaArquivados cards={cards} linhas={data ?? []} />
      ) : status === "aberto" ? (
        visao === "kanban" ? (
          <Kanban
            key={cards.map((c) => c.id + c.etapaId).join()}
            colunas={colunas}
            cards={cards}
            funilId={funil.id}
            eletroposto={eletroposto}
            etiquetas={config.etiquetas.filter((e) => e.ativa)}
            motivos={config.motivos}
          />
        ) : (
          <ListaNegocios cards={cards} colunas={colunas} motivos={config.motivos} />
        )
      ) : (
        <ListaFechados status={status} cards={cards} linhas={data ?? []} motivos={config.motivos} />
      )}
    </div>
  );
}

type LinhaNegocio = {
  id: string;
  numero: number;
  titulo: string;
  tipo: TipoNegocio;
  valor: number | null;
  etapa_id: string;
  etapa_desde: string;
  updated_at: string;
  origem_id: string | null;
  responsavel_id: string | null;
  fechado_em: string | null;
  motivo_perda_id: string | null;
  arquivado_em: string | null;
  motivo_arquivamento: string | null;
  contatos: unknown;
  negocio_etiquetas: { etiqueta_id: string }[];
};

type Configuracao = Awaited<ReturnType<typeof carregarConfiguracao>>;

function montarCards(
  linhas: LinhaNegocio[],
  config: Configuracao,
  pendentes: { negocio_id: string | null; vence_em: string; titulo: string }[],
  notas: { negocio_id: string }[],
  temperaturas: Map<string, TemperaturaNegocio>,
  eletroposto: boolean,
): Card[] {
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeOrigem = new Map(config.origens.map((o) => [o.id, o.nome]));
  const etiquetas = new Map(config.etiquetas.map((e) => [e.id, e]));
  // Vêm ordenadas pelo prazo: a primeira de cada negócio é a próxima.
  const proxima = new Map<string, { vence_em: string; titulo: string }>();
  for (const t of pendentes) if (t.negocio_id && !proxima.has(t.negocio_id)) proxima.set(t.negocio_id, t);
  const contagemNotas = new Map<string, number>();
  for (const n of notas) contagemNotas.set(n.negocio_id, (contagemNotas.get(n.negocio_id) ?? 0) + 1);
  const agora = Date.now();
  return linhas.map((n) => {
    const tarefaProxima = proxima.get(n.id);
    return {
      id: n.id,
      numero: n.numero,
      titulo: n.titulo,
      contato: (n.contatos as { nome: string }).nome,
      responsavel: n.responsavel_id ? (nomeMembro.get(n.responsavel_id) ?? "") : "Sem responsável",
      origem: n.origem_id ? (nomeOrigem.get(n.origem_id) ?? null) : null,
      valor: formatarMoeda(n.valor),
      valorNumerico: n.valor,
      etapaId: n.etapa_id,
      desde: tempoDesde(n.etapa_desde, agora),
      atualizadoEm: n.updated_at,
      tarefa: tarefaProxima ? situacaoPrazo(tarefaProxima.vence_em, agora) : "nenhuma",
      tarefaTitulo: tarefaProxima?.titulo ?? null,
      tarefaVenceEm: tarefaProxima?.vence_em ?? null,
      etiquetas: n.negocio_etiquetas.flatMap((ne) => {
        const e = etiquetas.get(ne.etiqueta_id);
        return e ? [{ id: e.id, nome: e.nome, cor: e.cor }] : [];
      }),
      comentarios: contagemNotas.get(n.id) ?? 0,
      temperatura: temperaturas.get(n.id) ?? null,
      // Sem o módulo, o selo só marca o negócio de eletroposto que já existir; solar segue sem selo.
      tipo: eletroposto || n.tipo === "eletroposto" ? n.tipo : null,
    };
  });
}
