import { Briefcase, CalendarClock, SlidersHorizontal, Settings2, TrendingUp, Wallet, X } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Botao, Campo, Selecao } from "@/components/ui";
import {
  carregarConfiguracao,
  fimDaSemana,
  formatarMoeda,
  inicioDoDia,
  situacaoPrazo,
  tempoDesde,
} from "@/lib/crm";
import { COOKIE_VISAO_NEGOCIOS, exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Indicadores, type Indicador } from "./indicadores";
import { Kanban, type Card } from "./kanban";
import { ListaFechados, ListaNegocios } from "./lista";
import { VisaoToggle } from "./visao-toggle";

function dataLimite(diasAtras: number) {
  return new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString();
}

function agoraMs() {
  return Date.now();
}

export default async function Negocios({ searchParams }: PageProps<"/negocios">) {
  const { atual } = await exigirPapel();
  const filtros = await searchParams;
  const texto = (k: string) => (typeof filtros[k] === "string" ? (filtros[k] as string) : "");

  const config = await carregarConfiguracao(atual.empresaId);
  const funisAtivos = config.funis.filter((f) => f.ativo);
  const funil = funisAtivos.find((f) => f.id === texto("funil")) ?? funisAtivos[0];
  if (!funil) return <p className="text-sm text-zinc-600">Nenhum funil ativo. Peça ao admin para criar um.</p>;

  const colunas = config.etapas.filter((e) => e.funilId === funil.id && e.ativa);
  const status = (["aberto", "ganho", "perdido"] as const).find((s) => s === texto("status")) ?? "aberto";
  const etiqueta = config.etiquetas.find((e) => e.id === texto("etiqueta"));
  const etapaFiltro = colunas.find((e) => e.id === texto("etapa"));
  const valorMin = texto("valorMin") ? Number(texto("valorMin")) : null;
  const valorMax = texto("valorMax") ? Number(texto("valorMax")) : null;
  const atrasados = texto("atrasados") === "1";
  const semProxima = texto("semProxima") === "1";

  const visao = (["kanban", "lista"] as const).find((v) => v === texto("visao")) ?? ((await cookies()).get(COOKIE_VISAO_NEGOCIOS)?.value as "kanban" | "lista" | undefined) ?? "kanban";

  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("negocios")
    .select(
      `id, numero, titulo, valor, etapa_id, etapa_desde, updated_at, origem_id, responsavel_id, fechado_em, motivo_perda_id,
       contatos!inner(nome, telefone, email), negocio_etiquetas${etiqueta ? "!inner" : ""}(etiqueta_id)`,
    )
    .eq("empresa_id", atual.empresaId)
    .eq("funil_id", funil.id)
    .eq("status", status)
    .order(status === "aberto" ? "etapa_desde" : "fechado_em", { ascending: false })
    .limit(500);
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
  const [{ data }, { data: pendentes }, { count: ganhos30d }, { count: perdidos30d }] = await Promise.all([
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

  let cards = montarCards(data ?? [], config, pendentes ?? []);
  if (atrasados) cards = cards.filter((c) => c.tarefa === "atrasada");
  if (semProxima) cards = cards.filter((c) => c.tarefa === "nenhuma");

  const podeFiltrarResponsavel = atual.papel !== "vendedor";

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Negócios</h1>
          <p className="text-sm text-zinc-500">Acompanhe e gerencie todos os seus negócios no funil de vendas.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {status === "aberto" && <VisaoToggle visao={visao} query={queryVisao ? `${queryVisao}&` : ""} />}
          {atual.papel === "admin" && (
            <Link href="/configuracoes/funil">
              <Botao variante="secundario" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                Editar etapas
              </Botao>
            </Link>
          )}
          <Link href={`/negocios/novo?funil=${funil.id}`}>
            <Botao>Adicionar negócio</Botao>
          </Link>
        </div>
      </div>
      <form className="flex flex-col gap-2" action="/negocios">
        {visao !== "kanban" && <input type="hidden" name="visao" value={visao} />}
        <div className="flex flex-wrap items-center gap-2">
          {funisAtivos.length > 1 && (
            <Selecao name="funil" defaultValue={funil.id} aria-label="Funil">
              {funisAtivos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          )}
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="min-w-56 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          {podeFiltrarResponsavel && (
            <Selecao name="responsavel" defaultValue={texto("responsavel")} aria-label="Responsável">
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
          <Selecao name="status" defaultValue={status} aria-label="Situação">
            <option value="aberto">Em andamento</option>
            <option value="ganho">Ganhos</option>
            <option value="perdido">Perdidos</option>
          </Selecao>
          {config.etiquetas.length > 0 && (
            <Selecao name="etiqueta" defaultValue={etiqueta?.id ?? ""} aria-label="Etiqueta">
              <option value="">Todas as etiquetas</option>
              {config.etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </Selecao>
          )}
          <Selecao name="origem" defaultValue={texto("origem")} aria-label="Origem">
            <option value="">Todas as origens</option>
            {config.origens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
          <Botao type="submit" variante="secundario">
            Filtrar
          </Botao>
        </div>
        <details className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-zinc-700">
            <SlidersHorizontal size={14} /> Filtros avançados
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Selecao rotulo="Etapa" name="etapa" defaultValue={etapaFiltro?.id ?? ""}>
              <option value="">Todas as etapas</option>
              {colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
            <Campo rotulo="Criado de" type="date" name="criadoDe" defaultValue={texto("criadoDe")} />
            <Campo rotulo="Criado até" type="date" name="criadoAte" defaultValue={texto("criadoAte")} />
            <Campo rotulo="Valor mínimo" type="number" name="valorMin" defaultValue={texto("valorMin")} min={0} />
            <Campo rotulo="Valor máximo" type="number" name="valorMax" defaultValue={texto("valorMax")} min={0} />
            <label className="flex items-center gap-1.5 pb-2">
              <input type="checkbox" name="atrasados" value="1" defaultChecked={atrasados} />
              Só com tarefa atrasada
            </label>
            <label className="flex items-center gap-1.5 pb-2">
              <input type="checkbox" name="semProxima" value="1" defaultChecked={semProxima} />
              Sem próxima atividade
            </label>
            <Botao type="submit" variante="secundario">
              Aplicar
            </Botao>
          </div>
        </details>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <Link
                key={c.rotulo}
                href={c.remover}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-200"
              >
                {c.rotulo}
                <X size={11} />
              </Link>
            ))}
            <Link href={linkLimpar} className="text-xs text-zinc-500 underline hover:text-zinc-800">
              Limpar filtros
            </Link>
          </div>
        )}
      </form>
      {status === "aberto" && <Indicadores itens={indicadores} />}
      {status === "aberto" ? (
        visao === "kanban" ? (
          <Kanban key={cards.map((c) => c.id + c.etapaId).join()} colunas={colunas} cards={cards} funilId={funil.id} />
        ) : (
          <ListaNegocios cards={cards} colunas={colunas} />
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
  valor: number | null;
  etapa_id: string;
  etapa_desde: string;
  updated_at: string;
  origem_id: string | null;
  responsavel_id: string | null;
  fechado_em: string | null;
  motivo_perda_id: string | null;
  contatos: unknown;
  negocio_etiquetas: { etiqueta_id: string }[];
};

type Configuracao = Awaited<ReturnType<typeof carregarConfiguracao>>;

function montarCards(
  linhas: LinhaNegocio[],
  config: Configuracao,
  pendentes: { negocio_id: string | null; vence_em: string; titulo: string }[],
): Card[] {
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeOrigem = new Map(config.origens.map((o) => [o.id, o.nome]));
  const etiquetas = new Map(config.etiquetas.map((e) => [e.id, e]));
  // Vêm ordenadas pelo prazo: a primeira de cada negócio é a próxima.
  const proxima = new Map<string, { vence_em: string; titulo: string }>();
  for (const t of pendentes) if (t.negocio_id && !proxima.has(t.negocio_id)) proxima.set(t.negocio_id, t);
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
        return e ? [{ nome: e.nome, cor: e.cor }] : [];
      }),
    };
  });
}
