import type { Json } from "@/lib/supabase/database.types";

type Nomes = { etapa: (id: string) => string; origem: (id: string) => string; membro: (id: string) => string };

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
    default:
      return tipo;
  }
}
