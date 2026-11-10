"use server";

import { z } from "zod";
import { componenteKitSchema } from "@/lib/calculadora";
import { previaPrecoKit, type PreviaPrecoKit } from "@/lib/compras/precificacao-gravacao";
import { CALCULADORA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Prévia do preço de venda do kit pela tabela de preços (P4b), antes de gravar: só o preço sugerido e os avisos (item
 * sem preço, preço velho), nunca custo ou margem. Nulo = sem como calcular (sem acesso ou sem parâmetros).
 */
export async function sugerirPrecoKit(componentes: z.input<typeof componenteKitSchema>[]): Promise<PreviaPrecoKit | null> {
  const { atual } = await exigirPapel(...CALCULADORA);
  const r = z.array(componenteKitSchema).max(50).safeParse(componentes);
  if (!r.success || r.data.length === 0) return null;
  return previaPrecoKit(
    await criarClienteServidor(),
    atual.empresaId,
    r.data.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      quantidade: c.quantidade,
      potenciaW: c.potenciaW,
      materialId: c.materialId,
      precoVendaManual: c.precoVendaManual,
    })),
  );
}
