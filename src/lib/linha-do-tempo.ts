import type { Json } from "@/lib/supabase/database.types";

import { ROTULO_TIPO_TAREFA, type TipoTarefa } from "@/lib/tipos";

type Nomes = {
  etapa: (id: string) => string;
  origem: (id: string) => string;
  membro: (id: string) => string;
  motivo: (id: string) => string;
};

/** Frase legível para cada tipo de atividade da linha do tempo. */
export function descreverAtividade(tipo: string, dadosJson: Json, nomes: Nomes): string {
  const d = (dadosJson ?? {}) as Record<string, string | number | null>;
  const nomeOu = (fn: (id: string) => string, id: unknown, vazio: string) => (id ? fn(String(id)) : vazio);
  const moeda = (v: unknown) =>
    v == null ? "sem valor" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  switch (tipo) {
    case "negocio_criado":
      return `Negócio criado em ${nomeOu(nomes.etapa, d.etapa_id, "?")}${d.origem_id ? `, origem ${nomes.origem(String(d.origem_id))}` : ""}`;
    case "etapa_alterada":
      return `Moveu de ${nomeOu(nomes.etapa, d.de, "?")} para ${nomeOu(nomes.etapa, d.para, "?")}`;
    case "responsavel_alterado":
      return `Responsável: ${nomeOu(nomes.membro, d.de, "ninguém")} → ${nomeOu(nomes.membro, d.para, "ninguém")}`;
    case "origem_alterada":
      return `Origem: ${nomeOu(nomes.origem, d.de, "sem origem")} → ${nomeOu(nomes.origem, d.para, "sem origem")}`;
    case "valor_alterado":
      return `Valor: ${moeda(d.de)} → ${moeda(d.para)}`;
    case "negocio_ganho":
      return `Negócio ganho (${moeda(d.valor)})`;
    case "negocio_perdido":
      return "Negócio perdido";
    case "negocio_reaberto":
      return "Negócio reaberto";
    case "motivo_perda":
      return `Motivo da perda: ${nomeOu(nomes.motivo, d.motivo_id, "?")}${d.detalhe ? ` (${d.detalhe})` : ""}`;
    case "tarefa_criada":
      return `Tarefa criada: ${ROTULO_TIPO_TAREFA[d.tipo as TipoTarefa] ?? "Tarefa"}, ${d.titulo}`;
    case "tarefa_concluida":
      return `Tarefa concluída${d.atrasada ? " com atraso" : ""}: ${d.titulo}`;
    case "tarefa_reaberta":
      return `Tarefa reaberta: ${d.titulo}`;
    case "anexo_adicionado":
      return `Arquivo anexado: ${d.nome}`;
    case "anexo_removido":
      return `Arquivo removido: ${d.nome}`;
    case "handoff_enviado":
      return `Enviado para vendas: ${nomeOu(nomes.membro, d.para_membro_id, "?")} (aguardando aceite)`;
    case "handoff_aceito":
      return "Oportunidade aceita pelo vendedor";
    case "handoff_devolvido":
      return `Oportunidade devolvida${d.motivo ? `: ${d.motivo}` : ""}`;
    case "pagamento_confirmado":
      return "Pagamento confirmado";
    case "pagamento_estornado":
      return `Confirmação de pagamento estornada${d.motivo ? `: ${d.motivo}` : ""}`;
    default:
      return tipo;
  }
}
