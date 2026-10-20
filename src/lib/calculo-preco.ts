/**
 * Preço do cálculo solar x valor do negócio, sem React nem banco. O cálculo guarda o preço do kit
 * como retrato do valor do negócio no momento em que foi salvo; a proposta mostra esse retrato e o
 * contrato usa o valor atual. Quando os dois divergem, quem gera o documento precisa saber.
 */

function centavos(v: number): number {
  return Math.round(v * 100);
}

/** Preço do cálculo em dia com o valor do negócio (negócio sem valor conta como zero, como no cálculo). */
export function precoDoCalculoDesatualizado(kitPreco: number, valorNegocio: number | null): boolean {
  return centavos(kitPreco) !== centavos(valorNegocio ?? 0);
}

/**
 * Payback com o preço novo, pela mesma regra do cálculo: preço ÷ economia mensal, 1 casa; em aberto
 * sem preço ou sem economia. A economia não depende do preço, então não é refeita.
 */
export function paybackComPreco(preco: number, economiaMensal: number): number | null {
  if (!(preco > 0) || !(economiaMensal > 0)) return null;
  return Math.round((preco / economiaMensal) * 10) / 10;
}

export const MENSAGEM_PRECO_DESATUALIZADO =
  "O valor do negócio mudou depois do cálculo: a proposta mostra o preço antigo. Use “Atualizar preço no cálculo” antes de gerar o contrato.";
