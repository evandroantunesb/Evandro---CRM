/**
 * Checklist de documentos da Engenharia (20261030100000_engenharia_checklist.sql). Regras puras da tela: rótulos,
 * resumo e quais botões cada pessoa vê. Espelham as RPCs, que conferem de novo; a tela nunca é a única barreira.
 */

/** Bucket privado dos documentos, pasta `empresa/obra/objeto`. */
export const BUCKET_DOCUMENTOS_ENGENHARIA = "engenharia-documentos";

export const STATUS_ITEM_ENGENHARIA = ["pendente", "em_conferencia", "valido", "invalido", "dispensado"] as const;
export type StatusItemEngenharia = (typeof STATUS_ITEM_ENGENHARIA)[number];

export const ROTULO_STATUS_ITEM: Record<StatusItemEngenharia, string> = {
  pendente: "Pendente",
  em_conferencia: "Em conferência",
  valido: "Válido",
  invalido: "Inválido",
  dispensado: "Não se aplica",
};

/** Autorização na Engenharia da obra, como `autorizacao_setor_obra`: null = só leitura. */
export type AutorizacaoEngenharia = "admin" | "coordenar" | "executar" | null;

export type DocumentoEngenhariaVM = { id: string; nome: string; versao: number; enviadoPor: string | null; quando: string };

export type ItemEngenhariaVM = {
  id: string;
  grupo: string;
  titulo: string;
  descricao: string | null;
  obrigatorio: boolean;
  status: StatusItemEngenharia;
  motivo: string | null;
  atualizadoPor: string | null;
  atualizadoEm: string | null;
  /** Versões, da mais nova para a mais antiga; vazio para quem não vê documentos. */
  documentos: DocumentoEngenhariaVM[];
};

export const statusItem = (s: string): StatusItemEngenharia =>
  (STATUS_ITEM_ENGENHARIA as readonly string[]).includes(s) ? (s as StatusItemEngenharia) : "pendente";

const resolvido = (s: StatusItemEngenharia) => s === "valido" || s === "dispensado";

/** Contagens do checklist: resolvido = válido ou não se aplica. Sem percentual. */
export function resumoChecklist(itens: readonly Pick<ItemEngenhariaVM, "obrigatorio" | "status">[]) {
  const obrigatorios = itens.filter((i) => i.obrigatorio);
  return {
    total: itens.length,
    resolvidos: itens.filter((i) => resolvido(i.status)).length,
    obrigatorios: obrigatorios.length,
    obrigatoriosResolvidos: obrigatorios.filter((i) => resolvido(i.status)).length,
    emConferencia: itens.filter((i) => i.status === "em_conferencia").length,
    invalidos: itens.filter((i) => i.status === "invalido").length,
  };
}

/** Grupos na ordem em que aparecem (os itens já vêm ordenados pelo modelo). */
export function agruparItens<T extends { grupo: string }>(itens: readonly T[]): { grupo: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const i of itens) grupos.set(i.grupo, [...(grupos.get(i.grupo) ?? []), i]);
  return [...grupos].map(([grupo, lista]) => ({ grupo, itens: lista }));
}

/** Botões do item para quem atua na Engenharia da obra (obra cancelada: nenhum). */
export function acoesItem(item: Pick<ItemEngenhariaVM, "status" | "obrigatorio" | "documentos">, autorizacao: AutorizacaoEngenharia, cancelada: boolean) {
  const age = autorizacao !== null && !cancelada;
  return {
    anexar: age && item.status !== "dispensado",
    validar: age && item.documentos.length > 0 && item.status !== "valido" && item.status !== "dispensado",
    invalidar: age && item.documentos.length > 0 && item.status !== "invalido" && item.status !== "dispensado",
    // Obrigatório só admin ou coordenador dispensa (decisão padrão, ajustável).
    dispensar: age && item.status !== "dispensado" && (!item.obrigatorio || autorizacao === "admin" || autorizacao === "coordenar"),
    reabrir: age && item.status !== "pendente" && item.status !== "em_conferencia",
  };
}
