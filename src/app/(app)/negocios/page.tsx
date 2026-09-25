import Link from "next/link";
import { Botao, Selecao } from "@/components/ui";
import { carregarConfiguracao, formatarMoeda, tempoDesde } from "@/lib/crm";
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
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("negocios")
    .select("id, numero, titulo, valor, etapa_id, etapa_desde, origem_id, responsavel_id, contatos!inner(nome, telefone, email)")
    .eq("empresa_id", atual.empresaId)
    .eq("funil_id", funil.id)
    .eq("status", "aberto")
    .order("etapa_desde", { ascending: false })
    .limit(500);
  if (texto("responsavel")) consulta = consulta.eq("responsavel_id", texto("responsavel"));
  if (texto("origem")) consulta = consulta.eq("origem_id", texto("origem"));
  const busca = texto("q").replace(/[%,()]/g, "").trim();
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    consulta = consulta.or(
      [`nome.ilike.%${busca}%`, `email.ilike.%${busca}%`, ...(digitos.length >= 4 ? [`telefone_digitos.like.%${digitos}%`] : [])].join(","),
      { referencedTable: "contatos" },
    );
  }
  const { data } = await consulta;

  const cards = montarCards(data ?? [], config);

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
      <Kanban key={cards.map((c) => c.id + c.etapaId).join()} colunas={colunas} cards={cards} />
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
  contatos: unknown;
};

function montarCards(linhas: LinhaNegocio[], config: Awaited<ReturnType<typeof carregarConfiguracao>>): Card[] {
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeOrigem = new Map(config.origens.map((o) => [o.id, o.nome]));
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
  }));
}
