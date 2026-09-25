"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcular, componentesJsonSchema, DISPONIBILIDADE_PADRAO, nomeKitPersonalizado, potenciaKitPersonalizadoKwp } from "@/lib/calculadora";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_LIGACAO, type TipoLigacao, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO_LISTAS = "/configuracoes/listas";

type LinhaCalculo = Omit<
  Database["public"]["Tables"]["calculos_solares"]["Insert"],
  "negocio_id" | "observacoes" | "atualizado_por" | "criado_por"
>;

/**
 * Monta a linha de `calculos_solares` a partir do kit (personalizado, por
 * componentes) e dos parâmetros da empresa. Compartilhado entre "salvar kit
 * e cálculo" (negócio já existe) e a criação de negócio com calculadora
 * embutida (nova proposta).
 */
export async function montarLinhaCalculo(
  supabase: SupabaseServidor,
  empresaId: string,
  entrada: {
    kitNome: string;
    potenciaKwp: number;
    precoKit: number;
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
  },
): Promise<{ ok: true; linha: LinhaCalculo } | { ok: false; mensagem: string }> {
  if (entrada.consumoMedioKwh == null && entrada.valorFaturaMedio == null) {
    return { ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura." };
  }
  if (entrada.potenciaKwp <= 0) {
    return { ok: false, mensagem: "Informe ao menos um módulo com potência para calcular." };
  }
  const consumoMedioKwh = entrada.consumoMedioKwh ?? entrada.valorFaturaMedio! / entrada.tarifaKwh;

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]] as number;
  const resultado = calcular({
    potenciaKwp: entrada.potenciaKwp,
    precoKit: entrada.precoKit,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: entrada.tarifaKwh,
    produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  return {
    ok: true,
    linha: {
      empresa_id: empresaId,
      kit_id: null,
      kit_nome: entrada.kitNome,
      kit_potencia_kwp: entrada.potenciaKwp,
      kit_preco: entrada.precoKit,
      tipo_ligacao: entrada.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: entrada.valorFaturaMedio,
      tarifa_kwh: entrada.tarifaKwh,
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
      // Sem preço do kit (negócio sem valor definido), o payback não tem
      // significado — fica em aberto em vez de mostrar "0 meses".
      payback_meses: entrada.precoKit > 0 ? resultado.paybackMeses : null,
    },
  };
}

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

/**
 * Salva o kit personalizado (módulos, inversor, baterias, outros) e recalcula
 * o cálculo solar do negócio a partir dele. O preço usado no payback é o
 * valor do negócio (o kit personalizado não tem preço por item).
 */
export async function salvarKitPersonalizado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = z
    .object({
      negocioId: z.string().uuid(),
      tipoLigacao: z.enum(TIPOS_LIGACAO),
      consumoMedioKwh: numeroBrOpcional,
      valorFaturaMedio: numeroBrOpcional,
      tarifaKwh: numeroBr("Informe a tarifa"),
      estruturaTelhado: z.string().trim().max(120).optional(),
      componentes: componentesJsonSchema,
      observacoes: z.string().trim().max(2000, "Máximo de 2.000 caracteres").optional(),
    })
    .refine((d) => d.consumoMedioKwh != null || d.valorFaturaMedio != null, {
      message: "Informe o consumo médio ou o valor médio da fatura.",
      path: ["consumoMedioKwh"],
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data: negocio } = await supabase.from("negocios").select("valor").eq("id", d.negocioId).maybeSingle();
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };

  const montado = await montarLinhaCalculo(supabase, atual.empresaId, {
    kitNome: nomeKitPersonalizado(d.componentes),
    potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
    precoKit: negocio.valor ?? 0,
    tipoLigacao: d.tipoLigacao,
    consumoMedioKwh: d.consumoMedioKwh,
    valorFaturaMedio: d.valorFaturaMedio,
    tarifaKwh: d.tarifaKwh,
  });
  if (!montado.ok) return montado;

  const { error: erroCalculo } = await supabase.from("calculos_solares").upsert(
    {
      ...montado.linha,
      negocio_id: d.negocioId,
      observacoes: d.observacoes || null,
      atualizado_por: atual.membroId,
      criado_por: atual.membroId,
    },
    { onConflict: "negocio_id", ignoreDuplicates: false },
  );
  if (erroCalculo) return { ok: false, mensagem: mensagemErro(erroCalculo, "Não foi possível salvar o cálculo.") };

  await supabase.from("negocios").update({ estrutura_telhado: d.estruturaTelhado || null }).eq("id", d.negocioId);

  // Substitui a lista de componentes (mais simples que sincronizar item a item).
  await supabase.from("kit_componentes").delete().eq("negocio_id", d.negocioId);
  if (d.componentes.length) {
    const { error: erroComponentes } = await supabase.from("kit_componentes").insert(
      d.componentes.map((c, i) => ({
        empresa_id: atual.empresaId,
        negocio_id: d.negocioId,
        tipo: c.tipo,
        descricao: c.descricao,
        potencia_w: c.potenciaW,
        quantidade: c.quantidade,
        ordem: i,
      })),
    );
    if (erroComponentes) {
      return { ok: false, mensagem: "Cálculo salvo, mas não foi possível salvar os componentes do kit." };
    }
  }

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Kit e cálculo salvos." };
}

export async function apagarCalculo(formData: FormData) {
  await exigirPapel();
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
