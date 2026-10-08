"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { salvarKitComCliente } from "@/lib/negocios-gravacao";
import { exigirPapel } from "@/lib/sessao";
import { CALCULADORA } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO_LISTAS = "/configuracoes/listas";

/** Aceita "1.234,56", "1234,5" e "1234.5". */
const numeroBr = (mensagem: string) =>
  z
    .string()
    .trim()
    .min(1, mensagem)
    .transform((v) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
    .pipe(z.number({ message: mensagem }).positive(mensagem));

/** Salva o kit personalizado pelo núcleo `salvarKitComCliente` (itens com ou sem tarifa; cálculo com tarifa). */
export async function salvarKitPersonalizado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...CALCULADORA);
  const supabase = await criarClienteServidor();
  const { negocioId, ...r } = await salvarKitComCliente(supabase, atual, formData);
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
  .transform((v) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
  .pipe(z.number({ message: "Preço inválido" }).nonnegative("Preço inválido"));

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
    .transform((v) => Number(v.replace(",", ".")) / 100)
    .pipe(z.number().min(0, "Percentual inválido").max(1, "Percentual inválido"));
  const custoOpcional = z
    .string()
    .optional()
    .transform((v) => {
      if (!v || !v.trim()) return 0;
      return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
    })
    .pipe(z.number({ message: "Custo inválido" }).nonnegative("Custo inválido"));
  const dados = z
    .object({
      produtividade_kwh_kwp_mes: numeroBr("Informe a produtividade"),
      percentual_fio_b: percentual,
      disponibilidade_mono_kwh: numeroBr("Informe a disponibilidade monofásica"),
      disponibilidade_bi_kwh: numeroBr("Informe a disponibilidade bifásica"),
      disponibilidade_tri_kwh: numeroBr("Informe a disponibilidade trifásica"),
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
