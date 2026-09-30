export type StatusQualificacao = { rotulo: string; tom: "positivo" | "neutro" | "atencao"; atendidos: number; total: number };

/**
 * Critérios fixos por enquanto (telefone válido, interesse confirmado, decisor identificado).
 * Critérios configuráveis pelo gestor (spec RAION_SDR_REGRAS_PERMISSOES §18) ficam pra fase futura.
 */
export function calcularStatusQualificacao(telefoneValido: boolean, objetivo: string | null, eDecisor: boolean | null): StatusQualificacao {
  const criterios = [telefoneValido, !!objetivo, eDecisor !== null];
  const atendidos = criterios.filter(Boolean).length;
  const tom = atendidos === criterios.length ? "positivo" : atendidos === 0 ? "neutro" : "atencao";
  const rotulo = atendidos === criterios.length ? "Qualificado" : atendidos === 0 ? "Não qualificado" : "Parcialmente qualificado";
  return { rotulo, tom, atendidos, total: criterios.length };
}
