import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executarStatusSupabase, resolverBinarioSupabase } from "../scripts/lib/stack-supabase-local.mjs";

// M1: o Supabase CLI é executado pelo binário real, sem shell e sem o shim. Nenhum teste aqui
// conecta em Docker, banco ou rede; os processos reais criados são só do próprio Node.
const BS = String.fromCharCode(92); // barra invertida, sem escapes em string
const SAIDA = 'API_URL="http://127.0.0.1:54321"';

describe("M1: resolução verificável do executável do Supabase CLI", () => {
  /** Mundo fictício de pacotes: `pacotes[caminho]` é o conteúdo do package.json. */
  function mundo(pacotes: Record<string, unknown>, arquivos: string[]) {
    return {
      resolver: (id: string) => {
        const achado = Object.keys(pacotes).find((c) => c.endsWith(`/${id}`));
        if (!achado) throw new Error("nao encontrado");
        return achado;
      },
      ler: (c: string) => JSON.stringify(pacotes[c]),
      ehArquivo: (c: string) => arquivos.some((a) => c.replaceAll(BS, "/").endsWith(a)),
    };
  }
  const base = { "/pnpm/supabase/package.json": { name: "supabase", version: "2.118.0" } };
  const win = { "/pnpm/cli-windows-x64/@supabase/cli-windows-x64/package.json": { name: "@supabase/cli-windows-x64", version: "2.118.0" } };
  const linux = { "/pnpm/cli-linux-x64/@supabase/cli-linux-x64/package.json": { name: "@supabase/cli-linux-x64", version: "2.118.0" } };

  it("Windows: bin/supabase.exe do pacote da plataforma", () => {
    const binario = resolverBinarioSupabase({
      plataforma: "win32",
      arquitetura: "x64",
      ...mundo({ ...base, ...win }, ["cli-windows-x64/bin/supabase.exe"]),
    });
    expect(binario.replaceAll(BS, "/")).toMatch(/cli-windows-x64\/bin\/supabase\.exe$/);
  });

  it("Linux: bin/supabase (sem extensão) e fallback para o pacote musl", () => {
    const glibc = resolverBinarioSupabase({ plataforma: "linux", arquitetura: "x64", ...mundo({ ...base, ...linux }, ["cli-linux-x64/bin/supabase"]) });
    expect(glibc.replaceAll(BS, "/")).toMatch(/cli-linux-x64\/bin\/supabase$/);
    const musl = {
      "/pnpm/cli-linux-x64-musl/@supabase/cli-linux-x64-musl/package.json": { name: "@supabase/cli-linux-x64-musl", version: "2.118.0" },
    };
    const sóMusl = resolverBinarioSupabase({ plataforma: "linux", arquitetura: "x64", ...mundo({ ...base, ...musl }, ["cli-linux-x64-musl/bin/supabase"]) });
    expect(sóMusl.replaceAll(BS, "/")).toMatch(/musl\/bin\/supabase$/);
  });

  it("recusa versão ou nome do pacote divergentes, binário que não é arquivo e pacote ausente", () => {
    const resolve = (pacotes: Record<string, unknown>, arquivos: string[]) =>
      () => resolverBinarioSupabase({ plataforma: "linux", arquitetura: "x64", ...mundo(pacotes, arquivos) });
    const arquivo = ["cli-linux-x64/bin/supabase"];
    const outraVersao = { "/pnpm/cli-linux-x64/@supabase/cli-linux-x64/package.json": { name: "@supabase/cli-linux-x64", version: "9.9.9" } };
    const outroNome = { "/pnpm/cli-linux-x64/@supabase/cli-linux-x64/package.json": { name: "@supabase/impostor", version: "2.118.0" } };
    expect(resolve({ ...base, ...outraVersao }, arquivo)).toThrow(/não encontrado/);
    expect(resolve({ ...base, ...outroNome }, arquivo)).toThrow(/não encontrado/);
    expect(resolve({ ...base, ...linux }, [])).toThrow(/não encontrado/);
    expect(resolve({ ...linux }, arquivo)).toThrow(/Pacote `supabase`/);
    expect(resolve({ "/pnpm/supabase/package.json": { name: "supabase" }, ...linux }, arquivo)).toThrow(/Versão/);
  });

  it("plataforma ou arquitetura sem binário conhecido → recusado", () => {
    expect(() => resolverBinarioSupabase({ plataforma: "freebsd", arquitetura: "x64" })).toThrow(/Plataforma sem binário/);
    expect(() => resolverBinarioSupabase({ plataforma: "linux", arquitetura: "ia32" })).toThrow(/Plataforma sem binário/);
  });

  it("SUPABASE_CLI_BINARY_OVERRIDE (honrada pelo shim) é ignorada: variável de ambiente não troca o executável", () => {
    const anterior = process.env.SUPABASE_CLI_BINARY_OVERRIDE;
    process.env.SUPABASE_CLI_BINARY_OVERRIDE = "/tmp/executavel-malicioso";
    try {
      const binario = resolverBinarioSupabase({ plataforma: "linux", arquitetura: "x64", ...mundo({ ...base, ...linux }, ["cli-linux-x64/bin/supabase"]) });
      expect(binario).not.toContain("malicioso");
    } finally {
      if (anterior === undefined) delete process.env.SUPABASE_CLI_BINARY_OVERRIDE;
      else process.env.SUPABASE_CLI_BINARY_OVERRIDE = anterior;
    }
  });

  it("instalação real deste repositório: o binário existe, tem a versão do pacote e executa sem shell", () => {
    const binario = resolverBinarioSupabase();
    expect(existsSync(binario)).toBe(true);
    expect(basename(binario)).toBe(process.platform === "win32" ? "supabase.exe" : "supabase");
    const versaoPacote = JSON.parse(readFileSync(join(binario, "..", "..", "package.json"), "utf8")).version as string;
    const r = spawnSync(binario, ["--version"], { encoding: "utf8", shell: false, timeout: 30_000, windowsHide: true });
    expect(r.error).toBeUndefined();
    expect(r.stdout).toContain(versaoPacote);
  });
});

describe("M1: --workdir chega ao CLI exatamente como informado (sem interpretação de shell)", () => {
  const caminhos = [
    "/home/runner/work/repo",
    "/tmp/pasta com espaço/repo",
    "/tmp/a&b/repo",
    "/tmp/a|b/repo",
    "/tmp/a^b/repo",
    "/tmp/a;b$(x)`y`/repo",
    `/tmp/aspas"duplas'simples/repo`,
    "/tmp/a%PATH%b/repo",
    `E:${BS}raion-crm${BS}wt-testes-stack`,
    `C:${BS}Users${BS}Nome Sobrenome${BS}P&D${BS}repo`,
    `${BS}${BS}servidor${BS}pasta${BS}repo`,
    `/tmp/pasta${BS}estranha`,
  ];

  it.each(caminhos)("vetor de argumentos e opções para %s", (raiz) => {
    const executar = vi.fn(() => ({ status: 0, stdout: SAIDA, stderr: "", error: undefined }));
    const out = executarStatusSupabase(raiz, { binario: () => "/bin/supabase", executar: executar as never });
    expect(out).toBe(SAIDA);
    const [bin, args, opcoes] = executar.mock.calls[0] as unknown as [string, string[], { shell: boolean; cwd: string }];
    expect(bin).toBe("/bin/supabase");
    expect(args).toEqual(["status", "-o", "env", "--workdir", raiz]);
    expect(opcoes.shell).toBe(false);
    expect(opcoes.cwd).toBe(raiz);
  });

  it("M2: o CLI recebe o ambiente EXPLÍCITO informado (não um ambiente herdado por acaso)", () => {
    const executar = vi.fn(() => ({ status: 0, stdout: SAIDA, stderr: "", error: undefined }));
    const processo = { DOCKER_HOST: "unix:///var/run/docker.sock", OUTRA: "x" };
    executarStatusSupabase("/repo", { binario: () => "/bin/supabase", executar: executar as never, processo });
    const opcoes = (executar.mock.calls[0] as unknown as [string, string[], { env: unknown }])[2];
    expect(opcoes.env).toBe(processo);
    executarStatusSupabase("/repo", { binario: () => "/bin/supabase", executar: executar as never });
    expect((executar.mock.calls[1] as unknown as [string, string[], { env: unknown }])[2].env).toBe(process.env);
  });

  it("falha do processo, erro, saída vazia ou executável ausente interrompem sem repassar a saída", () => {
    const falhas = [
      { status: 1, stdout: "SEGREDO", stderr: "SEGREDO", error: undefined },
      { status: null, stdout: "", stderr: "", error: new Error("SEGREDO ENOENT") },
      { status: 0, stdout: "", stderr: "", error: undefined },
    ];
    for (const falha of falhas) {
      const msg = (() => {
        try {
          executarStatusSupabase("/repo", { binario: () => "/bin/supabase", executar: (() => falha) as never });
        } catch (e) {
          return (e as Error).message;
        }
        return "";
      })();
      expect(msg).toMatch(/Não foi possível obter os metadados/);
      expect(msg).not.toContain("SEGREDO");
    }
    expect(() =>
      executarStatusSupabase("/repo", {
        binario: () => {
          throw new Error("Binário do Supabase CLI não encontrado");
        },
        executar: vi.fn() as never,
      }),
    ).toThrow(/não encontrado/);
  });
});

describe("M1: processo REAL, diretórios com metacaracteres do cmd.exe/sh (prova de que não há shell)", () => {
  let raizTemporaria: string;
  let eco: string;
  beforeAll(() => {
    raizTemporaria = realpathSync(mkdtempSync(join(tmpdir(), "raion-sem-shell-")));
    eco = join(raizTemporaria, "eco.cjs");
    // Imita o CLI: imprime os argumentos e o diretório de trabalho que recebeu.
    writeFileSync(eco, "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n");
  });
  afterAll(() => rmSync(raizTemporaria, { recursive: true, force: true }));

  // Nomes válidos em Windows e Linux (sem | " < > : ? *, que o Windows proíbe em nomes de pasta).
  const nomes = ["com espaço", "e&comercial", "circunflexo^", "parenteses (1)", "100%PATH%", "ponto e vírgula;", "a&echo-injetado&b"];

  it.each(nomes)("pasta %j: argv e cwd chegam intactos e nenhum comando extra roda", (nome) => {
    const raiz = join(raizTemporaria, nome);
    mkdirSync(raiz);
    const executar = (_bin: string, args: string[], opcoes: object) => spawnSync(process.execPath, [eco, ...args], opcoes as never);
    const saida = JSON.parse(executarStatusSupabase(raiz, { binario: () => "irrelevante", executar: executar as never }));
    expect(saida.argv).toEqual(["status", "-o", "env", "--workdir", raiz]);
    expect(realpathSync(saida.cwd)).toBe(realpathSync(raiz));
    // Com shell, o `&`/espaço partiria a linha e o argumento chegaria truncado (visto na auditoria).
    // A igualdade exata de argv e cwd acima é a prova de que nada foi interpretado.
  });
});

describe("M1: nenhum código da trava usa shell", () => {
  const arquivos = [
    "scripts/lib/stack-supabase-local.mjs",
    "scripts/lib/docker-stack-local.mjs",
    "scripts/lib/bundle-servido.mjs",
    "scripts/e2e-servidor.mjs",
  ];
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it.each(arquivos)("%s não usa shell:true, exec/execSync nem `pnpm exec`", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(process.cwd(), arquivo), "utf8"));
    expect(codigo).not.toMatch(/shell:\s*true/);
    expect(codigo).not.toMatch(/shell:\s*process\.platform/);
    expect(codigo).not.toMatch(/(?<![.\w])(exec|execSync)\(/); // o `.exec(` de RegExp é permitido
    expect(codigo).not.toMatch(/["']pnpm["']/);
    expect(codigo).not.toMatch(/SUPABASE_CLI_BINARY_OVERRIDE/);
  });

  // O Playwright carrega e2e/global-setup.ts e seus imports por um transpilador CJS: `import.meta`
  // quebra esse carregamento ("Cannot use 'import.meta' outside a module") e o Vitest NÃO acusa.
  it.each(arquivos.filter((a) => a.startsWith("scripts/lib/")).concat(["scripts/lib/guard-supabase-local.mjs"]))(
    "%s não usa import.meta (carregado pelo Playwright em modo CJS)",
    (arquivo) => {
      expect(semComentarios(readFileSync(join(process.cwd(), arquivo), "utf8"))).not.toContain("import.meta");
    },
  );
});
