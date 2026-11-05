import { CHAVES_PRAZO_OBRA, type ChavePrazoObra } from "@/lib/obras/cronograma";
import type { SetorObra } from "@/lib/obras/rotulos";

/**
 * Quem edita cada prazo (20261124100000_prazos_operacao_funil_gestor.sql). Espelho, só para a tela, de
 * `coordena_setor` e `setor_prazo_obra`: admin e gestor editam todos; `operacao` edita os do setor que coordena.
 * Quem decide de fato é a RLS (`obra_prazos_etapas`, `engenharia_prazos`) e a RPC da entrega contratada.
 */

/** Setor dono de cada prazo das etapas da obra; a entrega contratada é do Operacional. */
export const SETOR_PRAZO_OBRA: Record<ChavePrazoObra, SetorObra> = {
  projeto: "engenharia",
  homologacao: "engenharia",
  compra: "compras",
  entrega_material: "compras",
  instalacao: "operacional",
  vistoria: "engenharia",
  conexao: "engenharia",
  entrega_contratada: "operacional",
};

/** A pessoa coordena o setor: admin e gestor sempre; `operacao` se tem o setor com capacidade "coordenar". */
export function coordenaSetor(papel: string | null | undefined, setoresCoordenados: readonly string[], setor: SetorObra): boolean {
  if (papel === "admin" || papel === "gestor") return true;
  return papel === "operacao" && setoresCoordenados.includes(setor);
}

/** Prazos das etapas da obra que a pessoa pode mudar (na ordem da tela). */
export function prazosObraEditaveis(papel: string | null | undefined, setoresCoordenados: readonly string[]): ChavePrazoObra[] {
  return CHAVES_PRAZO_OBRA.filter((c) => coordenaSetor(papel, setoresCoordenados, SETOR_PRAZO_OBRA[c]));
}
