/**
 * Trava fail-closed de ambiente local (fonte única). Usada pelo Vitest (tests/global-setup.ts,
 * via tests/guard-supabase-local.ts) e por pnpm dev, pnpm start e pnpm super-admin
 * (scripts/lib/ambiente-local.mjs). Nada roda se algum destino de banco/Supabase do ambiente
 * efetivo não for local: as suítes `*-db` e o super-admin usam service role e escrevem dados
 * reais, e um `.env.local` apontando para produção já causou execução acidental.
 *
 * Função pura (sem rede, sem banco, sem ler arquivos): recebe o ambiente e lança erro se algo
 * não for local. As mensagens citam só o nome da variável e o host; nunca valores ou chaves.
 *
 * Limites conhecidos (registrados em AGENTS.md):
 * - A checagem das chaves NÃO é verificação criptográfica de assinatura: só lê o payload do JWT
 *   para recusar chaves de projeto remoto usadas por engano (inclusive atrás de um túnel/proxy
 *   em host local). Não protege contra um token forjado de propósito.
 * - `SUPABASE_DB_URL` só tem o host validado (local), não a porta: a porta vem do
 *   supabase/config.toml e pode variar entre desenvolvedores; um túnel local na porta do banco
 *   passaria. A variável não é usada fora das suítes `*-db`.
 */

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// Variáveis lidas para conectar (ver tests/ajuda.ts, as suítes *-db e src/lib/env.ts).
const VARIAVEIS_HTTP = ["NEXT_PUBLIC_SUPABASE_URL"];
const VARIAVEIS_BANCO = ["SUPABASE_DB_URL"];
const VARIAVEIS_OBRIGATORIAS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

// Chaves JWT que o Supabase local (CLI) emite: emissor fixo e papel de cada uma.
const EMISSOR_LOCAL = "supabase-demo";
const CHAVES_JWT = [
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"],
  ["SUPABASE_SERVICE_ROLE_KEY", "service_role"],
];

/** @typedef {Record<string, string | undefined>} Ambiente */

/**
 * Ambiente efetivo: arquivos .env, com as variáveis do processo prevalecendo (como no loadEnv do Vite).
 * @param {Ambiente} arquivos
 * @param {Ambiente} processo
 * @returns {Ambiente}
 */
export function ambienteEfetivo(arquivos, processo) {
  return { ...arquivos, ...processo };
}

/**
 * @param {string} nome
 * @param {string} valor
 * @param {string[]} protocolos
 * @returns {URL}
 */
function analisar(nome, valor, protocolos) {
  let url;
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

/**
 * Hosts de conexão reais de uma URL de banco, inclusive os dados por parâmetro (`?host=`).
 * @param {string} nome
 * @param {string} valor
 */
function exigirBancoLocal(nome, valor) {
  const url = analisar(nome, valor, ["postgresql:", "postgres:"]);
  for (const chave of ["host", "hostaddr", "service"]) {
    if (url.searchParams.has(chave)) {
      throw new Error(`${nome} traz o parâmetro "${chave}", que pode redirecionar a conexão: recusado.`);
    }
  }
}

/**
 * Decodifica um segmento base64url como objeto JSON; `null` se não for.
 * @param {string} segmento
 * @returns {Record<string, unknown> | null}
 */
function objetoJson(segmento) {
  if (!/^[A-Za-z0-9_-]+$/.test(segmento)) return null;
  try {
    const valor = JSON.parse(Buffer.from(segmento, "base64url").toString("utf8"));
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Exige que a chave seja um JWT emitido pelo Supabase local com o papel esperado. Leitura do
 * payload apenas (sem verificar assinatura): recusa chaves de projeto remoto, que trazem o claim
 * `ref` e outro emissor, e os formatos de chave de API novos (`sb_publishable_`/`sb_secret_`).
 * @param {string} nome
 * @param {string} valor
 * @param {string} papel
 */
function exigirChaveLocal(nome, valor, papel) {
  const chave = valor.trim();
  if (/^sb_(publishable|secret)_/.test(chave)) {
    throw new Error(`${nome} usa o formato de chave de API "sb_…", não aceito: use a chave JWT do Supabase local.`);
  }
  const partes = chave.split(".");
  const cabecalho = partes.length === 3 ? objetoJson(partes[0]) : null;
  const payload = partes.length === 3 ? objetoJson(partes[1]) : null;
  if (!cabecalho || typeof cabecalho.alg !== "string" || !payload) {
    throw new Error(`${nome} não é um JWT válido: use a chave do Supabase local (supabase status).`);
  }
  if ("ref" in payload) {
    throw new Error(`${nome} pertence a um projeto Supabase remoto (claim "ref"): recusado.`);
  }
  if (payload.iss !== EMISSOR_LOCAL) {
    throw new Error(`${nome} não foi emitida pelo Supabase local (emissor diferente de "${EMISSOR_LOCAL}"): recusado.`);
  }
  if (payload.role !== papel) {
    throw new Error(`${nome} não tem o papel "${papel}" esperado: recusado.`);
  }
}

/**
 * Lança erro se o ambiente efetivo puder alcançar um Supabase não local.
 * O ambiente efetivo é o que o comando enxerga: arquivos .env + variáveis do processo
 * (estas prevalecem).
 * @param {Ambiente} env
 * @returns {void}
 */
export function verificarAmbienteLocal(env) {
  for (const nome of VARIAVEIS_OBRIGATORIAS) {
    if (!env[nome]?.trim()) {
      throw new Error(`${nome} ausente: só roda com Supabase local configurado (supabase start).`);
    }
  }
  for (const nome of VARIAVEIS_HTTP) analisar(nome, /** @type {string} */ (env[nome]), ["http:", "https:"]);
  for (const nome of VARIAVEIS_BANCO) {
    const valor = env[nome];
    if (valor !== undefined && valor.trim() !== "") exigirBancoLocal(nome, valor);
  }
  for (const [nome, papel] of CHAVES_JWT) exigirChaveLocal(nome, /** @type {string} */ (env[nome]), papel);
  // Defesa em profundidade: qualquer valor do ambiente que cite um domínio gerenciado do
  // Supabase (outra variável, URL alternativa) bloqueia, mesmo fora das variáveis conhecidas.
  for (const [nome, valor] of Object.entries(env)) {
    if (valor && /\.supabase\.(co|com|in)\b/i.test(valor)) {
      throw new Error(`${nome} referencia um domínio remoto do Supabase: recusado.`);
    }
  }
}
