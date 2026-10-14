// Alertas de falha por GitHub Issues, sem credenciais de produção.
// Executado apenas após validação do agendamento/backup; NÃO lê conteúdos do B2/Supabase.
const projeto = "evandroantunesb/Evandro---CRM";
const tituloPorTipo = {
  postgres: "[Backup Raion] Falha PostgreSQL",
  storage: "[Backup Raion] Falha Storage",
};
const [tipo] = process.argv.slice(2);
const titulo = tituloPorTipo[tipo];
if (!titulo || process.env.GITHUB_REPOSITORY !== projeto || process.env.GITHUB_SERVER_URL !== "https://github.com") {
  console.error("::error::Repositório ou tipo de alerta não autorizado");
  process.exit(1);
}
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("::error::Permissão de GitHub Issues indisponível");
  process.exit(1);
}
const run = process.env.GITHUB_RUN_ID;
if (!/^\d+$/.test(run ?? "")) {
  console.error("::error::ID da execução inválido");
  process.exit(1);
}
const tentativa = Number(process.env.GITHUB_RUN_ATTEMPT || "1");
if (!Number.isSafeInteger(tentativa) || tentativa < 1) {
  console.error("::error::Tentativa inválida");
  process.exit(1);
}
const statusValidacao = process.env.STATUS_VALIDACAO === "failure" ? "falhou" : "concluída";
const statusBackup = process.env.STATUS_BACKUP === "failure" ? "falhou" : "não concluído";
const descricao = [
  "O GitHub Actions registrou uma falha no processo de backup do Raion CRM.",
  "",
  `- Tipo: ${tipo === "postgres" ? "PostgreSQL" : "Supabase Storage"}`,
  `- Execução: https://github.com/${projeto}/actions/runs/${run}/attempts/${tentativa}`,
  `- Validação: ${statusValidacao}`,
  `- Backup: ${statusBackup}`,
  "",
  "**Ação necessária:** consultar o job, corrigir a causa e confirmar que um novo backup",
  "foi gerado e pode ser restaurado. Depois, fechar esta issue manualmente.",
  "Não cole segredos nem dados de clientes nos comentários.",
].join("\n");

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
async function github(url, options = {}) {
  const resposta = await fetch(`https://api.github.com/repos/${projeto}${url}`, {
    ...options,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) throw Error(`GitHub Issues HTTP ${resposta.status}`);
  return resposta.status === 204 ? null : resposta.json();
}

async function executar() {
  let issueAberta;
  for (let pagina = 1; pagina <= 10; pagina++) {
    const lista = await github(`/issues?state=open&per_page=100&page=${pagina}`);
    issueAberta = lista.find((item) => !item.pull_request && item.title === titulo);
    if (issueAberta || lista.length < 100) break;
  }
  if (issueAberta) {
    await github(`/issues/${issueAberta.number}/comments`, {
      method: "POST", body: JSON.stringify({ body: descricao }),
    });
  } else {
    await github("/issues", {
      method: "POST",
      body: JSON.stringify({ title: titulo, body: descricao }),
    });
  }
  console.log("Alerta de falha registrado em GitHub Issues (sem dados privados).");
}

executar().catch((erro) => {
  // Nunca registra token nem payloads do GitHub.
  console.error("::error::Falha ao registrar alerta: " + (
    /^GitHub Issues HTTP \d{3}$/.test(String(erro.message)) ? erro.message : "erro de comunicação"
  ));
  process.exitCode = 1;
});
