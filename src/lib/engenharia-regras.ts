import type { StatusProtocolo } from "@/lib/engenharia-protocolos-regras";
import type { ObraListaVM } from "@/lib/obras/dados";
import { setorConcluido } from "@/lib/obras/derivados";
import { STATUS_POR_SETOR } from "@/lib/obras/rotulos";

/**
 * Central da Engenharia: obras em andamento por etapa, a próxima ação de cada uma e o que espera terceiros. Só
 * fatos registrados (etapa, desde quando, parado, aguardando, responsável principal); a próxima ação é um texto
 * fixo por etapa, explicável, sem prazo, percentual ou semáforo inventados. Exigência aberta (P3) e vistoria que pede
 * ação (P4) trocam o texto e tiram a obra de "aguardando terceiros".
 */

/** Próxima ação por etapa da Engenharia (aprovada pelo Evandro em 29/10/2026). */
export const PROXIMA_ACAO_ENGENHARIA: Record<string, string> = {
  a_iniciar: "Conferir dados e iniciar o projeto",
  projeto_em_elaboracao: "Concluir projeto e documentação",
  enviado_concessionaria: "Verificar resposta da concessionária",
  aprovado: "Acompanhar instalação e pedir vistoria",
  aguardando_vistoria: "Acompanhar vistoria e troca do medidor",
};
export const ACAO_SEM_RESPONSAVEL = "Definir responsável";
/** Exigência aberta no protocolo (P3): a bola volta para a Engenharia. */
export const acaoExigencia = (n: number) => (n === 1 ? "Responder exigência da concessionária" : `Responder ${n} exigências da concessionária`);

/** Etapas em que a próxima movimentação é da concessionária, mesmo sem a marcação "Aguardando". */
const ETAPAS_COM_CONCESSIONARIA = new Set(["enviado_concessionaria", "aguardando_vistoria"]);

export type ObraNaEngenharia = {
  id: string;
  numero: number;
  clienteNome: string;
  cidadeUf: string;
  potenciaKwp: number | null;
  status: string;
  statusRotulo: string;
  estado: ObraListaVM["setores"][number]["estado"];
  aguardando: string | null;
  principalNome: string | null;
  souPrincipal: boolean;
  /** Texto da próxima ação; null para etapa que a regra não conhece (não se inventa ação). */
  proximaAcao: string | null;
  /** A próxima movimentação é de terceiro: marcação "Aguardando" ou etapa com a concessionária. */
  comTerceiro: boolean;
  /** Desde quando está na etapa ou, se aguarda terceiro marcado, desde quando aguarda. */
  desde: string | null;
};

export type GrupoEngenharia = { status: string; rotulo: string; obras: ObraNaEngenharia[] };

export type CentralEngenharia = {
  /** Obras com ação minha: sou o principal ou, se coordeno, a obra está sem principal. Sem as que esperam terceiro. */
  acoes: ObraNaEngenharia[];
  /** Obras paradas com terceiro (cliente, fornecedor, concessionária…), visíveis a quem vê a carteira. */
  comTerceiros: ObraNaEngenharia[];
  /** Carteira por etapa, na ordem do fluxo, com os grupos vazios. */
  grupos: GrupoEngenharia[];
};

/** Obra em andamento com a Engenharia em curso; com `aceitaConcluida`, também a de Engenharia concluída (sem ação). */
function paraEngenharia(
  o: ObraListaVM,
  rotuloStatus: (status: string) => string,
  exigencias: number,
  acaoVistoria: string | null,
  aceitaConcluida = false,
): ObraNaEngenharia | null {
  if (o.situacao !== "em_andamento") return null;
  const eng = o.setores.find((s) => s.setor === "engenharia");
  if (!eng?.status) return null;
  const concluida = setorConcluido("engenharia", eng.status);
  if (concluida && !aceitaConcluida) return null;
  // Exigência aberta ou vistoria que pede ação (não conformidade, conexão confirmada): a próxima movimentação é da
  // Engenharia, mesmo na etapa da concessionária. Exigência vem primeiro.
  const acaoRegistro = exigencias > 0 ? acaoExigencia(exigencias) : acaoVistoria;
  const comTerceiro = !concluida && acaoRegistro == null && (eng.aguardando != null || ETAPAS_COM_CONCESSIONARIA.has(eng.status));
  return {
    id: o.id,
    numero: o.numero,
    clienteNome: o.clienteNome,
    cidadeUf: [o.cidade, o.uf].filter(Boolean).join("/") || "—",
    potenciaKwp: o.potenciaKwp,
    status: eng.status,
    statusRotulo: rotuloStatus(eng.status),
    estado: eng.estado,
    aguardando: eng.aguardando,
    principalNome: eng.principalNome,
    souPrincipal: eng.souPrincipal,
    proximaAcao: concluida
      ? null
      : eng.principalNome == null
        ? ACAO_SEM_RESPONSAVEL
        : (acaoRegistro ?? PROXIMA_ACAO_ENGENHARIA[eng.status] ?? null),
    comTerceiro,
    desde: eng.aguardandoDesde ?? eng.statusDesde,
  };
}

/** Mais antigo primeiro: quem está há mais tempo parado na etapa aparece antes. Sem data, no fim; empate pelo número. */
const porAntiguidade = (a: ObraNaEngenharia, b: ObraNaEngenharia) =>
  (a.desde ?? "￿").localeCompare(b.desde ?? "￿") || a.numero - b.numero;

export function montarCentralEngenharia(
  obras: readonly ObraListaVM[],
  rotuloStatus: (status: string) => string,
  {
    coordena,
    exigencias = new Map(),
    acoesVistoria = new Map(),
  }: {
    coordena: boolean;
    /** Exigências abertas por obra (protocolos, P3). */
    exigencias?: ReadonlyMap<string, number>;
    /** Ação que a vistoria mais recente pede, por obra (P4). */
    acoesVistoria?: ReadonlyMap<string, string>;
  },
): CentralEngenharia {
  const grupos = new Map<string, ObraNaEngenharia[]>(
    STATUS_POR_SETOR.engenharia.filter((s) => !setorConcluido("engenharia", s)).map((s) => [s, []]),
  );
  const acoes: ObraNaEngenharia[] = [];
  const comTerceiros: ObraNaEngenharia[] = [];
  for (const o of obras) {
    const item = paraEngenharia(o, rotuloStatus, exigencias.get(o.id) ?? 0, acoesVistoria.get(o.id) ?? null);
    if (!item) continue;
    // Status que o banco aceite e a lista não conheça ainda vira grupo próprio, no fim: nunca some da tela.
    const lista = grupos.get(item.status) ?? [];
    grupos.set(item.status, lista);
    lista.push(item);
    // Sem responsável a ação é de quem coordena, mesmo que a etapa espere terceiro.
    if (item.principalNome == null && coordena) acoes.push(item);
    else if (item.comTerceiro) comTerceiros.push(item);
    else if (item.souPrincipal) acoes.push(item);
  }
  return {
    acoes: acoes.sort(porAntiguidade),
    comTerceiros: comTerceiros.sort(porAntiguidade),
    grupos: [...grupos].map(([status, lista]) => ({ status, rotulo: rotuloStatus(status), obras: lista.sort((a, b) => a.numero - b.numero) })),
  };
}

/**
 * Fases do Kanban da carteira (spec v1.3, seção 31.2). Visão derivada, sem valor regulatório: a fase sai dos fatos
 * registrados (etapa, checklist, protocolo, exigência) e nunca é gravada; não há arrastar para mudar de fase.
 */
export const FASES_KANBAN_ENGENHARIA = [
  "conferencia",
  "elaboracao",
  "pronto_protocolo",
  "analise_externa",
  "exigencia",
  "conexao",
  "concluida",
] as const;
export type FaseKanbanEngenharia = (typeof FASES_KANBAN_ENGENHARIA)[number];
export const ROTULO_FASE_KANBAN: Record<FaseKanbanEngenharia, string> = {
  conferencia: "Conferência inicial",
  elaboracao: "Em elaboração",
  pronto_protocolo: "Pronto para protocolo",
  analise_externa: "Em análise externa",
  exigencia: "Exigência / correção",
  conexao: "Conexão / vistoria",
  concluida: "Concluída",
};

/** Protocolo que já passou da aprovação (encerrado só vem depois de aprovado ou orçamento emitido). */
const PROTOCOLO_APROVADO = new Set<StatusProtocolo>(["aprovado", "orcamento_emitido", "encerrado"]);
/** Protocolo enviado, sem resposta final. */
const PROTOCOLO_EM_ANALISE = new Set<StatusProtocolo>(["protocolado", "em_analise", "com_exigencia"]);

/**
 * Uma fase por obra, na precedência da spec: Exigência > Conexão/vistoria > Em análise externa > Pronto para
 * protocolo > Em elaboração > Conferência inicial; Engenharia concluída vence tudo. Protocolo cancelado ou indeferido
 * não conta. O registro da aprovação não muda a etapa sozinho, por isso o protocolo aprovado também leva à conexão.
 */
export function faseKanbanEngenharia(
  status: string,
  { exigencias, protocolos, checklistApto }: { exigencias: number; protocolos: readonly StatusProtocolo[]; checklistApto: boolean },
): FaseKanbanEngenharia {
  if (setorConcluido("engenharia", status)) return "concluida";
  if (exigencias > 0) return "exigencia";
  if (status === "aprovado" || status === "aguardando_vistoria" || protocolos.some((p) => PROTOCOLO_APROVADO.has(p))) return "conexao";
  if (status === "enviado_concessionaria" || protocolos.some((p) => PROTOCOLO_EM_ANALISE.has(p))) return "analise_externa";
  if (checklistApto) return "pronto_protocolo";
  return status === "projeto_em_elaboracao" ? "elaboracao" : "conferencia";
}

export type ColunaKanbanEngenharia = { fase: FaseKanbanEngenharia; rotulo: string; obras: ObraNaEngenharia[] };

/**
 * Carteira em colunas: as mesmas obras da lista por etapa (em andamento) mais a coluna das que já concluíram a
 * Engenharia e seguem nos outros setores. Todas as colunas aparecem, mesmo vazias; cada obra numa só.
 */
export function montarKanbanEngenharia(
  obras: readonly ObraListaVM[],
  rotuloStatus: (status: string) => string,
  {
    exigencias = new Map(),
    acoesVistoria = new Map(),
    protocolos = new Map(),
    checklistsAptos = new Set(),
  }: {
    exigencias?: ReadonlyMap<string, number>;
    acoesVistoria?: ReadonlyMap<string, string>;
    /** Status dos protocolos de cada obra (P3). */
    protocolos?: ReadonlyMap<string, readonly StatusProtocolo[]>;
    /** Obras com checklist aplicado e obrigatórios válidos ou dispensados (gate G2). */
    checklistsAptos?: ReadonlySet<string>;
  },
): ColunaKanbanEngenharia[] {
  const colunas = new Map<FaseKanbanEngenharia, ObraNaEngenharia[]>(FASES_KANBAN_ENGENHARIA.map((f) => [f, []]));
  for (const o of obras) {
    const n = exigencias.get(o.id) ?? 0;
    const item = paraEngenharia(o, rotuloStatus, n, acoesVistoria.get(o.id) ?? null, true);
    if (!item) continue;
    const fase = faseKanbanEngenharia(item.status, { exigencias: n, protocolos: protocolos.get(o.id) ?? [], checklistApto: checklistsAptos.has(o.id) });
    colunas.get(fase)!.push(item);
  }
  return FASES_KANBAN_ENGENHARIA.map((fase) => ({ fase, rotulo: ROTULO_FASE_KANBAN[fase], obras: colunas.get(fase)!.sort(porAntiguidade) }));
}

/** Dias corridos desde uma data (ISO), no horário de Brasília. Fato de calendário, não prazo. */
export function diasDesde(desde: string, agora = new Date()): number {
  const dia = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d));
  return Math.max(0, Math.round((dia(agora) - dia(new Date(desde))) / 86_400_000));
}
