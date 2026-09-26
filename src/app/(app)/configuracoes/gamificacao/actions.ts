"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EVENTOS_GAMIFICACAO } from "@/lib/gamificacao";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { OPERADORES_CONDICAO, PERIODOS_LIMITE_REGRA, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/gamificacao";
const TIPOS_EVENTO = EVENTOS_GAMIFICACAO.map((e) => e.tipo);

const esquema = z
  .object({
    nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
    eventoTipo: z.enum(TIPOS_EVENTO as [string, ...string[]], { message: "Escolha um evento." }),
    pontos: z.coerce.number().int().refine((v) => v !== 0, "Pontos não pode ser zero."),
    condicaoCampo: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
    condicaoOperador: z.enum(OPERADORES_CONDICAO).optional().or(z.literal("").transform(() => undefined)),
    condicaoValor: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
    limitePeriodo: z.enum(PERIODOS_LIMITE_REGRA).optional().or(z.literal("").transform(() => undefined)),
    limiteQuantidade: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => !d.limitePeriodo === !d.limiteQuantidade, {
    message: "Defina o período e a quantidade do teto juntos, ou deixe os dois em branco.",
    path: ["limiteQuantidade"],
  });

function montarCondicao(dados: z.infer<typeof esquema>) {
  if (!dados.condicaoCampo || !dados.condicaoOperador || !dados.condicaoValor) return null;
  return { campo: dados.condicaoCampo, operador: dados.condicaoOperador, valor: dados.condicaoValor };
}

export async function criarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("gamification_rules").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    evento_tipo: dados.data.eventoTipo,
    pontos: dados.data.pontos,
    condicao: montarCondicao(dados.data),
    limite_periodo: dados.data.limitePeriodo ?? null,
    limite_quantidade: dados.data.limiteQuantidade ?? null,
    criado_por: atual.membroId,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a regra.") };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Regra criada." };
}

export async function editarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) {
    return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("gamification_rules")
    .update({
      nome: dados.data.nome,
      evento_tipo: dados.data.eventoTipo,
      pontos: dados.data.pontos,
      condicao: montarCondicao(dados.data),
      limite_periodo: dados.data.limitePeriodo ?? null,
      limite_quantidade: dados.data.limiteQuantidade ?? null,
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarRegra(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("gamification_rules").delete().eq("id", id.data);
  revalidatePath(CAMINHO);
}
