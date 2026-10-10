// Confere, antes de qualquer conexão, que as credenciais apontam para o projeto de produção esperado.
//
// Fail-closed e sem rede. Nunca imprime URL, senha, chave nem o valor dos secrets: as mensagens citam
// só o nome da variável e o que era esperado (o project ref de produção é público).
//
// Uso: node .github/scripts/validar-destino-producao.mjs <banco|seed> <project-ref esperado>
//   banco: SUPABASE_PROJECT_ID e SUPABASE_DB_URL (Session Pooler: usuário postgres.<ref>, porta 5432,
//          banco postgres, host aws-N-sa-east-1.pooler.supabase.com). No pooler, o projeto de destino
//          é definido pelo usuário postgres.<ref>; o host só indica a região.
//   seed:  SUPABASE_PROJECT_ID e SUPABASE_SERVICE_ROLE_KEY (JWT legado: role service_role e ref
//          esperado; chave sb_secret_ não traz o projeto e é aceita só com o project ref conferido).

const [modo, refEsperado] = process.argv.slice(2);

function falhar(msg) {
  console.log(`::error::${msg}`);
  process.exit(1);
}

if (modo !== "banco" && modo !== "seed") falhar("uso: validar-destino-producao.mjs <banco|seed> <project-ref>");
if (!/^[a-z0-9]{20}$/.test(refEsperado ?? "")) falhar("project ref esperado ausente ou em formato inválido");

const projeto = process.env.SUPABASE_PROJECT_ID ?? "";
if (!projeto) falhar("SUPABASE_PROJECT_ID ausente");
if (projeto !== refEsperado) falhar(`SUPABASE_PROJECT_ID não é o projeto de produção esperado (${refEsperado})`);

if (modo === "banco") {
  const bruta = process.env.SUPABASE_DB_URL ?? "";
  if (!bruta) falhar("SUPABASE_DB_URL ausente");
  if (bruta !== bruta.trim()) falhar("SUPABASE_DB_URL com espaços no início ou no fim");
  let u;
  try {
    u = new URL(bruta);
  } catch {
    falhar("SUPABASE_DB_URL não é uma URL válida");
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") falhar("SUPABASE_DB_URL não usa o esquema postgresql://");
  if (!/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/.test(u.hostname)) {
    falhar("SUPABASE_DB_URL não aponta para o Session Pooler oficial do Supabase em sa-east-1");
  }
  if (u.port !== "5432") falhar("SUPABASE_DB_URL não usa a porta 5432 (Session Pooler)");
  if (u.username !== `postgres.${refEsperado}`) {
    falhar(`o usuário de SUPABASE_DB_URL não é postgres.${refEsperado} (o pooler roteia pelo usuário)`);
  }
  if (!u.password) falhar("SUPABASE_DB_URL sem senha");
  if (u.pathname !== "/postgres") falhar("SUPABASE_DB_URL não usa o banco postgres");
  if (u.hash) falhar("SUPABASE_DB_URL com fragmento (#) inesperado");
  // Só sslmode é aceito: host, hostaddr, port, user, dbname, options, service etc. poderiam redirecionar
  // a conexão ou trocar o usuário depois da validação.
  for (const [chave, valor] of u.searchParams) {
    if (chave !== "sslmode" || !["require", "verify-ca", "verify-full"].includes(valor)) {
      falhar("SUPABASE_DB_URL com parâmetro de conexão não permitido (só sslmode=require|verify-ca|verify-full)");
    }
  }
} else {
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!chave) falhar("SUPABASE_SERVICE_ROLE_KEY ausente");
  if (!/^sb_secret_/.test(chave)) {
    const partes = chave.split(".");
    let claims = null;
    if (partes.length === 3 && partes.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
      try {
        claims = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
      } catch {
        claims = null;
      }
    }
    if (!claims || typeof claims !== "object") falhar("SUPABASE_SERVICE_ROLE_KEY não é JWT legível nem chave sb_secret_");
    if (claims.role !== "service_role") falhar("SUPABASE_SERVICE_ROLE_KEY não tem role service_role");
    if (claims.ref !== refEsperado) falhar(`SUPABASE_SERVICE_ROLE_KEY não pertence ao projeto ${refEsperado} (claim ref)`);
  }
}

console.log(`Destino conferido: projeto ${refEsperado} (${modo}).`);
