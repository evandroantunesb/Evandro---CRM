"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHAVES_PRAZO_OBRA } from "@/lib/obras/cronograma";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { prazosObraEditaveis } from "@/lib/prazos-permissao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSetoresCoordenados } from "@/lib/setores-coordenados";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const dias = z.coerce.number({ message: "Informe os dias úteis." }).int("Use um número inteiro de dias.").min(1, "Mínimo de 1 dia útil.").max(365, "Máximo de 365 dias úteis.");

/**
 * Dias úteis de cada etapa e da entrega contratada. Admin e gestor mudam todos; o coordenador, os do seu setor
 * (20261124100000). Só os que a pessoa pode mudar são lidos do formulário; o banco confere de novo.
 */
export async function salvarPrazosObra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const supabase = await criarClienteServidor();
  const editaveis = prazosObraEditaveis(atual.papel, await carregarSetoresCoordenados(supabase, atual));
  if (editaveis.length === 0) return { ok: false, mensagem: "Você não pode mudar os prazos das etapas." };

  const valores: { chave: (typeof CHAVES_PRAZO_OBRA)[number]; dias: number }[] = [];
  for (const chave of editaveis) {
    const d = dias.safeParse(String(formData.get(chave) ?? "").trim() || undefined);
    if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
    valores.push({ chave, dias: d.data });
  }

  // Só o que mudou: cada linha gravada vira um registro de auditoria.
  const { data: atuais, error: erroLeitura } = await supabase.from("obra_prazos_etapas").select("chave, dias_uteis").eq("empresa_id", atual.empresaId);
  if (erroLeitura) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  const antes = new Map((atuais ?? []).map((p) => [p.chave, p.dias_uteis]));
  for (const v of valores.filter((v) => antes.get(v.chave) !== v.dias)) {
    // A RLS recusa sem erro (zero linhas): confere que a linha foi gravada.
    const { data, error } = await supabase
      .from("obra_prazos_etapas")
      .update({ dias_uteis: v.dias })
      .eq("empresa_id", atual.empresaId)
      .eq("chave", v.chave)
      .select("chave");
    if (error || (data ?? []).length === 0) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  }
  revalidatePath("/configuracoes/prazos-obras");
  return { ok: true, mensagem: "Prazos salvos. A entrega contratada das obras que já existem não muda." };
}
