import { resumoChecklist, type AutorizacaoEngenharia, type ItemEngenhariaVM } from "@/lib/engenharia-checklist-regras";
import type { ProtocoloVM } from "@/lib/engenharia-protocolos-regras";
import type { SituacaoVistoria } from "@/lib/engenharia-vistoria-regras";

/**
 * Os oito passos guiados da Engenharia (spec v1.3, seções 22, 23 e OB-06). Guia de trabalho, não a ordem do portal da
 * distribuidora: o status de cada passo sai dos fatos da obra; nenhum passo trava a consulta dos outros. Os passos 2,
 * 3, 5 e 7 não têm fato próprio e usam a confirmação formal (`obra_engenharia_passo_registros`).
 */

export const PASSOS_ENGENHARIA = [
  { numero: 1, titulo: "Receber demanda", ajuda: "Obra com responsável principal na Engenharia." },
  { numero: 2, titulo: "Enquadrar sistema", ajuda: "Distribuidora, modalidade, categoria, potência e condicionantes identificados." },
  { numero: 3, titulo: "Conferir dados técnicos", ajuda: "UC, titularidade, rede, levantamento e divergências revisados." },
  { numero: 4, titulo: "Preparar projeto e documentos", ajuda: "Checklist aplicado e itens obrigatórios válidos ou não aplicáveis." },
  { numero: 5, titulo: "Revisar para protocolo", ajuda: "Revisão técnica final do pacote que será enviado." },
  { numero: 6, titulo: "Protocolar e acompanhar", ajuda: "Protocolo registrado; exigências respondidas até a aprovação." },
  { numero: 7, titulo: "Tratar condições de conexão", ajuda: "Orçamento ou condições da distribuidora, aceite e adequações acompanhados." },
  { numero: 8, titulo: "Vistoria, medição e encerramento", ajuda: "Vistoria aprovada, medidor adequado e conexão confirmada." },
] as const;

export const PASSOS_COM_REGISTRO = [2, 3, 5, 7] as const;
export type PassoComRegistro = (typeof PASSOS_COM_REGISTRO)[number];
export const ehPassoComRegistro = (n: number): n is PassoComRegistro => (PASSOS_COM_REGISTRO as readonly number[]).includes(n);

export const ACOES_PASSO = ["confirmado", "reaberto", "nao_se_aplica"] as const;
export type AcaoPasso = (typeof ACOES_PASSO)[number];
export const acaoPasso = (s: string): AcaoPasso => ((ACOES_PASSO as readonly string[]).includes(s) ? (s as AcaoPasso) : "reaberto");
export const ROTULO_ACAO_PASSO: Record<AcaoPasso, string> = { confirmado: "Concluído", reaberto: "Reaberto", nao_se_aplica: "Não se aplica" };

export const STATUS_PASSO = ["a_fazer", "em_andamento", "concluido", "com_pendencia", "nao_se_aplica"] as const;
export type StatusPasso = (typeof STATUS_PASSO)[number];
export const ROTULO_STATUS_PASSO: Record<StatusPasso, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  com_pendencia: "Com pendência",
  nao_se_aplica: "Não se aplica",
};
const FECHADO = new Set<StatusPasso>(["concluido", "nao_se_aplica"]);

export type RegistroPassoVM = { id: string; passo: PassoComRegistro; acao: AcaoPasso; observacao: string | null; autor: string | null; quando: string };

export type FatosPassos = {
  temResponsavel: boolean;
  /** Registro mais recente de cada passo com registro. */
  registros: Partial<Record<PassoComRegistro, RegistroPassoVM>>;
  checklist: readonly Pick<ItemEngenhariaVM, "obrigatorio" | "status" | "atualizadoEm" | "documentos">[];
  protocolos: readonly Pick<ProtocoloVM, "status" | "exigencias">[];
  vistoria: Pick<SituacaoVistoria, "status" | "conexaoConfirmadaEm"> | null;
  /** Etapa da Engenharia: quem não lê protocolos e vistorias (RLS) vê os passos 6 e 8 por ela. */
  etapa: string | null;
  engenhariaConcluida: boolean;
};

const ETAPAS_APOS_APROVACAO = new Set(["aprovado", "aguardando_vistoria", "concluido"]);

export type PassoVM = { numero: number; titulo: string; ajuda: string; status: StatusPasso; detalhe: string | null };

/** Última mudança do checklist que a revisão do passo 5 precisa ter visto: item alterado ou documento novo. */
export function ultimaMudancaChecklist(itens: FatosPassos["checklist"]): string | null {
  let ultima: string | null = null;
  for (const i of itens) {
    for (const quando of [i.atualizadoEm, ...i.documentos.map((d) => d.quando)]) {
      if (quando && (ultima == null || quando > ultima)) ultima = quando;
    }
  }
  return ultima;
}

/** Revisão do passo 5 feita antes da última mudança do checklist (OB-07): volta a "necessita revisão". */
export function revisaoDesatualizada(revisao: RegistroPassoVM | undefined, itens: FatosPassos["checklist"]): boolean {
  if (revisao?.acao !== "confirmado") return false;
  const ultima = ultimaMudancaChecklist(itens);
  return ultima != null && new Date(ultima).getTime() > new Date(revisao.quando).getTime();
}

function porRegistro(r: RegistroPassoVM | undefined): Pick<PassoVM, "status" | "detalhe"> {
  if (!r) return { status: "a_fazer", detalhe: null };
  if (r.acao === "confirmado") return { status: "concluido", detalhe: null };
  if (r.acao === "nao_se_aplica") return { status: "nao_se_aplica", detalhe: r.observacao };
  return { status: "com_pendencia", detalhe: r.observacao ? `Reaberto: ${r.observacao}` : "Reaberto" };
}

function porChecklist(itens: FatosPassos["checklist"]): Pick<PassoVM, "status" | "detalhe"> {
  if (itens.length === 0) return { status: "a_fazer", detalhe: "Checklist ainda não aplicado" };
  const r = resumoChecklist(itens);
  const detalhe = `${r.obrigatoriosResolvidos} de ${r.obrigatorios} obrigatórios resolvidos`;
  if (r.obrigatoriosResolvidos === r.obrigatorios) return { status: "concluido", detalhe };
  return { status: r.invalidos > 0 ? "com_pendencia" : "em_andamento", detalhe };
}

function porProtocolo({ protocolos, etapa }: FatosPassos): Pick<PassoVM, "status" | "detalhe"> {
  // O válido mais recente (a lista vem do mais novo para o mais antigo); cancelado e indeferido não contam.
  const p = protocolos.find((x) => x.status !== "cancelado" && x.status !== "indeferido");
  if (!p) {
    if (etapa && ETAPAS_APOS_APROVACAO.has(etapa)) return { status: "concluido", detalhe: null };
    if (etapa === "enviado_concessionaria") return { status: "em_andamento", detalhe: "Aguardando a distribuidora" };
    return { status: "a_fazer", detalhe: null };
  }
  const abertas = p.exigencias.filter((e) => e.status === "aberta").length;
  if (abertas > 0) return { status: "com_pendencia", detalhe: abertas === 1 ? "1 exigência aberta" : `${abertas} exigências abertas` };
  // Encerrado só vem depois de aprovado ou orçamento emitido.
  if (p.status === "aprovado" || p.status === "orcamento_emitido" || p.status === "encerrado") return { status: "concluido", detalhe: null };
  return { status: "em_andamento", detalhe: "Aguardando a distribuidora" };
}

function porVistoria(f: FatosPassos): Pick<PassoVM, "status" | "detalhe"> {
  if (f.engenhariaConcluida) return { status: "concluido", detalhe: null };
  if (!f.vistoria || f.vistoria.status === "cancelada")
    return f.etapa === "aguardando_vistoria" ? { status: "em_andamento", detalhe: null } : { status: "a_fazer", detalhe: null };
  if (f.vistoria.status === "com_nao_conformidade") return { status: "com_pendencia", detalhe: "Vistoria com não conformidade" };
  if (f.vistoria.conexaoConfirmadaEm) return { status: "em_andamento", detalhe: "Conexão confirmada: falta concluir a Engenharia" };
  return { status: "em_andamento", detalhe: null };
}

export function montarPassosEngenharia(f: FatosPassos): PassoVM[] {
  return PASSOS_ENGENHARIA.map(({ numero, titulo, ajuda }) => {
    let s: Pick<PassoVM, "status" | "detalhe">;
    switch (numero) {
      case 1:
        s = f.temResponsavel ? { status: "concluido", detalhe: null } : { status: "a_fazer", detalhe: "Defina o responsável principal" };
        break;
      case 4:
        s = porChecklist(f.checklist);
        break;
      case 5:
        s = revisaoDesatualizada(f.registros[5], f.checklist)
          ? { status: "com_pendencia", detalhe: "Necessita revisão: o checklist mudou depois da revisão" }
          : porRegistro(f.registros[5]);
        break;
      case 6:
        s = porProtocolo(f);
        break;
      case 8:
        s = porVistoria(f);
        break;
      default:
        s = porRegistro(f.registros[numero]);
    }
    return { numero, titulo, ajuda, ...s };
  });
}

/** "Onde estou": o primeiro passo ainda aberto; null quando todos estão concluídos ou não se aplicam. */
export const passoAtual = (passos: readonly PassoVM[]): PassoVM | null => passos.find((p) => !FECHADO.has(p.status)) ?? null;

/** Próxima ação do passo em que a obra está (botões principais da seção 23 da spec). */
export function proximaAcaoPasso(p: PassoVM): string {
  switch (p.numero) {
    case 1:
      return "Definir o responsável principal";
    case 2:
      return p.status === "com_pendencia" ? "Revisar o enquadramento" : "Definir o enquadramento";
    case 3:
      return "Concluir a conferência dos dados técnicos";
    case 4:
      return p.status === "a_fazer" ? "Aplicar o checklist" : "Resolver os itens obrigatórios do checklist";
    case 5:
      return "Concluir a revisão para protocolo";
    case 6:
      return p.status === "com_pendencia"
        ? "Responder a exigência da distribuidora"
        : p.status === "a_fazer"
          ? "Registrar o protocolo"
          : "Acompanhar a resposta da distribuidora";
    case 7:
      return "Registrar as condições de conexão";
    default:
      return p.status === "com_pendencia"
        ? "Corrigir a não conformidade e pedir nova vistoria"
        : p.status === "a_fazer"
          ? "Pedir a vistoria"
          : "Acompanhar a vistoria e a conexão";
  }
}

/** Pendências: passos com pendência, na ordem do fluxo. */
export const passosComPendencia = (passos: readonly PassoVM[]) => passos.filter((p) => p.status === "com_pendencia");

/**
 * Botões de um passo com registro. Mesmas regras da RPC `registrar_passo_engenharia`, para a tela não oferecer o que o
 * banco recusa: quem atua na Engenharia da obra (ou o admin), obra não cancelada; passo 5 com o checklist apto; passo 7
 * com protocolo aprovado (ou orçamento emitido, ou encerrado).
 */
export function acoesPasso(
  passo: PassoComRegistro,
  { status, autorizacao, cancelada, checklistApto, protocoloAprovado }: {
    status: StatusPasso;
    autorizacao: AutorizacaoEngenharia;
    cancelada: boolean;
    checklistApto: boolean;
    protocoloAprovado: boolean;
  },
): { confirmar: boolean; reabrir: boolean; naoSeAplica: boolean; bloqueio: string | null } {
  const nada = { confirmar: false, reabrir: false, naoSeAplica: false, bloqueio: null };
  if (!autorizacao || cancelada) return nada;
  const bloqueio =
    passo === 5 && !checklistApto
      ? "Aplique o checklist e resolva os itens obrigatórios antes de concluir a revisão."
      : passo === 7 && !protocoloAprovado
        ? "Registre a aprovação ou o orçamento da distribuidora no protocolo antes deste passo."
        : null;
  const fechado = status === "concluido" || status === "nao_se_aplica";
  return {
    // No passo 5 com pendência (revisão desatualizada), confirmar de novo é a nova revisão.
    confirmar: !bloqueio && status !== "concluido",
    reabrir: fechado,
    naoSeAplica: passo === 7 && !bloqueio && status !== "nao_se_aplica",
    bloqueio: status === "concluido" ? null : bloqueio,
  };
}
