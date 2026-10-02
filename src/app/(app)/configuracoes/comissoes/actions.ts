"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularComissaoMes, type FaixaComissao } from "@/lib/comissoes";
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
  vigenciaMes: z.string().regex(/^\d{4}-\d{2}$/, "Escolha o mês de vigência."),
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

/** Cria uma NOVA versão do plano (vigência mensal) — nunca edita uma versão existente em lugar. */
export async function salvarPlano(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaPlano.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const faixas = analisarFaixas(dados.data.faixasJson);
  if (!faixas.ok) return { ok: false, mensagem: faixas.mensagem };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("planos_comissao").insert({
    empresa_id: atual.empresaId,
    membro_id: dados.data.membroId,
    vigencia_inicio: `${dados.data.vigenciaMes}-01`,
    salario_base: dados.data.salarioBase ?? null,
    meta_ote: dados.data.metaOte ?? null,
    tipo_calculo: dados.data.tipoCalculo,
    faixas: faixas.faixas,
    criado_por: atual.membroId,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar a nova versão do plano.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
  return { ok: true, mensagem: "Nova versão do plano criada." };
}

/** Só funciona (via RLS) numa versão que ainda não entrou em vigência — preserva as demais. */
export async function apagarVersaoPlano(formData: FormData) {
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
  const resultado = await calcularComissaoMes(supabase, {
    empresaId: atual.empresaId,
    membroId: dados.data.membroId,
    referencia: `${dados.data.mes}-01`,
    calculadoPor: atual.membroId,
  });
  if (!resultado.ok) return resultado;

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
  return { ok: true, mensagem: "Comissão calculada." };
}

const esquemaFechar = z.object({ id: z.string().uuid() });

export async function fecharComissao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = esquemaFechar.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Comissão inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fechar_comissao", { p_comissao_id: dados.data.id });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível fechar a comissão.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/comissoes");
  return { ok: true, mensagem: "Comissão fechada." };
}
