import Link from "next/link";
import type { ReactNode } from "react";
import { Botao, Selecao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusPagamentoContrato } from "@/lib/tipos";
import {
  ATALHOS_POR_VISAO,
  ATALHOS_VENDA,
  ROTULO_NEGOCIO,
  ROTULO_PAGAMENTO,
  ROTULO_SITUACAO_CONTRATO,
  ROTULO_SITUACAO_PROPOSTA,
  ROTULO_VISAO_VENDA,
  VISOES_VENDA,
  carregarLinhasVenda,
  linhasDaVisao,
  linhasVisiveis,
  responsaveisPermitidos,
  type LinhaVenda,
  type SituacaoContrato,
  type StatusNegocio,
  type VisaoVenda,
} from "@/lib/venda";

type Tom = "neutro" | "positivo" | "negativo" | "atencao";
const TOM_PROPOSTA: Record<LinhaVenda["proposta"], Tom> = { nao_gerada: "neutro", nunca_aberta: "atencao", aberta: "positivo" };
const TOM_CONTRATO: Record<SituacaoContrato, Tom> = {
  nao_gerado: "neutro",
  rascunho: "neutro",
  aguardando_assinatura: "atencao",
  assinado: "positivo",
};
const TOM_PAGAMENTO: Record<StatusPagamentoContrato, Tom> = { pendente: "atencao", confirmado: "positivo", estornado: "negativo" };
const TOM_NEGOCIO: Record<StatusNegocio, Tom> = { aberto: "neutro", ganho: "positivo", perdido: "negativo" };

const umDe = <T extends string>(valores: readonly T[], v: string): T | undefined => valores.find((x) => x === v);

export default async function PropostasContratos({ searchParams }: PageProps<"/propostas-contratos">) {
  // SDR fora: não gera proposta nem contrato (spec RAION_SDR_REGRAS_PERMISSOES §40/§41).
  const { atual } = await exigirPapel("admin", "gestor", "vendedor");
  const filtros = await searchParams;
  const texto = (k: string) => (typeof filtros[k] === "string" ? (filtros[k] as string) : "");
  const veEquipe = atual.papel === "admin" || atual.papel === "gestor";
  const visao: VisaoVenda = umDe(VISOES_VENDA, texto("visao")) ?? "propostas";

  const supabase = await criarClienteServidor();
  const [config, linhas, equipesRes] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    carregarLinhasVenda(supabase, atual.empresaId),
    veEquipe
      ? supabase
          .from("equipe_membros")
          .select("membro_id, equipes!inner(id, nome, ativa)")
          .eq("empresa_id", atual.empresaId)
          .eq("equipes.ativa", true)
      : Promise.resolve({ data: [] as { membro_id: string; equipes: unknown }[] }),
  ]);

  const equipes = new Map<string, { nome: string; membros: Set<string> }>();
  for (const em of equipesRes.data ?? []) {
    const e = em.equipes as unknown as { id: string; nome: string };
    const atualEquipe = equipes.get(e.id) ?? { nome: e.nome, membros: new Set<string>() };
    atualEquipe.membros.add(em.membro_id);
    equipes.set(e.id, atualEquipe);
  }
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));
  const nomeResponsavel = (l: LinhaVenda) => (l.responsavelId ? (nomeMembro.get(l.responsavelId) ?? "—") : "—");

  const daGuia = linhasDaVisao(linhas, visao);
  const responsaveisComLinha = [...new Set(daGuia.map((l) => l.responsavelId).filter((id): id is string => !!id))]
    .map((id) => ({ id, nome: nomeMembro.get(id) ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const responsavel = veEquipe ? texto("responsavel") : "";
  const equipe = veEquipe ? equipes.get(texto("equipe")) : undefined;
  const atalhos = ATALHOS_POR_VISAO[visao];
  const atalho = umDe(atalhos, texto("atalho"));

  const visiveis = linhasVisiveis(linhas, visao, {
    busca: texto("q"),
    contrato: umDe(Object.keys(ROTULO_SITUACAO_CONTRATO) as SituacaoContrato[], texto("contrato")),
    pagamento: umDe([...(Object.keys(ROTULO_PAGAMENTO) as StatusPagamentoContrato[]), "sem" as const], texto("pagamento")),
    negocio: umDe(Object.keys(ROTULO_NEGOCIO) as StatusNegocio[], texto("negocio")),
    responsaveis: responsaveisPermitidos(responsavel || undefined, equipe?.membros),
    atalho,
  });

  const base = `/propostas-contratos?visao=${visao}`;
  const vazio = daGuia.length === 0 ? (visao === "propostas" ? "Nenhuma proposta enviada ainda." : "Nenhum contrato gerado ainda.") : "Nenhum registro com esses filtros.";

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Propostas e contratos</h1>
        <p className="text-sm text-zinc-500">
          {visao === "propostas"
            ? "Propostas enviadas e se o cliente já viu."
            : "Contratos, assinatura e pagamento de cada venda."}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-zinc-200" aria-label="Visão">
        {VISOES_VENDA.map((v) => (
          <Link
            key={v}
            href={`/propostas-contratos?visao=${v}`}
            aria-current={v === visao ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              v === visao ? "border-dourado text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {ROTULO_VISAO_VENDA[v]} ({linhasDaVisao(linhas, v).length})
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        {atalhos.map((a) => (
          <Link
            key={a}
            href={atalho === a ? base : `${base}&atalho=${a}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              atalho === a ? "border-carvao bg-carvao text-offwhite" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            }`}
          >
            {ATALHOS_VENDA[a]}
          </Link>
        ))}
      </div>

      <form action="/propostas-contratos" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="visao" value={visao} />
        {atalho && <input type="hidden" name="atalho" value={atalho} />}
        <input
          name="q"
          defaultValue={texto("q")}
          placeholder="Buscar cliente ou nº"
          className="min-w-56 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        {visao === "contratos" && (
          <>
            <Selecao name="contrato" defaultValue={texto("contrato")} aria-label="Contrato">
              <option value="">Contrato: todos</option>
              {(Object.keys(ROTULO_SITUACAO_CONTRATO) as SituacaoContrato[])
                .filter((v) => v !== "nao_gerado")
                .map((v) => (
                  <option key={v} value={v}>
                    {ROTULO_SITUACAO_CONTRATO[v]}
                  </option>
                ))}
            </Selecao>
            <Selecao name="pagamento" defaultValue={texto("pagamento")} aria-label="Pagamento">
              <option value="">Pagamento: todos</option>
              {Object.entries(ROTULO_PAGAMENTO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
              <option value="sem">Contrato ainda não assinado</option>
            </Selecao>
          </>
        )}
        <Selecao name="negocio" defaultValue={texto("negocio")} aria-label="Situação do negócio">
          <option value="">Situação: todas</option>
          {Object.entries(ROTULO_NEGOCIO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
        {veEquipe && (
          <>
            <Selecao name="responsavel" defaultValue={responsavel} aria-label="Responsável">
              <option value="">Responsável: todos</option>
              {responsaveisComLinha.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Selecao>
            {equipes.size > 0 && (
              <Selecao name="equipe" defaultValue={texto("equipe")} aria-label="Equipe">
                <option value="">Equipe: todas</option>
                {[...equipes].map(([id, e]) => (
                  <option key={id} value={id}>
                    {e.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </>
        )}
        <Botao type="submit" variante="secundario">
          Filtrar
        </Botao>
        <Link href={base} className="text-xs text-zinc-500 underline hover:text-zinc-800">
          Limpar filtros
        </Link>
      </form>

      <p className="text-xs text-zinc-500">
        {visiveis.length} de {daGuia.length} {visao === "propostas" ? "proposta" : "contrato"}
        {daGuia.length === 1 ? "" : "s"}
      </p>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">{vazio}</p>
      ) : visao === "propostas" ? (
        <Propostas linhas={visiveis} veEquipe={veEquipe} nomeResponsavel={nomeResponsavel} />
      ) : (
        <Contratos linhas={visiveis} veEquipe={veEquipe} nomeResponsavel={nomeResponsavel} />
      )}
    </div>
  );
}

type PropsLista = { linhas: LinhaVenda[]; veEquipe: boolean; nomeResponsavel: (l: LinhaVenda) => string };

const valor = (l: LinhaVenda) => (l.valor != null ? formatarMoeda(l.valor) : "—");

function NegocioLink({ l }: { l: LinhaVenda }) {
  return (
    <>
      <Link href={`/negocios/${l.negocioId}`} className="font-medium text-zinc-900 hover:text-dourado hover:underline">
        #{l.numero} {l.clienteNome}
      </Link>
      {l.titulo !== l.clienteNome && <p className="truncate text-xs text-zinc-500">{l.titulo}</p>}
    </>
  );
}

/** Tabela só no desktop (rola na horizontal só se não couber); no celular, um card compacto por registro. */
function Lista({ cabecalho, linhas, celulas, card }: {
  cabecalho: string[];
  linhas: LinhaVenda[];
  celulas: (l: LinhaVenda) => ReactNode[];
  card: (l: LinhaVenda) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              {cabecalho.map((c, i) => (
                <th key={c} className={`px-3 py-2 font-medium whitespace-nowrap ${i === 0 ? "w-full" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.negocioId} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                {celulas(l).map((c, i) => (
                  // Cliente fica com o espaço que sobra (e pode quebrar); status, valor, responsável e
                  // datas nunca quebram — se não couber, a tabela rola na horizontal.
                  <td key={i} className={i === 0 ? "min-w-48 px-3 py-2" : "px-3 py-2 whitespace-nowrap"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {linhas.map((l) => (
          <li key={l.negocioId} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            {card(l)}
          </li>
        ))}
      </ul>
    </>
  );
}

function LinhaCard({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-500">{rotulo}</span>
      <span className="text-right whitespace-nowrap">{children}</span>
    </div>
  );
}

function Propostas({ linhas, veEquipe, nomeResponsavel }: PropsLista) {
  return (
    <Lista
      linhas={linhas}
      cabecalho={["Cliente", ...(veEquipe ? ["Responsável"] : []), "Valor", "Proposta", "Visualizações", "Última visualização", "Atualizado em"]}
      celulas={(l) => [
        <NegocioLink key="n" l={l} />,
        ...(veEquipe ? [<span key="r" className="whitespace-nowrap text-zinc-700">{nomeResponsavel(l)}</span>] : []),
        <span key="v" className="whitespace-nowrap">{valor(l)}</span>,
        <Selo key="p" tom={TOM_PROPOSTA[l.proposta]}>{ROTULO_SITUACAO_PROPOSTA[l.proposta]}</Selo>,
        <span key="a" className="text-zinc-700">{l.propostaAberturas}</span>,
        <span key="u" className="whitespace-nowrap text-zinc-600">{l.propostaUltimaAbertura ? formatarDataHora(l.propostaUltimaAbertura) : "—"}</span>,
        <span key="m" className="whitespace-nowrap text-zinc-600">{formatarDataHora(l.ultimaMovimentacao)}</span>,
      ]}
      card={(l) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <NegocioLink l={l} />
            </div>
            <span className="shrink-0 whitespace-nowrap"><Selo tom={TOM_PROPOSTA[l.proposta]}>{ROTULO_SITUACAO_PROPOSTA[l.proposta]}</Selo></span>
          </div>
          {veEquipe && <LinhaCard rotulo="Responsável">{nomeResponsavel(l)}</LinhaCard>}
          <LinhaCard rotulo="Valor">{valor(l)}</LinhaCard>
          <LinhaCard rotulo="Visualizações">
            {l.propostaAberturas}
            {l.propostaUltimaAbertura ? ` · última em ${formatarDataHora(l.propostaUltimaAbertura)}` : ""}
          </LinhaCard>
          <LinhaCard rotulo="Atualizado em">{formatarDataHora(l.ultimaMovimentacao)}</LinhaCard>
        </div>
      )}
    />
  );
}

function Contratos({ linhas, veEquipe, nomeResponsavel }: PropsLista) {
  const pagamento = (l: LinhaVenda) =>
    l.pagamento ? <Selo tom={TOM_PAGAMENTO[l.pagamento]}>{ROTULO_PAGAMENTO[l.pagamento]}</Selo> : <span className="text-xs text-zinc-400">Após assinatura</span>;
  return (
    <Lista
      linhas={linhas}
      cabecalho={["Cliente", ...(veEquipe ? ["Responsável"] : []), "Valor", "Contrato", "Pagamento", "Situação", "Atualizado em"]}
      celulas={(l) => [
        <NegocioLink key="n" l={l} />,
        ...(veEquipe ? [<span key="r" className="whitespace-nowrap text-zinc-700">{nomeResponsavel(l)}</span>] : []),
        <span key="v" className="whitespace-nowrap">{valor(l)}</span>,
        <Selo key="c" tom={TOM_CONTRATO[l.contrato]}>{ROTULO_SITUACAO_CONTRATO[l.contrato]}</Selo>,
        <span key="p">{pagamento(l)}</span>,
        <Selo key="s" tom={TOM_NEGOCIO[l.negocio]}>{ROTULO_NEGOCIO[l.negocio]}</Selo>,
        <span key="m" className="whitespace-nowrap text-zinc-600">{formatarDataHora(l.ultimaMovimentacao)}</span>,
      ]}
      card={(l) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <NegocioLink l={l} />
            </div>
            <span className="shrink-0 whitespace-nowrap"><Selo tom={TOM_CONTRATO[l.contrato]}>{ROTULO_SITUACAO_CONTRATO[l.contrato]}</Selo></span>
          </div>
          {veEquipe && <LinhaCard rotulo="Responsável">{nomeResponsavel(l)}</LinhaCard>}
          <LinhaCard rotulo="Valor">{valor(l)}</LinhaCard>
          <LinhaCard rotulo="Pagamento">{pagamento(l)}</LinhaCard>
          <LinhaCard rotulo="Situação">
            <Selo tom={TOM_NEGOCIO[l.negocio]}>{ROTULO_NEGOCIO[l.negocio]}</Selo>
          </LinhaCard>
          <LinhaCard rotulo="Atualizado em">{formatarDataHora(l.ultimaMovimentacao)}</LinhaCard>
        </div>
      )}
    />
  );
}
