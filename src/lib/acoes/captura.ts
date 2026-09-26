"use server";

import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(2, "Informe seu nome"),
  telefone: z.string().trim().min(8, "Informe um telefone válido"),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).optional(),
  cidade: z.string().trim().max(120).optional(),
  unidade_consumidora: z.string().trim().max(60).optional(),
});

/**
 * Envio do formulário público de captura (sem login). Cria o contato e o
 * negócio direto, já sorteando o responsável entre quem está marcado como
 * "recebe leads" — mesmo rodízio simples usado na entrega 6 (o item da fila
 * de aprovação do gestor fica para depois).
 */
export async function enviarCaptura(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const admin = criarClienteAdmin();

  const { data: formulario } = await admin
    .from("formularios")
    .select("id, empresa_id, funil_id, origem_id, ativo")
    .eq("token", d.token)
    .maybeSingle();
  if (!formulario || !formulario.ativo) return { ok: false, mensagem: "Este formulário não está mais disponível." };

  const { data: etapaInicial } = await admin
    .from("etapas")
    .select("id")
    .eq("funil_id", formulario.funil_id)
    .eq("ativa", true)
    .order("inicial", { ascending: false })
    .order("ordem")
    .limit(1)
    .single();
  if (!etapaInicial) return { ok: false, mensagem: "Não foi possível registrar seu contato agora. Tente novamente mais tarde." };

  const { data: contato, error: erroContato } = await admin
    .from("contatos")
    .insert({
      empresa_id: formulario.empresa_id,
      nome: d.nome,
      telefone: d.telefone,
      email: d.email || null,
      cidade: d.cidade || null,
    })
    .select("id")
    .single();
  if (erroContato || !contato) return { ok: false, mensagem: mensagemErro(erroContato, "Não foi possível registrar seu contato.") };

  // Rodízio: escolhe quem está ativo e marcado para receber leads, dando
  // preferência a quem está há mais tempo sem receber (ou nunca recebeu).
  const { data: proximo } = await admin
    .from("empresa_membros")
    .select("id")
    .eq("empresa_id", formulario.empresa_id)
    .eq("ativo", true)
    .eq("recebe_leads", true)
    .order("recebeu_lead_em", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  const { error: erroNegocio } = await admin.from("negocios").insert({
    empresa_id: formulario.empresa_id,
    titulo: d.nome,
    funil_id: formulario.funil_id,
    etapa_id: etapaInicial.id,
    origem_id: formulario.origem_id,
    responsavel_id: proximo?.id ?? null,
    contato_id: contato.id,
    unidade_consumidora: d.unidade_consumidora || null,
  });
  if (erroNegocio) return { ok: false, mensagem: mensagemErro(erroNegocio, "Não foi possível registrar seu contato.") };

  if (proximo) {
    await admin.from("empresa_membros").update({ recebeu_lead_em: new Date().toISOString() }).eq("id", proximo.id);
  }

  return { ok: true, mensagem: "Recebemos seus dados! Em breve um de nossos consultores vai falar com você." };
}
