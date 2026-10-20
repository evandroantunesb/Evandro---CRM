/**
 * Prova de identidade da stack Supabase local (fail-closed), fonte única dos destinos que os
 * testes de integração e o e2e usam para ESCREVER dados.
 *
 * Problema que resolve: a trava de scripts/lib/guard-supabase-local.mjs só prova que cada destino
 * é local. Com várias stacks locais (portas/project_id diferentes), a API dos testes
 * (`NEXT_PUBLIC_SUPABASE_URL`) podia ser de uma stack e o Postgres (`SUPABASE_DB_URL`, ou o padrão
 * implícito 127.0.0.1:54322 das suítes `*-db`) de outra: os testes gravariam num banco que não é o
 * da API. Aqui os dois destinos precisam bater com os metadados que o PRÓPRIO Supabase CLI reporta
 * para a stack deste repositório (`supabase status -o env --workdir <raiz>`): uma única consulta
 * ao CLI, atrelada ao `project_id` do `supabase/config.toml`, que falha se a stack não estiver no ar.
 *
 * Regras (todas fail-closed; nada é presumido):
 * - API, chaves JWT e banco do ambiente efetivo têm de ser IGUAIS ao que o CLI reporta
 *   (host literal, porta, protocolo; usuário/senha/banco; chaves). Nunca se deduz uma porta da outra.
 * - Se `SUPABASE_DB_URL` não existir, o destino do banco é o `DB_URL` do CLI (nunca um padrão fixo).
 * - Variáveis `PG*` (que o driver usa para completar/sobrepor conexão) são recusadas.
 * - Falha ao obter os metadados (CLI ausente, Docker parado, stack parada, saída incompleta) aborta.
 * - O que o CLI reporta (configuração) é conferido com o que o DOCKER publica de fato
 *   (./docker-stack-local.mjs): contêineres do projeto, rótulos, rede, saúde e portas reais.
 * - O CLI é executado pelo binário real, sem shell e sem o shim (ver `resolverBinarioSupabase`).
 * - Sem bypass: não existe variável, flag ou modo que pule a verificação.
 *
 * Nunca imprime valores: as mensagens citam só nomes de variáveis. Funções puras (recebem o
 * ambiente e o texto do status); só `executarStatusSupabase` e o módulo do Docker tocam o sistema.
 *
 * Limite conhecido (AGENTS.md): não há consulta de volta ao banco para provar que a API aponta
 * para ele, nem checagem de processos fora do Docker que escutem as mesmas portas.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { verificarStackNoDocker } from "./docker-stack-local.mjs";
import { verificarAmbienteLocal } from "./guard-supabase-local.mjs";

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// Variáveis do libpq/pg que podem completar ou sobrepor a conexão do driver.
const VARIAVEIS_PG = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGPASSFILE",
  "PGOPTIONS",
  "PGSSLMODE",
  "PGSSLROOTCERT",
  "PGSYSCONFDIR",
  "PGLOCALEDIR",
  "DATABASE_URL",
];

const CAMPOS_STATUS = ["API_URL", "DB_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];

/** @typedef {Record<string, string | undefined>} Ambiente */

/**
 * Lê a saída de `supabase status -o env` (linhas `CHAVE="valor"`).
 * @param {string} texto
 * @returns {Record<string, string>}
 */
export function lerStatusEnv(texto) {
  /** @type {Record<string, string>} */
  const saida = {};
  for (const linha of String(texto).split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha.trim());
    if (!m) continue;
    let valor = m[2].trim();
    if (valor.length >= 2 && valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    saida[m[1]] = valor;
  }
  return saida;
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
  if (!protocolos.includes(url.protocol)) throw new Error(`${nome} usa protocolo não permitido.`);
  if (!HOSTS_LOCAIS.has(url.hostname)) throw new Error(`${nome} não aponta para um host local.`);
  if (!url.port) throw new Error(`${nome} não informa a porta: não é possível comprovar a stack.`);
  return url;
}

/**
 * Destino HTTP (API) sem credenciais, caminho, parâmetros ou fragmento.
 * @param {string} nome
 * @param {string} valor
 */
function destinoApi(nome, valor) {
  const url = analisar(nome, valor, ["http:", "https:"]);
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error(`${nome} traz credenciais, caminho ou parâmetros: recusado.`);
  }
  return { protocolo: url.protocol, host: url.hostname, porta: url.port };
}

/**
 * Destino de banco: protocolo, host, porta, usuário, senha e banco; sem parâmetros de consulta
 * (host/hostaddr/service e demais poderiam redirecionar ou alterar a conexão).
 * @param {string} nome
 * @param {string} valor
 */
function destinoBanco(nome, valor) {
  const url = analisar(nome, valor, ["postgresql:", "postgres:"]);
  if (url.search || url.hash) throw new Error(`${nome} traz parâmetros de conexão: recusado.`);
  const banco = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!banco || banco.includes("/")) throw new Error(`${nome} não informa o banco.`);
  if (!url.username) throw new Error(`${nome} não informa o usuário.`);
  return {
    host: url.hostname,
    porta: url.port,
    usuario: decodeURIComponent(url.username),
    senha: decodeURIComponent(url.password),
    banco,
  };
}

/**
 * Resolve e comprova a stack: devolve a URL de banco VERIFICADA que os testes devem usar.
 * Lança erro (sem valores) se algo estiver ausente, divergente ou não puder ser comprovado.
 * @param {Ambiente} env ambiente efetivo (o que os testes realmente enxergam)
 * @param {Record<string, string>} status saída já lida de `supabase status -o env`
 * @returns {{ urlBanco: string, apiUrl: string, apiPorta: string, dbPorta: string }}
 */
export function resolverStackLocal(env, status) {
  // Mantém todas as proteções existentes (remoto, chaves, domínios gerenciados).
  verificarAmbienteLocal(env);

  for (const campo of CAMPOS_STATUS) {
    if (!status[campo]?.trim()) {
      throw new Error(`Metadados da stack local incompletos (falta ${campo}): não é possível comprovar a stack.`);
    }
  }

  const apiStatus = destinoApi("API_URL (supabase status)", status.API_URL);
  const bancoStatus = destinoBanco("DB_URL (supabase status)", status.DB_URL);

  // API do ambiente = API da stack. Host literal: "localhost" pode resolver para outro endereço.
  const apiEnv = destinoApi("NEXT_PUBLIC_SUPABASE_URL", /** @type {string} */ (env.NEXT_PUBLIC_SUPABASE_URL));
  if (apiEnv.protocolo !== apiStatus.protocolo || apiEnv.host !== apiStatus.host || apiEnv.porta !== apiStatus.porta) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL não corresponde à API da stack local informada por `supabase status`: recusado.",
    );
  }

  // Chaves do ambiente = chaves da mesma stack (uma chave só vale para a stack que a emitiu).
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() !== status.ANON_KEY.trim()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY não é a chave da stack local atual: recusado.");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim() !== status.SERVICE_ROLE_KEY.trim()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não é a chave da stack local atual: recusado.");
  }

  for (const nome of VARIAVEIS_PG) {
    if (env[nome] !== undefined && env[nome] !== "") {
      throw new Error(`${nome} está definida e poderia redirecionar a conexão com o banco: recusado.`);
    }
  }

  const urlInformada = env.SUPABASE_DB_URL;
  if (urlInformada !== undefined && urlInformada.trim() !== "") {
    const bancoEnv = destinoBanco("SUPABASE_DB_URL", urlInformada);
    for (const campo of /** @type {const} */ (["host", "porta", "usuario", "senha", "banco"])) {
      if (bancoEnv[campo] !== bancoStatus[campo]) {
        throw new Error(
          `SUPABASE_DB_URL diverge do banco da stack local informada por \`supabase status\` (${campo}): recusado.`,
        );
      }
    }
  }
  // Sem SUPABASE_DB_URL: usa SEMPRE o banco que o CLI reporta (nunca um padrão fixo).
  return {
    urlBanco: status.DB_URL.trim(),
    apiUrl: status.API_URL.trim(),
    apiPorta: apiStatus.porta,
    dbPorta: bancoStatus.porta,
  };
}

// Pacotes de binário por plataforma/arquitetura, na mesma ordem de preferência do shim do pacote
// `supabase` (dist/supabase.js). Só o primeiro que resolver e passar nas conferências é usado.
const PACOTES_CLI = {
  darwin: { arm64: ["darwin-arm64"], x64: ["darwin-x64"] },
  linux: { arm64: ["linux-arm64", "linux-arm64-musl"], x64: ["linux-x64", "linux-x64-musl"] },
  win32: { arm64: ["windows-arm64"], x64: ["windows-x64"] },
};

/**
 * Localiza o executável REAL do Supabase CLI instalado, sem passar pelo shim (`.cmd`/`dist/supabase.js`)
 * e sem shell. O pacote `supabase` instalado resolve `@supabase/cli-<plataforma>` a partir do próprio
 * diretório (o pnpm não o eleva à raiz); fazemos o mesmo e conferimos que o pacote tem o nome e a
 * versão esperados e que `bin/supabase[.exe]` é um arquivo. `SUPABASE_CLI_BINARY_OVERRIDE`, que o shim
 * honra, é IGNORADO de propósito: uma variável de ambiente não pode trocar o executável da trava.
 * O pacote `supabase` é procurado a partir de `raiz` (o projeto), nunca de `import.meta`: o Playwright
 * carrega este módulo por um transpilador CJS, onde `import.meta` não existe.
 * @param {{ raiz?: string, plataforma?: string, arquitetura?: string,
 *           resolver?: (id: string, deOnde: string | null) => string,
 *           ler?: (caminho: string) => string,
 *           ehArquivo?: (caminho: string) => boolean }} [o]
 * @returns {string} caminho absoluto do executável
 */
export function resolverBinarioSupabase({
  raiz = process.cwd(),
  plataforma = process.platform,
  arquitetura = process.arch,
  resolver = (id, deOnde) => createRequire(deOnde ?? join(raiz, "package.json")).resolve(id),
  ler = (c) => readFileSync(c, "utf8"),
  ehArquivo = (c) => {
    try {
      return statSync(c).isFile();
    } catch {
      return false;
    }
  },
} = {}) {
  const sufixos = /** @type {Record<string, Record<string, string[]>>} */ (PACOTES_CLI)[plataforma]?.[arquitetura];
  if (!sufixos) throw new Error(`Plataforma sem binário do Supabase CLI conhecido (${plataforma}/${arquitetura}).`);
  let pkgPrincipal;
  let versao;
  try {
    pkgPrincipal = resolver("supabase/package.json", null);
    versao = JSON.parse(ler(pkgPrincipal)).version;
  } catch {
    throw new Error("Pacote `supabase` (CLI do projeto) não encontrado: rode `pnpm install`.");
  }
  if (typeof versao !== "string" || !versao) throw new Error("Versão do pacote `supabase` ilegível.");
  const extensao = plataforma === "win32" ? ".exe" : "";
  for (const sufixo of sufixos) {
    let pkg;
    try {
      pkg = resolver(`@supabase/cli-${sufixo}/package.json`, pkgPrincipal);
      const meta = JSON.parse(ler(pkg));
      if (meta.name !== `@supabase/cli-${sufixo}` || meta.version !== versao) continue;
    } catch {
      continue;
    }
    const binario = join(dirname(pkg), "bin", `supabase${extensao}`);
    if (ehArquivo(binario)) return binario;
  }
  throw new Error("Binário do Supabase CLI não encontrado para esta plataforma: rode `pnpm install`.");
}

/**
 * Consulta o Supabase CLI do projeto. Única parte com efeito no sistema (executa o processo do CLI,
 * somente leitura). O executável é o binário real (sem shell: o caminho de `--workdir` chega ao CLI
 * exatamente como informado, com qualquer espaço ou metacaractere, sem ser interpretado). Nunca
 * inclui a saída do CLI nas mensagens de erro.
 * @param {string} raiz diretório que contém `supabase/` (usado exatamente como informado)
 * @param {{ binario?: () => string, executar?: typeof spawnSync }} [o]
 * @returns {string} saída de `supabase status -o env`
 */
export function executarStatusSupabase(raiz, { binario = () => resolverBinarioSupabase({ raiz }), executar = spawnSync } = {}) {
  const r = executar(binario(), ["status", "-o", "env", "--workdir", raiz], {
    cwd: raiz,
    encoding: "utf8",
    timeout: 60_000,
    shell: false,
    windowsHide: true,
  });
  if (r.error || r.status !== 0 || !r.stdout) {
    throw new Error(
      "Não foi possível obter os metadados da stack local (`supabase status`): " +
        "confira se o Docker e a stack (`pnpm exec supabase start`) estão no ar. Nada foi executado.",
    );
  }
  return r.stdout;
}

/**
 * Ponto de entrada: obtém os metadados, comprova a stack (CLI + portas reais do Docker) e devolve a
 * URL de banco verificada.
 * @param {{ env: Ambiente, raiz: string,
 *           executarStatus?: (raiz: string) => string,
 *           consultarDocker?: (d: { raiz: string, apiPorta: string, dbPorta: string, env: Ambiente }) => unknown }} opcoes
 * @returns {{ urlBanco: string, apiUrl: string }}
 */
export function exigirStackLocal({
  env,
  raiz,
  executarStatus = executarStatusSupabase,
  consultarDocker = verificarStackNoDocker,
}) {
  // Valida o ambiente ANTES de executar qualquer processo: ambiente remoto nem chega ao CLI.
  verificarAmbienteLocal(env);
  let texto;
  try {
    texto = executarStatus(raiz);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("Não foi possível obter")) throw erro;
    throw new Error("Não foi possível obter os metadados da stack local (`supabase status`). Nada foi executado.");
  }
  const stack = resolverStackLocal(env, lerStatusEnv(texto));
  // O CLI descreve a configuração; o Docker diz o que está de fato publicado.
  consultarDocker({ raiz, apiPorta: stack.apiPorta, dbPorta: stack.dbPorta, env });
  return { urlBanco: stack.urlBanco, apiUrl: stack.apiUrl };
}
