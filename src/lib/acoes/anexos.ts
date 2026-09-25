"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/** O arquivo já foi enviado pelo navegador direto para o Storage; aqui só registramos. */
export async function registrarAnexo(dados: {
  negocioId: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
}): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const d = z
    .object({
      negocioId: z.string().uuid(),
      caminho: z.string().min(1),
      nome: z.string().trim().min(1).max(200),
      tamanho: z.number().int().nonnegative(),
      tipoMime: z.string().max(200),
    })
    .safeParse(dados);
  if (!d.success || !d.data.caminho.startsWith(`${atual.empresaId}/${d.data.negocioId}/`)) {
    return { ok: false, mensagem: "Dados do arquivo inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anexos").insert({
    empresa_id: atual.empresaId,
    negocio_id: d.data.negocioId,
    caminho: d.data.caminho,
    nome: d.data.nome,
    tamanho: d.data.tamanho,
    tipo_mime: d.data.tipoMime || null,
  });
  if (error) {
    // Sem registro, o arquivo não aparece para ninguém: remove para não ocupar espaço,
    // desde que o usuário veja o negócio e o caminho não seja de um anexo já registrado.
    const admin = criarClienteAdmin();
    const [{ data: negocio }, { data: registrado }] = await Promise.all([
      supabase.from("negocios").select("id").eq("id", d.data.negocioId).maybeSingle(),
      admin.from("anexos").select("id").eq("caminho", d.data.caminho).maybeSingle(),
    ]);
    if (negocio && !registrado) await admin.storage.from("anexos").remove([d.data.caminho]);
    return { ok: false, mensagem: "Não foi possível registrar o arquivo." };
  }
  revalidatePath(`/negocios/${d.data.negocioId}`);
  return { ok: true, mensagem: "Arquivo anexado." };
}

export async function apagarAnexo(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("anexoId"));
  if (!id.success) return;

  // O banco decide se pode apagar (quem enviou ou admin); só então o arquivo sai do Storage.
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anexos").delete().eq("id", id.data).select("caminho, negocio_id");
  if (!data?.[0]) return;
  await criarClienteAdmin().storage.from("anexos").remove([data[0].caminho]);
  revalidatePath(`/negocios/${data[0].negocio_id}`);
}
