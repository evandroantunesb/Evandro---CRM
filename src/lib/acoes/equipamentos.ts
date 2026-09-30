"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/calculadora";

// Campos elétricos são opcionais (datasheet nem sempre é cadastrado de uma vez) —
// número positivo quando informado, null quando o campo vem vazio do formulário.
const campoEletricoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().positive().nullable());

const coefTempOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().nullable());

const quantidadeMpptOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().int().positive().nullable());

const camposEletricosModulo = {
  vocV: campoEletricoOpcional,
  iscA: campoEletricoOpcional,
  vmpV: campoEletricoOpcional,
  impA: campoEletricoOpcional,
  coefTempVocPctC: coefTempOpcional,
};

const camposEletricosInversor = {
  tensaoMaxDcV: campoEletricoOpcional,
  mpptMinV: campoEletricoOpcional,
  mpptMaxV: campoEletricoOpcional,
  correnteMaxEntradaA: campoEletricoOpcional,
  quantidadeMppt: quantidadeMpptOpcional,
};

/** Ativa um módulo ou inversor do catálogo (OpenSolar) como opção do dimensionamento automático. */
export async function ativarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      tipo: z.enum(["modulo", "inversor"]),
      opensolarId: z.coerce.number().int().optional(),
      fabricante: z.string().trim().min(1, "Informe o fabricante").max(120),
      modelo: z.string().trim().min(1, "Informe o modelo").max(120),
      potenciaW: z.coerce.number().positive("Informe a potência"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("equipamentos_empresa").insert({
    empresa_id: atual.empresaId,
    tipo: d.tipo,
    opensolar_id: d.opensolarId ?? null,
    fabricante: d.fabricante,
    modelo: d.modelo,
    potencia_w: d.potenciaW,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível ativar o equipamento.") };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Equipamento ativado." };
}

/**
 * Liga/desliga um equipamento já ativado, ajusta a prioridade comercial dele
 * no ranking automático e salva os dados elétricos do datasheet (usados pelo
 * motor de dimensionamento pra validar string/MPPT — ver `dimensionamento.ts`).
 * Os campos elétricos são opcionais e variam por tipo (módulo vs. inversor);
 * o formulário só envia os do tipo correspondente.
 */
export async function editarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z
    .object({
      id: z.string().uuid(),
      tipo: z.enum(["modulo", "inversor"]),
      prioridade: z.coerce.number().int().min(-100).max(100),
      ...camposEletricosModulo,
      ...camposEletricosInversor,
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("equipamentos_empresa")
    .update({
      prioridade: d.prioridade,
      ativo: formData.get("ativo") === "on",
      ...(d.tipo === "modulo"
        ? {
            voc_v: d.vocV,
            isc_a: d.iscA,
            vmp_v: d.vmpV,
            imp_a: d.impA,
            coef_temp_voc_pct_c: d.coefTempVocPctC,
          }
        : {
            tensao_max_dc_v: d.tensaoMaxDcV,
            mppt_min_v: d.mpptMinV,
            mppt_max_v: d.mpptMaxV,
            corrente_max_entrada_a: d.correnteMaxEntradaA,
            quantidade_mppt: d.quantidadeMppt,
          }),
    })
    .eq("id", d.id);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarEquipamento(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  await supabase.from("equipamentos_empresa").delete().eq("id", id.data);
  revalidatePath(CAMINHO);
}
