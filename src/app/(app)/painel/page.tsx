import Link from "next/link";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarMoeda, tempoDesde } from "@/lib/crm";
import {
  carregarAtribuicoesPendentes,
  carregarIndicadores,
  carregarLeadsParadosPainel,
  carregarPropostasParadasPainel,
  carregarTarefasAtrasadasLista,
} from "@/lib/painel";
import { exigirPapel } from "@/lib/sessao";
import { LinhaAtribuicaoPendente } from "./atribuicoes-pendentes";
import { LinhaParado } from "./linha-parado";

export default async function Painel() {
  const { atual } = await exigirPapel("admin", "gestor");
  const config = await carregarConfiguracao(atual.empresaId);
  const [indicadores, atribuicoesPendentes, tarefasAtrasadas, leadsParados, propostasParadas] = await Promise.all([
    carregarIndicadores(atual.empresaId, config),
    carregarAtribuicoesPendentes(atual.empresaId),
    carregarTarefasAtrasadasLista(atual.empresaId, config),
    carregarLeadsParadosPainel(atual.empresaId, config.diasConsideradoParado),
    carregarPropostasParadasPainel(atual.empresaId, config.diasConsideradoParado),
  ]);
  const vendedores = config.membros.filter((m) => m.ativo && m.papel === "vendedor");
  const agora = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Painel</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Estatistica rotulo="Negócios ganhos" valor={indicadores.ganhos.total} destaque="positivo" />
        <Estatistica rotulo="Valor ganho" valor={formatarMoeda(indicadores.ganhos.valor)} destaque="positivo" />
        <Estatistica rotulo="Negócios perdidos" valor={indicadores.perdidos.total} destaque="negativo" />
        <Estatistica rotulo="Tarefas atrasadas" valor={indicadores.tarefasAtrasadas} destaque={indicadores.tarefasAtrasadas ? "negativo" : "neutro"} />
      </div>

      {atribuicoesPendentes.length > 0 && (
        <Cartao titulo={`Leads aguardando aprovação (${atribuicoesPendentes.length})`}>
          <p className="mb-2 text-sm text-zinc-600">
            O rodízio sugeriu um vendedor pra cada lead abaixo. Aprove a sugestão ou escolha outro vendedor — sem decisão, o
            lead é atribuído sozinho pro sugerido quando o prazo da origem vencer.
          </p>
          {atribuicoesPendentes.map((a) => (
            <LinhaAtribuicaoPendente
              key={a.id}
              atribuicao={a}
              minutosRestantes={Math.round((new Date(a.expiraEm).getTime() - agora.getTime()) / 60_000)}
              vendedores={vendedores}
            />
          ))}
        </Cartao>
      )}

      {tarefasAtrasadas.length > 0 && (
        <Cartao titulo={`Tarefas atrasadas (${tarefasAtrasadas.length})`}>
          <ul className="flex flex-col">
            {tarefasAtrasadas.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  {t.negocioId ? (
                    <Link href={`/negocios/${t.negocioId}`} className="truncate text-sm font-medium text-zinc-900 hover:underline">
                      {t.contatoNome ?? t.titulo}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium text-zinc-900">{t.titulo}</p>
                  )}
                  <p className="truncate text-xs text-zinc-500">
                    {t.contatoNome ? t.titulo : "Tarefa"}
                    {t.responsavelNome ? ` · ${t.responsavelNome}` : ""}
                  </p>
                </div>
                <Selo tom="negativo">{tempoDesde(t.venceEm, agora.getTime())}</Selo>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {leadsParados.length > 0 && (
        <Cartao titulo={`Leads parados (${leadsParados.length})`}>
          <p className="mb-2 text-sm text-zinc-600">
            Sem mudar de etapa nem ganhar uma nota nova há mais de {config.diasConsideradoParado} dias.
          </p>
          <ul className="flex flex-col">
            {leadsParados.map((n) => (
              <LinhaParado
                key={n.id}
                negocioId={n.id}
                numero={n.numero}
                titulo={n.titulo}
                contatoNome={n.contatoNome}
                responsavelId={n.responsavelId}
                ultimaAtividadeEm={n.ultimaAtividadeEm}
                agora={agora.getTime()}
                vendedores={vendedores}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {propostasParadas.length > 0 && (
        <Cartao titulo={`Propostas paradas (${propostasParadas.length})`}>
          <p className="mb-2 text-sm text-zinc-600">
            Proposta gerada, sem o cliente abrir de novo nem mudar de etapa há mais de {config.diasConsideradoParado} dias.
          </p>
          <ul className="flex flex-col">
            {propostasParadas.map((n) => (
              <LinhaParado
                key={n.id}
                negocioId={n.id}
                numero={n.numero}
                titulo={n.titulo}
                contatoNome={n.contatoNome}
                responsavelId={n.responsavelId}
                ultimaAtividadeEm={n.ultimaAtividadeEm}
                agora={agora.getTime()}
                vendedores={vendedores}
              />
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Leads por origem">
        {indicadores.porOrigem.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio cadastrado ainda.</p>
        ) : (
          <Tabela
            cabecalho={["Origem", "Negócios"]}
            linhas={indicadores.porOrigem.map((o) => [o.nome, String(o.total)])}
          />
        )}
      </Cartao>

      <Cartao titulo="Negócios em aberto por etapa">
        {indicadores.porEtapa.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio em aberto.</p>
        ) : (
          <Tabela
            cabecalho={["Funil", "Etapa", "Negócios", "Valor"]}
            linhas={indicadores.porEtapa.map((e) => [e.funil, e.etapa, String(e.total), formatarMoeda(e.valor)])}
          />
        )}
      </Cartao>

      <Cartao titulo="Desempenho por vendedor">
        {indicadores.porVendedor.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio com responsável definido ainda.</p>
        ) : (
          <Tabela
            cabecalho={["Vendedor", "Em aberto", "Ganhos", "Perdidos", "Valor ganho", "Tarefas atrasadas"]}
            linhas={indicadores.porVendedor.map((v) => [
              v.nome,
              String(v.abertos),
              String(v.ganhos),
              String(v.perdidos),
              formatarMoeda(v.valorGanho),
              String(v.atrasadas),
            ])}
          />
        )}
      </Cartao>
    </div>
  );
}

function Estatistica({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque: "positivo" | "negativo" | "neutro" }) {
  const cor = { positivo: "text-green-700", negativo: "text-red-700", neutro: "text-zinc-900" }[destaque];
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
      <p className={`text-2xl font-semibold ${cor}`}>{valor}</p>
      <p className="text-sm text-zinc-600">{rotulo}</p>
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-zinc-500">
            {cabecalho.map((c) => (
              <th key={c} className="py-1.5 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t border-zinc-100">
              {linha.map((valor, j) => (
                <td key={j} className="py-1.5 pr-4 text-zinc-800">
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
