"use server";

import { revalidatePath } from "next/cache";
import { criarNegocioEletropostoComCliente, salvarEletropostoComCliente } from "@/lib/eletroposto-gravacao";
import type { ResultadoCriacao } from "@/lib/negocios-gravacao";
import { NEGOCIOS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/** Cria o negócio de eletroposto pelo núcleo `criarNegocioEletropostoComCliente`. Não redireciona: a tela abre a ficha. */
export async function criarNegocioEletroposto(formData: FormData): Promise<ResultadoCriacao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const supabase = await criarClienteServidor();
  const r = await criarNegocioEletropostoComCliente(supabase, atual, formData);
  if (r.ok) revalidatePath("/negocios");
  return r;
}

/** Local próprio, usina FV e modelos da proposta, na ficha do negócio. */
export async function salvarEletroposto(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const supabase = await criarClienteServidor();
  const r = await salvarEletropostoComCliente(supabase, atual, formData);
  if (r.ok) revalidatePath(`/negocios/${formData.get("negocioId")}`);
  return r;
}
