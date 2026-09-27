"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { TIPOS_BLOCO_PROPOSTA, type TipoBloco } from "@/lib/propostas/blocos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO_LISTA = "/configuracoes/propostas";
const caminhoModelo = (id: string) => `/configuracoes/propostas/modelos/${id}`;

const CAPAS = ["foto", "minimalista", "tecnica"] as const;

// Ponto de partida de cada base oferecida em "Criar modelo": lista de tipos
// de bloco já na ordem certa (o gestor pode reordenar/remover depois). Só
// usa tipos com renderer pronto (`implementado: true` em blocos.ts).
const BASES_MODELO = {
  expressa: ["cover", "system_summary", "investment_main", "payment_options", "next_steps"],
  comercial: [
    "cover",
    "system_summary",
    "equipment_summary",
    "how_it_works",
    "generation_monthly_chart",
    "investment_main",
    "payment_options",
    "before_after_bill",
    "included_services",
    "next_steps",
  ],
  completa: [
    "cover",
    "system_summary",
    "equipment_summary",
    "how_it_works",
    "generation_monthly_chart",
    "investment_main",
    "payment_options",
    "before_after_bill",
    "included_services",
    "next_steps",
  ],
  em_branco: ["cover", "investment_main"],
} satisfies Record<string, TipoBloco[]>;

const esquemaCriar = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
  descricao: z.string().trim().max(300).optional(),
  capa_variante: z.enum(CAPAS),
  base: z.enum(["expressa", "comercial", "completa", "em_branco"]),
});

export async function criarModeloProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaCriar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data: modelo, error } = await supabase
    .from("proposta_modelos")
    .insert({
      empresa_id: atual.empresaId,
      nome: d.nome,
      descricao: d.descricao || null,
      capa_variante: d.capa_variante,
      criado_por: atual.membroId,
      atualizado_por: atual.membroId,
    })
    .select("id")
    .single();
  if (error || !modelo) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar o modelo.") };

  const blocos = BASES_MODELO[d.base].map((tipo, ordem) => ({ modelo_id: modelo.id, tipo, ordem }));
  const { error: erroBlocos } = await supabase.from("proposta_modelo_blocos").insert(blocos);
  if (erroBlocos) return { ok: false, mensagem: "Modelo criado, mas houve um problema ao montar os blocos iniciais." };

  revalidatePath(CAMINHO_LISTA);
  return { ok: true, mensagem: "Modelo criado." };
}

async function carregarModeloDaEmpresa(id: string, empresaId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("proposta_modelos").select("id").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  return data;
}

export async function duplicarModeloProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { data: original } = await supabase
    .from("proposta_modelos")
    .select("nome, descricao, capa_variante, empresa_id, proposta_modelo_blocos(tipo, ordem, ativo, quebra_pagina, config)")
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  if (!original) return { ok: false, mensagem: "Modelo não encontrado." };

  const { data: copia, error } = await supabase
    .from("proposta_modelos")
    .insert({
      empresa_id: atual.empresaId,
      nome: `${original.nome} (cópia)`,
      descricao: original.descricao,
      capa_variante: original.capa_variante,
      criado_por: atual.membroId,
      atualizado_por: atual.membroId,
    })
    .select("id")
    .single();
  if (error || !copia) return { ok: false, mensagem: mensagemErro(error, "Não foi possível duplicar o modelo.") };

  const blocosOriginais = (original.proposta_modelo_blocos ?? []) as {
    tipo: string;
    ordem: number;
    ativo: boolean;
    quebra_pagina: string;
    config: unknown;
  }[];
  if (blocosOriginais.length > 0) {
    const { error: erroBlocos } = await supabase.from("proposta_modelo_blocos").insert(
      blocosOriginais.map((b) => ({
        modelo_id: copia.id,
        tipo: b.tipo,
        ordem: b.ordem,
        ativo: b.ativo,
        quebra_pagina: b.quebra_pagina as never,
        config: b.config as never,
      })),
    );
    if (erroBlocos) return { ok: false, mensagem: "Modelo duplicado, mas houve um problema ao copiar os blocos." };
  }

  revalidatePath(CAMINHO_LISTA);
  return { ok: true, mensagem: "Modelo duplicado." };
}

export async function definirModeloPadrao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await carregarModeloDaEmpresa(id.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  // Tira o padrão de qualquer outro modelo da empresa antes de marcar este
  // (o índice único só permite um padrao=true por empresa por vez).
  await supabase.from("proposta_modelos").update({ padrao: false }).eq("empresa_id", atual.empresaId).eq("padrao", true);
  const { error } = await supabase.from("proposta_modelos").update({ padrao: true, atualizado_por: atual.membroId }).eq("id", id.data);
  if (error) return { ok: false, mensagem: "Não foi possível definir como padrão." };
  revalidatePath(CAMINHO_LISTA);
  return { ok: true, mensagem: "Definido como padrão." };
}

export async function alternarPublicacaoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };
  const publicar = formData.get("publicar") === "1";

  const supabase = await criarClienteServidor();
  const { data: modelo } = await supabase
    .from("proposta_modelos")
    .select("revisao")
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  if (!modelo) return { ok: false, mensagem: "Modelo não encontrado." };

  if (publicar) {
    // Investimento é obrigatório no modelo comercial mínimo: nunca publicar
    // um modelo sem o bloco de valor total ativo.
    const { count } = await supabase
      .from("proposta_modelo_blocos")
      .select("id", { count: "exact", head: true })
      .eq("modelo_id", id.data)
      .eq("tipo", "investment_main")
      .eq("ativo", true);
    if (!count) return { ok: false, mensagem: "Adicione e ative o bloco \"Valor total da proposta\" antes de publicar." };
  }

  const { error } = await supabase
    .from("proposta_modelos")
    .update({
      status: publicar ? "publicado" : "rascunho",
      revisao: publicar ? modelo.revisao + 1 : modelo.revisao,
      atualizado_por: atual.membroId,
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(CAMINHO_LISTA);
  return { ok: true, mensagem: publicar ? "Modelo publicado." : "Modelo despublicado." };
}

export async function arquivarModeloProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_modelos")
    .update({ status: "arquivado", padrao: false, atualizado_por: atual.membroId })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: "Não foi possível arquivar o modelo." };
  revalidatePath(CAMINHO_LISTA);
  return { ok: true, mensagem: "Modelo arquivado." };
}

export async function renomearModeloProposta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const esquema = z.object({
    nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
    descricao: z.string().trim().max(300).optional(),
    capa_variante: z.enum(CAPAS),
  });
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_modelos")
    .update({ nome: dados.data.nome, descricao: dados.data.descricao || null, capa_variante: dados.data.capa_variante, atualizado_por: atual.membroId })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(CAMINHO_LISTA);
  revalidatePath(caminhoModelo(id.data));
  return { ok: true, mensagem: "Modelo atualizado." };
}

// ---------------------------------------------------------------------------
// Blocos do construtor
// ---------------------------------------------------------------------------

async function empresaDoModelo(modeloId: string, empresaId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("proposta_modelos").select("id").eq("id", modeloId).eq("empresa_id", empresaId).maybeSingle();
  return !!data;
}

export async function adicionarBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  const tipo = z.enum(TIPOS_BLOCO_PROPOSTA as [string, ...string[]]).safeParse(formData.get("tipo"));
  if (!modeloId.success || !tipo.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  const { data: ultimo } = await supabase
    .from("proposta_modelo_blocos")
    .select("ordem")
    .eq("modelo_id", modeloId.data)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("proposta_modelo_blocos")
    .insert({ modelo_id: modeloId.data, tipo: tipo.data, ordem: (ultimo?.ordem ?? -1) + 1 });
  if (error) return { ok: false, mensagem: "Não foi possível adicionar o bloco." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Bloco adicionado." };
}

export async function removerBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  if (!id.success || !modeloId.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("proposta_modelo_blocos").delete().eq("id", id.data).eq("modelo_id", modeloId.data);
  if (error) return { ok: false, mensagem: "Não foi possível remover o bloco." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Bloco removido." };
}

export async function alternarBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  if (!id.success || !modeloId.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_modelo_blocos")
    .update({ ativo: formData.get("ativo") === "1" })
    .eq("id", id.data)
    .eq("modelo_id", modeloId.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Salvo." };
}

export async function moverBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  const id = z.string().uuid().safeParse(formData.get("id"));
  const direcao = z.enum(["cima", "baixo"]).safeParse(formData.get("direcao"));
  if (!modeloId.success || !id.success || !direcao.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  const { data: blocos } = await supabase
    .from("proposta_modelo_blocos")
    .select("id, ordem")
    .eq("modelo_id", modeloId.data)
    .order("ordem", { ascending: true });
  if (!blocos) return { ok: false, mensagem: "Não foi possível reordenar." };

  const indice = blocos.findIndex((b) => b.id === id.data);
  const vizinho = direcao.data === "cima" ? indice - 1 : indice + 1;
  if (indice === -1 || vizinho < 0 || vizinho >= blocos.length) return { ok: true, mensagem: "" };

  const a = blocos[indice]!;
  const b = blocos[vizinho]!;
  const [erroA, erroB] = await Promise.all([
    supabase.from("proposta_modelo_blocos").update({ ordem: b.ordem }).eq("id", a.id).then((r) => r.error),
    supabase.from("proposta_modelo_blocos").update({ ordem: a.ordem }).eq("id", b.id).then((r) => r.error),
  ]);
  if (erroA || erroB) return { ok: false, mensagem: "Não foi possível reordenar." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Reordenado." };
}

const esquemaQuebra = z.enum(["auto", "nova_pagina", "pagina_exclusiva"]);

export async function definirQuebraBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  const quebra = esquemaQuebra.safeParse(formData.get("quebra_pagina"));
  if (!id.success || !modeloId.success || !quebra.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_modelo_blocos")
    .update({ quebra_pagina: quebra.data })
    .eq("id", id.data)
    .eq("modelo_id", modeloId.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Salvo." };
}

/** Salva o `config` (JSON) de um bloco — os campos variam por tipo, resolvidos no formulário de cada bloco. */
export async function salvarConfigBlocoModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const modeloId = z.string().uuid().safeParse(formData.get("modeloId"));
  const configBruto = z.string().safeParse(formData.get("config"));
  if (!id.success || !modeloId.success || !configBruto.success) return { ok: false, mensagem: "Dados inválidos." };
  if (!(await empresaDoModelo(modeloId.data, atual.empresaId))) return { ok: false, mensagem: "Modelo não encontrado." };

  let config: unknown;
  try {
    config = JSON.parse(configBruto.data);
  } catch {
    return { ok: false, mensagem: "Configuração inválida." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("proposta_modelo_blocos")
    .update({ config: config as never })
    .eq("id", id.data)
    .eq("modelo_id", modeloId.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  revalidatePath(caminhoModelo(modeloId.data));
  return { ok: true, mensagem: "Conteúdo do bloco salvo." };
}
