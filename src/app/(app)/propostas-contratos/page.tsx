import Link from "next/link";
import { Botao, Selecao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusPagamentoContrato } from "@/lib/tipos";
import {
  ATALHOS_VENDA,
  ROTULO_NEGOCIO,
  ROTULO_PAGAMENTO,
  ROTULO_SITUACAO_CONTRATO,
  ROTULO_SITUACAO_PROPOSTA,
  carregarLinhasVenda,
  filtrarLinhasVenda,
  type AtalhoVenda,
  type LinhaVenda,
  type SituacaoContrato,
  type StatusNegocio,
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
  const responsaveisComLinha = [...new Set(linhas.map((l) => l.responsavelId).filter((id): id is string => !!id))]
    .map((id) => ({ id, nome: nomeMembro.get(id) ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const responsavel = veEquipe ? texto("responsavel") : "";
  const equipe = veEquipe ? equipes.get(texto("equipe")) : undefined;
  const responsaveis = responsavel ? new Set([responsavel]) : equipe?.membros;
  const atalho = umDe(Object.keys(ATALHOS_VENDA) as AtalhoVenda[], texto("atalho"));

  const visiveis = filtrarLinhasVenda(linhas, {
    busca: texto("q"),
    contrato: umDe(Object.keys(ROTULO_SITUACAO_CONTRATO) as SituacaoContrato[], texto("contrato")),
    pagamento: umDe([...(Object.keys(ROTULO_PAGAMENTO) as StatusPagamentoContrato[]), "sem" as const], texto("pagamento")),
    negocio: umDe(Object.keys(ROTULO_NEGOCIO) as StatusNegocio[], texto("negocio")),
    responsaveis,
    atalho,
  });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Propostas e contratos</h1>
        <p className="text-sm text-zinc-500">
          Negócios com proposta ou contrato: abertura da proposta, status do contrato, pagamento e situação do negócio.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(ATALHOS_VENDA) as AtalhoVenda[]).map((a) => (
          <Link
            key={a}
            href={atalho === a ? "/propostas-contratos" : `/propostas-contratos?atalho=${a}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              atalho === a ? "border-carvao bg-carvao text-offwhite" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            }`}
          >
            {ATALHOS_VENDA[a]}
          </Link>
        ))}
      </div>

      <form action="/propostas-contratos" className="flex flex-wrap items-center gap-2">
        {atalho && <input type="hidden" name="atalho" value={atalho} />}
        <input
          name="q"
          defaultValue={texto("q")}
          placeholder="Buscar cliente ou nº"
          className="min-w-56 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <Selecao name="contrato" defaultValue={texto("contrato")} aria-label="Contrato">
          <option value="">Contrato: todos</option>
          {Object.entries(ROTULO_SITUACAO_CONTRATO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
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
          <option value="sem">Sem pagamento (contrato não assinado)</option>
        </Selecao>
        <Selecao name="negocio" defaultValue={texto("negocio")} aria-label="Negócio">
          <option value="">Negócio: todos</option>
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
        <Link href="/propostas-contratos" className="text-xs text-zinc-500 underline hover:text-zinc-800">
          Limpar
        </Link>
      </form>

      <p className="text-xs text-zinc-500">
        {visiveis.length} de {linhas.length} negócio{linhas.length === 1 ? "" : "s"}
      </p>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          {linhas.length === 0 ? "Nenhum negócio com proposta ou contrato ainda." : "Nenhum negócio com esses filtros."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 font-medium">Negócio</th>
                {veEquipe && <th className="px-3 py-2 font-medium">Responsável</th>}
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Proposta</th>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">Pagamento</th>
                <th className="px-3 py-2 font-medium">Negócio</th>
                <th className="px-3 py-2 font-medium">Última movimentação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.negocioId} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                  <td className="px-3 py-2">
                    <Link href={`/negocios/${l.negocioId}`} className="font-medium text-zinc-900 hover:text-dourado hover:underline">
                      #{l.numero} {l.clienteNome}
                    </Link>
                    {l.titulo !== l.clienteNome && <p className="truncate text-xs text-zinc-500">{l.titulo}</p>}
                  </td>
                  {veEquipe && (
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-700">{l.responsavelId ? (nomeMembro.get(l.responsavelId) ?? "—") : "—"}</td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{l.valor != null ? formatarMoeda(l.valor) : "—"}</td>
                  <td className="px-3 py-2">
                    <Selo tom={TOM_PROPOSTA[l.proposta]}>{ROTULO_SITUACAO_PROPOSTA[l.proposta]}</Selo>
                    {l.propostaUltimaAbertura && (
                      <p className="mt-0.5 text-xs whitespace-nowrap text-zinc-500">
                        {l.propostaAberturas}× · última {formatarDataHora(l.propostaUltimaAbertura)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Selo tom={TOM_CONTRATO[l.contrato]}>{ROTULO_SITUACAO_CONTRATO[l.contrato]}</Selo>
                  </td>
                  <td className="px-3 py-2">
                    {l.pagamento ? <Selo tom={TOM_PAGAMENTO[l.pagamento]}>{ROTULO_PAGAMENTO[l.pagamento]}</Selo> : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Selo tom={TOM_NEGOCIO[l.negocio]}>{ROTULO_NEGOCIO[l.negocio]}</Selo>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{formatarDataHora(l.ultimaMovimentacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
