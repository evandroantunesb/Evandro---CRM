/**
 * Rotas públicas (sem login). A regra compara o prefixo inteiro ou o prefixo seguido de "/": `/obra/<token>` é pública
 * e `/obras` continua exigindo login.
 */
export const ROTAS_PUBLICAS = ["/login", "/recuperar-senha", "/auth", "/proposta", "/captura", "/contrato", "/obra"] as const;

export const ehRotaPublica = (caminho: string): boolean => ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));
