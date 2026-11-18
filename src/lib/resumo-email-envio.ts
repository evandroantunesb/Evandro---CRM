import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarResumoEmail, diaNoFuso, type ItemResumo } from "@/lib/resumo-email";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Envio do resumo diário (plano em docs/superpowers/plans/2026-11-18-resumo-diario-email.md). Roda com a service role,
 * chamado só pela rota do agendador. Um resumo por pessoa e empresa por dia: reserva no banco antes de enviar.
 */

export type MensagemEmail = { para: string; assunto: string; html: string; texto: string; chaveIdempotencia: string };
export type Enviar = (m: MensagemEmail) => Promise<{ ok: true } | { ok: false; erro: string }>;

export type ResultadoResumo = { pessoas: number; enviados: number; falhas: number; ignorados: number };

/** Configurado só com a chave do Resend e o remetente (como o Google Agenda: sem chave, nada é enviado). */
export function resumoEmailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE);
}

/** Envia pela API HTTP do Resend. A chave de idempotência evita e-mail duplicado se a mesma reserva for reenviada. */
export const enviarPeloResend: Enviar = async ({ para, assunto, html, texto, chaveIdempotencia }) => {
  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": chaveIdempotencia,
      },
      body: JSON.stringify({ from: process.env.EMAIL_REMETENTE, to: [para], subject: assunto, html, text: texto }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resposta.ok) return { ok: true };
    // Só o código e o nome do erro do Resend: nada do destinatário vai para o registro.
    const corpo = (await resposta.json().catch(() => null)) as { name?: string } | null;
    return { ok: false, erro: `Resend ${resposta.status}${corpo?.name ? ` (${corpo.name})` : ""}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado no envio." : "Falha de rede no envio." };
  }
};

export async function executarResumoDiario({
  admin,
  agora,
  siteUrl,
  enviar,
}: {
  admin: SupabaseClient<Database>;
  agora: Date;
  siteUrl: string;
  enviar: Enviar;
}): Promise<ResultadoResumo> {
  const dia = diaNoFuso(agora);
  const ate = agora.toISOString();
  const { data, error } = await admin.rpc("resumo_email_pendentes", { p_dia: dia, p_ate: ate });
  if (error) throw new Error(`Não foi possível ler os avisos pendentes: ${error.message}`);

  type Pessoa = { empresaId: string; empresaNome: string; membroId: string; nome: string; email: string; janelaInicio: string; itens: ItemResumo[] };
  const pessoas = new Map<string, Pessoa>();
  for (const l of data ?? []) {
    let p = pessoas.get(l.membro_id);
    if (!p) {
      p = { empresaId: l.empresa_id, empresaNome: l.empresa_nome, membroId: l.membro_id, nome: l.nome, email: l.email, janelaInicio: l.janela_inicio, itens: [] };
      pessoas.set(l.membro_id, p);
    }
    p.itens.push({ tipo: l.tipo, mensagem: l.mensagem, link: l.link, criadaEm: l.criada_em });
  }

  const resultado: ResultadoResumo = { pessoas: pessoas.size, enviados: 0, falhas: 0, ignorados: 0 };
  for (const p of pessoas.values()) {
    const { data: reserva, error: erroReserva } = await admin.rpc("reservar_resumo_email", {
      p_empresa_id: p.empresaId,
      p_membro_id: p.membroId,
      p_dia: dia,
      p_janela_inicio: p.janelaInicio,
      p_janela_fim: ate,
      p_itens: p.itens.length,
    });
    if (erroReserva) {
      resultado.falhas++;
      continue;
    }
    if (!reserva) {
      // Outra execução já enviou (ou está enviando) o resumo desta pessoa hoje.
      resultado.ignorados++;
      continue;
    }
    const email = montarResumoEmail({ nome: p.nome, empresaNome: p.empresaNome, itens: p.itens, siteUrl, agora });
    const envio = await enviar({ para: p.email, ...email, chaveIdempotencia: `resumo-${reserva}` });
    await admin.rpc("concluir_resumo_email", { p_id: reserva, p_enviado: envio.ok, p_erro: envio.ok ? undefined : envio.erro });
    if (envio.ok) resultado.enviados++;
    else resultado.falhas++;
  }
  return resultado;
}
