"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularValorComissao, encontrarFaixa, type FaixaComissao } from "@/lib/comissoes";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_CALCULO_COMISSAO, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/comissoes";

const esquemaFaixa = z
  .object({
    resultado_minimo: z.number().nonnegative(),
    resultado_maximo: z.number().positive().nullable(),
    valor: z.number().positive(),
  })
  .refine((f) => f.resultado_maximo === null || f.resultado_maximo > f.resultado_minimo, {
    message: "O teto da faixa precisa ser maior que o piso.",
  });

const esquemaPlano = z.object({
  membroId: z.string().uuid(),
  salarioBase: z.coerce.number().nonnegative().optional().or(z.literal("").transform(() => undefined)),
  metaOte: z.coerce.number().nonnegative().optional().or(z.literal("").transform(() => undefined)),
  tipoCalculo: z.enum(TIPOS_CALCULO_COMISSAO),
  faixasJson: z.string(),
});

function analisarFaixas(json: string): { ok: true; faixas: FaixaComissao[] } | { ok: false; mensagem: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { ok: false, mensagem: "Faixas inválidas." };
  }
  const analise = z.array(esquemaFaixa).min(1, "Cadastre ao menos uma faixa.").safeParse(bruto);
  if (!analise.success) return { ok: false, mensagem: analise.error.issues[0].message };
  return { ok: true, faixas: [...analise.data].sort((a, b) => a.resultado_minimo - b.resultado_minimo) };
}

export async function salvarPlano(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaPlano.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const faixas = analisarFaixas(dados.data.faixasJson);
  if (!faixas.ok) return { ok: false, mensagem: faixas.mensagem };

  const supabase = await criarClienteServidor();
  const { data: existente } = await supabase
    .from("planos_comissao")
    .select("id")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", dados.data.membroId)
    .maybeSingle();

  const linha = {
    salario_base: dados.data.salarioBase ?? null,
    meta_ote: dados.data.metaOte ?? null,
    tipo_calculo: dados.data.tipoCalculo,
    faixas: faixas.faixas,
  };

  const { error } = existente
    ? await supabase.from("planos_comissao").update(linha).eq("id", existente.id)
    : await supabase.from("planos_comissao").insert({
        ...linha,
        empresa_id: atual.empresaId,
        membro_id: dados.data.membroId,
        criado_por: atual.membroId,
      });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o plano.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
  return { ok: true, mensagem: "Plano salvo." };
}

export async function apagarPlano(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("planos_comissao").delete().eq("id", id.data);
  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
}

const esquemaCalculo = z.object({
  membroId: z.string().uuid(),
  mes: z.string().regex(/^\d{4}-\d{2}$/, "Escolha um mês."),
});

export async function calcularComissao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaCalculo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data: plano } = await supabase
    .from("planos_comissao")
    .select("id, salario_base, tipo_calculo, faixas")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", dados.data.membroId)
    .eq("ativo", true)
    .maybeSingle();
  if (!plano) return { ok: false, mensagem: "Este colaborador não tem um plano de comissão ativo." };

  const referencia = `${dados.data.mes}-01`;
  const inicioIso = new Date(`${referencia}T00:00:00Z`).toISOString();
  const [ano, mes] = dados.data.mes.split("-").map(Number);
  const fimExclusivoIso = new Date(Date.UTC(ano, mes, 1)).toISOString();

  const { data: negocios } = await supabase
    .from("negocios")
    .select("valor")
    .eq("responsavel_id", dados.data.membroId)
    .eq("status", "ganho")
    .gte("fechado_em", inicioIso)
    .lt("fechado_em", fimExclusivoIso)
    .limit(10000);

  const resultadoApurado = (negocios ?? []).reduce((soma, n) => soma + (n.valor ?? 0), 0);
  const faixas = plano.faixas as unknown as FaixaComissao[];
  const faixaAplicada = encontrarFaixa(faixas, resultadoApurado);
  const valorComissao = calcularValorComissao(plano.tipo_calculo, faixaAplicada, resultadoApurado);
  const salarioBase = plano.salario_base ?? 0;

  const { error } = await supabase.from("comissoes_calculadas").upsert(
    {
      empresa_id: atual.empresaId,
      membro_id: dados.data.membroId,
      plano_id: plano.id,
      referencia,
      resultado_apurado: resultadoApurado,
      salario_base: salarioBase,
      valor_comissao: valorComissao,
      valor_total: salarioBase + valorComissao,
      faixa_aplicada: faixaAplicada,
      calculado_por: atual.membroId,
    },
    { onConflict: "empresa_id,membro_id,referencia" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível calcular a comissão.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
  return { ok: true, mensagem: "Comissão calculada." };
}
