/*
 * Assistente de primeiro acesso (Onboarding, subprojeto 3; 20261205100000_assistente_primeiro_acesso.sql; desenho em
 * docs/superpowers/specs/2026-11-11-assistente-primeiro-acesso-design.md). Regra pura dos passos: Solo tem 5 e PRO 7
 * (os setores entram como passo 5 do PRO no subprojeto 4). `passo_atual` é 1-based e `pulados` guarda as posições.
 */

export type ChavePasso = "empresa" | "marca" | "imagens" | "telas" | "pagamento" | "equipe" | "revisar";

/** Títulos e sobretítulos dos quadros aprovados. */
export const PASSOS: Record<ChavePasso, { titulo: string; chamada: string }> = {
  empresa: { titulo: "Sua empresa", chamada: "Como a sua empresa aparece" },
  marca: { titulo: "Marca e cores", chamada: "Como o Raion vai aparecer para a sua equipe" },
  imagens: { titulo: "Tela de entrada e faixa", chamada: "As imagens da sua empresa" },
  telas: { titulo: "Telas que a equipe usa", chamada: "Ligue só o que a sua empresa precisa" },
  pagamento: { titulo: "Formas de pagamento", chamada: "Como você recebe dos seus clientes" },
  equipe: { titulo: "Equipe", chamada: "Quem trabalha com você" },
  revisar: { titulo: "Revisar e começar", chamada: "Tudo pronto para começar" },
};

const SOLO: ChavePasso[] = ["empresa", "marca", "imagens", "pagamento", "revisar"];
const PRO: ChavePasso[] = ["empresa", "marca", "imagens", "telas", "pagamento", "equipe", "revisar"];

export const passosDoPlano = (solo: boolean): ChavePasso[] => [...(solo ? SOLO : PRO)];

export function proximoPasso(passos: readonly ChavePasso[], atual: ChavePasso): ChavePasso | null {
  const i = passos.indexOf(atual);
  return i >= 0 && i < passos.length - 1 ? passos[i + 1] : null;
}

export function passoAnterior(passos: readonly ChavePasso[], atual: ChavePasso): ChavePasso | null {
  const i = passos.indexOf(atual);
  return i > 0 ? passos[i - 1] : null;
}

export type EstadoAssistente = { passo_atual: number; pulados: readonly number[] };

export function estadoDoPasso(o: EstadoAssistente, passos: readonly ChavePasso[], chave: ChavePasso): "feito" | "pulado" | "pendente" {
  const posicao = passos.indexOf(chave) + 1;
  if (posicao < 1 || posicao >= o.passo_atual) return "pendente";
  return o.pulados.includes(posicao) ? "pulado" : "feito";
}

/** Passo do estado gravado (posição fora do plano = o primeiro). */
export function passoDoEstado(o: EstadoAssistente, passos: readonly ChavePasso[]): ChavePasso {
  return passos[Math.min(Math.max(o.passo_atual, 1), passos.length) - 1];
}
