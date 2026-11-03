import { AlarmClock, Banknote, CircleX, Inbox, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarMoeda, tempoDesde } from "@/lib/crm";
import { contarAtribuicoesPendentes } from "@/lib/distribuicao-leads";
import {
  carregarIndicadores,
  carregarLeadsParadosPainel,
  carregarLeadsSemContatoPainel,
  carregarPropostasParadasPainel,
  carregarTarefasAtrasadasLista,
} from "@/lib/painel";
import { exigirPapel } from "@/lib/sessao";
import { GESTAO_COMERCIAL } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaParado } from "./linha-parado";
import { OportunidadesPendentes, type OportunidadePendente } from "./oportunidades-pendentes";

export default async function Painel() {
  const { atual } = await exigirPapel(...GESTAO_COMERCIAL);
  const config = await carregarConfiguracao(atual.empresaId);
  const [indicadores, leadsADistribuir, tarefasAtrasadas, leadsParados, propostasParadas, leadsSemContato, pendentes] = await Promise.all([
    carregarIndicadores(atual.empresaId, config),
    criarClienteServidor().then((supabase) => contarAtribuicoesPendentes(supabase, atual.empresaId)),
    carregarTarefasAtrasadasLista(atual.empresaId, config),
    carregarLeadsParadosPainel(atual.empresaId, config.diasConsideradoParado),
    carregarPropostasParadasPainel(atual.empresaId, config.diasConsideradoParado),
    carregarLeadsSemContatoPainel(atual.empresaId, config.horasConsideradoSemContato),
    // Lista restrita (colunas definidas no banco): pendências que este gestor/admin pode responder.
    criarClienteServidor().then((supabase) => supabase.rpc("oportunidades_pendentes_equipe", { p_empresa_id: atual.empresaId })),
  ]);
  const oportunidadesPendentes: OportunidadePendente[] = pendentes.data ?? [];
  // Falha na consulta não pode parecer "nenhuma pendência": o cartão avisa, sem detalhes internos.
  if (pendentes.error) console.error("Painel: falha ao carregar oportunidades pendentes", pendentes.error.code);
  const vendedores = config.membros.filter((m) => m.ativo && m.papel === "vendedor");
  const agora = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Gestão · Comercial"
        titulo="Painel"
        descricao={
          leadsADistribuir > 0
            ? `${leadsADistribuir} lead${leadsADistribuir === 1 ? "" : "s"} aguardando distribuição.`
            : "Resultados da equipe e o que precisa de atenção."
        }
        acoes={
          leadsADistribuir > 0 && (
            <Link href="/leads-a-distribuir" className={CLASSE_ACAO_CABECALHO}>
              <Inbox size={16} aria-hidden />
              Distribuir leads
            </Link>
          )
        }
      />

      {/* Indicadores numa superfície só, separados por fios (como no Início e na Engenharia). */}
      <div className="painel overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-linha sm:grid-cols-4">
          <Indicador Icone={Trophy} rotulo="Negócios ganhos" valor={indicadores.ganhos.total} destaque="positivo" />
          <Indicador Icone={Banknote} rotulo="Valor ganho" valor={formatarMoeda(indicadores.ganhos.valor)} destaque="positivo" />
          <Indicador Icone={CircleX} rotulo="Negócios perdidos" valor={indicadores.perdidos.total} destaque="negativo" />
          <Indicador
            Icone={AlarmClock}
            rotulo="Tarefas atrasadas"
            valor={indicadores.tarefasAtrasadas}
            destaque={indicadores.tarefasAtrasadas ? "negativo" : "neutro"}
          />
        </dl>
      </div>

      {pendentes.error && (
        <Cartao titulo="Oportunidades aguardando aceite">
          <p className="text-sm text-zinc-600">Não foi possível carregar as oportunidades aguardando aceite agora. Atualize a página em instantes.</p>
        </Cartao>
      )}

      {oportunidadesPendentes.length > 0 && (
        <Cartao titulo={`Oportunidades aguardando aceite (${oportunidadesPendentes.length})`}>
          <p className="mb-2 text-sm text-zinc-600">
            Enviadas pelo SDR a vendedores da sua equipe e ainda sem resposta. Você pode aceitar ou devolver em nome do vendedor.
          </p>
          <OportunidadesPendentes itens={oportunidadesPendentes} agoraMs={agora.getTime()} />
        </Cartao>
      )}

      {leadsSemContato.length > 0 && (
        <Cartao titulo={`Leads sem contato (${leadsSemContato.length})`}>
          <p className="mb-2 text-sm text-zinc-600">
            Leads novos, ainda na etapa inicial, sem nenhuma nota registrada há mais de {config.horasConsideradoSemContato} horas.
          </p>
          <ul className="flex flex-col">
            {leadsSemContato.map((n) => (
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

function Indicador({
  Icone,
  rotulo,
  valor,
  destaque,
}: {
  Icone: LucideIcon;
  rotulo: string;
  valor: string | number;
  destaque: "positivo" | "negativo" | "neutro";
}) {
  const cor = { positivo: "text-energia", negativo: "text-erro", neutro: "text-texto" }[destaque];
  const texto = String(valor);
  // Valores longos (dinheiro) encolhem para caber numa linha da célula; 0,6em é a largura média de um caractere.
  const tamanho = { fontSize: `min(1.875rem, calc(100cqi / ${(texto.length * 0.6).toFixed(2)}))` };
  return (
    <div className="@container flex min-w-0 flex-col gap-2 bg-superficie p-4 md:p-5">
      <dt className="flex min-w-0 items-center gap-2 text-xs font-medium text-texto-2">
        <Icone size={15} className="shrink-0 text-dourado-texto" aria-hidden />
        <span className="truncate">{rotulo}</span>
      </dt>
      <dd className={`font-titulo font-light tracking-tight whitespace-nowrap tabular-nums ${cor}`} style={tamanho}>
        {texto}
      </dd>
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
