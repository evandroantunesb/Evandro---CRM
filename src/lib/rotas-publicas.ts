/**
 * Rotas públicas (sem login). A regra compara o prefixo inteiro ou o prefixo seguido de "/": `/obra/<token>` é pública
 * e `/obras` continua exigindo login. `/api/cron` é do agendador da Vercel: cada rota confere o `CRON_SECRET`.
 */
export const ROTAS_PUBLICAS = ["/login", "/recuperar-senha", "/auth", "/proposta", "/captura", "/contrato", "/obra", "/api/cron"] as const;

export const ehRotaPublica = (caminho: string): boolean => ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));
