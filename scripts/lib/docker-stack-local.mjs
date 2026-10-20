/**
 * Prova, pelo próprio Docker, de que as portas reportadas pelo Supabase CLI são as portas REAIS dos
 * contêineres da stack do repositório. O `supabase status` descreve a configuração (`config.toml`),
 * não o que o Docker publica: com um `config.toml` divergente da stack em execução, o CLI pode
 * reportar a API de uma stack e a porta de banco de outra. Aqui o destino só é aceito se:
 *
 * - o Docker consultado é local (socket unix/npipe; `tcp://`, `ssh://` e afins são recusados). O
 *   endpoint é o que o PRÓPRIO `docker context inspect` reporta, executado com o mesmo ambiente
 *   explícito dos demais comandos (`DOCKER_HOST`/`DOCKER_CONTEXT`/`DOCKER_CONFIG` vindos só de arquivo
 *   `.env*`, ou `DOCKER_HOST` e `DOCKER_CONTEXT` ao mesmo tempo, são recusados: a precedência entre
 *   eles não é garantida entre versões do CLI);
 * - os contêineres `supabase_kong_<id>` e `supabase_db_<id>` existem e estão rodando (e saudáveis,
 *   quando há healthcheck), com os rótulos `com.supabase.cli.project` e `com.docker.compose.project`
 *   iguais ao `project_id` e na rede `supabase_network_<id>` (o nome sozinho não basta);
 * - cada um publica a porta interna (8000/5432) em exatamente UMA porta do host, só em loopback, e
 *   essa porta é a que o CLI reportou (nunca se deduz uma da outra);
 * - a publicação inclui o host LITERAL da URL verificada (127.0.0.1 ou [::1]): é nele que os testes
 *   conectam, então publicar só no outro protocolo não comprova o destino. `localhost` é recusado
 *   (pode resolver para qualquer um dos dois);
 * - nenhum OUTRO contêiner publica essas mesmas portas do host (ambiguidade).
 *
 * Execução do Docker sem shell (`execFileSync` com vetor de argumentos fixos). As mensagens citam
 * só nomes de contêineres, rótulos e portas; nunca variáveis de ambiente nem credenciais.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "::1"]);
const NOME_PROJETO = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * `project_id` do `supabase/config.toml` (valor de nível superior, antes de qualquer `[secao]`).
 * @param {string} raiz
 * @param {(caminho: string) => string} [ler]
 * @returns {string}
 */
export function lerProjectId(raiz, ler = (c) => readFileSync(c, "utf8")) {
  let texto;
  try {
    texto = ler(join(raiz, "supabase", "config.toml"));
  } catch {
    throw new Error("supabase/config.toml ilegível: não é possível identificar o projeto da stack.");
  }
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (t.startsWith("[")) break;
    const m = /^project_id\s*=\s*"([^"]*)"\s*(#.*)?$/.exec(t);
    if (m) {
      if (!NOME_PROJETO.test(m[1])) throw new Error("project_id do config.toml tem formato inválido.");
      return m[1];
    }
  }
  throw new Error("project_id ausente no supabase/config.toml: não é possível identificar a stack.");
}

// Variáveis que decidem QUAL daemon o `docker` (e o Supabase CLI, que usa o mesmo cliente) consulta.
const VARIAVEIS_DESTINO_DOCKER = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"];
const valorDe = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

/**
 * O ambiente VALIDADO (que inclui arquivos `.env*`) e o ambiente dos SUBPROCESSOS (`process.env`)
 * precisam concordar sobre o destino do Docker; senão a prova valeria para um daemon e os comandos
 * rodariam em outro. Também recusa `DOCKER_HOST` e `DOCKER_CONTEXT` juntos: com os dois definidos, o
 * CLI escolhe um em silêncio e a escolha pode mudar entre versões.
 * @param {Record<string, string | undefined>} validado ambiente efetivo (processo + arquivos)
 * @param {Record<string, string | undefined>} processo o que os subprocessos realmente herdam
 */
export function exigirAmbienteDockerCoerente(validado, processo) {
  for (const nome of VARIAVEIS_DESTINO_DOCKER) {
    if (valorDe(validado[nome]) !== valorDe(processo[nome])) {
      throw new Error(
        `${nome} difere entre o ambiente validado e o dos subprocessos (definida só em arquivo .env* ou com outro valor): recusado.`,
      );
    }
  }
  if (valorDe(processo.DOCKER_HOST) && valorDe(processo.DOCKER_CONTEXT)) {
    throw new Error("DOCKER_HOST e DOCKER_CONTEXT estão definidos ao mesmo tempo: destino do Docker ambíguo, recusado.");
  }
}

/**
 * Destino do Docker: só socket local. Recebe o endpoint que o próprio CLI reporta como efetivo.
 * @param {string | undefined} endpoint `Endpoints.docker.Host` de `docker context inspect`
 */
export function exigirDockerLocal(endpoint) {
  const host = valorDe(endpoint);
  if (!host) throw new Error("Não foi possível determinar o destino do Docker: recusado.");
  if (!/^(unix|npipe):\/\//.test(host)) {
    throw new Error("O Docker consultado não é local (só socket unix/npipe é aceito): recusado.");
  }
}

/**
 * IP de publicação que o Docker precisa informar para o host literal da URL verificada.
 * @param {string | undefined} host `URL.hostname` ("127.0.0.1" ou "[::1]")
 * @param {string} rotulo "API" ou "banco" (só para a mensagem)
 * @returns {string}
 */
function hostIpExigido(host, rotulo) {
  if (host === "127.0.0.1") return "127.0.0.1";
  if (host === "[::1]" || host === "::1") return "::1";
  throw new Error(
    `O host da URL de ${rotulo} (${host ? JSON.stringify(host) : "ausente"}) não é 127.0.0.1 nem [::1]: não há como comprovar o destino no Docker. Recusado.`,
  );
}

/**
 * @typedef {{ HostIp?: string, HostPort?: string }} Publicacao
 * @typedef {{
 *   Name?: string,
 *   State?: { Running?: boolean, Status?: string, Health?: { Status?: string } },
 *   Config?: { Labels?: Record<string, string> | null },
 *   NetworkSettings?: { Ports?: Record<string, Publicacao[] | null> | null, Networks?: Record<string, unknown> | null },
 * }} ContainerInspecionado
 */

/**
 * @param {ContainerInspecionado} c
 * @param {string} nome
 * @param {string} projeto
 */
function exigirContainerDoProjeto(c, nome, projeto) {
  if (c.Name !== `/${nome}`) throw new Error(`Contêiner "${nome}" ausente: a stack não está no ar.`);
  if (c.State?.Running !== true || c.State?.Status !== "running") {
    throw new Error(`Contêiner "${nome}" não está rodando: recusado.`);
  }
  const saude = c.State?.Health?.Status;
  if (saude !== undefined && saude !== "healthy") throw new Error(`Contêiner "${nome}" não está saudável (${saude}): recusado.`);
  const rotulos = c.Config?.Labels ?? {};
  for (const rotulo of ["com.supabase.cli.project", "com.docker.compose.project"]) {
    if (rotulos[rotulo] !== projeto) {
      throw new Error(`Contêiner "${nome}" não pertence ao projeto "${projeto}" (rótulo ${rotulo}): recusado.`);
    }
  }
  if (!Object.keys(c.NetworkSettings?.Networks ?? {}).includes(`supabase_network_${projeto}`)) {
    throw new Error(`Contêiner "${nome}" não está na rede supabase_network_${projeto}: recusado.`);
  }
}

/**
 * Porta do host publicada para uma porta interna: exatamente uma, só em loopback e incluindo o
 * IP do host literal da URL verificada (publicação adicional só em outro IP de loopback).
 * @param {ContainerInspecionado} c
 * @param {string} nome
 * @param {string} portaInterna ex.: "8000/tcp"
 * @param {string} ipExigido "127.0.0.1" ou "::1": o IP em que os testes realmente conectam
 * @returns {string}
 */
function portaPublicada(c, nome, portaInterna, ipExigido) {
  const entradas = c.NetworkSettings?.Ports?.[portaInterna] ?? [];
  if (entradas.length === 0) throw new Error(`Contêiner "${nome}" não publica ${portaInterna} no host: recusado.`);
  const fora = [...new Set(entradas.filter((e) => !LOOPBACK.has(e.HostIp ?? "")).map((e) => e.HostIp ?? ""))];
  if (fora.length > 0) {
    // O Supabase CLI publica com `-p <porta>:<porta-interna>` (sem IP): vale o padrão do Docker, que é
    // 0.0.0.0/:: . Em rede bridge PERSONALIZADA (`supabase_network_<id>`) a opção `ip` do daemon não vale;
    // o padrão vem de `default-network-opts` (host_binding_ipv4) e só afeta redes criadas depois dele.
    throw new Error(
      `Contêiner "${nome}" publica ${portaInterna} fora do loopback (HostIp ${fora.map((ip) => JSON.stringify(ip)).join(", ")}): recusado. ` +
        'Configure o Docker para publicar redes bridge novas só em 127.0.0.1 ("default-network-opts" → bridge → ' +
        '"com.docker.network.bridge.host_binding_ipv4") e recrie a rede e os contêineres da stack (ver AGENTS.md).',
    );
  }
  const portas = new Set(entradas.map((e) => e.HostPort ?? ""));
  if (portas.size !== 1 || portas.has("")) {
    throw new Error(`Contêiner "${nome}" publica ${portaInterna} em mais de uma porta do host (ambíguo): recusado.`);
  }
  // Só o IP da URL verificada comprova o destino: publicar apenas em ::1 não prova que 127.0.0.1:<porta>
  // (onde os testes conectam) é este contêiner, e vice-versa.
  if (!entradas.some((e) => e.HostIp === ipExigido)) {
    const publicados = [...new Set(entradas.map((e) => e.HostIp ?? ""))].map((ip) => JSON.stringify(ip)).join(", ");
    throw new Error(
      `Contêiner "${nome}" não publica ${portaInterna} em ${ipExigido}, o endereço da URL verificada (publica em ${publicados}): recusado.`,
    );
  }
  return [...portas][0];
}

/**
 * Compara as portas reportadas pelo CLI com as publicadas pelo Docker. Função pura.
 * @param {{ projeto: string, apiPorta: string, dbPorta: string, apiHost: string, dbHost: string,
 *           containers: ContainerInspecionado[] }} d
 *   `containers`: inspeção de TODOS os contêineres em execução. `apiHost`/`dbHost`: host literal das
 *   URLs verificadas (`URL.hostname`); sem ele a verificação é recusada.
 */
export function verificarPortasDocker({ projeto, apiPorta, dbPorta, apiHost, dbHost, containers }) {
  const ipApi = hostIpExigido(apiHost, "API");
  const ipDb = hostIpExigido(dbHost, "banco");
  const kongNome = `supabase_kong_${projeto}`;
  const dbNome = `supabase_db_${projeto}`;
  const porNome = (nome) => containers.filter((c) => c.Name === `/${nome}`);
  for (const nome of [kongNome, dbNome]) {
    if (porNome(nome).length !== 1) throw new Error(`Contêiner "${nome}" ausente ou duplicado: a stack não está no ar.`);
  }
  const kong = porNome(kongNome)[0];
  const db = porNome(dbNome)[0];
  exigirContainerDoProjeto(kong, kongNome, projeto);
  exigirContainerDoProjeto(db, dbNome, projeto);

  if (portaPublicada(kong, kongNome, "8000/tcp", ipApi) !== apiPorta) {
    throw new Error(
      `A porta da API reportada pelo supabase status (${apiPorta}) não é a que o Docker publica para ${kongNome}: recusado.`,
    );
  }
  if (portaPublicada(db, dbNome, "5432/tcp", ipDb) !== dbPorta) {
    throw new Error(
      `A porta do banco reportada pelo supabase status (${dbPorta}) não é a que o Docker publica para ${dbNome}: recusado.`,
    );
  }

  // Outro contêiner publicando a mesma porta do host torna o destino ambíguo.
  for (const c of containers) {
    if (c.Name === `/${kongNome}` || c.Name === `/${dbNome}`) continue;
    for (const entradas of Object.values(c.NetworkSettings?.Ports ?? {})) {
      for (const e of entradas ?? []) {
        if (e.HostPort === apiPorta || e.HostPort === dbPorta) {
          throw new Error(`O contêiner "${c.Name?.replace(/^\//, "")}" também publica a porta ${e.HostPort}: destino ambíguo, recusado.`);
        }
      }
    }
  }
}

/**
 * Executa o Docker sem shell, com o ambiente EXPLÍCITO informado (o mesmo que a trava comprovou).
 * Falhas não repassam a saída do processo.
 * @param {string[]} args
 * @param {Record<string, string | undefined>} [env] ambiente do subprocesso (padrão: `process.env`)
 * @returns {string}
 */
export function executarDocker(args, env = process.env) {
  try {
    return execFileSync("docker", args, {
      env,
      encoding: "utf8",
      timeout: 30_000,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Não foi possível consultar o Docker (`docker`): confira se ele está instalado e em execução.");
  }
}

/**
 * Consulta real: valida o destino do Docker, inspeciona os contêineres em execução e compara as portas.
 * Todo comando roda com o MESMO ambiente explícito (`processo`); o endpoint efetivo é o que o próprio
 * `docker context inspect` reporta com esse ambiente (cobre `DOCKER_HOST`, `DOCKER_CONTEXT` e o
 * contexto atual), nunca o valor de uma variável lida de arquivo.
 * @param {{ raiz: string, apiPorta: string, dbPorta: string, apiHost: string, dbHost: string,
 *           env: Record<string, string | undefined>, processo?: Record<string, string | undefined>,
 *           docker?: (args: string[]) => string, lerConfig?: (c: string) => string }} o
 *   `env`: ambiente validado (processo + arquivos). `processo`: o que os subprocessos herdam.
 */
export function verificarStackNoDocker({ raiz, apiPorta, dbPorta, apiHost, dbHost, env, processo = process.env, docker, lerConfig }) {
  exigirAmbienteDockerCoerente(env, processo);
  const executar = docker ?? ((args) => executarDocker(args, processo));
  const projeto = lerProjectId(raiz, lerConfig);

  let endpoint;
  try {
    const ctx = JSON.parse(executar(["context", "inspect"]));
    endpoint = Array.isArray(ctx) && ctx.length === 1 ? ctx[0]?.Endpoints?.docker?.Host : undefined;
  } catch {
    throw new Error("Não foi possível determinar o contexto do Docker: recusado.");
  }
  exigirDockerLocal(endpoint);

  const nomes = executar(["ps", "--format", "{{.Names}}"])
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (nomes.length === 0) throw new Error("Nenhum contêiner em execução: a stack local não está no ar.");
  let containers;
  try {
    containers = JSON.parse(executar(["inspect", ...nomes]));
  } catch {
    throw new Error("Resposta inválida do Docker ao inspecionar os contêineres: recusado.");
  }
  if (!Array.isArray(containers)) throw new Error("Resposta inválida do Docker ao inspecionar os contêineres: recusado.");
  verificarPortasDocker({ projeto, apiPorta, dbPorta, apiHost, dbHost, containers });
  return { projeto };
}
