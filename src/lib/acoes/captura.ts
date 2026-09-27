"use server";

import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Etiqueta com o nome do formulário (ex.: "Feira Cascavel 26/09"), pra dar pra
 * saber no Kanban de qual formulário/evento cada lead veio. Cria a etiqueta na
 * primeira vez que o formulário gera um lead; nas próximas, reaproveita.
 * Nunca falha o cadastro do lead por causa disso — só loga se der problema.
 */
async function garantirEtiquetaDoFormulario(
  admin: ReturnType<typeof criarClienteAdmin>,
  empresaId: string,
  nomeFormulario: string,
): Promise<string | null> {
  const { data: existente } = await admin
    .from("etiquetas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("nome", nomeFormulario)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: criada, error } = await admin
    .from("etiquetas")
    .insert({ empresa_id: empresaId, nome: nomeFormulario })
    .select("id")
    .single();
  if (criada) return criada.id;

  // Corrida: outro lead do mesmo formulário criou a etiqueta entre o select e o insert.
  if (error?.code === "23505") {
    const { data: recemCriada } = await admin
      .from("etiquetas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("nome", nomeFormulario)
      .maybeSingle();
    if (recemCriada) return recemCriada.id;
  }

  console.error("Falha ao criar/buscar etiqueta do formulário", nomeFormulario, error);
  return null;
}

const esquema = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(2, "Informe seu nome"),
  telefone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10 || v.length === 11, "Informe um telefone com DDD"),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).optional(),
  cidade: z.string().trim().max(120).optional(),
  valor_conta_energia: z.coerce.number({ message: "Informe o valor da sua conta de energia" }).positive("Informe um valor válido"),
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
    .select("id, nome, empresa_id, funil_id, origem_id, ativo")
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

  const { data: negocio, error: erroNegocio } = await admin
    .from("negocios")
    .insert({
      empresa_id: formulario.empresa_id,
      titulo: d.nome,
      funil_id: formulario.funil_id,
      etapa_id: etapaInicial.id,
      origem_id: formulario.origem_id,
      responsavel_id: proximo?.id ?? null,
      contato_id: contato.id,
      valor_conta_energia: d.valor_conta_energia,
    })
    .select("id")
    .single();
  if (erroNegocio || !negocio) return { ok: false, mensagem: mensagemErro(erroNegocio, "Não foi possível registrar seu contato.") };

  if (proximo) {
    await admin.from("empresa_membros").update({ recebeu_lead_em: new Date().toISOString() }).eq("id", proximo.id);
  }

  // Etiqueta com o nome do formulário, pra dar pra ver no Kanban de qual
  // formulário/evento o lead veio (nunca bloqueia o cadastro se falhar).
  const etiquetaId = await garantirEtiquetaDoFormulario(admin, formulario.empresa_id, formulario.nome);
  if (etiquetaId) {
    const { error: erroEtiqueta } = await admin
      .from("negocio_etiquetas")
      .insert({ negocio_id: negocio.id, etiqueta_id: etiquetaId, empresa_id: formulario.empresa_id });
    if (erroEtiqueta) console.error("Falha ao marcar etiqueta do formulário no negócio", negocio.id, erroEtiqueta);
  }

  const { error: erroMetrica } = await admin.rpc("incrementar_preenchimento_formulario", { p_id: formulario.id });
  if (erroMetrica) console.error("Falha ao contar preenchimento do formulário", formulario.id, erroMetrica);

  return { ok: true, mensagem: "Recebemos seus dados! Em breve um de nossos consultores vai falar com você." };
}
