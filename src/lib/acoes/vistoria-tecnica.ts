"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  negocioId: z.string().uuid(),
  observacoes: z.string().trim().max(3000),
  confirmar: z.enum(["sim", "nao"]),
});

export async function salvarVistoriaTecnica(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("vendedor");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_vistoria_tecnica", {
    p_negocio_id: dados.data.negocioId,
    p_visita_realizada: formData.get("visitaRealizada") === "on",
    p_medidor_inspecionado: formData.get("medidorInspecionado") === "on",
    p_telhado_inspecionado: formData.get("telhadoInspecionado") === "on",
    p_observacoes: dados.data.observacoes,
    p_confirmar: dados.data.confirmar === "sim",
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar a vistoria técnica.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: dados.data.confirmar === "sim" ? "Vistoria confirmada." : "Vistoria salva como rascunho." };
}
