/**
 * Trava fail-closed dos testes: nenhuma suíte roda se algum destino de banco/Supabase do
 * ambiente efetivo não for local. As suítes `*-db` usam service role e escrevem dados reais;
 * um `.env.local` apontando para produção já causou execução acidental.
 *
 * Função pura (sem rede, sem banco): recebe o ambiente e lança erro se algo não for local.
 */

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// Variáveis que as suítes leem para se conectar (ver tests/ajuda.ts e as suítes *-db).
const VARIAVEIS_HTTP = ["NEXT_PUBLIC_SUPABASE_URL"] as const;
const VARIAVEIS_BANCO = ["SUPABASE_DB_URL"] as const;
const VARIAVEIS_OBRIGATORIAS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Ambiente = Record<string, string | undefined>;

/** Ambiente efetivo: arquivos .env, com as variáveis do processo prevalecendo (como no loadEnv do Vite). */
export function ambienteEfetivo(arquivos: Ambiente, processo: Ambiente): Ambiente {
  return { ...arquivos, ...processo };
}

function analisar(nome: string, valor: string, protocolos: string[]): URL {
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    throw new Error(`${nome} não é uma URL válida.`);
  }
  if (!protocolos.includes(url.protocol)) {
    throw new Error(`${nome} usa protocolo "${url.protocol}" não permitido.`);
  }
  if (!HOSTS_LOCAIS.has(url.hostname)) {
    throw new Error(`${nome} aponta para "${url.hostname}", que não é local (127.0.0.1, localhost ou ::1).`);
  }
  return url;
}

/** Hosts de conexão reais de uma URL de banco, inclusive os dados por parâmetro (`?host=`). */
function exigirBancoLocal(nome: string, valor: string) {
  const url = analisar(nome, valor, ["postgresql:", "postgres:"]);
  for (const chave of ["host", "hostaddr", "service"]) {
    if (url.searchParams.has(chave)) {
      throw new Error(`${nome} traz o parâmetro "${chave}", que pode redirecionar a conexão: recusado.`);
    }
  }
}

/**
 * Lança erro se o ambiente efetivo dos testes puder alcançar um Supabase não local.
 * O ambiente efetivo é o mesmo que o Vitest injeta: arquivos .env + variáveis do processo
 * (estas prevalecem).
 */
export function verificarAmbienteLocal(env: Ambiente): void {
  for (const nome of VARIAVEIS_OBRIGATORIAS) {
    if (!env[nome]?.trim()) {
      throw new Error(`${nome} ausente: os testes só rodam com Supabase local configurado (supabase start).`);
    }
  }
  for (const nome of VARIAVEIS_HTTP) analisar(nome, env[nome]!, ["http:", "https:"]);
  for (const nome of VARIAVEIS_BANCO) {
    const valor = env[nome];
    if (valor !== undefined && valor.trim() !== "") exigirBancoLocal(nome, valor);
  }
  // Defesa em profundidade: qualquer valor do ambiente que cite um domínio gerenciado do
  // Supabase (outra variável, URL alternativa) bloqueia, mesmo fora das variáveis conhecidas.
  for (const [nome, valor] of Object.entries(env)) {
    if (valor && /\.supabase\.(co|com|in)\b/i.test(valor)) {
      throw new Error(`${nome} referencia um domínio remoto do Supabase: recusado.`);
    }
  }
}
