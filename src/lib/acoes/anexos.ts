"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { ANEXOS_E_NOTAS } from "@/lib/permissoes";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { reservarAnexosComCliente, reservaSchema, type Reserva } from "@/lib/anexos-servidor";
import { CATEGORIAS_ANEXO, type ResultadoAcao } from "@/lib/tipos";

/**
 * Reserva o registro dos arquivos de um negócio e devolve os caminhos para o navegador enviar o
 * conteúdo direto ao Storage (arquivo não passa pela Server Action, limitada a 1 MB). Usado pela
 * fatura do formulário "Dados do negócio".
 */
export async function reservarAnexos(
  negocioId: string,
  arquivos: { nome: string; tamanho: number; tipoMime: string; categoria: string }[],
): Promise<{ ok: true; reservas: Reserva[] } | { ok: false; mensagem: string }> {
  const { atual } = await exigirPapel(...ANEXOS_E_NOTAS);
  const d = z.object({ negocioId: z.string().uuid(), arquivos: z.array(reservaSchema).min(1).max(30) }).safeParse({ negocioId, arquivos });
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const r = await reservarAnexosComCliente(supabase, { empresaId: atual.empresaId, negocioId: d.data.negocioId, arquivos: d.data.arquivos });
  revalidatePath(`/negocios/${d.data.negocioId}`);
  return r;
}

/** O arquivo já foi enviado pelo navegador direto para o Storage; aqui só registramos. */
export async function registrarAnexo(dados: {
  negocioId: string;
  caminho: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  categoria?: string;
}): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...ANEXOS_E_NOTAS);
  const d = z
    .object({
      negocioId: z.string().uuid(),
      caminho: z.string().min(1),
      nome: z.string().trim().min(1).max(200),
      tamanho: z.number().int().nonnegative(),
      tipoMime: z.string().max(200),
      categoria: z.enum(CATEGORIAS_ANEXO).default("geral"),
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
    categoria: d.data.categoria,
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
  await exigirPapel(...ANEXOS_E_NOTAS);
  const id = z.string().uuid().safeParse(formData.get("anexoId"));
  if (!id.success) return;

  // O banco decide se pode apagar (quem enviou ou admin); só então o arquivo sai do Storage.
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anexos").delete().eq("id", id.data).select("caminho, negocio_id");
  if (!data?.[0]) return;
  await criarClienteAdmin().storage.from("anexos").remove([data[0].caminho]);
  revalidatePath(`/negocios/${data[0].negocio_id}`);
}
