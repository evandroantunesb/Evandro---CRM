"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { METRICAS_META, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/metas";

const esquema = z
  .object({
    titulo: z.string().trim().min(2, "Título muito curto").max(80, "Título muito longo"),
    metrica: z.enum(METRICAS_META, { message: "Escolha uma métrica." }),
    membroId: z.string().uuid({ message: "Escolha um colaborador." }),
    periodoInicio: z.string().date("Data inicial inválida."),
    periodoFim: z.string().date("Data final inválida."),
    valorAlvo: z.coerce.number().positive("A meta precisa ser maior que zero."),
  })
  .refine((d) => d.periodoFim >= d.periodoInicio, {
    message: "O fim do período não pode ser antes do início.",
    path: ["periodoFim"],
  });

export async function criarMeta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("metas").insert({
    empresa_id: atual.empresaId,
    titulo: dados.data.titulo,
    metrica: dados.data.metrica,
    membro_id: dados.data.membroId,
    periodo_inicio: dados.data.periodoInicio,
    periodo_fim: dados.data.periodoFim,
    valor_alvo: dados.data.valorAlvo,
    criado_por: atual.membroId,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a meta.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/metas");
  return { ok: true, mensagem: "Meta criada." };
}

export async function editarMeta(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) {
    return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("metas")
    .update({
      titulo: dados.data.titulo,
      metrica: dados.data.metrica,
      membro_id: dados.data.membroId,
      periodo_inicio: dados.data.periodoInicio,
      periodo_fim: dados.data.periodoFim,
      valor_alvo: dados.data.valorAlvo,
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/metas");
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarMeta(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("metas").delete().eq("id", id.data);
  revalidatePath(CAMINHO);
  revalidatePath("/gamificacao/metas");
}
