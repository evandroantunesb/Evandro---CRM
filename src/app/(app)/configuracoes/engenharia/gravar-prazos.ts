import "server-only";
import { z } from "zod";
import { lerContagem, type ChavePrazo, type ContagemPrazo } from "@/lib/engenharia-prazos-regras";
import type { ResultadoAcao } from "@/lib/tipos";

const dias = z.union([z.literal(""), z.coerce.number().int("Use dias inteiros").min(1, "Mínimo de 1 dia").max(365, "Máximo de 365 dias")]);

type LinhaPrazo = { chave: string; dias_uteis: number | null; contagem: string };

/**
 * Lê do formulário os prazos das `chaves` (vazio = sem prazo; `<chave>_contagem` = úteis ou corridos) e grava só os que
 * mudaram: cada linha gravada vira um registro de auditoria, e menos escritas deixam menos espaço para um salvamento
 * parcial. `gravar` devolve se a linha foi gravada (a RLS recusa sem erro, com zero linhas). Comum aos prazos da
 * empresa (`engenharia_prazos`) e aos da distribuidora por concessionária (`concessionaria_prazos`).
 */
export async function gravarPrazos(
  formData: FormData,
  chaves: readonly ChavePrazo[],
  ler: () => Promise<LinhaPrazo[] | null>,
  gravar: (chave: ChavePrazo, dias: number | null, contagem: ContagemPrazo) => Promise<boolean>,
): Promise<ResultadoAcao> {
  const valores: { chave: ChavePrazo; dias: number | null; contagem: ContagemPrazo }[] = [];
  for (const chave of chaves) {
    const d = dias.safeParse(String(formData.get(chave) ?? "").trim());
    if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
    valores.push({ chave, dias: d.data === "" ? null : d.data, contagem: lerContagem(formData.get(`${chave}_contagem`)) });
  }
  const atuais = await ler();
  if (!atuais) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  const antes = new Map(atuais.map((p) => [p.chave, p]));
  const mudou = (v: (typeof valores)[number]) => antes.get(v.chave)?.dias_uteis !== v.dias || antes.get(v.chave)?.contagem !== v.contagem;
  for (const v of valores.filter(mudou)) {
    if (!(await gravar(v.chave, v.dias, v.contagem))) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  }
  return { ok: true, mensagem: "Prazos salvos." };
}
