import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executarDocker,
  exigirAmbienteDockerCoerente,
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
/** `hosts`: host literal das URLs verificadas (padrão: IPv4, o que a stack do repositório usa). */
const verificar = (containers: unknown[], api = "54321", banco = "54322", projeto = "meu-projeto", hosts: [string, string] = ["127.0.0.1", "127.0.0.1"]) =>
  verificarPortasDocker({ projeto, apiPorta: api, dbPorta: banco, apiHost: hosts[0], dbHost: hosts[1], containers: containers as never });

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

  it("só IPv4 em 127.0.0.1 (o que default-network-opts produz) é aceito para uma URL IPv4", () => {
    expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]))).not.toThrow();
  });

  describe("M1: a publicação precisa incluir o host literal da URL verificada", () => {
    const V4: [string, string] = ["127.0.0.1", "127.0.0.1"];
    const V6: [string, string] = ["[::1]", "[::1]"];

    it("URL IPv4 + publicação exclusivamente IPv6 (::1) → recusada (era aceita antes)", () => {
      const msg = recusa(() => verificar(comIps(["::1"], ["::1"]), "54321", "54322", "meu-projeto", V4));
      expect(msg).toContain("não publica 8000/tcp em 127.0.0.1");
      expect(msg).toContain('"::1"');
      expect(() => verificar(comIps(["127.0.0.1"], ["::1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/supabase_db_meu-projeto.*5432\/tcp em 127\.0\.0\.1/);
      expect(() => verificar(comIps(["::1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/supabase_kong_meu-projeto.*8000\/tcp em 127\.0\.0\.1/);
    });

    it("URL IPv6 ([::1]) + publicação exclusivamente IPv4 → recusada", () => {
      const msg = recusa(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V6));
      expect(msg).toContain("não publica 8000/tcp em ::1");
      expect(() => verificar(comIps(["::1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V6)).toThrow(/supabase_db_meu-projeto.*5432\/tcp em ::1/);
    });

    it("URL IPv4 + IPv4, e URL IPv6 + IPv6 → aceitas", () => {
      expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).not.toThrow();
      expect(() => verificar(comIps(["::1"], ["::1"]), "54321", "54322", "meu-projeto", V6)).not.toThrow();
    });

    it("IPv4 + IPv6 compatíveis (a URL usa um dos dois) → aceitas; adicional só em loopback", () => {
      expect(() => verificar(comIps(["127.0.0.1", "::1"], ["::1", "127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).not.toThrow();
      expect(() => verificar(comIps(["127.0.0.1", "::1"], ["127.0.0.1", "::1"]), "54321", "54322", "meu-projeto", V6)).not.toThrow();
    });

    it("API e banco com protocolos diferentes são avaliados cada um pelo próprio host", () => {
      expect(() => verificar(comIps(["127.0.0.1"], ["::1"]), "54321", "54322", "meu-projeto", ["127.0.0.1", "[::1]"])).not.toThrow();
      expect(() => verificar(comIps(["127.0.0.1"], ["::1"]), "54321", "54322", "meu-projeto", ["[::1]", "127.0.0.1"])).toThrow(/não publica/);
    });

    it("portas iguais, mas hosts divergentes → recusadas", () => {
      // O CLI e o Docker concordam na porta (54321/54322), mas o IP publicado não é o da URL.
      expect(() => verificar(comIps(["::1"], ["::1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/não publica/);
      expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V6)).toThrow(/não publica/);
    });

    it("0.0.0.0, :: e adicionais fora do loopback continuam recusados, mesmo com o IP exigido presente", () => {
      expect(() => verificar(comIps(["127.0.0.1", "0.0.0.0"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/fora do loopback/);
      expect(() => verificar(comIps(["127.0.0.1", "::"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/fora do loopback/);
      expect(() => verificar(comIps(["::1", "::"], ["::1"]), "54321", "54322", "meu-projeto", V6)).toThrow(/fora do loopback/);
      expect(() => verificar(comIps(["0.0.0.0"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", V4)).toThrow(/fora do loopback/);
    });

    it("portas ambíguas (IPs correspondentes, mas portas diferentes do host) → recusadas", () => {
      const ambiguo = [
        conteiner("supabase_kong_meu-projeto", "meu-projeto", {
          "8000/tcp": [
            { HostIp: "127.0.0.1", HostPort: "54321" },
            { HostIp: "::1", HostPort: "59999" },
          ],
        }),
        db("meu-projeto", "54322"),
      ];
      expect(() => verificar(ambiguo)).toThrow(/ambíguo/);
    });

    it("host da URL ausente, localhost ou outro endereço → recusado (sem prova, sem aceitação)", () => {
      for (const host of ["localhost", "", "10.0.0.5", "[::ffff:127.0.0.1]"]) {
        expect(() => verificar(comIps(["127.0.0.1"], ["127.0.0.1"]), "54321", "54322", "meu-projeto", [host, "127.0.0.1"])).toThrow(
          /não é 127\.0\.0\.1 nem \[::1\]/,
        );
      }
      expect(() =>
        verificarPortasDocker({ projeto: "meu-projeto", apiPorta: "54321", dbPorta: "54322", containers: stack() as never } as never),
      ).toThrow(/ausente/);
    });

    it("identidade, labels, rede e saúde continuam exigidas com o host correto", () => {
      const outroProjeto = conteiner("supabase_kong_meu-projeto", "impostor", { "8000/tcp": publica(["127.0.0.1"], "54321") });
      expect(() => verificar([outroProjeto, db("meu-projeto", "54322")])).toThrow(/não pertence ao projeto/);
      const doente = db("meu-projeto", "54322", { State: { Running: true, Status: "running", Health: { Status: "unhealthy" } } });
      expect(() => verificar([kong("meu-projeto", "54321"), doente])).toThrow(/unhealthy/);
    });
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
  const LOCAL = "unix:///var/run/docker.sock";
  const contextoLocal = JSON.stringify([{ Endpoints: { docker: { Host: LOCAL } } }]);
  const consultar = (docker: (a: string[]) => string) =>
    verificarStackNoDocker({ raiz: "/repo", apiPorta: "54321", dbPorta: "54322", apiHost: "127.0.0.1", dbHost: "127.0.0.1", env: {}, processo: {}, docker, lerConfig });

  it("o Docker não responde a nenhum comando (parado/ausente) → recusado já no contexto", () => {
    expect(() =>
      consultar(() => {
        throw new Error("Não foi possível consultar o Docker (`docker`)");
      }),
    ).toThrow(/Não foi possível determinar o contexto do Docker/);
  });

  it("`docker ps` falha depois de o contexto local ser comprovado", () => {
    const docker = (args: string[]) => {
      if (args[0] === "context") return contextoLocal;
      throw new Error("Não foi possível consultar o Docker (`docker`)");
    };
    expect(() => consultar(docker)).toThrow(/Não foi possível consultar o Docker/);
  });

  it("`docker inspect` falha depois de a listagem funcionar", () => {
    const docker = (args: string[]) => {
      if (args[0] === "context") return contextoLocal;
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
    const docker = (args: string[]) => (args[0] === "context" ? contextoLocal : args[0] === "ps" ? "a\nb" : JSON.stringify(semPortas));
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
      // M1: o IP exigido é o do host literal da URL do CLI, não "qualquer loopback".
      "ip_da_url",
      "any(.[]; .HostIp == $ip)",
    ]) {
      expect(texto, trecho).toContain(trecho);
    }
    expect(texto).toContain('--arg ip "$ip"');
  });

  it.each(WORKFLOWS)("%s: a conferência usa o host da URL do CLI e recusa host que não seja 127.0.0.1 ou [::1]", (arquivo) => {
    const texto = ler(arquivo);
    expect(texto).toContain("supabase status -o env");
    expect(texto).toContain('"[::1]") echo "::1"');
    expect(texto).toContain("não é 127.0.0.1 nem [::1]");
    // Nunca imprime as URLs no passo de conferência (a do banco leva senha). O passo seguinte, que grava o
    // .env.local, usa API_URL de propósito e fica de fora.
    const inicio = texto.indexOf("Conferir as portas publicadas");
    const passo = texto.slice(inicio, texto.indexOf("- name: Gerar .env.local", inicio));
    expect(passo.length).toBeGreaterThan(0);
    expect(passo).not.toMatch(/echo[^\n]*\$\{?(API_URL|DB_URL)\b/);
  });

  describe("M3: o workflow do navegador roda quando a trava ou o servidor do e2e mudam", () => {
    /** Entradas de `on.pull_request.paths` (leitura textual: o arquivo não tem outro bloco `paths:`). */
    function caminhosDoGatilho(): string[] {
      const linhas = ler(".github/workflows/navegador-obras.yml").split(/\r?\n/);
      const inicio = linhas.findIndex((l) => /^\s{4}paths:\s*$/.test(l));
      expect(inicio).toBeGreaterThan(-1);
      const caminhos: string[] = [];
      for (const linha of linhas.slice(inicio + 1)) {
        const m = /^\s{6}-\s+"([^"]+)"\s*$/.exec(linha);
        if (m) caminhos.push(m[1]);
        else if (!/^\s*(#.*)?$/.test(linha)) break;
      }
      return caminhos;
    }

    it("mantém os gatilhos originais", () => {
      expect(caminhosDoGatilho()).toEqual(
        expect.arrayContaining([
          "src/app/(app)/obras/**",
          "src/components/obras/**",
          "src/lib/obras/**",
          "src/lib/acoes/obras.ts",
          "e2e/**",
          "playwright.config.ts",
          ".github/workflows/navegador-obras.yml",
        ]),
      );
    });

    it("inclui os arquivos que decidem em que stack o e2e grava e como o app é construído", () => {
      expect(caminhosDoGatilho()).toEqual(
        expect.arrayContaining([
          "scripts/e2e-servidor.mjs",
          "scripts/checar-ambiente-local.mjs",
          "scripts/lib/**",
          "next.config.ts",
          "package.json",
          "pnpm-lock.yaml",
          "supabase/**",
        ]),
      );
    });

    it("todo módulo local que o servidor do e2e importa está coberto pelos gatilhos", () => {
      const caminhos = caminhosDoGatilho();
      const cobre = (arquivo: string) =>
        caminhos.some((c) => (c.endsWith("/**") ? arquivo.startsWith(c.slice(0, -2)) : c === arquivo));
      const importados = [...ler("scripts/e2e-servidor.mjs").matchAll(/from "(\.\/[^"]+)"/g)].map((m) => `scripts/${m[1].slice(2)}`);
      expect(importados.length).toBeGreaterThan(0);
      for (const arquivo of [...importados, "scripts/checar-ambiente-local.mjs", "scripts/e2e-servidor.mjs"]) {
        expect(cobre(arquivo), `${arquivo} não está nos gatilhos`).toBe(true);
      }
    });

    it("princípio de mínimos privilégios preservado: só leitura, sem secrets, sem pull_request_target", () => {
      const texto = ler(".github/workflows/navegador-obras.yml");
      expect(texto).toMatch(/^permissions:\s*\n\s{2}contents: read\s*$/m);
      expect(texto).not.toContain("pull_request_target");
      expect(texto).not.toMatch(/secrets\./);
    });
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

describe("A1: o Docker consultado precisa ser local (endpoint efetivo reportado pelo próprio Docker)", () => {
  it.each(["unix:///var/run/docker.sock", "npipe:////./pipe/dockerDesktopLinuxEngine", "npipe:////./pipe/docker_engine"])("aceita %s", (endpoint) => {
    expect(() => exigirDockerLocal(endpoint)).not.toThrow();
  });

  it.each(["tcp://10.0.0.5:2375", "tcp://127.0.0.1:2375", "ssh://usuario@servidor", "fd://", "https://x"])("recusa %s", (endpoint) => {
    expect(() => exigirDockerLocal(endpoint)).toThrow(/não é local/);
  });

  it("sem endpoint (contexto sem Host, ausente ou em branco) não há prova → recusado", () => {
    for (const vazio of [undefined, "", "   "]) expect(() => exigirDockerLocal(vazio)).toThrow(/Não foi possível determinar/);
  });
});

describe("M2: ambiente validado x ambiente dos subprocessos (destino do Docker)", () => {
  const LOCAL = "unix:///var/run/docker.sock";

  it("variáveis iguais, ou ausentes nos dois lados, são coerentes", () => {
    expect(() => exigirAmbienteDockerCoerente({}, {})).not.toThrow();
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_HOST: LOCAL }, { DOCKER_HOST: LOCAL })).not.toThrow();
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_CONTEXT: "default" }, { DOCKER_CONTEXT: "default" })).not.toThrow();
    // Vazio e em branco equivalem a "não definida" (como o Docker trata).
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_HOST: "" }, { DOCKER_HOST: "  " })).not.toThrow();
    // Outras variáveis não interferem.
    expect(() => exigirAmbienteDockerCoerente({ OUTRA: "a" }, { OUTRA: "b" })).not.toThrow();
  });

  it("DOCKER_HOST definido só no ambiente validado (arquivo .env.local) → recusado", () => {
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_HOST: LOCAL }, {})).toThrow(/DOCKER_HOST difere/);
  });

  it("DOCKER_HOST diferente entre o ambiente validado e o do subprocesso → recusado", () => {
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_HOST: LOCAL }, { DOCKER_HOST: "tcp://10.0.0.5:2375" })).toThrow(/DOCKER_HOST difere/);
    // O inverso (definido só no processo) também é divergência.
    expect(() => exigirAmbienteDockerCoerente({}, { DOCKER_HOST: "tcp://10.0.0.5:2375" })).toThrow(/DOCKER_HOST difere/);
  });

  it("DOCKER_CONTEXT e DOCKER_CONFIG divergentes → recusados", () => {
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_CONTEXT: "default" }, { DOCKER_CONTEXT: "remoto" })).toThrow(/DOCKER_CONTEXT difere/);
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_CONTEXT: "default" }, {})).toThrow(/DOCKER_CONTEXT difere/);
    expect(() => exigirAmbienteDockerCoerente({ DOCKER_CONFIG: "/outra/pasta" }, {})).toThrow(/DOCKER_CONFIG difere/);
  });

  it("DOCKER_HOST e DOCKER_CONTEXT ao mesmo tempo → ambíguo, recusado mesmo quando iguais nos dois lados", () => {
    const ambos = { DOCKER_HOST: LOCAL, DOCKER_CONTEXT: "default" };
    expect(() => exigirAmbienteDockerCoerente(ambos, ambos)).toThrow(/ao mesmo tempo/);
  });

  it("a mensagem cita só nomes de variáveis, nunca os valores", () => {
    const msg = recusa(() => exigirAmbienteDockerCoerente({ DOCKER_HOST: "tcp://usuario:SEGREDO@10.0.0.5:2375" }, {}));
    expect(msg).not.toContain("SEGREDO");
    expect(msg).not.toContain("10.0.0.5");
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
  const LOCAL = "unix:///var/run/docker.sock";

  /** Docker simulado que registra os vetores de argumentos recebidos (e os ambientes, quando há). */
  function dockerSimulado(containers: unknown[], contexto: string | null = LOCAL) {
    const chamadas: string[][] = [];
    const docker = (args: string[]) => {
      chamadas.push(args);
      if (args[0] === "context") return contexto === null ? "[]" : JSON.stringify([{ Endpoints: { docker: { Host: contexto } } }]);
      if (args[0] === "ps") return nomes(containers as { Name: string }[]);
      if (args[0] === "inspect") return JSON.stringify(containers);
      throw new Error("comando inesperado");
    };
    return { docker, chamadas };
  }
  const consulta = (
    docker: (a: string[]) => string,
    { env = {}, processo = {}, dbPorta = "54322" }: { env?: Record<string, string | undefined>; processo?: Record<string, string | undefined>; dbPorta?: string } = {},
  ) =>
    verificarStackNoDocker({
      raiz: "/repo",
      apiPorta: "54321",
      dbPorta,
      apiHost: "127.0.0.1",
      dbHost: "127.0.0.1",
      env,
      processo,
      docker,
      lerConfig,
    });

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
    expect(recusa(() => consulta(docker, { dbPorta: "59999" }))).toContain("59999");
  });

  it("M1 pelo fluxo completo: URL IPv4 e Docker só em ::1 → recusado", () => {
    const soV6 = [
      conteiner("supabase_kong_meu-projeto", "meu-projeto", { "8000/tcp": [{ HostIp: "::1", HostPort: "54321" }] }),
      conteiner("supabase_db_meu-projeto", "meu-projeto", { "5432/tcp": [{ HostIp: "::1", HostPort: "54322" }] }),
    ];
    expect(() => consulta(dockerSimulado(soV6).docker)).toThrow(/não publica 8000\/tcp em 127\.0\.0\.1/);
  });

  it("M2: o endpoint efetivo vem SEMPRE do `docker context inspect` (nunca de uma variável lida)", () => {
    // Mesmo com DOCKER_HOST local nos dois ambientes, o contexto é consultado e o resultado decide.
    const local = dockerSimulado(stack());
    consulta(local.docker, { env: { DOCKER_HOST: LOCAL }, processo: { DOCKER_HOST: LOCAL } });
    expect(local.chamadas.map((c) => c[0])).toEqual(["context", "ps", "inspect"]);

    // O Docker CLI aplica DOCKER_HOST/DOCKER_CONTEXT e reporta o destino efetivo: remoto → recusado
    // antes de listar contêineres, qualquer que seja a variável de origem.
    for (const [nome, valor] of [
      ["DOCKER_HOST", "tcp://10.0.0.5:2375"],
      ["DOCKER_CONTEXT", "remoto"],
    ] as const) {
      const remoto = dockerSimulado(stack(), "tcp://10.0.0.5:2375");
      expect(() => consulta(remoto.docker, { env: { [nome]: valor }, processo: { [nome]: valor } })).toThrow(/não é local/);
      expect(remoto.chamadas).toEqual([["context", "inspect"]]);
    }
  });

  it("M2: DOCKER_CONTEXT apontando para endpoint remoto → recusado; contexto local comprovado → aceito", () => {
    const remoto = dockerSimulado(stack(), "ssh://usuario@servidor");
    expect(() => consulta(remoto.docker, { env: { DOCKER_CONTEXT: "producao" }, processo: { DOCKER_CONTEXT: "producao" } })).toThrow(/não é local/);
    const local = dockerSimulado(stack(), "npipe:////./pipe/dockerDesktopLinuxEngine");
    expect(() => consulta(local.docker, { env: { DOCKER_CONTEXT: "desktop-linux" }, processo: { DOCKER_CONTEXT: "desktop-linux" } })).not.toThrow();
  });

  it("M2: DOCKER_HOST só em arquivo, divergente ou em conflito com DOCKER_CONTEXT → recusado SEM executar o Docker", () => {
    const casos: [string, Record<string, string>, Record<string, string>, RegExp][] = [
      ["só em arquivo", { DOCKER_HOST: LOCAL }, {}, /DOCKER_HOST difere/],
      ["valor divergente", { DOCKER_HOST: LOCAL }, { DOCKER_HOST: "tcp://10.0.0.5:2375" }, /DOCKER_HOST difere/],
      ["conflito com DOCKER_CONTEXT", { DOCKER_HOST: LOCAL, DOCKER_CONTEXT: "default" }, { DOCKER_HOST: LOCAL, DOCKER_CONTEXT: "default" }, /ao mesmo tempo/],
    ];
    for (const [rotulo, env, processo, esperado] of casos) {
      const { docker, chamadas } = dockerSimulado(stack());
      expect(() => consulta(docker, { env, processo }), rotulo).toThrow(esperado);
      expect(chamadas, rotulo).toEqual([]);
    }
  });

  it("M2: os comandos executam com o ambiente explícito `processo` (e não herdam outro)", () => {
    vi.mocked(execFileSync).mockReset();
    const saidas: Record<string, string> = {
      context: JSON.stringify([{ Endpoints: { docker: { Host: LOCAL } } }]),
      ps: nomes(stack() as { Name: string }[]),
      inspect: JSON.stringify(stack()),
    };
    vi.mocked(execFileSync).mockImplementation(((_cmd: string, args: string[]) => saidas[args[0]]) as never);
    const processo = { DOCKER_CONTEXT: "desktop-linux", PATH: "/usr/bin" };
    verificarStackNoDocker({ raiz: "/repo", apiPorta: "54321", dbPorta: "54322", apiHost: "127.0.0.1", dbHost: "127.0.0.1", env: processo, processo, lerConfig });
    const chamadas = vi.mocked(execFileSync).mock.calls as unknown as [string, string[], { env: unknown; shell: boolean }][];
    expect(chamadas.map((c) => c[1][0])).toEqual(["context", "ps", "inspect"]);
    for (const [, , opcoes] of chamadas) {
      expect(opcoes.env).toBe(processo);
      expect(opcoes.shell).toBe(false);
    }
  });

  it("contexto remoto do Docker é recusado antes de listar contêineres", () => {
    const { docker, chamadas } = dockerSimulado(stack(), "ssh://usuario@servidor");
    expect(() => consulta(docker)).toThrow(/não é local/);
    expect(chamadas).toEqual([["context", "inspect"]]);
  });

  it("M2: metadados do contexto inconsistentes (vazio, mais de um, sem Host, JSON inválido) → recusado", () => {
    expect(() => consulta(dockerSimulado(stack(), null).docker)).toThrow(/Não foi possível determinar o destino/);
    const dois = () => JSON.stringify([{ Endpoints: { docker: { Host: LOCAL } } }, { Endpoints: { docker: { Host: LOCAL } } }]);
    expect(() => consulta(dois)).toThrow(/Não foi possível determinar o destino/);
    const semHost = () => JSON.stringify([{ Endpoints: { docker: {} } }]);
    expect(() => consulta(semHost)).toThrow(/Não foi possível determinar o destino/);
    expect(() => consulta(() => "lixo")).toThrow(/contexto do Docker/);
    expect(() => consulta(() => JSON.stringify({ Endpoints: { docker: { Host: LOCAL } } }))).toThrow(/Não foi possível determinar o destino/);
  });

  it("nenhum contêiner, resposta inválida ou falha do Docker → recusado", () => {
    expect(() => consulta(dockerSimulado([]).docker)).toThrow(/Nenhum contêiner/);
    const contexto = JSON.stringify([{ Endpoints: { docker: { Host: "unix:///x" } } }]);
    const invalido = (args: string[]) => (args[0] === "context" ? contexto : args[0] === "ps" ? "a" : "não é json");
    expect(() => consulta(invalido)).toThrow(/Resposta inválida/);
    const naoLista = (args: string[]) => (args[0] === "context" ? contexto : args[0] === "ps" ? "a" : "{}");
    expect(() => consulta(naoLista)).toThrow(/Resposta inválida/);
    const contextoInvalido = (args: string[]) => (args[0] === "context" ? "lixo" : "");
    expect(() => consulta(contextoInvalido)).toThrow(/contexto do Docker/);
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

  it("M2: o ambiente do subprocesso é o informado (explícito), com `process.env` só como padrão", () => {
    vi.mocked(execFileSync).mockReturnValue("ok" as never);
    const processo = { DOCKER_CONTEXT: "desktop-linux" };
    executarDocker(["ps"], processo);
    executarDocker(["ps"]);
    const chamadas = vi.mocked(execFileSync).mock.calls as unknown as [string, string[], { env: unknown }][];
    expect(chamadas[0][2].env).toBe(processo);
    expect(chamadas[1][2].env).toBe(process.env);
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
