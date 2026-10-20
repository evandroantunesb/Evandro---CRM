/**
 * Prova, pelo próprio Docker, de que as portas reportadas pelo Supabase CLI são as portas REAIS dos
 * contêineres da stack do repositório. O `supabase status` descreve a configuração (`config.toml`),
 * não o que o Docker publica: com um `config.toml` divergente da stack em execução, o CLI pode
 * reportar a API de uma stack e a porta de banco de outra. Aqui o destino só é aceito se:
 *
 * - o Docker consultado é local (socket unix/npipe; `tcp://`, `ssh://` e afins são recusados);
 * - os contêineres `supabase_kong_<id>` e `supabase_db_<id>` existem e estão rodando (e saudáveis,
 *   quando há healthcheck), com os rótulos `com.supabase.cli.project` e `com.docker.compose.project`
 *   iguais ao `project_id` e na rede `supabase_network_<id>` (o nome sozinho não basta);
 * - cada um publica a porta interna (8000/5432) em exatamente UMA porta do host, só em loopback, e
 *   essa porta é a que o CLI reportou (nunca se deduz uma da outra);
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

/**
 * Destino do Docker: só socket local. `DOCKER_HOST` tem precedência sobre o contexto.
 * @param {string | undefined} dockerHost valor de DOCKER_HOST
 * @param {string | undefined} hostDoContexto endpoint do contexto atual (docker context inspect)
 */
export function exigirDockerLocal(dockerHost, hostDoContexto) {
  const host = dockerHost !== undefined && dockerHost.trim() !== "" ? dockerHost.trim() : hostDoContexto?.trim();
  if (!host) throw new Error("Não foi possível determinar o destino do Docker: recusado.");
  if (!/^(unix|npipe):\/\//.test(host)) {
    throw new Error("O Docker consultado não é local (só socket unix/npipe é aceito): recusado.");
  }
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
 * Porta do host publicada para uma porta interna: exatamente uma, só em loopback.
 * @param {ContainerInspecionado} c
 * @param {string} nome
 * @param {string} portaInterna ex.: "8000/tcp"
 * @returns {string}
 */
function portaPublicada(c, nome, portaInterna) {
  const entradas = c.NetworkSettings?.Ports?.[portaInterna] ?? [];
  if (entradas.length === 0) throw new Error(`Contêiner "${nome}" não publica ${portaInterna} no host: recusado.`);
  for (const e of entradas) {
    if (!LOOPBACK.has(e.HostIp ?? "")) {
      throw new Error(`Contêiner "${nome}" publica ${portaInterna} fora do loopback: recusado.`);
    }
  }
  const portas = new Set(entradas.map((e) => e.HostPort ?? ""));
  if (portas.size !== 1 || portas.has("")) {
    throw new Error(`Contêiner "${nome}" publica ${portaInterna} em mais de uma porta do host (ambíguo): recusado.`);
  }
  return [...portas][0];
}

/**
 * Compara as portas reportadas pelo CLI com as publicadas pelo Docker. Função pura.
 * @param {{ projeto: string, apiPorta: string, dbPorta: string, containers: ContainerInspecionado[] }} d
 *   `containers`: inspeção de TODOS os contêineres em execução.
 */
export function verificarPortasDocker({ projeto, apiPorta, dbPorta, containers }) {
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

  if (portaPublicada(kong, kongNome, "8000/tcp") !== apiPorta) {
    throw new Error(
      `A porta da API reportada pelo supabase status (${apiPorta}) não é a que o Docker publica para ${kongNome}: recusado.`,
    );
  }
  if (portaPublicada(db, dbNome, "5432/tcp") !== dbPorta) {
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
 * Executa o Docker sem shell. Falhas não repassam a saída do processo.
 * @param {string[]} args
 * @returns {string}
 */
export function executarDocker(args) {
  try {
    return execFileSync("docker", args, {
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
 * @param {{ raiz: string, apiPorta: string, dbPorta: string, env: Record<string, string | undefined>,
 *           docker?: (args: string[]) => string, lerConfig?: (c: string) => string }} o
 */
export function verificarStackNoDocker({ raiz, apiPorta, dbPorta, env, docker = executarDocker, lerConfig }) {
  const projeto = lerProjectId(raiz, lerConfig);

  let hostContexto;
  if (!env.DOCKER_HOST?.trim()) {
    try {
      const ctx = JSON.parse(docker(["context", "inspect"]));
      hostContexto = ctx?.[0]?.Endpoints?.docker?.Host;
    } catch {
      throw new Error("Não foi possível determinar o contexto do Docker: recusado.");
    }
  }
  exigirDockerLocal(env.DOCKER_HOST, hostContexto);

  const nomes = docker(["ps", "--format", "{{.Names}}"])
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (nomes.length === 0) throw new Error("Nenhum contêiner em execução: a stack local não está no ar.");
  let containers;
  try {
    containers = JSON.parse(docker(["inspect", ...nomes]));
  } catch {
    throw new Error("Resposta inválida do Docker ao inspecionar os contêineres: recusado.");
  }
  if (!Array.isArray(containers)) throw new Error("Resposta inválida do Docker ao inspecionar os contêineres: recusado.");
  verificarPortasDocker({ projeto, apiPorta, dbPorta, containers });
  return { projeto };
}
