"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { REGRAS_TEMPERATURA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

// Forma da lista; parâmetros de cada sinal são conferidos no banco (`preparar_regra_temperatura`).
const esquemaRegras = z
  .array(
    z.object({
      id: z.string().uuid(),
      ativa: z.boolean(),
      temperatura: z.enum(["quente", "frio"]),
      parametros: z
        .object({
          dias: z.number().optional(),
          etapas: z.array(z.string()).optional(),
          prazos: z.array(z.string()).optional(),
          exige_decisor: z.boolean().optional(),
        })
        .strict(),
    }),
  )
  .min(1);

/** Salva a lista inteira (ordem = posição na lista) numa só transação. */
export async function salvarRegrasTemperatura(json: string): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...REGRAS_TEMPERATURA);
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { ok: false, mensagem: "Dados inválidos." };
  }
  const regras = esquemaRegras.safeParse(bruto);
  if (!regras.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_regras_temperatura", { p_empresa_id: atual.empresaId, p_regras: regras.data });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath("/configuracoes/temperatura");
  revalidatePath("/negocios", "layout");
  return { ok: true, mensagem: "Regras salvas. A temperatura dos negócios já foi recalculada." };
}
