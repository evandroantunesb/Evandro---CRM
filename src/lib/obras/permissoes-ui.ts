/**
 * Espelho da regra `autorizacao_setor_obra` (migration 20261008100000) usado SÓ para decidir
 * o que MOSTRAR. As RPCs seguem como autoridade: nunca use isto como barreira de segurança.
 */
import type { Papel } from "@/lib/tipos";

export type AcaoSetor = "admin" | "coordenar" | "executar";

export type ContextoAtuacao = {
  papel: Papel | string | null | undefined;
  meusSetores: readonly { setor: string; capacidade: "executar" | "coordenar" | string }[];
  minhasParticipacoesAtivas: readonly { obraId: string; setor: string }[];
};

export function acaoSetor(ctx: ContextoAtuacao, obraId: string, setor: string): AcaoSetor | null {
  if (setor === "comercial") return null;
  if (ctx.papel === "admin") return "admin";
  if (ctx.papel === "operacao") {
    const meus = ctx.meusSetores.filter((s) => s.setor === setor);
    if (meus.some((s) => s.capacidade === "coordenar")) return "coordenar";
    if (
      meus.length > 0 &&
      ctx.minhasParticipacoesAtivas.some((p) => p.obraId === obraId && p.setor === setor)
    )
      return "executar";
  }
  return null;
}
