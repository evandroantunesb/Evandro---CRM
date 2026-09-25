"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcular, DISPONIBILIDADE_PADRAO } from "@/lib/calculadora";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_LIGACAO, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO_LISTAS = "/configuracoes/listas";

/** Aceita "1.234,56", "1234,5" e "1234.5". */
const numeroBr = (mensagem: string) =>
  z
    .string()
    .trim()
    .min(1, mensagem)
    .transform((v) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
    .pipe(z.number({ message: mensagem }).positive(mensagem));

const numeroBrOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  })
  .pipe(z.number().positive().nullable());

export async function salvarCalculo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = z
    .object({
      negocioId: z.string().uuid(),
      kitId: z.string().uuid("Escolha um kit"),
      tipoLigacao: z.enum(TIPOS_LIGACAO),
      consumoMedioKwh: numeroBrOpcional,
      valorFaturaMedio: numeroBrOpcional,
      tarifaKwh: numeroBr("Informe a tarifa"),
      observacoes: z.string().trim().max(2000, "Máximo de 2.000 caracteres").optional(),
    })
    .refine((d) => d.consumoMedioKwh != null || d.valorFaturaMedio != null, {
      message: "Informe o consumo médio ou o valor médio da fatura.",
      path: ["consumoMedioKwh"],
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const consumoMedioKwh = d.consumoMedioKwh ?? d.valorFaturaMedio! / d.tarifaKwh;

  const supabase = await criarClienteServidor();
  const [{ data: kit }, { data: parametros }] = await Promise.all([
    supabase
      .from("kits_solares")
      .select("id, nome, potencia_kwp, preco")
      .eq("id", d.kitId)
      .eq("empresa_id", atual.empresaId)
      .maybeSingle(),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  if (!kit) return { ok: false, mensagem: "Kit não encontrado." };
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[d.tipoLigacao]] as number;
  const resultado = calcular({
    potenciaKwp: kit.potencia_kwp,
    precoKit: kit.preco,
    tipoLigacao: d.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: d.tarifaKwh,
    produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  const { error } = await supabase.from("calculos_solares").upsert(
    {
      empresa_id: atual.empresaId,
      negocio_id: d.negocioId,
      kit_id: kit.id,
      kit_nome: kit.nome,
      kit_potencia_kwp: kit.potencia_kwp,
      kit_preco: kit.preco,
      tipo_ligacao: d.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: d.valorFaturaMedio,
      tarifa_kwh: d.tarifaKwh,
      produtividade_kwh_kwp_mes: parametros.produtividade_kwh_kwp_mes,
      percentual_fio_b: parametros.percentual_fio_b,
      disponibilidade_kwh: disponibilidadeKwh,
      geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      payback_meses: resultado.paybackMeses,
      observacoes: d.observacoes || null,
      atualizado_por: atual.membroId,
      criado_por: atual.membroId,
    },
    { onConflict: "negocio_id", ignoreDuplicates: false },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o cálculo.") };

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Cálculo salvo." };
}

export async function apagarCalculo(formData: FormData) {
  await exigirPapel();
  const id = z.string().uuid().safeParse(formData.get("calculoId"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("calculos_solares").delete().eq("id", id.data).select("negocio_id");
  if (data?.[0]) revalidatePath(`/negocios/${data[0].negocio_id}`);
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
  const dados = z
    .object({
      produtividade_kwh_kwp_mes: numeroBr("Informe a produtividade"),
      percentual_fio_b: percentual,
      disponibilidade_mono_kwh: numeroBr("Informe a disponibilidade monofásica"),
      disponibilidade_bi_kwh: numeroBr("Informe a disponibilidade bifásica"),
      disponibilidade_tri_kwh: numeroBr("Informe a disponibilidade trifásica"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("parametros_calculadora").update(dados.data).eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar os parâmetros.") };
  revalidatePath(CAMINHO_LISTAS);
  return { ok: true, mensagem: "Parâmetros salvos." };
}
