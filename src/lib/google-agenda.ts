import "server-only";
import { z } from "zod";

/**
 * Integração com o Google Agenda: cada membro conecta a própria conta Google
 * (OAuth) e, ao criar uma tarefa, ela também vira um evento na agenda dele.
 * Sem SDK — só fetch nas APIs REST do Google, igual ao resto do projeto (ver src/lib/geodados.ts).
 */

const ESCOPO = "https://www.googleapis.com/auth/calendar.events";

function credenciais() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Se a integração não tiver as variáveis de ambiente configuradas, a tela nem mostra a opção. */
export function integracaoConfigurada(): boolean {
  return credenciais() !== null;
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
