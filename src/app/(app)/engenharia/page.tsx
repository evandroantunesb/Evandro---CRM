import { AlarmClock, BellRing, CalendarClock, CalendarX, CirclePause, HardHat, Hourglass, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO, CLASSE_SEGMENTO_CABECALHO, classeItemSegmentoCabecalho } from "@/components/cabecalho-pagina";
import { IniciarAtuacao } from "@/components/engenharia/iniciar-atuacao";
import { ListaTarefasSetor } from "@/components/tarefas-setor";
import { Cartao, CartaoRecolhivel } from "@/components/ui";
import { carregarChecklistsAptos } from "@/lib/engenharia-checklist";
import { agendaPrazos, cargaPorResponsavel, montarMeuDia, resumoFaixa, type JustificativaPendente } from "@/lib/engenharia-inicio";
import { carregarIndicadoresEngenharia, carregarPrazosObras } from "@/lib/engenharia-prazos";
import { lerPeriodo } from "@/lib/engenharia-prazos-regras";
import { carregarStatusProtocolos, contarExigenciasAbertas } from "@/lib/engenharia-protocolos";
import { montarCentralEngenharia, montarKanbanEngenharia, type ObraNaEngenharia } from "@/lib/engenharia-regras";
import { carregarAcoesVistoria } from "@/lib/engenharia-vistoria";
import { hojeEmSaoPaulo, saudacao } from "@/lib/formatacao";
import { ETAPAS_OBRA, ROTULO_ETAPA_CURTO, type EtapaObra } from "@/lib/obras/cronograma";
import { carregarObras } from "@/lib/obras/dados";
import { rotuloStatus } from "@/lib/obras/rotulos";
import { ENGENHARIA, OBRAS, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor, contarAbasTarefasSetor } from "@/lib/tarefas-setor";
import { ROTULO_FILTRO_TAREFAS_SETOR, type TarefaSetorVM } from "@/lib/tarefas-setor-regras";
import { Aba, Kanban, ListaObras, ListaPorEtapa, ResumoFases } from "./carteira";
import { Desempenho } from "./desempenho";
import { FILTROS, hrefEngenharia, lerCarteira, lerFiltro, type EstadoEngenharia, type Filtro, type VisaoEngenharia } from "./estado";
import { MeuDia, ProximosPrazos } from "./meu-dia";

const VAZIO: Record<Filtro, string> = {
  abertas: "Nenhuma tarefa de Engenharia aberta.",
  minhas: "Nenhuma tarefa com você.",
  fila: "Nenhuma tarefa esperando alguém assumir.",
  concluidas: "Nenhuma tarefa concluída.",
};

// Etapas em que o checklist decide entre "Pronto para protocolo" e as fases anteriores (antes do protocolo).
const ETAPAS_ANTES_DO_PROTOCOLO = new Set(["a_iniciar", "projeto_em_elaboracao"]);
const DIAS_AGENDA = 7;
const DIAS_PERTO = 3;

// No contexto da Engenharia, a tarefa de obra abre o card da obra para o engenheiro, não a tela de Obras.
const paraCard = (t: TarefaSetorVM): TarefaSetorVM =>
  t.obraId ? { ...t, referencia: { ...t.referencia, href: `/engenharia/${t.obraId}` } } : t;

const rotuloEngenharia = (s: string) => rotuloStatus("engenharia", s);

/** "terça-feira, 3 de novembro" → "Terça, 3 de novembro" (fuso de Brasília). */
function dataDeHoje(agora = new Date()) {
  const texto = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).replace("-feira", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Início do engenheiro (desenho aprovado em 03/11/2026). "Pessoal": o que é meu (Meu dia, prazos, minhas obras);
 * "Equipe" (coordenador, admin e gestor): o setor inteiro, com os indicadores e a carga por responsável. Carteira em
 * Resumo/Kanban/Lista e as tarefas do setor nas duas. Tudo sob RLS: a tela não decide permissão, só monta o que chega.
 */
export default async function Engenharia({ searchParams }: PageProps<"/engenharia">) {
  const sessao = await exigirPapel(...ENGENHARIA);
  const { atual } = sessao;
  const params = await searchParams;
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
        <CabecalhoPagina sobretitulo="Obras · Engenharia" titulo="Engenharia" />
        <p className="text-sm text-zinc-600">Você não atua em Engenharia nesta empresa. Peça ao admin para configurar em Configurações › Usuários.</p>
      </div>
    );
  }

  // Admin e gestor acompanham o setor (abrem em Equipe); o coordenador escolhe; o executor fica só com Pessoal.
  const gestao = atual.papel === "admin" || atual.papel === "gestor";
  const temEquipe = gestao || coordenaSetor;
  const visaoPadrao: VisaoEngenharia = gestao ? "equipe" : "pessoal";
  const estado: EstadoEngenharia = {
    visao: temEquipe && (params.visao === "equipe" || params.visao === "pessoal") ? params.visao : visaoPadrao,
    visaoPadrao,
    carteira: lerCarteira(params.carteira),
    periodo: lerPeriodo(params.periodo),
    periodoNaUrl: params.periodo != null,
    ver: lerFiltro(params.ver),
  };
  const pessoal = estado.visao === "pessoal";
  // Definir responsável é do admin e do coordenador (quem a RPC deixa gerir a obra); o gestor só acompanha.
  const coordena = atual.papel === "admin" || coordenaSetor;
  // Iniciar atuação é de quem atua na Engenharia (mesma regra da RPC); admin e gestor não iniciam.
  const podeIniciar = atual.papel === "operacao" && atua;
  const filtroTarefas = { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, setor: "engenharia" as const };

  const [abertas, daAba, porAba, obras, exigencias, acoesVistoria, prazos, indicadores, protocolos, participacoes, pedidos] = await Promise.all([
    carregarTarefasSetor(supabase, { ...filtroTarefas, filtro: "abertas" }),
    estado.ver === "abertas" ? null : carregarTarefasSetor(supabase, { ...filtroTarefas, filtro: estado.ver }),
    contarAbasTarefasSetor(supabase, atual.empresaId, atual.membroId, "engenharia"),
    carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, membroId: atual.membroId }).then((r) => r.obras),
    contarExigenciasAbertas(supabase, atual.empresaId),
    carregarAcoesVistoria(supabase, atual.empresaId),
    carregarPrazosObras(supabase, atual.empresaId),
    carregarIndicadoresEngenharia(supabase, atual.empresaId, estado.periodo),
    carregarStatusProtocolos(supabase, atual.empresaId),
    // "Minhas obras": onde participo hoje da Engenharia (responsável, apoio ou substituto).
    supabase.from("obra_participantes").select("obra_id").eq("empresa_id", atual.empresaId).eq("membro_id", atual.membroId).eq("setor", "engenharia").is("fim", null),
    // Pedidos de justificativa de atraso ainda sem resposta, feitos a mim.
    supabase.from("obra_justificativas_atraso").select("id, obra_id, etapa, prazo").eq("empresa_id", atual.empresaId).eq("pedido_a", atual.membroId).is("respondido_em", null),
  ]);
  for (const r of [participacoes, pedidos]) if (r.error) throw r.error;
  // Fases "Pronto para protocolo" e anteriores dependem do checklist (Resumo e Kanban).
  const checklistsAptos = await carregarChecklistsAptos(
    supabase,
    atual.empresaId,
    obras
      .filter((o) => o.situacao === "em_andamento")
      .filter((o) => ETAPAS_ANTES_DO_PROTOCOLO.has(o.setores.find((s) => s.setor === "engenharia")?.status ?? ""))
      .map((o) => o.id),
  );

  // Ação, obras novas e tarefas olham o setor que eu vejo; a carteira, os terceiros e os prazos seguem a visão.
  const central = montarCentralEngenharia(obras, rotuloEngenharia, { coordena, podeIniciar, exigencias, acoesVistoria });
  const minhas = new Set((participacoes.data ?? []).map((p) => p.obra_id));
  const obrasDaVisao = pessoal ? obras.filter((o) => minhas.has(o.id)) : obras;
  const daVisao = pessoal ? montarCentralEngenharia(obrasDaVisao, rotuloEngenharia, { coordena, podeIniciar, exigencias, acoesVistoria }) : central;
  const emCurso = daVisao.grupos.flatMap((g) => g.obras);
  const colunas = montarKanbanEngenharia(obrasDaVisao, rotuloEngenharia, { exigencias, acoesVistoria, protocolos, checklistsAptos });
  const prazosEmCurso = emCurso.flatMap((o) => prazos.get(o.id) ?? []);
  const vencidos = prazosEmCurso.filter((p) => p.diasRestantes < 0).length;

  const tarefas = abertas.tarefas.map(paraCard);
  // Minhas tarefas e as da fila que eu posso assumir.
  const tarefasMinhas = tarefas.filter((t) => t.responsavel?.id === atual.membroId || (!t.responsavel && t.podeAgir));
  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const justificativas: JustificativaPendente[] = (pedidos.data ?? []).flatMap((j) => {
    const o = obraPorId.get(j.obra_id);
    if (!o || !(ETAPAS_OBRA as readonly string[]).includes(j.etapa)) return [];
    return [{ id: j.id, obraId: j.obra_id, obra: `Obra #${o.numero} · ${o.clienteNome}`, etapa: ROTULO_ETAPA_CURTO[j.etapa as EtapaObra], prazo: j.prazo }];
  });

  const semResponsavel = central.grupos.flatMap((g) => g.obras).find((o) => o.principalNome == null);
  const primeiroNome = sessao.nome.split(/[\s@]/)[0] || sessao.nome;
  const resumo = pessoal
    ? resumoFaixa({ acoes: central.acoes.length, vencemAmanha: prazosEmCurso.filter((p) => p.diasRestantes === 1).length, novas: central.novas.length }, true)
    : resumoFaixa({ acoes: emCurso.filter((o) => !o.comTerceiro && o.proximaAcao).length, vencidos, novas: emCurso.filter((o) => o.principalNome == null).length }, false);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <CabecalhoPagina
        destaque
        sobretitulo={`${dataDeHoje()} · Engenharia${pessoal ? "" : " · equipe"}`}
        titulo={pessoal ? `${saudacao()}, ${primeiroNome}.` : `Engenharia da ${atual.empresaNome}`}
        descricao={resumo}
        acoes={
          <>
            {temEquipe && (
              <nav aria-label="Visão" className={CLASSE_SEGMENTO_CABECALHO}>
                {(["pessoal", "equipe"] as const).map((v) => (
                  <Link key={v} href={hrefEngenharia(estado, { visao: v })} aria-current={estado.visao === v ? "page" : undefined} className={classeItemSegmentoCabecalho(estado.visao === v)}>
                    {v === "pessoal" ? "Pessoal" : "Equipe"}
                  </Link>
                ))}
              </nav>
            )}
            {pessoal && podeIniciar && central.novas[0] && (
              <IniciarAtuacao obraId={central.novas[0].id} rotulo={`Iniciar a próxima obra da fila: obra #${central.novas[0].numero}`} naFaixa />
            )}
            {!pessoal && coordena && semResponsavel && (
              <Link href={`/engenharia/${semResponsavel.id}`} className={CLASSE_ACAO_CABECALHO}>
                Definir responsável da próxima obra
              </Link>
            )}
          </>
        }
      />

      {pessoal ? (
        <>
          <Indicadores
            numeros={[
              ["Comigo agora", tarefasMinhas.length + central.acoes.length, "obras e tarefas", BellRing],
              [
                `Prazos nos próximos ${DIAS_PERTO} dias úteis`,
                prazosEmCurso.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= DIAS_PERTO).length,
                vencidos === 0 ? "nenhum vencido" : vencidos === 1 ? "1 já vencido" : `${vencidos} já vencidos`,
                CalendarClock,
              ],
              ["Aguardando terceiros", daVisao.comTerceiros.length, "cliente, fornecedor ou concessionária", Hourglass],
            ]}
          />
          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <MeuDia dia={montarMeuDia({ acoes: central.acoes, tarefas: tarefasMinhas, novas: central.novas, justificativas, prazos, hoje: hojeEmSaoPaulo() })} />
            <ProximosPrazos agenda={agendaPrazos(emCurso, prazos, DIAS_AGENDA)} dias={DIAS_AGENDA} />
          </div>
        </>
      ) : (
        <Indicadores
          numeros={[
            // Carteira e paradas vêm do banco (sem o limite de linhas da lista); se ele falhar, contam a lista.
            ["Obras na Engenharia", indicadores?.carteira.total ?? emCurso.length, null, HardHat],
            ["Precisam de você", tarefasMinhas.length + central.acoes.length, null, BellRing],
            ...(podeIniciar ? [["Novas obras", central.novas.length, null, Inbox] as Numero] : []),
            ["Aguardando terceiros", daVisao.comTerceiros.length, null, Hourglass],
            ["Paradas", indicadores?.carteira.paradas ?? emCurso.filter((o) => o.estado === "parado").length, null, CirclePause],
            ["Prazos vencidos", [...prazos.values()].filter((lista) => lista.some((p) => p.diasRestantes < 0)).length, null, CalendarX],
            ["Tarefas atrasadas", tarefas.filter((t) => t.atrasada).length, null, AlarmClock],
          ]}
        />
      )}

      <div className={pessoal ? "" : "grid items-start gap-4 lg:grid-cols-[3fr_1fr]"}>
        <Cartao
          titulo={pessoal ? `Minhas obras na Engenharia (${emCurso.length})` : `Obras na Engenharia (${emCurso.length})`}
          acao={
            <nav aria-label="Visão da carteira" className="flex flex-wrap gap-2">
              {(["resumo", "kanban", "lista"] as const).map((c) => (
                <Aba key={c} href={hrefEngenharia(estado, { carteira: c })} atual={estado.carteira === c}>
                  {c === "resumo" ? "Resumo" : c === "kanban" ? "Kanban" : "Lista"}
                </Aba>
              ))}
            </nav>
          }
        >
          {estado.carteira === "kanban" ? (
            <Kanban colunas={colunas} prazos={prazos} />
          ) : estado.carteira === "lista" ? (
            <ListaPorEtapa grupos={daVisao.grupos} prazos={prazos} vazio={pessoal ? "Nenhuma obra com você na Engenharia." : "Nenhuma obra em andamento na Engenharia."} />
          ) : (
            <ResumoFases colunas={colunas} hrefKanban={hrefEngenharia(estado, { carteira: "kanban" })} />
          )}
          {pode(atual.papel, OBRAS) && (
            <Link href="/obras" className="mt-4 inline-block text-sm text-zinc-600 underline hover:text-zinc-900">
              Ver todas as obras
            </Link>
          )}
        </Cartao>
        {!pessoal && <CargaEquipe obras={emCurso} />}
      </div>

      <section aria-label="Tarefas da Engenharia">
        <Cartao titulo="Tarefas da Engenharia">
          <nav aria-label="Filtro das tarefas" className="mb-4 flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Aba key={f} href={hrefEngenharia(estado, { ver: f })} atual={f === estado.ver} contagem={f === "concluidas" ? 0 : porAba[f]}>
                {ROTULO_FILTRO_TAREFAS_SETOR[f]}
              </Aba>
            ))}
          </nav>
          <ListaTarefasSetor tarefas={daAba ? daAba.tarefas.map(paraCard) : tarefas} membrosPorSetor={(daAba ?? abertas).membrosPorSetor} vazio={VAZIO[estado.ver]} />
        </Cartao>
      </section>

      <CartaoRecolhivel
        titulo={`Aguardando terceiros (${daVisao.comTerceiros.length})`}
        resumo={daVisao.comTerceiros.length === 0 ? "Nenhuma obra esperando cliente, fornecedor ou concessionária." : "Obras esperando cliente, fornecedor ou concessionária."}
      >
        {daVisao.comTerceiros.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma obra esperando cliente, fornecedor ou concessionária.</p>
        ) : (
          <ListaObras obras={daVisao.comTerceiros} prazos={prazos} acao />
        )}
      </CartaoRecolhivel>

      {indicadores && <Desempenho indicadores={indicadores} estado={estado} rotuloEtapa={rotuloEngenharia} />}
    </div>
  );
}

type Numero = [rotulo: string, valor: number, rodape: string | null, Icone: LucideIcon];

/** Indicadores numa superfície só, separados por fios (como no Início), sem um cartão por número. */
function Indicadores({ numeros }: { numeros: Numero[] }) {
  // Três números: um por linha no celular (dois por linha deixaria um buraco); mais que isso, em duas colunas.
  const colunas = numeros.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : numeros.length > 6 ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
  return (
    <div className="painel overflow-hidden">
      <dl className={`grid gap-px bg-linha ${colunas}`}>
        {numeros.map(([rotulo, valor, rodape, Icone]) => (
          <div key={rotulo} className="flex min-w-0 flex-col gap-2 bg-superficie p-4 md:p-5">
            <dt className="flex min-w-0 items-center gap-2 text-xs font-medium text-texto-2">
              <Icone size={15} className="shrink-0 text-dourado-texto" aria-hidden />
              <span className="truncate">{rotulo}</span>
            </dt>
            <dd className="font-titulo text-3xl font-light tracking-tight text-texto tabular-nums">{valor}</dd>
            {rodape && <dd className="text-xs text-zinc-500">{rodape}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Quem está com quantas obras em curso (responsável principal na Engenharia). */
function CargaEquipe({ obras }: { obras: ObraNaEngenharia[] }) {
  const carga = cargaPorResponsavel(obras);
  const maior = Math.max(1, ...carga.map((c) => c.total));
  return (
    <Cartao titulo="Carga por responsável">
      {carga.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma obra em curso.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {carga.map((c) => (
            <li key={c.nome ?? "sem"} className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate text-texto">{c.nome ?? "Sem responsável"}</span>
                <span className="font-medium text-texto tabular-nums">{c.total}</span>
              </div>
              <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-2">
                <div className={`h-full rounded-full ${c.nome ? "bg-dourado" : "bg-zinc-400"}`} style={{ width: `${(c.total / maior) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
