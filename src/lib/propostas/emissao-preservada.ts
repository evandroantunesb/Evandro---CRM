/**
 * Situação dos dados da EMISSÃO de uma proposta (puro, sem I/O, sem "server-only").
 *
 * Hoje nenhuma proposta preserva os números do que foi emitido: `propostas` guarda só token, modo de preço, mensagem,
 * modelo e blocos; a página pública e o PDF leem `calculos_solares`, `kit_componentes` e `contatos` AO VIVO e
 * nenhum PDF é armazenado. Sem snapshot (migration, fora desta rodada), nada prova o que o cliente viu: a data do
 * cálculo não comprova. Por isso, para QUALQUER proposta, os dados da emissão estão indisponíveis.
 *
 * Nunca falar em "conjunto emitido": não há conjunto preservado. Quando existir snapshot, este helper passa a
 * olhar a coluna/tabela de emissão e devolver `{ disponivel: true }`.
 *
 * Isto vale para as propostas ANTIGAS (tabela `propostas`). Propostas emitidas pela emissão preservada
 * (`propostas_emissoes`, link e PDF próprios) são tratadas à parte, em `proposta-simples.ts`; o token delas nunca
 * chega aqui. Nenhum PDF antigo foi gravado pelo sistema, então não há arquivo original para preservar: o link
 * antigo mostra o aviso e a opção de solicitar uma nova proposta. Números antigos nunca são reconstruídos.
 */

/** Emissão preservada existe, mas o conteúdo gravado não confere (formato ou hash): nunca exibir. */
export const MENSAGEM_EMISSAO_INTEGRIDADE =
  "Não foi possível confirmar o conteúdo desta proposta, por segurança ela não está disponível. Fale com o seu vendedor.";

/** Link do WhatsApp da empresa pedindo uma nova proposta; sem número válido = null. */
export function linkSolicitarNovaProposta(whatsapp: string | null | undefined, clienteNome: string): string | null {
  const digitos = (whatsapp ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  const texto = `Olá, sou ${clienteNome} e gostaria de solicitar uma nova proposta de energia solar.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export type SituacaoEmissao = { disponivel: true } | { disponivel: false; mensagem: string };

/** Proposta com dados da emissão preservados? Hoje: nunca (não existe snapshot). */
export function emissaoPreservada(proposta?: unknown): boolean {
  void proposta;
  return false;
}

/** AAAA-MM-DD... (ou Date) -> DD/MM/AAAA no fuso de São Paulo; data inválida = null. */
export function dataDaEmissao(criadaEm: string | Date | null | undefined): string | null {
  if (!criadaEm) return null;
  const d = typeof criadaEm === "string" ? new Date(criadaEm) : criadaEm;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export const MENSAGEM_EMISSAO_INDISPONIVEL =
  "Os valores de economia desta proposta não estão disponíveis nesta versão do sistema. Fale com o seu vendedor.";

/** Mensagem completa de indisponibilidade (página pública e PDF 409). */
export function mensagemEmissaoIndisponivel(criadaEm?: string | Date | null): string {
  const data = dataDaEmissao(criadaEm);
  return `${data ? `Proposta emitida em ${data}. ` : ""}${MENSAGEM_EMISSAO_INDISPONIVEL}`;
}

/** Situação da emissão para a página pública e o PDF. */
export function situacaoDaEmissao(proposta: { created_at?: string | Date | null }): SituacaoEmissao {
  if (emissaoPreservada(proposta)) return { disponivel: true };
  return { disponivel: false, mensagem: mensagemEmissaoIndisponivel(proposta.created_at) };
}
