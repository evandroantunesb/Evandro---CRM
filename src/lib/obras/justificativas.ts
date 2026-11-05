import { ETAPAS_OBRA, SETOR_ETAPA, type DicaAtraso, type EtapaObra } from "./cronograma";
import type { SetorObra } from "./rotulos";
import { ROTULO_SETOR } from "./rotulos";

/**
 * Justificativas de atraso (OPR): admin ou gestor pede ao responsável do setor da etapa; ele responde em 2 dias úteis.
 * Aqui só se escolhe, por etapa, o que mostrar (a pendente; sem ela, a última respondida) e se monta o texto do desenho
 * aprovado ("Pedida a Marina Lopes (Compras) em 01/11. Ainda sem resposta." / "Lucas Prado · respondeu em 25/09").
 */

export type LinhaJustificativa = {
  id: string;
  etapa: string;
  pedido_a: string;
  pedido_em: string;
  cobrado_em: string | null;
  prazo: string;
  texto: string | null;
  respondido_por: string | null;
  respondido_em: string | null;
};

export type JustificativaVM = {
  id: string;
  etapa: EtapaObra;
  pedidoA: string;
  pedidoAId: string;
  pedidoEm: string;
  cobradoEm: string | null;
  prazo: string;
  texto: string | null;
  respondidoPor: string | null;
  respondidoEm: string | null;
};

const ehEtapa = (v: string): v is EtapaObra => (ETAPAS_OBRA as readonly string[]).includes(v);
const ddmmBrasilia = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));
export const ddmmData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Por etapa: a justificativa pendente; sem ela, a respondida mais recente. */
export function justificativasPorEtapa(linhas: readonly LinhaJustificativa[], nomes: ReadonlyMap<string, string>): Map<EtapaObra, JustificativaVM> {
  const nome = (id: string | null) => (id && nomes.get(id)) || "Usuário não identificado";
  const mapa = new Map<EtapaObra, JustificativaVM>();
  const ordenadas = [...linhas].sort((a, b) => a.pedido_em.localeCompare(b.pedido_em));
  for (const l of ordenadas) {
    if (!ehEtapa(l.etapa)) continue;
    const atual = mapa.get(l.etapa);
    if (atual && !atual.respondidoEm) continue;
    mapa.set(l.etapa, {
      id: l.id,
      etapa: l.etapa,
      pedidoA: nome(l.pedido_a),
      pedidoAId: l.pedido_a,
      pedidoEm: l.pedido_em,
      cobradoEm: l.cobrado_em,
      prazo: l.prazo,
      texto: l.texto,
      respondidoPor: l.respondido_em ? nome(l.respondido_por) : null,
      respondidoEm: l.respondido_em,
    });
  }
  return mapa;
}

export function dicaDaJustificativa(j: JustificativaVM): DicaAtraso {
  if (j.respondidoEm && j.texto) {
    return { titulo: "Justificativa", texto: j.texto, rodape: `${j.respondidoPor} · respondeu em ${ddmmBrasilia(j.respondidoEm)}`, pendente: false };
  }
  return {
    titulo: "Justificativa pendente",
    texto: `Pedida a ${j.pedidoA} (${ROTULO_SETOR[SETOR_ETAPA[j.etapa]]}) em ${ddmmBrasilia(j.pedidoEm)}. Ainda sem resposta.`,
    rodape: `Prazo para responder: ${ddmmData(j.prazo)}`,
    pendente: true,
  };
}

export function dicasPorEtapa(mapa: ReadonlyMap<EtapaObra, JustificativaVM>): Partial<Record<EtapaObra, DicaAtraso>> {
  return Object.fromEntries([...mapa].map(([etapa, j]) => [etapa, dicaDaJustificativa(j)]));
}

export const COLUNAS_JUSTIFICATIVA = "id, etapa, pedido_a, pedido_em, cobrado_em, prazo, texto, respondido_por, respondido_em";

export type AtrasoEtapaVM = {
  etapa: EtapaObra;
  atraso: number;
  justificativa: {
    id: string;
    pedidoA: string;
    pedidoEm: string;
    prazo: string;
    texto: string | null;
    respondidoPor: string | null;
    respondidoEm: string | null;
    /** A sessão pode responder (quem recebeu o pedido, o substituto do setor, o admin ou quem coordena o setor). */
    podeResponder: boolean;
  } | null;
};

/**
 * Atrasos da ficha: as etapas com atraso próprio (e as que já têm justificativa), na ordem do cronograma. Responde
 * quem recebeu o pedido, o substituto do setor da etapa na obra, o admin ou quem coordena o setor (espelho da RPC,
 * só para mostrar o formulário).
 */
export function atrasosDaObra(entrada: {
  etapas: readonly { etapa: string; atraso_proprio: number }[];
  justificativas: ReadonlyMap<EtapaObra, JustificativaVM>;
  membroId: string;
  autorizacao: (setor: SetorObra) => string | null | undefined;
  /** A sessão é o substituto deste setor na obra (20261123100000). */
  substituo?: (setor: SetorObra) => boolean;
}): AtrasoEtapaVM[] {
  const atrasoProprio = new Map(entrada.etapas.map((e) => [e.etapa, e.atraso_proprio]));
  return ETAPAS_OBRA.filter((e) => (atrasoProprio.get(e) ?? 0) > 0 || entrada.justificativas.has(e)).map((etapa) => {
    const j = entrada.justificativas.get(etapa);
    const setor = SETOR_ETAPA[etapa];
    const coordena = ["admin", "coordenar"].includes(entrada.autorizacao(setor) ?? "") || (entrada.substituo?.(setor) ?? false);
    return {
      etapa,
      atraso: atrasoProprio.get(etapa) ?? 0,
      justificativa: j
        ? {
            id: j.id,
            pedidoA: j.pedidoA,
            pedidoEm: j.pedidoEm,
            prazo: j.prazo,
            texto: j.texto,
            respondidoPor: j.respondidoPor,
            respondidoEm: j.respondidoEm,
            podeResponder: !j.respondidoEm && (j.pedidoAId === entrada.membroId || coordena),
          }
        : null,
    };
  });
}
