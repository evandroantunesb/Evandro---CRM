function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return valor;
}

/**
 * No Vercel, usa o endereço que a própria plataforma atribuiu ao deploy atual
 * (`VERCEL_PROJECT_PRODUCTION_URL` em produção, `VERCEL_URL` em preview) em vez de um
 * valor fixo em `NEXT_PUBLIC_SITE_URL` — que pode ficar desatualizado ou, pior, apontar
 * para um domínio de outro projeto (já aconteceu: `NEXT_PUBLIC_SITE_URL` estava
 * configurada com um domínio de terceiros, quebrando todo link público gerado).
 */
function resolverSiteUrl(): string {
  if (process.env.VERCEL) {
    const dominio =
      process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_URL;
    if (dominio) return `https://${dominio}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export const env = {
  supabaseUrl: obrigatoria("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: obrigatoria(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Só no servidor. Lida sob demanda para nunca ir para o navegador. */
  supabaseServiceRoleKey: () =>
    obrigatoria("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  siteUrl: resolverSiteUrl(),
};
