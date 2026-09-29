import {
  BriefcaseBusiness,
  Calendar,
  FileText,
  KanbanSquare,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  Target,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListaTarefas, type TarefaLista } from "@/components/lista-tarefas";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarMoeda, inicioDoDia, tempoDesde } from "@/lib/crm";
import { carregarLeadsParados } from "@/lib/leads-parados";
import { calcularProgresso, calcularRealizado, type Meta } from "@/lib/metas";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL, type TipoTarefa } from "@/lib/tipos";
import { GraficoDesempenho } from "./grafico-desempenho";

const ICONE_TIPO_TAREFA: Record<TipoTarefa, LucideIcon> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  visita: MapPin,
  reuniao: Calendar,
  email: Mail,
  outro: FileText,
};

function paraDataCurta(d: Date) {
  return d.toISOString().slice(0, 10);
}

function limitesMes(deslocamento: number, referencia = new Date()) {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  const inicio = new Date(Date.UTC(ano, mes - deslocamento, 1));
  const fimExclusivo = new Date(Date.UTC(ano, mes - deslocamento + 1, 1));
  return { inicio, fimExclusivo, inicioIso: inicio.toISOString(), fimExclusivoIso: fimExclusivo.toISOString() };
}

/** Variação percentual vs. o período anterior. Sem baseline real (anterior = 0), não inventa uma % — retorna null. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function saudacao(agora = new Date()) {
  const hora = Number(agora.toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ visao?: string | string[] }> }) {
  const sessao = await obterSessao();
  const atual = sessao.atual;
  if (!atual) redirect(sessao.superAdmin ? "/super-admin" : "/sem-acesso");

  // Vendedor só vê a própria operação; admin/gestor pode alternar pra visão da empresa toda (?visao=equipe).
  const podeVerEquipe = atual.papel !== "vendedor";
  const visaoParam = (await searchParams).visao;
  const visaoSolicitada = Array.isArray(visaoParam) ? visaoParam[0] : visaoParam;
  const pessoal = !(podeVerEquipe && visaoSolicitada === "equipe");

  const supabase = await criarClienteServidor();
  const agora = new Date();
  const hojeInicio = inicioDoDia();
  const hojeFimExclusivo = hojeInicio + 86_400_000;
  const ontemInicio = hojeInicio - 86_400_000;
  const mesAtual = limitesMes(0, agora);
  const mesPassado = limitesMes(1, agora);
  const hojeStr = paraDataCurta(agora);

  // Consultas que mudam de escopo conforme a visão (Pessoal filtra por responsavel_id; Equipe é a empresa toda).
  let consultaLeadsHoje = supabase
    .from("negocios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", atual.empresaId)
    .gte("created_at", new Date(hojeInicio).toISOString())
    .lt("created_at", new Date(hojeFimExclusivo).toISOString());
  if (pessoal) consultaLeadsHoje = consultaLeadsHoje.eq("responsavel_id", atual.membroId);

  let consultaLeadsOntem = supabase
    .from("negocios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", atual.empresaId)
    .gte("created_at", new Date(ontemInicio).toISOString())
    .lt("created_at", new Date(hojeInicio).toISOString());
  if (pessoal) consultaLeadsOntem = consultaLeadsOntem.eq("responsavel_id", atual.membroId);

  let consultaNegociosAtivos = supabase.from("negocios").select("valor").eq("empresa_id", atual.empresaId).eq("status", "aberto").limit(10000);
  if (pessoal) consultaNegociosAtivos = consultaNegociosAtivos.eq("responsavel_id", atual.membroId);

  let consultaPropostasAbertas = supabase
    .from("propostas")
    .select("id, negocios!inner(valor, status, responsavel_id)")
    .eq("negocios.empresa_id", atual.empresaId)
    .eq("negocios.status", "aberto")
    .limit(10000);
  if (pessoal) consultaPropostasAbertas = consultaPropostasAbertas.eq("negocios.responsavel_id", atual.membroId);

  let consultaMetas = supabase
    .from("metas")
    .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
    .eq("empresa_id", atual.empresaId)
    .eq("ativa", true)
    .eq("metrica", "receita")
    .lte("periodo_inicio", hojeStr)
    .gte("periodo_fim", hojeStr)
    .order("periodo_inicio", { ascending: false });
  consultaMetas = pessoal ? consultaMetas.eq("membro_id", atual.membroId).limit(1) : consultaMetas.limit(50);

  let consultaNegociosMes = supabase
    .from("negocios")
    .select("valor, fechado_em")
    .eq("empresa_id", atual.empresaId)
    .eq("status", "ganho")
    .gte("fechado_em", mesAtual.inicioIso)
    .lt("fechado_em", mesAtual.fimExclusivoIso)
    .limit(10000);
  if (pessoal) consultaNegociosMes = consultaNegociosMes.eq("responsavel_id", atual.membroId);

  let consultaNegociosMesPassado = supabase
    .from("negocios")
    .select("valor, fechado_em")
    .eq("empresa_id", atual.empresaId)
    .eq("status", "ganho")
    .gte("fechado_em", mesPassado.inicioIso)
    .lt("fechado_em", mesPassado.fimExclusivoIso)
    .limit(10000);
  if (pessoal) consultaNegociosMesPassado = consultaNegociosMesPassado.eq("responsavel_id", atual.membroId);

  let consultaTarefasAtrasadasTotal = supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", atual.empresaId)
    .is("concluida_em", null)
    .lt("vence_em", agora.toISOString());
  if (pessoal) consultaTarefasAtrasadasTotal = consultaTarefasAtrasadasTotal.eq("responsavel_id", atual.membroId);

  let consultaTarefasAtrasadas = supabase
    .from("tarefas")
    .select("id, titulo, tipo, vence_em, negocios(id, contatos(nome))")
    .eq("empresa_id", atual.empresaId)
    .is("concluida_em", null)
    .lt("vence_em", agora.toISOString())
    .order("vence_em", { ascending: true })
    .limit(4);
  if (pessoal) consultaTarefasAtrasadas = consultaTarefasAtrasadas.eq("responsavel_id", atual.membroId);

  const [
    config,
    { count: leadsHoje },
    { count: leadsOntem },
    { data: negociosAtivos },
    { data: propostasAbertas },
    { data: metasLinhas },
    { data: negociosMes },
    { data: negociosMesPassado },
    { count: tarefasAtrasadasTotal },
    { data: tarefasAtrasadas },
    { data: tarefasHoje },
    { data: niveis },
    { data: pontosTotais },
    { data: rankingBruto },
    { count: conquistasCount },
  ] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    consultaLeadsHoje,
    consultaLeadsOntem,
    consultaNegociosAtivos,
    consultaPropostasAbertas,
    consultaMetas,
    consultaNegociosMes,
    consultaNegociosMesPassado,
    consultaTarefasAtrasadasTotal,
    consultaTarefasAtrasadas,
    supabase
      .from("tarefas")
      .select("id, titulo, tipo, vence_em, concluida_em, negocios(id, numero, contatos(nome))")
      .eq("empresa_id", atual.empresaId)
      .eq("responsavel_id", atual.membroId)
      .is("concluida_em", null)
      .gte("vence_em", new Date(hojeInicio).toISOString())
      .lt("vence_em", new Date(hojeFimExclusivo).toISOString())
      .order("vence_em", { ascending: true })
      .limit(20),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).order("xp_minimo"),
    supabase.from("point_ledger").select("pontos").eq("membro_id", atual.membroId).eq("estornado", false).limit(20000),
    supabase.rpc("ranking_gamificacao", { p_empresa_id: atual.empresaId, p_desde: mesAtual.inicioIso }),
    supabase
      .from("conquistas_desbloqueadas")
      .select("id", { count: "exact", head: true })
      .eq("membro_id", atual.membroId),
  ]);

  // Leads aguardando primeiro contato: negócios abertos ainda na etapa inicial do funil.
  const etapasIniciais = config.etapas.filter((e) => e.inicial).map((e) => e.id);
  let consultaLeadsAguardandoCount = supabase
    .from("negocios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", atual.empresaId)
    .eq("status", "aberto")
    .in("etapa_id", etapasIniciais);
  if (pessoal) consultaLeadsAguardandoCount = consultaLeadsAguardandoCount.eq("responsavel_id", atual.membroId);

  let consultaLeadsAguardandoLista = supabase
    .from("negocios")
    .select("id, created_at, contatos(nome)")
    .eq("empresa_id", atual.empresaId)
    .eq("status", "aberto")
    .in("etapa_id", etapasIniciais)
    .order("created_at", { ascending: true })
    .limit(4);
  if (pessoal) consultaLeadsAguardandoLista = consultaLeadsAguardandoLista.eq("responsavel_id", atual.membroId);

  const [{ count: leadsAguardando }, { data: leadsAguardandoLista }, leadsParados] = await Promise.all([
    etapasIniciais.length ? consultaLeadsAguardandoCount : Promise.resolve({ count: 0 }),
    etapasIniciais.length ? consultaLeadsAguardandoLista : Promise.resolve({ data: [] }),
    carregarLeadsParados(supabase, atual.empresaId, pessoal ? { responsavelId: atual.membroId } : {}),
  ]);

  // KPIs -------------------------------------------------------------------
  const valorNegociosAtivos = (negociosAtivos ?? []).reduce((s, n) => s + (n.valor ?? 0), 0);
  const propostasLinhas = (propostasAbertas ?? []) as unknown as { id: string; negocios: { valor: number | null } }[];
  const valorPropostas = propostasLinhas.reduce((s, p) => s + (p.negocios?.valor ?? 0), 0);

  const metasAtivas: Meta[] = (metasLinhas ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    metrica: "receita",
    membroId: m.membro_id,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    valorAlvo: m.valor_alvo,
    ativa: m.ativa,
  }));
  // Não existe meta coletiva no schema (metas.membro_id é obrigatório) — na visão Equipe, "meta do mês"
  // vira progresso médio das metas individuais ativas, mesmo padrão do dashboard de Gamificação.
  const meta: Meta | null = pessoal ? (metasAtivas[0] ?? null) : null;
  const progressoMeta = meta
    ? calcularProgresso(meta.valorAlvo, await calcularRealizado(supabase, meta), meta.periodoInicio, meta.periodoFim, agora)
    : null;

  let metaKpiValor: string;
  let metaKpiRodape: string;
  let metaKpiBarra: number | null;
  if (pessoal) {
    metaKpiValor = progressoMeta ? `${progressoMeta.percentual.toFixed(0)}%` : "—";
    metaKpiRodape = meta ? `${formatarMoeda(progressoMeta!.realizado)} de ${formatarMoeda(meta.valorAlvo)}` : "Nenhuma meta configurada";
    metaKpiBarra = progressoMeta ? Math.min(100, progressoMeta.percentual) : null;
  } else {
    const progressosEquipe = await Promise.all(
      metasAtivas.map(async (m) => calcularProgresso(m.valorAlvo, await calcularRealizado(supabase, m), m.periodoInicio, m.periodoFim, agora)),
    );
    const progressoMedioEquipe = progressosEquipe.length
      ? progressosEquipe.reduce((s, p) => s + Math.min(p.percentual, 100), 0) / progressosEquipe.length
      : null;
    metaKpiValor = progressoMedioEquipe === null ? "—" : `${progressoMedioEquipe.toFixed(0)}%`;
    metaKpiRodape = metasAtivas.length
      ? `Progresso médio de ${metasAtivas.length} meta${metasAtivas.length === 1 ? "" : "s"} ativa${metasAtivas.length === 1 ? "" : "s"}`
      : "Nenhuma meta ativa na equipe";
    metaKpiBarra = progressoMedioEquipe;
  }

  // Gráfico de desempenho: vendas acumuladas do mês corrente -----------------
  const diasNoMes = Math.round((mesAtual.fimExclusivo.getTime() - mesAtual.inicio.getTime()) / 86_400_000);
  const diaHoje = Math.min(Math.floor((agora.getTime() - mesAtual.inicio.getTime()) / 86_400_000) + 1, diasNoMes);
  const porDia = new Array(diasNoMes).fill(0) as number[];
  for (const n of negociosMes ?? []) {
    if (!n.fechado_em) continue;
    const dia = Math.floor((new Date(n.fechado_em).getTime() - mesAtual.inicio.getTime()) / 86_400_000);
    if (dia >= 0 && dia < diasNoMes) porDia[dia] += n.valor ?? 0;
  }
  const acumuladoMes = porDia.slice(0, diaHoje).reduce<{ dia: number; valor: number }[]>((acc, v, i) => {
    acc.push({ dia: i + 1, valor: (acc.at(-1)?.valor ?? 0) + v });
    return acc;
  }, []);
  const totalMes = acumuladoMes.at(-1)?.valor ?? 0;

  const totalMesPassadoAteHoje = (negociosMesPassado ?? [])
    .filter((n) => n.fechado_em && new Date(n.fechado_em).getTime() < mesPassado.inicio.getTime() + diaHoje * 86_400_000)
    .reduce((s, n) => s + (n.valor ?? 0), 0);

  const trajetoriaMeta = meta
    ? Array.from({ length: diaHoje }, (_, i) => ({ dia: i + 1, valor: (meta.valorAlvo / diasNoMes) * (i + 1) }))
    : null;

  // Prioridades: tarefas atrasadas + leads aguardando contato + leads parados ------
  type Prioridade = { id: string; icone: LucideIcon; titulo: string; subtitulo: string; badge: "atrasado" | "pendente" | "parado"; tempo: string; href: string };
  const prioridadesAtrasadas: Prioridade[] = (tarefasAtrasadas ?? []).map((t) => {
    const negocio = t.negocios as unknown as { id: string; contatos: { nome: string } | null } | null;
    return {
      id: `t-${t.id}`,
      icone: ICONE_TIPO_TAREFA[t.tipo as TipoTarefa] ?? FileText,
      titulo: negocio?.contatos?.nome ?? t.titulo,
      subtitulo: negocio?.contatos?.nome ? t.titulo : "Tarefa",
      badge: "atrasado",
      tempo: tempoDesde(t.vence_em, agora.getTime()),
      href: negocio ? `/negocios/${negocio.id}` : "/tarefas",
    };
  });
  const prioridadesLeads: Prioridade[] = (leadsAguardandoLista ?? []).map((n) => {
    const contato = n.contatos as unknown as { nome: string } | null;
    return {
      id: `l-${n.id}`,
      icone: UserPlus,
      titulo: contato?.nome ?? "(sem nome)",
      subtitulo: "Novo lead · aguardando primeiro contato",
      badge: "pendente",
      tempo: tempoDesde(n.created_at, agora.getTime()),
      href: `/negocios/${n.id}`,
    };
  });
  const prioridadesParadas: Prioridade[] = leadsParados.map((n) => ({
    id: `p-${n.id}`,
    icone: BriefcaseBusiness,
    titulo: n.contatoNome,
    subtitulo: `#${n.numero} ${n.titulo} · sem atividade`,
    badge: "parado",
    tempo: tempoDesde(n.ultimaAtividadeEm, agora.getTime()),
    href: `/negocios/${n.id}`,
  }));
  const prioridades = [...prioridadesAtrasadas, ...prioridadesParadas, ...prioridadesLeads].slice(0, 4);
  const totalPendencias = (tarefasAtrasadasTotal ?? 0) + (leadsAguardando ?? 0) + leadsParados.length;

  // Agenda de hoje -----------------------------------------------------------
  const agendaHoje: TarefaLista[] = (tarefasHoje ?? []).map((t) => {
    const negocio = t.negocios as unknown as { id: string; numero: number; contatos: { nome: string } | null } | null;
    return {
      id: t.id,
      titulo: negocio?.contatos?.nome ? `${negocio.contatos.nome} · ${t.titulo}` : t.titulo,
      tipo: t.tipo as TipoTarefa,
      vence_em: t.vence_em,
      concluida_em: t.concluida_em,
      responsavel: null,
      podeApagar: false,
      negocio: negocio ? { id: negocio.id, rotulo: `#${negocio.numero}` } : null,
    };
  });

  // Gamificação --------------------------------------------------------------
  function nivelPara(totalXp: number) {
    let resultado = { nivel: 1, nome: null as string | null };
    for (const n of niveis ?? []) {
      if (n.xp_minimo <= totalXp) resultado = { nivel: n.nivel, nome: n.nome };
      else break;
    }
    return resultado;
  }
  const meuTotalXp = (pontosTotais ?? []).reduce((s, l) => s + l.pontos, 0);
  const meuNivel = nivelPara(meuTotalXp);
  const proximoNivel = (niveis ?? []).find((n) => n.xp_minimo > meuTotalXp) ?? null;
  const xpBaseNivel = niveis?.find((n) => n.nivel === meuNivel.nivel)?.xp_minimo ?? 0;
  const progressoNivel = proximoNivel
    ? Math.min(100, Math.round(((meuTotalXp - xpBaseNivel) / (proximoNivel.xp_minimo - xpBaseNivel)) * 100))
    : 100;
  const rankingOrdenado = (rankingBruto ?? []).slice().sort((a, b) => b.total_pontos - a.total_pontos);
  const minhaPosicao = rankingOrdenado.findIndex((r) => r.membro_id === atual.membroId);
  const nomeMembroRanking = new Map(config.membros.map((m) => [m.id, m.nome]));

  // Ações rápidas --------------------------------------------------------------
  const acoesRapidas = [
    { href: "/negocios/novo", rotulo: "Novo negócio", Icone: Plus },
    { href: "/tarefas", rotulo: "Nova tarefa", Icone: Calendar },
    { href: "/negocios/novo", rotulo: "Novo contato", Icone: UserPlus },
    { href: "/negocios", rotulo: "Gerar proposta", Icone: FileText },
    { href: "/negocios", rotulo: "Abrir Kanban", Icone: KanbanSquare },
    ...(atual.papel === "admin" ? [{ href: "/configuracoes/captura", rotulo: "Capturar leads", Icone: QrCode }] : []),
  ];

  const primeiroNome = sessao.nome.split(" ")[0];
  const subtitulo = pessoal
    ? (tarefasHoje?.length ?? 0) === 0 && totalPendencias === 0
      ? "Sua agenda está em dia."
      : `Você tem ${tarefasHoje?.length ?? 0} tarefa${(tarefasHoje?.length ?? 0) === 1 ? "" : "s"} hoje e ${tarefasAtrasadasTotal ?? 0} cliente${(tarefasAtrasadasTotal ?? 0) === 1 ? "" : "s"} aguardando retorno.`
    : totalPendencias === 0
      ? "A equipe está em dia."
      : `A equipe tem ${totalPendencias} pendência${totalPendencias === 1 ? "" : "s"} hoje (tarefas atrasadas + leads aguardando contato + leads parados).`;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 capitalize">
            {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
            {saudacao(agora)}, {primeiroNome}.
          </h1>
          <p className="text-sm text-zinc-500">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeVerEquipe && (
            <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
              <Link
                href="/inicio?visao=pessoal"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pessoal ? "bg-carvao text-offwhite" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Pessoal
              </Link>
              <Link
                href="/inicio?visao=equipe"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  !pessoal ? "bg-carvao text-offwhite" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Equipe
              </Link>
            </div>
          )}
          <Link
            href="/negocios/novo"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-dourado px-4 py-2 text-sm font-medium text-carvao transition-colors hover:bg-amber-400"
          >
            <Plus size={16} />
            Novo negócio
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          Icone={Users}
          valor={String(leadsHoje ?? 0)}
          legenda="Novos leads hoje"
          variacaoPct={variacao(leadsHoje ?? 0, leadsOntem ?? 0)}
          rodape={`${leadsAguardando ?? 0} aguardando primeiro contato`}
        />
        <Kpi
          Icone={BriefcaseBusiness}
          valor={String((negociosAtivos ?? []).length)}
          legenda="Negócios em andamento"
          rodape={`${formatarMoeda(valorNegociosAtivos)} em potencial`}
        />
        <Kpi
          Icone={FileText}
          valor={String(propostasLinhas.length)}
          legenda="Propostas em aberto"
          rodape={`${formatarMoeda(valorPropostas)} em negociação`}
        />
        <Kpi
          Icone={Target}
          valor={metaKpiValor}
          legenda={pessoal ? "Meta do mês" : "Metas da equipe"}
          rodape={metaKpiRodape}
          barra={metaKpiBarra}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.14fr_1fr]">
        <Cartao
          titulo={pessoal ? "Minhas prioridades hoje" : "Prioridades da equipe hoje"}
          acao={
            <div className="flex items-center gap-2">
              {totalPendencias > 0 && <Selo tom="negativo">{totalPendencias} pendências</Selo>}
              <Link href="/tarefas" className="text-sm text-dourado hover:underline">
                Ver todas →
              </Link>
            </div>
          }
        >
          {!prioridades.length ? (
            <p className="text-sm text-zinc-500">{pessoal ? "Nenhuma prioridade pendente. Sua operação está em dia." : "Nenhuma prioridade pendente. A equipe está em dia."}</p>
          ) : (
            <ul className="flex flex-col">
              {prioridades.map((p) => {
                const Icone = p.icone;
                return (
                  <li key={p.id} className="flex items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dourado/10 text-dourado">
                      <Icone size={16} />
                    </span>
                    <Link href={p.href} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{p.titulo}</p>
                      <p className="truncate text-xs text-zinc-500">{p.subtitulo}</p>
                    </Link>
                    <Selo tom={p.badge === "atrasado" ? "negativo" : "atencao"}>
                      {{ atrasado: "Atrasado", pendente: "Pendente", parado: "Parado" }[p.badge]}
                    </Selo>
                    <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{p.tempo}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <Cartao titulo={pessoal ? "Meu desempenho no mês" : "Desempenho da equipe no mês"}>
          {acumuladoMes.length < 2 ? (
            <p className="text-sm text-zinc-500">Ainda não há dados suficientes neste período.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-zinc-900">{formatarMoeda(totalMes)}</span>
                {variacao(totalMes, totalMesPassadoAteHoje) != null && (
                  <span className={`text-xs font-medium ${totalMes >= totalMesPassadoAteHoje ? "text-green-700" : "text-red-700"}`}>
                    {totalMes >= totalMesPassadoAteHoje ? "▲" : "▼"} {Math.abs(variacao(totalMes, totalMesPassadoAteHoje)!).toFixed(0)}%
                  </span>
                )}
              </div>
              {meta && <p className="text-xs text-zinc-500">Meta de {formatarMoeda(meta.valorAlvo)}</p>}
              <GraficoDesempenho acumulado={acumuladoMes} meta={trajetoriaMeta} />
            </>
          )}
        </Cartao>
      </div>

      {pessoal ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.14fr_1fr]">
          <Cartao titulo="Minha agenda de hoje" acao={<Link href="/tarefas" className="text-sm text-dourado hover:underline">Ver agenda completa →</Link>}>
            <ListaTarefas tarefas={agendaHoje} vazio="Nenhuma tarefa agendada para hoje." />
          </Cartao>

          <Cartao
            titulo="Minha jornada no Raion"
            className="border-green-100 bg-[#F1FFF6]"
            acao={<Link href="/gamificacao/jornada" className="text-sm text-[#137B43] hover:underline">Ver minha jornada →</Link>}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#137B43] text-white">
                <Trophy size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-zinc-900">Nível {meuNivel.nivel}{meuNivel.nome && <span className="ml-1 text-sm font-normal text-zinc-500">{meuNivel.nome}</span>}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-dourado" style={{ width: `${progressoNivel}%` }} />
                </div>
                {proximoNivel && (
                  <p className="mt-1 text-xs text-zinc-600">
                    {meuTotalXp.toLocaleString("pt-BR")} / {proximoNivel.xp_minimo.toLocaleString("pt-BR")} pontos para o próximo nível
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniCartaoJornada valor={meuTotalXp.toLocaleString("pt-BR")} legenda="Pontos" />
              <MiniCartaoJornada valor={minhaPosicao >= 0 ? `${minhaPosicao + 1}º` : "—"} legenda="Ranking" />
              <MiniCartaoJornada valor={String(conquistasCount ?? 0)} legenda="Conquistas" />
            </div>
          </Cartao>
        </div>
      ) : (
        <Cartao
          titulo="Ranking da equipe"
          className="border-green-100 bg-[#F1FFF6]"
          acao={<Link href="/gamificacao/ranking" className="text-sm text-[#137B43] hover:underline">Ver ranking completo →</Link>}
        >
          {!rankingOrdenado.length ? (
            <p className="text-sm text-zinc-600">Ainda não há pontuação registrada este mês.</p>
          ) : (
            <ul className="flex flex-col">
              {rankingOrdenado.slice(0, 5).map((r, i) => (
                <li key={r.membro_id} className="flex items-center gap-3 border-t border-green-100 py-2.5 first:border-t-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#137B43] text-sm font-semibold text-white">
                    {i + 1}º
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">{nomeMembroRanking.get(r.membro_id) ?? "—"}</span>
                  <span className="shrink-0 text-sm font-semibold text-zinc-900">{r.total_pontos.toLocaleString("pt-BR")} pts</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      <Cartao titulo="Ações rápidas">
        <div className="flex flex-wrap gap-2.5">
          {acoesRapidas.map((a, i) => (
            <Link
              key={`${a.href}-${a.rotulo}-${i}`}
              href={a.href}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-carvao transition-colors hover:bg-offwhite"
            >
              <a.Icone size={16} className="text-dourado" />
              {a.rotulo}
            </Link>
          ))}
        </div>
      </Cartao>

      <p className="text-center text-xs text-zinc-400">
        Você está em <strong className="font-medium text-zinc-600">{atual.empresaNome}</strong> como {ROTULO_PAPEL[atual.papel]}.
      </p>
    </div>
  );
}

function Kpi({
  Icone,
  valor,
  legenda,
  rodape,
  variacaoPct,
  barra,
}: {
  Icone: LucideIcon;
  valor: string;
  legenda: string;
  rodape: string;
  variacaoPct?: number | null;
  barra?: number | null;
}) {
  return (
    <div className="flex min-h-[128px] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dourado/10 text-dourado">
          <Icone size={17} />
        </span>
        {variacaoPct != null && (
          <span className={`text-xs font-medium ${variacaoPct >= 0 ? "text-green-700" : "text-red-700"}`}>
            {variacaoPct >= 0 ? "▲" : "▼"} {Math.abs(variacaoPct).toFixed(0)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-500">{legenda}</p>
        <p className="truncate text-2xl font-semibold text-zinc-900 [font-variant-numeric:tabular-nums]">{valor}</p>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        {barra != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-dourado" style={{ width: `${barra}%` }} />
          </div>
        )}
        <p className="truncate text-xs text-zinc-500">{rodape}</p>
      </div>
    </div>
  );
}

function MiniCartaoJornada({ valor, legenda }: { valor: string; legenda: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white px-2 py-2.5 text-center">
      <span className="text-lg font-semibold text-zinc-900">{valor}</span>
      <span className="text-[11px] text-zinc-500">{legenda}</span>
    </div>
  );
}
