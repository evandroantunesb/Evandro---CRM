"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/propostas/identidade";

const corOpcional = z
  .union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB")])
  .optional();

const esquema = z.object({
  nome_exibicao: z.string().trim().max(120).optional(),
  cor_primaria: corOpcional,
  cor_destaque: corOpcional,
  whatsapp: z.string().trim().max(30).optional(),
  rodape_texto: z.string().trim().max(200).optional(),
  logo_url: z.string().trim().optional(),
  logo_escuro_url: z.string().trim().optional(),
  foto_capa_url: z.string().trim().optional(),
});

/**
 * Salva a identidade visual usada nas propostas da empresa (nome, logo,
 * cores, WhatsApp, rodapé, foto de capa padrão). Os campos de imagem
 * recebem o caminho no bucket "proposta-marca" (o upload em si é feito
 * direto do navegador, antes de chamar esta ação).
 */
export async function salvarIdentidadeProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("proposta_identidades").upsert(
    {
      empresa_id: atual.empresaId,
      nome_exibicao: d.nome_exibicao || null,
      cor_primaria: d.cor_primaria || null,
      cor_destaque: d.cor_destaque || null,
      whatsapp: d.whatsapp || null,
      rodape_texto: d.rodape_texto || null,
      ...(d.logo_url !== undefined ? { logo_url: d.logo_url || null } : {}),
      ...(d.logo_escuro_url !== undefined ? { logo_escuro_url: d.logo_escuro_url || null } : {}),
      ...(d.foto_capa_url !== undefined ? { foto_capa_url: d.foto_capa_url || null } : {}),
      atualizado_por: atual.membroId,
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, mensagem: "Não foi possível salvar a identidade visual." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Identidade visual salva." };
}
