#!/usr/bin/env node
// Trava fail-closed do executor da suíte SQL da P1a: só libera um banco DESCARTÁVEL e coerente.
// Faz apenas leituras (docker port e um SELECT na marca da fixture). Qualquer falta ou inconsistência sai com código 2
// ANTES de o executor copiar arquivo ou gravar qualquer coisa. Nunca imprime senha, chave ou valor de variável sensível.
import { execFileSync } from "node:child_process";

const BANCO_COMPARTILHADO = "supabase_db_evandro---crm"; // banco local de desenvolvimento (porta 54322 por padrão)
const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const env = process.env;
const emActions = env.GITHUB_ACTIONS === "true";

function recusar(motivo) {
  console.error(`RECUSADO (nada foi gravado): ${motivo}`);
  process.exit(2);
}

function exigir(nome) {
  const v = (env[nome] ?? "").trim();
  if (!v) recusar(`variável ${nome} ausente.`);
  return v;
}

function urlLocal(nome, valor, protocolos) {
  let u;
  try {
    u = new URL(valor);
  } catch {
    recusar(`${nome} não é uma URL válida.`);
  }
  if (!protocolos.includes(u.protocol)) recusar(`${nome} usa o protocolo "${u.protocol}", não permitido.`);
  if (!HOSTS_LOCAIS.has(u.hostname)) recusar(`${nome} aponta para "${u.hostname}", que não é local (produção e remotos são recusados).`);
  for (const p of ["host", "hostaddr", "service", "sslrootcert"]) {
    if (u.searchParams.has(p)) recusar(`${nome} traz o parâmetro "${p}", que pode redirecionar a conexão.`);
  }
  if (!u.port) recusar(`${nome} sem porta explícita.`);
  return u;
}

function docker(...args) {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function portasPublicadas(container, portaInterna) {
  const saida = docker("port", container, `${portaInterna}/tcp`);
  if (saida === null) recusar(`container "${container}" não existe ou não está rodando.`);
  return [...saida.matchAll(/:(\d+)\s*$/gm)].map((m) => m[1]);
}

const container = exigir("DB_CONTAINER");
const nomeBanco = exigir("DB_NAME");
const urlBancoTxt = exigir("SUPABASE_DB_URL");
const urlApiTxt = (env.SUPABASE_API_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
if (!urlApiTxt) recusar("URL da API Supabase ausente (SUPABASE_API_URL ou NEXT_PUBLIC_SUPABASE_URL).");
if (env.P1A_DESCARTAVEL !== "1") recusar('defina P1A_DESCARTAVEL=1 para confirmar que o destino é descartável.');

const urlBanco = urlLocal("SUPABASE_DB_URL", urlBancoTxt, ["postgresql:", "postgres:"]);
const urlApi = urlLocal("URL da API Supabase", urlApiTxt, ["http:", "https:"]);

// 1. Banco local compartilhado: recusado, salvo no CI (stack nova do job, sem dados de desenvolvimento).
if (container === BANCO_COMPARTILHADO && !emActions) {
  recusar("o container é o do banco local compartilhado; use uma stack descartável (project_id e portas próprios).");
}
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(container)) recusar("DB_CONTAINER não segue o padrão supabase_db_<projeto>.");
const projeto = container.replace(/^supabase_db_/, "");

// 2. O banco da URL é o banco informado.
const bancoDaUrl = decodeURIComponent(urlBanco.pathname.replace(/^\//, ""));
if (bancoDaUrl !== nomeBanco) recusar("o banco da SUPABASE_DB_URL difere de DB_NAME.");

// 3. As portas da URL do banco e da API pertencem ao MESMO projeto (containers do mesmo project_id).
if (!portasPublicadas(container, 5432).includes(urlBanco.port)) {
  recusar("a porta da SUPABASE_DB_URL não é a publicada pelo DB_CONTAINER.");
}
const kong = `supabase_kong_${projeto}`;
if (!portasPublicadas(kong, 8000).includes(urlApi.port)) {
  recusar(`a porta da URL da API não é a publicada por ${kong}: banco e API apontam para projetos diferentes.`);
}

// 4. Marca da fixture (só existe se a fixture foi carregada num banco vazio) e banco sem volume de desenvolvimento.
function consulta(sql) {
  const s = docker("exec", "-i", container, "psql", "-U", "postgres", "-d", nomeBanco, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", `begin read only; ${sql}; rollback;`);
  if (s === null) recusar("falha ao consultar o banco (somente leitura).");
  return s;
}
// `psql -At` imprime também as etiquetas BEGIN/ROLLBACK; ficam só as linhas de resultado.
const linhas = (sql) => consulta(sql).split("\n").filter((l) => l !== "" && l !== "BEGIN" && l !== "ROLLBACK");
if (linhas("select current_database()")[0] !== nomeBanco) recusar("current_database() difere de DB_NAME.");
if (linhas("select to_regclass('public.p1a_marca_descartavel') is not null")[0] !== "t") {
  recusar("marca de ambiente descartável ausente: carregue tests/sql/p1a/fixture.sql num banco vazio.");
}
if (linhas("select count(*) from public.p1a_marca_descartavel where fixture = 'p1a-v1'")[0] !== "1") {
  recusar("marca de ambiente descartável inválida.");
}
const empresas = Number(linhas("select count(*) from public.empresas")[0]);
if (!(empresas <= 10)) recusar(`o banco tem ${empresas} empresas: parece de desenvolvimento, não a fixture.`);

console.log(`destino ok: projeto ${projeto}, banco ${nomeBanco}, ${empresas} empresas (fixture), ${emActions ? "GitHub Actions" : "local"}.`);
