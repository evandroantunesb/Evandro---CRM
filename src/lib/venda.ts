import type { SupabaseServidor } from "@/lib/supabase/server";
import type { StatusContrato, StatusPagamentoContrato } from "@/lib/tipos";

/**
 * Visão consolidada de Venda (/propostas-contratos): uma linha por negócio que já tem proposta
 * ou contrato, juntando só dados existentes. Toda leitura passa pela RLS de sempre —
 * `pode_ver_negocio` em propostas, propostas_aberturas, contratos e confirmacoes_pagamento —
 * então cada papel vê exatamente os negócios que já via. Não existe "proposta aprovada".
 */

export type StatusNegocio = "aberto" | "ganho" | "perdido";
export type SituacaoProposta = "nao_gerada" | "nunca_aberta" | "aberta";
export type SituacaoContrato = "nao_gerado" | StatusContrato;

export const ROTULO_SITUACAO_PROPOSTA: Record<SituacaoProposta, string> = {
  nao_gerada: "Não gerada",
  nunca_aberta: "Cliente ainda não viu",
  aberta: "Vista pelo cliente",
};
export const ROTULO_SITUACAO_CONTRATO: Record<SituacaoContrato, string> = {
  nao_gerado: "Não gerado",
  rascunho: "Rascunho",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
};
export const ROTULO_PAGAMENTO: Record<StatusPagamentoContrato, string> = {
  pendente: "A confirmar",
  confirmado: "Confirmado",
  estornado: "Estornado",
};
export const ROTULO_NEGOCIO: Record<StatusNegocio, string> = { aberto: "Em andamento", ganho: "Ganho", perdido: "Perdido" };

export type LinhaVenda = {
  negocioId: string;
  numero: number;
  titulo: string;
  clienteNome: string;
  responsavelId: string | null;
  valor: number | null;
  negocio: StatusNegocio;
  proposta: SituacaoProposta;
  propostaUltimaAbertura: string | null;
  propostaAberturas: number;
  contrato: SituacaoContrato;
  /** null quando não há contrato assinado nem confirmação (mesma regra de `status_pagamento_contrato`). */
  pagamento: StatusPagamentoContrato | null;
  ultimaMovimentacao: string;
};

type Confirmacao = { confirmado_em: string; estornado_em: string | null };

/** Espelha a função `status_pagamento_contrato` do banco, a partir das linhas já lidas. */
export function statusPagamento(contratoStatus: StatusContrato | null, confirmacoes: readonly Confirmacao[]): StatusPagamentoContrato | null {
  if (confirmacoes.some((c) => c.estornado_em == null)) return "confirmado";
  if (confirmacoes.length > 0) return "estornado";
  if (contratoStatus === "assinado") return "pendente";
  return null;
}

export function situacaoProposta(temProposta: boolean, aberturas: number): SituacaoProposta {
  if (!temProposta) return "nao_gerada";
  return aberturas > 0 ? "aberta" : "nunca_aberta";
}

/** Data mais recente entre as informadas (ISO); ignora vazias. */
export function maisRecente(datas: readonly (string | null | undefined)[]): string {
  const validas = datas.filter((d): d is string => !!d);
  return validas.length ? validas.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)) : "";
}

export const ATALHOS_VENDA = {
  proposta_nunca_aberta: "Cliente ainda não viu",
  aguardando_assinatura: "Aguardando assinatura",
  assinado_sem_pagamento: "Assinado, falta confirmar pagamento",
  pago_nao_ganho: "Pago, falta marcar como ganho",
} as const;
export type AtalhoVenda = keyof typeof ATALHOS_VENDA;

export type FiltrosVenda = {
  busca?: string;
  contrato?: SituacaoContrato;
  pagamento?: StatusPagamentoContrato | "sem";
  negocio?: StatusNegocio;
  /** Responsáveis permitidos (filtro de responsável/equipe); undefined = todos. */
  responsaveis?: ReadonlySet<string>;
  atalho?: AtalhoVenda;
};

/**
 * Filtros de responsável e equipe são cumulativos: só equipe -> membros da equipe; só
 * responsável -> ele; os dois -> ele, se pertencer à equipe, senão nenhum (conjunto vazio);
 * nenhum -> undefined (todos).
 */
export function responsaveisPermitidos(responsavel: string | undefined, membrosEquipe: ReadonlySet<string> | undefined): ReadonlySet<string> | undefined {
  if (responsavel && membrosEquipe) return membrosEquipe.has(responsavel) ? new Set([responsavel]) : new Set<string>();
  if (responsavel) return new Set([responsavel]);
  return membrosEquipe;
}

function atendeAtalho(l: LinhaVenda, atalho: AtalhoVenda): boolean {
  switch (atalho) {
    case "proposta_nunca_aberta":
      return l.proposta === "nunca_aberta";
    case "aguardando_assinatura":
      return l.contrato === "aguardando_assinatura";
    case "assinado_sem_pagamento":
      return l.contrato === "assinado" && l.pagamento !== "confirmado";
    case "pago_nao_ganho":
      return l.pagamento === "confirmado" && l.negocio !== "ganho";
  }
}

export function filtrarLinhasVenda(linhas: readonly LinhaVenda[], f: FiltrosVenda): LinhaVenda[] {
  const busca = f.busca?.trim().toLowerCase().replace(/^#/, "") ?? "";
  return linhas.filter((l) => {
    if (busca && !(String(l.numero) === busca || l.clienteNome.toLowerCase().includes(busca) || l.titulo.toLowerCase().includes(busca))) {
      return false;
    }
    if (f.contrato && l.contrato !== f.contrato) return false;
    if (f.pagamento && (f.pagamento === "sem" ? l.pagamento !== null : l.pagamento !== f.pagamento)) return false;
    if (f.negocio && l.negocio !== f.negocio) return false;
    if (f.responsaveis && !(l.responsavelId && f.responsaveis.has(l.responsavelId))) return false;
    if (f.atalho && !atendeAtalho(l, f.atalho)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Visões (guias Propostas / Contratos) — mesma consulta, recortes diferentes
// ---------------------------------------------------------------------------

export const VISOES_VENDA = ["propostas", "contratos"] as const;
export type VisaoVenda = (typeof VISOES_VENDA)[number];
export const ROTULO_VISAO_VENDA: Record<VisaoVenda, string> = { propostas: "Propostas", contratos: "Contratos" };

export const ATALHOS_POR_VISAO: Record<VisaoVenda, readonly AtalhoVenda[]> = {
  propostas: ["proposta_nunca_aberta"],
  contratos: ["aguardando_assinatura", "assinado_sem_pagamento", "pago_nao_ganho"],
};

/** Guia Propostas: negócios com proposta gerada. Guia Contratos: negócios com contrato gerado. */
export function linhasDaVisao(linhas: readonly LinhaVenda[], visao: VisaoVenda): LinhaVenda[] {
  return linhas.filter((l) => (visao === "propostas" ? l.proposta !== "nao_gerada" : l.contrato !== "nao_gerado"));
}

/** Descarta filtros que não pertencem à guia (ex.: contrato/pagamento na guia Propostas, atalho de outra guia). */
export function filtrosDaVisao(visao: VisaoVenda, f: FiltrosVenda): FiltrosVenda {
  const atalho = f.atalho && ATALHOS_POR_VISAO[visao].includes(f.atalho) ? f.atalho : undefined;
  if (visao === "propostas") return { busca: f.busca, negocio: f.negocio, responsaveis: f.responsaveis, atalho };
  return { ...f, atalho };
}

/** Linhas da guia já filtradas — o que a tela mostra. */
export function linhasVisiveis(linhas: readonly LinhaVenda[], visao: VisaoVenda, f: FiltrosVenda): LinhaVenda[] {
  return filtrarLinhasVenda(linhasDaVisao(linhas, visao), filtrosDaVisao(visao, f));
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const LOTE = 150;
function emLotes<T>(itens: readonly T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
  return lotes;
}

/** Monta as linhas a partir das tabelas existentes (todas sob RLS). Ordena por última movimentação. */
export async function carregarLinhasVenda(supabase: SupabaseServidor, empresaId: string): Promise<LinhaVenda[]> {
  const [propostasRes, contratosRes] = await Promise.all([
    supabase.from("propostas").select("id, negocio_id, updated_at").eq("empresa_id", empresaId),
    supabase.from("contratos").select("id, negocio_id, status, updated_at").eq("empresa_id", empresaId),
  ]);
  if (propostasRes.error) throw propostasRes.error;
  if (contratosRes.error) throw contratosRes.error;
  const propostas = propostasRes.data ?? [];
  const contratos = contratosRes.data ?? [];

  const negocioIds = [...new Set([...propostas.map((p) => p.negocio_id), ...contratos.map((c) => c.negocio_id)])];
  if (negocioIds.length === 0) return [];
  const propostaIds = propostas.map((p) => p.id);
  const contratoIds = contratos.map((c) => c.id);

  const [negocios, aberturas, confirmacoes] = await Promise.all([
    Promise.all(
      emLotes(negocioIds).map((ids) =>
        supabase.from("negocios").select("id, numero, titulo, valor, status, responsavel_id, updated_at, contatos(nome)").in("id", ids),
      ),
    ),
    Promise.all(emLotes(propostaIds).map((ids) => supabase.from("propostas_aberturas").select("proposta_id, aberta_em").in("proposta_id", ids))),
    Promise.all(
      emLotes(contratoIds).map((ids) =>
        supabase.from("confirmacoes_pagamento").select("contrato_id, confirmado_em, estornado_em").in("contrato_id", ids),
      ),
    ),
  ]);
  for (const r of [...negocios, ...aberturas, ...confirmacoes]) if (r.error) throw r.error;

  const propostaPorNegocio = new Map(propostas.map((p) => [p.negocio_id, p]));
  const contratoPorNegocio = new Map(contratos.map((c) => [c.negocio_id, c]));
  const aberturasPorProposta = new Map<string, string[]>();
  for (const a of aberturas.flatMap((r) => r.data ?? [])) {
    aberturasPorProposta.set(a.proposta_id, [...(aberturasPorProposta.get(a.proposta_id) ?? []), a.aberta_em]);
  }
  const confirmacoesPorContrato = new Map<string, Confirmacao[]>();
  for (const c of confirmacoes.flatMap((r) => r.data ?? [])) {
    confirmacoesPorContrato.set(c.contrato_id, [...(confirmacoesPorContrato.get(c.contrato_id) ?? []), c]);
  }

  return negocios
    .flatMap((r) => r.data ?? [])
    .map((n): LinhaVenda => {
      const proposta = propostaPorNegocio.get(n.id);
      const contrato = contratoPorNegocio.get(n.id);
      const abertas = proposta ? (aberturasPorProposta.get(proposta.id) ?? []) : [];
      const confs = contrato ? (confirmacoesPorContrato.get(contrato.id) ?? []) : [];
      const contratoStatus = (contrato?.status as StatusContrato | undefined) ?? null;
      const ultimaAbertura = abertas.length ? maisRecente(abertas) : null;
      return {
        negocioId: n.id,
        numero: n.numero,
        titulo: n.titulo,
        clienteNome: (n.contatos as unknown as { nome: string } | null)?.nome ?? "(sem nome)",
        responsavelId: n.responsavel_id,
        valor: n.valor,
        negocio: n.status as StatusNegocio,
        proposta: situacaoProposta(!!proposta, abertas.length),
        propostaUltimaAbertura: ultimaAbertura,
        propostaAberturas: abertas.length,
        contrato: contratoStatus ?? "nao_gerado",
        pagamento: statusPagamento(contratoStatus, confs),
        ultimaMovimentacao: maisRecente([
          n.updated_at,
          proposta?.updated_at,
          ultimaAbertura,
          contrato?.updated_at,
          ...confs.flatMap((c) => [c.confirmado_em, c.estornado_em]),
        ]),
      };
    })
    .sort((a, b) => new Date(b.ultimaMovimentacao).getTime() - new Date(a.ultimaMovimentacao).getTime());
}

/*
 * Fechamento da venda em 3 marcos (ficha do negócio). Só leitura: os marcos refletem o que já
 * está gravado (status do negócio, status do contrato e `status_pagamento_contrato`). A única
 * ação de escrita do cartão continua sendo o componente `Fechamento` (ganho/perdido/reabrir).
 * Os marcos não dizem nada sobre a obra: a existência dela vem só da leitura de `obras` (RLS).
 */
export type EstadoMarco = "cumprido" | "pendente" | "bloqueado";
export type Marco = { titulo: string; estado: EstadoMarco; rotulo: string; ancora: string | null };
export type MarcosVenda = {
  venda: Marco;
  contrato: Marco;
  pagamento: Marco;
  concluidos: number;
  concluida: boolean;
  /** Texto factual de progresso; null para negócio perdido (sem contador). */
  progresso: string | null;
};

export function marcosDaVenda(entrada: {
  negocio: StatusNegocio;
  contrato: SituacaoContrato;
  /** Resultado de `status_pagamento_contrato`: null quando não há contrato assinado nem confirmação. */
  pagamento: StatusPagamentoContrato | null;
}): MarcosVenda {
  const venda: Marco = {
    titulo: "Venda ganha",
    estado: entrada.negocio === "ganho" ? "cumprido" : "pendente",
    rotulo: ROTULO_NEGOCIO[entrada.negocio],
    ancora: null,
  };
  const contrato: Marco = {
    titulo: "Contrato assinado",
    estado: entrada.contrato === "assinado" ? "cumprido" : "pendente",
    rotulo: ROTULO_SITUACAO_CONTRATO[entrada.contrato],
    ancora: "#contrato",
  };
  // Estornado não conta como cumprido. Sem status de pagamento, o cartão Pagamento não existe.
  const pagamento: Marco =
    entrada.pagamento === null
      ? { titulo: "Pagamento confirmado", estado: "bloqueado", rotulo: "Aguardando contrato assinado", ancora: null }
      : {
          titulo: "Pagamento confirmado",
          estado: entrada.pagamento === "confirmado" ? "cumprido" : "pendente",
          rotulo: ROTULO_PAGAMENTO[entrada.pagamento],
          ancora: "#pagamento",
        };
  const concluidos = [venda, contrato, pagamento].filter((m) => m.estado === "cumprido").length;
  return {
    venda,
    contrato,
    pagamento,
    concluidos,
    concluida: concluidos === 3,
    progresso: entrada.negocio === "perdido" ? null : `${concluidos} de 3 marcos concluídos`,
  };
}

/**
 * O que o cartão de fechamento recebe. Quem não pode ver contrato e pagamento (SDR) recebe só a
 * situação comercial: os dados de contrato/pagamento nem entram no objeto.
 */
export type CartaoFechamento =
  | { tipo: "situacao"; titulo: "Situação"; negocio: StatusNegocio }
  | { tipo: "marcos"; titulo: "Fechamento da venda"; negocio: StatusNegocio; marcos: MarcosVenda };

export function cartaoFechamento(
  podeVerContratoEPagamento: boolean,
  entrada: { negocio: StatusNegocio; contrato: SituacaoContrato; pagamento: StatusPagamentoContrato | null },
): CartaoFechamento {
  if (!podeVerContratoEPagamento) return { tipo: "situacao", titulo: "Situação", negocio: entrada.negocio };
  return { tipo: "marcos", titulo: "Fechamento da venda", negocio: entrada.negocio, marcos: marcosDaVenda(entrada) };
}

/** Aviso exibido antes de reabrir. Só a saída de "ganho" tem efeitos sobre obra e pontos. */
export function avisoReabertura(status: Exclude<StatusNegocio, "aberto">): { titulo: string; linhas: string[] } {
  if (status === "perdido") {
    return {
      titulo: "Confirmar reabertura do negócio?",
      linhas: ["Ao reabrir este negócio, ele voltará para o status Aberto."],
    };
  }
  return {
    titulo: "Confirmar reabertura da venda?",
    linhas: [
      "Ao reabrir este negócio, ele voltará para o status Aberto.",
      "O contrato assinado, o pagamento confirmado e a obra, caso existam, não serão cancelados automaticamente.",
      'Se já houver obra, ela receberá o alerta "Venda alterada", que não será removido automaticamente caso a venda seja ganha novamente.',
      "Os pontos concedidos pela venda ganha serão estornados, incluindo os pontos do SDR de origem, quando aplicável.",
    ],
  };
}
