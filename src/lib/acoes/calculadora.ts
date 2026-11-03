"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { lerNumeroBr, MENSAGEM_NUMERO_BR } from "@/lib/formatacao";
import { atualizarPrecoCalculoComCliente, salvarKitComCliente } from "@/lib/negocios-gravacao";
import { LIMITES_CONFIRMACAO } from "@/lib/propostas/proposta-simples";
import { exigirPapel } from "@/lib/sessao";
import { CALCULADORA } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO_LISTAS = "/configuracoes/listas";

/** Padrão brasileiro ("1.234,56", "1234,5"); fora dele é recusado (ver `lerNumeroBr`). */
const numeroBr = (mensagem: string) =>
  z
    .string()
    .trim()
    .min(1, mensagem)
    .transform(lerNumeroBr)
    .pipe(z.number({ message: `${mensagem}. ${MENSAGEM_NUMERO_BR}` }).positive(mensagem));

/** Salva o kit personalizado pelo núcleo `salvarKitComCliente` (itens com ou sem tarifa; cálculo com tarifa). */
export async function salvarKitPersonalizado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...CALCULADORA);
  const supabase = await criarClienteServidor();
  const { negocioId, ...r } = await salvarKitComCliente(supabase, atual, formData);
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
  return r;
}

/** "Atualizar preço no cálculo": só o preço do kit e o payback, pelo valor atual do negócio. */
export async function atualizarPrecoCalculo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...CALCULADORA);
  const id = z.string().uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return { ok: false, mensagem: "Negócio inválido." };
  const supabase = await criarClienteServidor();
  const { negocioId, ...r } = await atualizarPrecoCalculoComCliente(supabase, atual, id.data);
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
  return r;
}

export async function apagarCalculo(formData: FormData) {
  await exigirPapel(...CALCULADORA);
  const id = z.string().uuid().safeParse(formData.get("calculoId"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("calculos_solares").delete().eq("id", id.data).select("negocio_id");
  if (data?.[0]) {
    await supabase.from("kit_componentes").delete().eq("negocio_id", data[0].negocio_id);
    revalidatePath(`/negocios/${data[0].negocio_id}`);
  }
}

const nomeKit = z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo");
const potenciaKwp = numeroBr("Informe a potência do kit");
const precoKit = z
  .string()
  .trim()
  .min(1, "Informe o preço")
  .transform(lerNumeroBr)
  .pipe(z.number({ message: `Preço inválido. ${MENSAGEM_NUMERO_BR}` }).nonnegative("Preço inválido"));

export async function criarKit(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({ nome: nomeKit, potencia_kwp: potenciaKwp, preco: precoKit, descricao: z.string().trim().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("kits_solares").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    potencia_kwp: dados.data.potencia_kwp,
    preco: dados.data.preco,
    descricao: dados.data.descricao || null,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar o kit.") };
  revalidatePath(CAMINHO_LISTAS);
  return { ok: true, mensagem: "Kit criado." };
}

export async function editarKit(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z
    .object({
      id: z.string().uuid(),
      nome: nomeKit,
      potencia_kwp: potenciaKwp,
      preco: precoKit,
      descricao: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("kits_solares")
    .update({
      nome: dados.data.nome,
      potencia_kwp: dados.data.potencia_kwp,
      preco: dados.data.preco,
      descricao: dados.data.descricao || null,
      ativo: formData.get("ativo") === "on",
    })
    .eq("id", dados.data.id);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o kit.") };
  revalidatePath(CAMINHO_LISTAS);
  return { ok: true, mensagem: "Salvo." };
}

export async function editarParametros(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const percentual = z
    .string()
    .trim()
    // Vazio continua valendo 0%, como antes.
    .transform((v) => (lerNumeroBr(v) ?? 0) / 100)
    .pipe(z.number({ message: `Percentual inválido. ${MENSAGEM_NUMERO_BR}` }).min(0, "Percentual inválido").max(1, "Percentual inválido"));
  const custoOpcional = z
    .string()
    .optional()
    .transform((v) => lerNumeroBr(v) ?? 0)
    .pipe(z.number({ message: `Custo inválido. ${MENSAGEM_NUMERO_BR}` }).nonnegative("Custo inválido"));
  const dados = z
    .object({
      // Fio B e disponibilidade não são mais editáveis: a estimativa usa a regra legal (Lei 14.300, art. 27; REN 1.000,
      // art. 291). As colunas ficam só para conferir as linhas da fórmula antiga e nunca são gravadas por aqui.
      produtividade_kwh_kwp_mes: numeroBr("Informe a produtividade"),
      custo_instalacao_por_modulo: custoOpcional,
      custo_material_ca_por_kwp: custoOpcional,
      custo_engenharia: custoOpcional,
      comissao_percentual: percentual,
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("parametros_calculadora").update(dados.data).eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar os parâmetros.") };
  revalidatePath(CAMINHO_LISTAS);
  return { ok: true, mensagem: "Parâmetros salvos." };
}

/**
 * O admin confirma o valor ATUAL da produtividade informando o valor que viu, a fonte e o responsável pela validação.
 * Só com essa confirmação a geração estimada pode aparecer numa proposta emitida; mudar o valor apaga a confirmação.
 */
export async function confirmarProdutividade(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      valor: z.coerce.number().positive("Informe o valor da produtividade."),
      fonte: z.string().trim().min(LIMITES_CONFIRMACAO.fonteMin, `Informe a fonte do valor (mínimo de ${LIMITES_CONFIRMACAO.fonteMin} caracteres).`).max(LIMITES_CONFIRMACAO.fonteMax, `A fonte passa de ${LIMITES_CONFIRMACAO.fonteMax} caracteres.`),
      responsavel: z.string().trim().min(LIMITES_CONFIRMACAO.responsavelMin, "Informe quem validou o valor.").max(LIMITES_CONFIRMACAO.responsavelMax, `O nome passa de ${LIMITES_CONFIRMACAO.responsavelMax} caracteres.`),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]!.message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_produtividade_calculadora", {
    p_empresa_id: atual.empresaId,
    p_valor: dados.data.valor,
    p_fonte: dados.data.fonte,
    p_responsavel: dados.data.responsavel,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível confirmar a produtividade.") };
  revalidatePath(CAMINHO_LISTAS);
  revalidatePath("/configuracoes/calculadora");
  return { ok: true, mensagem: "Produtividade confirmada." };
}
