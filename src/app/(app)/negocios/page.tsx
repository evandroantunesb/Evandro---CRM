import Link from "next/link";
import { Botao, Selecao } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda, situacaoPrazo, tempoDesde } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Kanban, type Card } from "./kanban";

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
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("negocios")
    .select(
      `id, numero, titulo, valor, etapa_id, etapa_desde, origem_id, responsavel_id, fechado_em, motivo_perda_id,
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
  const [{ data }, { data: pendentes }] = await Promise.all([
    consulta,
    // Tarefas em aberto dos negócios, para o indicador de próxima ação no card.
    supabase
      .from("tarefas")
      .select("negocio_id, vence_em")
      .eq("empresa_id", atual.empresaId)
      .is("concluida_em", null)
      .not("negocio_id", "is", null)
      .order("vence_em")
      .limit(5000),
  ]);

  const cards = montarCards(data ?? [], config, pendentes ?? []);

  const podeFiltrarResponsavel = atual.papel !== "vendedor";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Negócios</h1>
        <Link href={`/negocios/novo?funil=${funil.id}`} className="ml-auto">
          <Botao>Adicionar negócio</Botao>
        </Link>
      </div>
      <form className="flex flex-wrap items-center gap-2" action="/negocios">
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
      </form>
      {status === "aberto" ? (
        <Kanban key={cards.map((c) => c.id + c.etapaId).join()} colunas={colunas} cards={cards} />
      ) : (
        <ListaFechados status={status} cards={cards} linhas={data ?? []} config={config} />
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
  pendentes: { negocio_id: string | null; vence_em: string }[],
): Card[] {
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeOrigem = new Map(config.origens.map((o) => [o.id, o.nome]));
  const etiquetas = new Map(config.etiquetas.map((e) => [e.id, e]));
  // Vêm ordenadas pelo prazo: a primeira de cada negócio é a próxima.
  const proxima = new Map<string, string>();
  for (const t of pendentes) if (t.negocio_id && !proxima.has(t.negocio_id)) proxima.set(t.negocio_id, t.vence_em);
  const agora = Date.now();
  return linhas.map((n) => ({
    id: n.id,
    numero: n.numero,
    titulo: n.titulo,
    contato: (n.contatos as { nome: string }).nome,
    responsavel: n.responsavel_id ? (nomeMembro.get(n.responsavel_id) ?? "") : "Sem responsável",
    origem: n.origem_id ? (nomeOrigem.get(n.origem_id) ?? null) : null,
    valor: formatarMoeda(n.valor),
    etapaId: n.etapa_id,
    desde: tempoDesde(n.etapa_desde, agora),
    tarefa: proxima.has(n.id) ? situacaoPrazo(proxima.get(n.id)!, agora) : "nenhuma",
    etiquetas: n.negocio_etiquetas.flatMap((ne) => {
      const e = etiquetas.get(ne.etiqueta_id);
      return e ? [{ nome: e.nome, cor: e.cor }] : [];
    }),
  }));
}

function ListaFechados({
  status,
  cards,
  linhas,
  config,
}: {
  status: "ganho" | "perdido";
  cards: Card[];
  linhas: LinhaNegocio[];
  config: Configuracao;
}) {
  if (!cards.length) {
    return (
      <p className="text-sm text-zinc-600">
        Nenhum negócio {status === "ganho" ? "ganho" : "perdido"} com esses filtros.
      </p>
    );
  }
  const motivo = new Map(config.motivos.map((m) => [m.id, m.nome]));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Valor</th>
            <th className="px-3 py-2 font-medium">Responsável</th>
            <th className="px-3 py-2 font-medium">{status === "ganho" ? "Origem" : "Motivo"}</th>
            <th className="px-3 py-2 font-medium">Fechado em</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const l = porId.get(c.id)!;
            return (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <Link href={`/negocios/${c.id}`} className="font-medium text-amber-700 hover:underline">
                    {c.contato}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    #{c.numero} · {c.titulo}
                  </span>
                </td>
                <td className="px-3 py-2">{c.valor}</td>
                <td className="px-3 py-2">{c.responsavel}</td>
                <td className="px-3 py-2">
                  {status === "ganho" ? c.origem : l.motivo_perda_id ? motivo.get(l.motivo_perda_id) : ""}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{l.fechado_em ? formatarDataHora(l.fechado_em) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
