import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executarDocker,
  exigirDockerLocal,
  lerProjectId,
  verificarPortasDocker,
  verificarStackNoDocker,
} from "../scripts/lib/docker-stack-local.mjs";

// Testes puros: o Docker é simulado (objetos de inspeção fictícios); nenhum processo real é criado.
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

type Ports = Record<string, { HostIp: string; HostPort: string }[] | null>;

/** Saída fictícia de `docker inspect` para um contêiner da stack do projeto. */
function conteiner(nome: string, projeto: string, portas: Ports, ajustes: Record<string, unknown> = {}) {
  return {
    Name: `/${nome}`,
    State: { Running: true, Status: "running", Health: { Status: "healthy" } },
    Config: { Labels: { "com.supabase.cli.project": projeto, "com.docker.compose.project": projeto } },
    NetworkSettings: { Ports: portas, Networks: { [`supabase_network_${projeto}`]: {} } },
    ...ajustes,
  };
}
const loop = (porta: string) => [
  { HostIp: "127.0.0.1", HostPort: porta },
  { HostIp: "::1", HostPort: porta },
];
const kong = (projeto: string, porta: string, ajustes = {}) =>
  conteiner(`supabase_kong_${projeto}`, projeto, { "8000/tcp": loop(porta) }, ajustes);
const db = (projeto: string, porta: string, ajustes = {}) =>
  conteiner(`supabase_db_${projeto}`, projeto, { "5432/tcp": loop(porta) }, ajustes);

const stack = (projeto = "meu-projeto", api = "54321", banco = "54322") => [kong(projeto, api), db(projeto, banco)];
const verificar = (containers: unknown[], api = "54321", banco = "54322", projeto = "meu-projeto") =>
  verificarPortasDocker({ projeto, apiPorta: api, dbPorta: banco, containers: containers as never });

function recusa(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("esperava recusa");
}

describe("A1: portas reais do Docker x portas reportadas pelo CLI", () => {
  it("aceita quando o Docker publica exatamente as portas do CLI (IPv4 e IPv6 em loopback)", () => {
    expect(() => verificar(stack())).not.toThrow();
    expect(() => verificar(stack("outro", "56321", "56322"), "56321", "56322", "outro")).not.toThrow();
  });

  it("CASO DA AUDITORIA: config.toml informa o banco na 59999, o Docker publica na 54322 → recusado", () => {
    const msg = recusa(() => verificar(stack(), "54321", "59999"));
    expect(msg).toContain("59999");
    expect(msg).toContain("supabase_db_meu-projeto");
  });

  it("API reportada em porta diferente da publicada → recusado", () => {
    expect(recusa(() => verificar(stack(), "59998", "54322"))).toContain("supabase_kong_meu-projeto");
  });

  it("stack cruzada: a porta de API de uma stack com a porta de banco de outra → recusado", () => {
    // Docker tem duas stacks; o CLI (config divergente) mistura a API da A com o banco da B.
    const duas = [...stack("a", "56321", "56322"), ...stack("b", "57321", "57322")];
    expect(() => verificar(duas, "56321", "56322", "a")).not.toThrow();
    expect(() => verificar(duas, "56321", "57322", "a")).toThrow(/não é a que o Docker publica/);
  });

  it("contêiner ausente, duplicado ou parado → recusado", () => {
    expect(recusa(() => verificar([kong("meu-projeto", "54321")]))).toMatch(/supabase_db_meu-projeto.*ausente/);
    expect(recusa(() => verificar([db("meu-projeto", "54322")]))).toMatch(/supabase_kong_meu-projeto.*ausente/);
    expect(recusa(() => verificar([...stack(), db("meu-projeto", "54322")]))).toMatch(/ausente ou duplicado/);
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), db("meu-projeto", "54322", { State: { Running: false, Status: "exited" } })]))).toMatch(
      /não está rodando/,
    );
    expect(recusa(() => verificar([])).length).toBeGreaterThan(0);
  });

  it("contêiner sem saúde (starting/unhealthy) → recusado; sem healthcheck é aceito", () => {
    for (const status of ["starting", "unhealthy"]) {
      const c = db("meu-projeto", "54322", { State: { Running: true, Status: "running", Health: { Status: status } } });
      expect(recusa(() => verificar([kong("meu-projeto", "54321"), c]))).toContain(status);
    }
    const semHealth = db("meu-projeto", "54322", { State: { Running: true, Status: "running" } });
    expect(() => verificar([kong("meu-projeto", "54321"), semHealth])).not.toThrow();
  });

  it("o nome sozinho não basta: rótulos e rede precisam ser do projeto", () => {
    const rotuloCli = db("meu-projeto", "54322", {
      Config: { Labels: { "com.supabase.cli.project": "impostor", "com.docker.compose.project": "meu-projeto" } },
    });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), rotuloCli]))).toContain("com.supabase.cli.project");
    const rotuloCompose = db("meu-projeto", "54322", {
      Config: { Labels: { "com.supabase.cli.project": "meu-projeto", "com.docker.compose.project": "impostor" } },
    });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), rotuloCompose]))).toContain("com.docker.compose.project");
    const semRotulos = db("meu-projeto", "54322", { Config: { Labels: null } });
    expect(() => verificar([kong("meu-projeto", "54321"), semRotulos])).toThrow(/não pertence ao projeto/);
    const outraRede = db("meu-projeto", "54322", { NetworkSettings: { Ports: { "5432/tcp": loop("54322") }, Networks: { bridge: {} } } });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), outraRede]))).toContain("supabase_network_meu-projeto");
  });

  it("porta não publicada, fora do loopback ou em mais de uma porta do host (ambígua) → recusado", () => {
    const naoPublica = conteiner("supabase_db_meu-projeto", "meu-projeto", { "5432/tcp": null });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), naoPublica]))).toMatch(/não publica/);
    const todasInterfaces = conteiner("supabase_db_meu-projeto", "meu-projeto", { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "54322" }] });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), todasInterfaces]))).toMatch(/fora do loopback/);
    const duasPortas = conteiner("supabase_db_meu-projeto", "meu-projeto", {
      "5432/tcp": [
        { HostIp: "127.0.0.1", HostPort: "54322" },
        { HostIp: "::1", HostPort: "59999" },
      ],
    });
    expect(recusa(() => verificar([kong("meu-projeto", "54321"), duasPortas]))).toMatch(/ambíguo/);
  });

  it("outro contêiner publicando a mesma porta do host torna o destino ambíguo → recusado", () => {
    const intruso = conteiner("outro_servico", "outro", { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] });
    expect(recusa(() => verificar([...stack(), intruso]))).toContain("outro_servico");
    const intrusoApi = conteiner("outro_servico", "outro", { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "54321" }] });
    expect(() => verificar([...stack(), intrusoApi])).toThrow(/também publica a porta 54321/);
    const inofensivo = conteiner("outro_servico", "outro", { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] });
    expect(() => verificar([...stack(), inofensivo])).not.toThrow();
  });
});

describe("A1: política de loopback (o que o Docker realmente publica)", () => {
  const publica = (ips: string[], porta: string) => ips.map((HostIp) => ({ HostIp, HostPort: porta }));
  const comIps = (ipsKong: string[], ipsDb: string[]) => [
    conteiner("supabase_kong_meu-projeto", "meu-projeto", { "8000/tcp": publica(ipsKong, "54321") }),
    conteiner("supabase_db_meu-projeto", "meu-projeto", { "5432/tcp": publica(ipsDb, "54322") }),
  ];

  it("só IPv4 em 127.0.0.1 (o que default-network-opts produz) é aceito", () => {
    expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]))).not.toThrow();
    expect(() => verificar(comIps(["::1"], ["::1"]))).not.toThrow();
  });

  it("0.0.0.0 (padrão do CLI sem default-network-opts) é recusado, com IP e correção na mensagem", () => {
    // Caso real do CI no commit 81674c8: kong 8000/tcp publicado em 0.0.0.0 e ::.
    const msg = recusa(() => verificar(comIps(["0.0.0.0", "::"], ["0.0.0.0", "::"])));
    expect(msg).toContain('"supabase_kong_meu-projeto"');
    expect(msg).toContain("8000/tcp fora do loopback");
    expect(msg).toContain('"0.0.0.0"');
    expect(msg).toContain("host_binding_ipv4");
    expect(msg).toContain("recrie");
    expect(() => verificar(comIps(["127.0.0.1"], ["0.0.0.0"]))).toThrow(/supabase_db_meu-projeto.*5432\/tcp fora do loopback/);
  });

  it(':: (todas as interfaces IPv6) é recusado, sozinho ou junto de 127.0.0.1', () => {
    expect(() => verificar(comIps(["::"], ["127.0.0.1"]))).toThrow(/fora do loopback/);
    expect(() => verificar(comIps(["127.0.0.1", "::"], ["127.0.0.1"]))).toThrow(/fora do loopback/);
    expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1", "::"]))).toThrow(/fora do loopback/);
  });

  it("IP ausente/vazio, IPv4-mapeado, localhost e IP de LAN são recusados (só a lista exata vale)", () => {
    for (const ip of ["", "localhost", "::ffff:127.0.0.1", "127.0.0.2", "10.0.0.5", "192.168.0.10"]) {
      expect(() => verificar(comIps([ip], ["127.0.0.1"]))).toThrow(/fora do loopback/);
    }
  });

  it("porta divergente do CLI continua recusada mesmo com loopback correto", () => {
    expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "54321", "59999")).toThrow(/não é a que o Docker publica/);
    expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "59998", "54322")).toThrow(/não é a que o Docker publica/);
  });

  it("contêiner de outro projeto ou em rede diferente da supabase_network_<id> é recusado", () => {
    const outroProjeto = conteiner("supabase_kong_meu-projeto", "impostor", { "8000/tcp": publica(["127.0.0.1"], "54321") });
    expect(() => verificar([outroProjeto, db("meu-projeto", "54322")])).toThrow(/não pertence ao projeto/);
    const redeAlheia = conteiner("supabase_kong_meu-projeto", "meu-projeto", { "8000/tcp": publica(["127.0.0.1"], "54321") }, {
      NetworkSettings: { Ports: { "8000/tcp": publica(["127.0.0.1"], "54321") }, Networks: { supabase_network_outro: {} } },
    });
    expect(() => verificar([redeAlheia, db("meu-projeto", "54322")])).toThrow(/supabase_network_meu-projeto/);
  });
});

describe("A1: Docker ausente ou inspeção com erro → recusado (fail-closed)", () => {
  const lerConfig = () => 'project_id = "meu-projeto"\n';
  const env = { DOCKER_HOST: "unix:///var/run/docker.sock" };
  const consultar = (docker: (a: string[]) => string) =>
    verificarStackNoDocker({ raiz: "/repo", apiPorta: "54321", dbPorta: "54322", env, docker, lerConfig });

  it("`docker ps` falha (Docker parado/ausente)", () => {
    expect(() =>
      consultar(() => {
        throw new Error("Não foi possível consultar o Docker (`docker`)");
      }),
    ).toThrow(/Não foi possível consultar o Docker/);
  });

  it("`docker inspect` falha depois de a listagem funcionar", () => {
    const docker = (args: string[]) => {
      if (args[0] === "ps") return "supabase_kong_meu-projeto\nsupabase_db_meu-projeto";
      throw new Error("Não foi possível consultar o Docker (`docker`)");
    };
    // A falha da inspeção é capturada e vira recusa própria; em nenhum caso a verificação é pulada.
    expect(() => consultar(docker)).toThrow(/Resposta inválida do Docker ao inspecionar/);
  });

  it("saída de `inspect` sem as portas (NetworkSettings.Ports ausente) é recusada, não presumida", () => {
    const semPortas = [
      conteiner("supabase_kong_meu-projeto", "meu-projeto", {}, { NetworkSettings: { Networks: { "supabase_network_meu-projeto": {} } } }),
      db("meu-projeto", "54322"),
    ];
    const docker = (args: string[]) => (args[0] === "ps" ? "a\nb" : JSON.stringify(semPortas));
    expect(() => consultar(docker)).toThrow(/não publica 8000\/tcp/);
  });
});

describe("A1: workflows de teste preparam o Docker para publicar em loopback", () => {
  const WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/navegador-obras.yml"];
  const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

  it.each(WORKFLOWS)("%s: default-network-opts vem ANTES do `supabase start`, é validado e a stack é conferida depois", (arquivo) => {
    const texto = ler(arquivo);
    const config = texto.indexOf("default-network-opts");
    const inicio = texto.indexOf("run: supabase start");
    const conferencia = texto.indexOf("Conferir as portas publicadas");
    expect(config).toBeGreaterThan(-1);
    expect(inicio).toBeGreaterThan(config);
    expect(conferencia).toBeGreaterThan(inicio);
    for (const trecho of [
      "com.docker.network.bridge.host_binding_ipv4",
      '"127.0.0.1"',
      "dockerd --validate",
      "systemctl restart docker",
      "docker network inspect",
      "supabase_kong_",
      "supabase_db_",
    ]) {
      expect(texto, trecho).toContain(trecho);
    }
  });

  it.each(WORKFLOWS)("%s: não há bypass (CI=true, variável de liberação) nem relaxamento da trava", (arquivo) => {
    const texto = ler(arquivo);
    expect(texto).not.toMatch(/\bCI\s*[:=]\s*"?true/i);
    expect(texto).not.toMatch(/PERMITIR|BYPASS|SKIP_(DOCKER|GUARD)|IGNORAR_TRAVA/i);
  });

  it.each(WORKFLOWS)("%s: `ip` do daemon sozinho não é usado (só vale para a bridge padrão)", (arquivo) => {
    expect(ler(arquivo)).not.toMatch(/\["ip"\]|"ip"\s*:/);
  });
});

describe("A1: o Docker consultado precisa ser local", () => {
  it.each(["unix:///var/run/docker.sock", "npipe:////./pipe/dockerDesktopLinuxEngine"])("aceita %s", (host) => {
    expect(() => exigirDockerLocal(host, undefined)).not.toThrow();
    expect(() => exigirDockerLocal(undefined, host)).not.toThrow();
  });

  it.each(["tcp://10.0.0.5:2375", "tcp://127.0.0.1:2375", "ssh://usuario@servidor", "fd://", "https://x"])("recusa %s", (host) => {
    expect(() => exigirDockerLocal(host, "unix:///var/run/docker.sock")).toThrow(/não é local/);
    expect(() => exigirDockerLocal(undefined, host)).toThrow(/não é local/);
  });

  it("DOCKER_HOST tem precedência sobre o contexto, e sem nenhum dos dois não há prova", () => {
    expect(() => exigirDockerLocal("tcp://10.0.0.5:2375", "unix:///var/run/docker.sock")).toThrow();
    expect(() => exigirDockerLocal("  ", "unix:///var/run/docker.sock")).not.toThrow();
    expect(() => exigirDockerLocal(undefined, undefined)).toThrow(/Não foi possível determinar/);
    expect(() => exigirDockerLocal("", "")).toThrow(/Não foi possível determinar/);
  });
});

describe("project_id do config.toml", () => {
  const ler = (texto: string) => () => texto;

  it("lê o valor de nível superior", () => {
    expect(lerProjectId("/repo", ler('# comentário\nproject_id = "evandro---crm"\n\n[api]\nport = 1'))).toBe("evandro---crm");
    expect(lerProjectId("/repo", ler('project_id = "x1_y.z" # nota'))).toBe("x1_y.z");
    expect(lerProjectId("/repo", ler('project_id = "abc"\r\n[api]\r\n'))).toBe("abc");
  });

  it("recusa ausente, dentro de seção, inválido ou arquivo ilegível", () => {
    expect(() => lerProjectId("/repo", ler("[api]\nproject_id = \"x\""))).toThrow(/ausente/);
    expect(() => lerProjectId("/repo", ler("port = 1"))).toThrow(/ausente/);
    for (const ruim of ["a b", "a;b", "$(x)", "-x", "a/b", ""]) {
      expect(() => lerProjectId("/repo", ler(`project_id = "${ruim}"`))).toThrow(/inválido/);
    }
    expect(() =>
      lerProjectId("/repo", () => {
        throw new Error("ENOENT");
      }),
    ).toThrow(/ilegível/);
  });
});

describe("A1: consulta ao Docker sem shell", () => {
  const CONFIG = 'project_id = "meu-projeto"\n';
  const lerConfig = () => CONFIG;
  const nomes = (containers: { Name: string }[]) => containers.map((c) => c.Name.slice(1)).join("\n");

  /** Docker simulado que registra os vetores de argumentos recebidos. */
  function dockerSimulado(containers: unknown[], contexto = "unix:///var/run/docker.sock") {
    const chamadas: string[][] = [];
    const docker = (args: string[]) => {
      chamadas.push(args);
      if (args[0] === "context") return JSON.stringify([{ Endpoints: { docker: { Host: contexto } } }]);
      if (args[0] === "ps") return nomes(containers as { Name: string }[]);
      if (args[0] === "inspect") return JSON.stringify(containers);
      throw new Error("comando inesperado");
    };
    return { docker, chamadas };
  }
  const consulta = (docker: (a: string[]) => string, env: Record<string, string | undefined> = {}, dbPorta = "54322") =>
    verificarStackNoDocker({ raiz: "/repo", apiPorta: "54321", dbPorta, env, docker, lerConfig });

  it("fluxo completo: contexto, lista de contêineres e inspeção, só com vetores de argumentos fixos", () => {
    const { docker, chamadas } = dockerSimulado(stack());
    expect(consulta(docker)).toEqual({ projeto: "meu-projeto" });
    expect(chamadas).toEqual([
      ["context", "inspect"],
      ["ps", "--format", "{{.Names}}"],
      ["inspect", "supabase_kong_meu-projeto", "supabase_db_meu-projeto"],
    ]);
  });

  it("caso da auditoria também pelo fluxo completo: CLI diz 59999, Docker publica 54322", () => {
    const { docker } = dockerSimulado(stack());
    expect(recusa(() => consulta(docker, {}, "59999"))).toContain("59999");
  });

  it("DOCKER_HOST local dispensa a consulta ao contexto; remoto é recusado antes de listar contêineres", () => {
    const local = dockerSimulado(stack());
    consulta(local.docker, { DOCKER_HOST: "unix:///var/run/docker.sock" });
    expect(local.chamadas.map((c) => c[0])).toEqual(["ps", "inspect"]);

    const remoto = dockerSimulado(stack());
    expect(() => consulta(remoto.docker, { DOCKER_HOST: "tcp://10.0.0.5:2375" })).toThrow(/não é local/);
    expect(remoto.chamadas).toEqual([]);
  });

  it("contexto remoto do Docker é recusado antes de listar contêineres", () => {
    const { docker, chamadas } = dockerSimulado(stack(), "ssh://usuario@servidor");
    expect(() => consulta(docker)).toThrow(/não é local/);
    expect(chamadas).toEqual([["context", "inspect"]]);
  });

  it("nenhum contêiner, resposta inválida ou falha do Docker → recusado", () => {
    expect(() => consulta(dockerSimulado([]).docker)).toThrow(/Nenhum contêiner/);
    const invalido = (args: string[]) => (args[0] === "context" ? JSON.stringify([{ Endpoints: { docker: { Host: "unix:///x" } } }]) : args[0] === "ps" ? "a" : "não é json");
    expect(() => consulta(invalido)).toThrow(/Resposta inválida/);
    const naoLista = (args: string[]) => (args[0] === "context" ? JSON.stringify([{ Endpoints: { docker: { Host: "unix:///x" } } }]) : args[0] === "ps" ? "a" : "{}");
    expect(() => consulta(naoLista)).toThrow(/Resposta inválida/);
    const contextoInvalido = (args: string[]) => (args[0] === "context" ? "lixo" : "");
    expect(() => consulta(contextoInvalido)).toThrow(/contexto do Docker/);
    expect(() =>
      consulta(
        () => {
          throw new Error("daemon fora do ar");
        },
        { DOCKER_HOST: "unix:///var/run/docker.sock" },
      ),
    ).toThrow(/daemon fora do ar/);
    expect(() =>
      consulta(() => {
        throw new Error("daemon fora do ar");
      }),
    ).toThrow(/contexto do Docker/);
  });
});

describe("executarDocker (sem shell)", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it("usa execFile com vetor de argumentos, sem shell", () => {
    vi.mocked(execFileSync).mockReturnValue("ok" as never);
    expect(executarDocker(["ps", "--format", "{{.Names}}"])).toBe("ok");
    const [cmd, args, opcoes] = vi.mocked(execFileSync).mock.calls[0] as unknown as [string, string[], { shell: boolean; timeout: number }];
    expect(cmd).toBe("docker");
    expect(args).toEqual(["ps", "--format", "{{.Names}}"]);
    expect(opcoes.shell).toBe(false);
    expect(opcoes.timeout).toBeGreaterThan(0);
  });

  it("falha do processo vira mensagem genérica, sem repassar a saída", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw Object.assign(new Error("segredo-na-saida"), { stderr: "segredo-na-saida" });
    });
    const msg = recusa(() => executarDocker(["ps"]));
    expect(msg).toMatch(/Não foi possível consultar o Docker/);
    expect(msg).not.toContain("segredo-na-saida");
  });
});
