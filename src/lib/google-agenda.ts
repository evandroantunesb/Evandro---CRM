import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import type { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Integração com o Google Agenda: cada membro conecta a própria conta Google
 * (OAuth) e, ao criar uma tarefa, ela também vira um evento na agenda dele.
 * Sem SDK — só fetch nas APIs REST do Google, igual ao resto do projeto (ver src/lib/opensolar.ts).
 */

const ESCOPO = "https://www.googleapis.com/auth/calendar.events";

function credenciais() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Chave AES-256 do refresh_token: 32 bytes em base64, só nas variáveis do servidor (Vercel), nunca no banco. */
function chaveToken(): Buffer | null {
  const valor = process.env.GOOGLE_AGENDA_CHAVE;
  if (!valor) return null;
  const chave = Buffer.from(valor, "base64");
  return chave.length === 32 ? chave : null;
}

/** Se a integração não tiver as variáveis de ambiente configuradas (inclusive a chave), a tela nem mostra a opção. */
export function integracaoConfigurada(): boolean {
  return credenciais() !== null && chaveToken() !== null;
}

const PREFIXO_CIFRA = "v1:";

/**
 * Cifra o refresh_token para gravar (AES-256-GCM, IV aleatório). O id do membro entra como dado autenticado: o valor
 * de um membro não decifra para outro, mesmo copiado de linha.
 */
export function cifrarRefreshToken(token: string, membroId: string): string {
  const chave = chaveToken();
  if (!chave) throw new Error("GOOGLE_AGENDA_CHAVE ausente ou inválida.");
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  cifra.setAAD(Buffer.from(membroId));
  const corpo = Buffer.concat([cifra.update(token, "utf8"), cifra.final()]);
  return PREFIXO_CIFRA + Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString("base64");
}

/**
 * Token em claro a partir do valor gravado. Conexões antigas (texto puro, sem prefixo) voltam como `legado`; valor
 * cifrado sem a chave certa, de outro membro ou adulterado devolve null.
 */
export function decifrarRefreshToken(valor: string, membroId: string): { token: string; legado: boolean } | null {
  if (!valor.startsWith(PREFIXO_CIFRA)) return { token: valor, legado: true };
  const chave = chaveToken();
  if (!chave) return null;
  try {
    const bruto = Buffer.from(valor.slice(PREFIXO_CIFRA.length), "base64");
    const decifra = createDecipheriv("aes-256-gcm", chave, bruto.subarray(0, 12));
    decifra.setAAD(Buffer.from(membroId));
    decifra.setAuthTag(bruto.subarray(12, 28));
    return { token: Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString("utf8"), legado: false };
  } catch {
    return null;
  }
}

/**
 * refresh_token da conexão do membro, ou null se não houver (ou não decifrar). Conexão antiga em texto puro é cifrada
 * aqui no primeiro uso, sem pedir para o usuário reconectar.
 */
export async function refreshTokenDoMembro(admin: ReturnType<typeof criarClienteAdmin>, membroId: string): Promise<string | null> {
  const { data: conexao } = await admin.from("google_agenda_conexoes").select("refresh_token").eq("membro_id", membroId).maybeSingle();
  if (!conexao) return null;
  const lido = decifrarRefreshToken(conexao.refresh_token, membroId);
  if (lido?.legado && chaveToken()) {
    await admin
      .from("google_agenda_conexoes")
      .update({ refresh_token: cifrarRefreshToken(lido.token, membroId) })
      .eq("membro_id", membroId)
      .eq("refresh_token", conexao.refresh_token);
  }
  return lido?.token ?? null;
}

export function urlAutorizacao(redirectUri: string, state: string): string | null {
  const cred = credenciais();
  if (!cred) return null;
  const params = new URLSearchParams({
    client_id: cred.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: ESCOPO,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

const esquemaTokens = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

export async function trocarCodigoPorTokens(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const cred = credenciais();
  if (!cred) return null;
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resposta.ok) return null;
  const dados = esquemaTokens.safeParse(await resposta.json());
  // Sem refresh_token quando o usuário já tinha autorizado antes sem "prompt=consent" —
  // não deve acontecer aqui porque sempre pedimos consent, mas por segurança tratamos como falha.
  if (!dados.success || !dados.data.refresh_token) return null;
  return { accessToken: dados.data.access_token, refreshToken: dados.data.refresh_token };
}

export async function obterAccessToken(refreshToken: string): Promise<string | null> {
  const cred = credenciais();
  if (!cred) return null;
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!resposta.ok) return null;
  const dados = esquemaTokens.safeParse(await resposta.json());
  return dados.success ? dados.data.access_token : null;
}

export async function obterEmailConta(accessToken: string): Promise<string | null> {
  const resposta = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resposta.ok) return null;
  const dados = (await resposta.json()) as { email?: string };
  return dados.email ?? null;
}

/** Cria o evento na agenda principal da conta conectada. Retorna o id do evento, ou null se falhar. */
export async function criarEvento(
  accessToken: string,
  evento: { titulo: string; descricao?: string; inicioIso: string; fimIso: string },
): Promise<string | null> {
  const resposta = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: evento.titulo,
      description: evento.descricao,
      start: { dateTime: evento.inicioIso },
      end: { dateTime: evento.fimIso },
    }),
  });
  if (!resposta.ok) return null;
  const dados = (await resposta.json()) as { id?: string };
  return dados.id ?? null;
}

/** Best-effort: se falhar (evento já removido manualmente, token expirado etc.) só ignora. */
export async function apagarEvento(accessToken: string, eventoId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}
