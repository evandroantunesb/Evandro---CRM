/**
 * Registro de falha no servidor. Único ponto do app que escreve direto no console (a regra `no-direct-console` do
 * ESLint o libera); trocar o destino dos registros depois é mexer só aqui.
 */
export function registrarErro(mensagem: string, ...detalhes: unknown[]): void {
  console.error(mensagem, ...detalhes);
}
