"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SETORES_OBRA, STATUS_POR_SETOR } from "@/lib/obras/rotulos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/tarefas-automaticas";
const DUPLICADA = "Já existe uma regra igual para esse gatilho e setor.";

const esquema = z
  .object({
    gatilho: z.string().regex(/^[a-z]+:[a-z_]+$/, "Escolha quando a tarefa nasce"),
    setor: z.enum(SETORES_OBRA, "Escolha o setor da tarefa"),
    titulo: z.string().trim().min(2, "Título muito curto").max(160, "Título muito longo"),
    descricao: z.string().trim().max(2000, "Descrição muito longa"),
    prazo: z.coerce.number().int("Use dias inteiros").min(1, "Mínimo de 1 dia útil").max(60, "Máximo de 60 dias úteis"),
  })
  .transform(({ gatilho, ...d }, ctx) => {
    const [setor, status] = gatilho.split(":");
    const valido = (SETORES_OBRA as readonly string[]).includes(setor) && STATUS_POR_SETOR[setor as (typeof SETORES_OBRA)[number]].includes(status);
    if (!valido) {
      ctx.addIssue({ code: "custom", message: "Escolha quando a tarefa nasce" });
      return z.NEVER;
    }
    return {
      gatilho_setor: setor as (typeof SETORES_OBRA)[number],
      gatilho_status: status,
      setor: d.setor,
      titulo: d.titulo,
      descricao: d.descricao || null,
      prazo_dias_uteis: d.prazo,
    };
  });

const ler = (formData: FormData) =>
  esquema.safeParse({
    gatilho: formData.get("gatilho"),
    setor: formData.get("setor"),
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") ?? "",
    prazo: formData.get("prazo"),
  });

export async function criarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = ler(formData);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("tarefas_automaticas_regras").insert({ empresa_id: atual.empresaId, ...d.data });
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADA : "Não foi possível criar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Regra criada." };
}

export async function editarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const d = ler(formData);
  if (!id.success || !d.success) return { ok: false, mensagem: d.error?.issues[0].message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("tarefas_automaticas_regras")
    .update({ ...d.data, ativa: formData.get("ativa") === "on" })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADA : "Não foi possível salvar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}
