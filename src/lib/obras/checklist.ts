/*
 * Checklist da obra do Solo (Onboarding, subprojeto 4b; 20261207100000_obra_solo.sql; desenho em
 * docs/superpowers/specs/2026-11-11-obra-solo-e-setores-design.md). Regra pura: andamento, etapa atual e a mensagem do
 * WhatsApp para o cliente. O banco guarda as etapas e decide quem escreve.
 */

export const ETAPAS_CHECKLIST = [
  "contrato",
  "entrada",
  "projeto_art",
  "material_comprado",
  "protocolo",
  "material_entregue",
  "instalacao",
  "vistoria",
  "conexao",
  "entrega",
] as const;
export type EtapaChecklist = (typeof ETAPAS_CHECKLIST)[number];

export const ROTULO_ETAPA: Record<EtapaChecklist, string> = {
  contrato: "Contrato assinado",
  entrada: "Entrada recebida",
  projeto_art: "Projeto e ART",
  material_comprado: "Material comprado",
  protocolo: "Protocolo na distribuidora",
  material_entregue: "Material entregue",
  instalacao: "Instalação",
  vistoria: "Vistoria",
  conexao: "Conexão e medidor",
  entrega: "Entrega ao cliente",
};

/** Etapas que podem ser marcadas "não se aplica" (da 3 à 9). */
export const ETAPAS_NAO_SE_APLICA: readonly EtapaChecklist[] = ETAPAS_CHECKLIST.slice(2, 9);

/** Etapas que não podem ser desmarcadas (nascem feitas com a obra). */
export const ETAPAS_FIXAS: readonly EtapaChecklist[] = ["contrato", "entrada"];

export const ehEtapaChecklist = (v: unknown): v is EtapaChecklist => (ETAPAS_CHECKLIST as readonly unknown[]).includes(v);

export type LinhaChecklist = { etapa: EtapaChecklist; feitaEm: string | null; naoSeAplica: boolean; previstaPara: string | null };

/** Resolvida = feita ou "não se aplica"; a entrega só conta feita. */
const resolvida = (l: LinhaChecklist) => l.feitaEm != null || (l.naoSeAplica && l.etapa !== "entrega");

/** Andamento: quantas resolvidas, a etapa atual (primeira não resolvida) e se a obra foi concluída (as 10). */
export function andamentoChecklist(linhas: readonly LinhaChecklist[]): { resolvidas: number; total: 10; atual: EtapaChecklist | null; concluida: boolean } {
  const porEtapa = new Map(linhas.map((l) => [l.etapa, l]));
  const ok = ETAPAS_CHECKLIST.map((e) => {
    const l = porEtapa.get(e);
    return l != null && resolvida(l);
  });
  const resolvidas = ok.filter(Boolean).length;
  const indiceAtual = ok.indexOf(false);
  return { resolvidas, total: 10, atual: indiceAtual < 0 ? null : ETAPAS_CHECKLIST[indiceAtual], concluida: indiceAtual < 0 };
}

/** Mensagem pronta para o cliente (texto da spec); sem nome, só "Olá!". */
export function mensagemWhatsApp({ clienteNome, etapa, link }: { clienteNome: string | null; etapa: EtapaChecklist; link: string }): string {
  const primeiro = (clienteNome ?? "").trim().split(/\s+/)[0];
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  return `${saudacao} A etapa *${ROTULO_ETAPA[etapa]}* da sua obra foi concluída. Acompanhe por aqui: ${link}`;
}

/** Link `wa.me` com a mensagem; sem telefone válido (menos de 10 dígitos) = nulo. Acrescenta o 55 quando falta. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
