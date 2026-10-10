/**
 * Trava fail-closed de pnpm dev, pnpm start e pnpm super-admin (scripts/checar-ambiente-local.mjs
 * e scripts/criar-super-admin.mts). Testes PUROS: executam os scripts reais em pastas
 * temporárias com arquivos .env* fictícios e variáveis de processo controladas; nenhuma conexão
 * é aberta (o super-admin só é executado com ambiente recusado, que sai antes de qualquer rede).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { jwtDemo, jwtRemoto } from "./jwt-ficticio";

const RAIZ = process.cwd();
const CHECAR = join(RAIZ, "scripts", "checar-ambiente-local.mjs");
const SUPER_ADMIN = join(RAIZ, "scripts", "criar-super-admin.mts");
const AMBIENTE_LOCAL = join(RAIZ, "scripts", "lib", "ambiente-local.mjs");

const LOCAL = "http://127.0.0.1:54321";
const REMOTO = "https://exemplo-ficticio.supabase.co";
// JWTs fictícios no formato do Supabase local; a "assinatura" é um marcador para provar que nada vaza.
const SEGREDO_ANON = "SEGREDOANON123";
const SEGREDO_SERVICE = "SEGREDOSERVICE456";
const ANON_LOCAL = jwtDemo("anon", SEGREDO_ANON);
const SERVICE_LOCAL = jwtDemo("service_role", SEGREDO_SERVICE);

/** Conteúdo de um arquivo .env* com as três variáveis exigidas. */
const arquivoEnv = (url: string, service = SERVICE_LOCAL) =>
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_LOCAL}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`;

// O processo filho só herda o necessário para o Node rodar: nenhuma variável do Supabase do
// ambiente de testes (que o Vitest injeta) vaza para dentro dos cenários.
const BASE = Object.fromEntries(
  ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE"]
    .filter((k) => process.env[k] !== undefined)
    .map((k) => [k, process.env[k] as string]),
);

const pastas: string[] = [];
afterEach(() => {
  while (pastas.length) rmSync(pastas.pop()!, { recursive: true, force: true });
});

function rodar(script: string, args: string[], arquivos: Record<string, string> = {}, processo: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "guard-ambiente-"));
  pastas.push(dir);
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(dir, nome), conteudo);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: dir,
    env: { ...BASE, ...processo } as NodeJS.ProcessEnv, // o Next exige NODE_ENV no tipo; o filho define o seu
    encoding: "utf8",
    timeout: 20_000,
  });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

const checar = (modo: string, arquivos?: Record<string, string>, processo?: Record<string, string>) =>
  rodar(CHECAR, [modo], arquivos, processo);

describe("host local, remoto e ausência de configuração", () => {
  it.each(["dev", "start", "super-admin"])("%s: .env.local local passa", (modo) => {
    const r = checar(modo, { ".env.local": arquivoEnv(LOCAL) });
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).not.toMatch(/MODULE_TYPELESS|Warning/);
  });

  it.each(["dev", "start", "super-admin"])("%s: .env.local remoto é recusado, sem vazar valores", (modo) => {
    const r = checar(modo, { ".env.local": arquivoEnv(REMOTO) });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/recusado \(trava fail-closed\)/);
    expect(r.saida).toMatch(/NEXT_PUBLIC_SUPABASE_URL aponta para "exemplo-ficticio\.supabase\.co"/);
    expect(r.saida).not.toContain(SEGREDO_ANON);
    expect(r.saida).not.toContain(SEGREDO_SERVICE);
  });

  it.each(["dev", "start", "super-admin"])("%s: túnel/proxy em host local com chave remota é recusado, sem vazar a chave", (modo) => {
    const remota = jwtRemoto("service_role", "SEGREDOREMOTO789");
    const r = checar(modo, { ".env.local": arquivoEnv("http://127.0.0.1:9999", remota) });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/SUPABASE_SERVICE_ROLE_KEY pertence a um projeto Supabase remoto/);
    expect(r.saida).not.toContain("SEGREDOREMOTO789");
    expect(r.saida).not.toContain(remota.split(".")[1]);
  });

  it.each(["dev", "start", "super-admin"])("%s: sem nenhuma configuração é recusado", (modo) => {
    const r = checar(modo);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/ausente/);
  });

  it("recusa configuração incompleta (falta a service role) e URL inválida", () => {
    const semService = `NEXT_PUBLIC_SUPABASE_URL=${LOCAL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_LOCAL}\n`;
    expect(checar("dev", { ".env.local": semService }).codigo).toBe(1);
    expect(checar("dev", { ".env.local": arquivoEnv("nao-e-url") }).codigo).toBe(1);
  });

  it("recusa qualquer outra variável que cite domínio remoto do Supabase", () => {
    const r = checar("dev", { ".env.local": arquivoEnv(LOCAL) }, { DATABASE_URL: "postgres://u:p@db.exemplo-ficticio.supabase.co:5432/postgres" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/DATABASE_URL referencia um domínio remoto/);
    expect(r.saida).not.toContain("u:p@");
  });

  it("modo ausente ou inválido não passa (código 2)", () => {
    expect(rodar(CHECAR, [], { ".env.local": arquivoEnv(LOCAL) }).codigo).toBe(2);
    expect(rodar(CHECAR, ["build"], { ".env.local": arquivoEnv(LOCAL) }).codigo).toBe(2);
  });
});

describe("precedência de variáveis", () => {
  it("variável do processo prevalece sobre o arquivo (remoto no processo recusa)", () => {
    const r = checar("dev", { ".env.local": arquivoEnv(LOCAL) }, { NEXT_PUBLIC_SUPABASE_URL: REMOTO });
    expect(r.codigo).toBe(1);
  });

  it("variável do processo prevalece sobre o arquivo (local no processo libera arquivo remoto)", () => {
    for (const modo of ["dev", "start", "super-admin"]) {
      const r = checar(modo, { ".env.local": arquivoEnv(REMOTO) }, { NEXT_PUBLIC_SUPABASE_URL: LOCAL });
      expect(r.codigo, `${modo}: ${r.saida}`).toBe(0);
    }
  });

  it("next dev: .env.development.local (remoto) vence .env.local (local); next start não lê esse arquivo", () => {
    const arquivos = { ".env.local": arquivoEnv(LOCAL), ".env.development.local": arquivoEnv(REMOTO) };
    expect(checar("dev", arquivos).codigo).toBe(1);
    expect(checar("start", arquivos).codigo).toBe(0);
  });

  it("next start: .env.production.local (remoto) é recusado; next dev não lê esse arquivo", () => {
    const arquivos = { ".env.local": arquivoEnv(LOCAL), ".env.production.local": arquivoEnv(REMOTO) };
    expect(checar("start", arquivos).codigo).toBe(1);
    expect(checar("dev", arquivos).codigo).toBe(0);
  });

  it("Next e Vite têm precedências diferentes e cada comando usa a sua: .env.local local + .env.development remoto", () => {
    // Next: .env.local vence .env.development (efetivo local). Vite (super-admin, Vitest): o contrário.
    const arquivos = { ".env.local": arquivoEnv(LOCAL), ".env.development": arquivoEnv(REMOTO) };
    expect(checar("dev", arquivos).codigo).toBe(0);
    expect(checar("start", arquivos).codigo).toBe(0);
    expect(checar("super-admin", arquivos).codigo).toBe(1);
  });

  it("arquivo remoto sobrescrito por arquivo local de maior precedência passa", () => {
    const arquivos = { ".env": arquivoEnv(REMOTO), ".env.local": arquivoEnv(LOCAL) };
    for (const modo of ["dev", "start", "super-admin"]) expect(checar(modo, arquivos).codigo, modo).toBe(0);
  });
});

describe("pnpm super-admin recusa antes de qualquer conexão", () => {
  it("ambiente remoto: sai com código 1 antes de usar a service role", () => {
    const t0 = Date.now();
    const r = rodar(SUPER_ADMIN, ["alguem@exemplo.com", "senha-ficticia", "Nome"], { ".env.local": arquivoEnv(REMOTO) });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/pnpm super-admin recusado \(trava fail-closed\)/);
    expect(r.saida).not.toContain(SEGREDO_SERVICE);
    expect(Date.now() - t0).toBeLessThan(15_000); // sem tentar a rede
  });

  it("sem configuração: recusa; processo remoto prevalece sobre arquivo local", () => {
    expect(rodar(SUPER_ADMIN, ["a@b.com", "x", "N"]).codigo).toBe(1);
    const r = rodar(SUPER_ADMIN, ["a@b.com", "x", "N"], { ".env.local": arquivoEnv(LOCAL) }, { NEXT_PUBLIC_SUPABASE_URL: REMOTO });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/recusado/);
  });

  it("valida e conecta com o MESMO objeto de ambiente; a trava vem antes de createClient", () => {
    const codigo = readFileSync(SUPER_ADMIN, "utf8");
    const carga = codigo.indexOf('const env = carregarAmbiente("super-admin");');
    const trava = codigo.indexOf('exigirAmbienteLocal(env, "pnpm super-admin");');
    const cliente = codigo.indexOf("createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,");
    expect(carga).toBeGreaterThan(-1);
    expect(trava).toBeGreaterThan(carga);
    expect(cliente).toBeGreaterThan(trava);
    // Nenhuma outra fonte de configuração ou cliente no script.
    expect(codigo).not.toMatch(/process\.env|loadEnv\(/);
    expect(codigo.match(/createClient\(/g)).toHaveLength(1);
  });

  it("equivalência: o ambiente do super-admin é o loadEnv do Vite, com o processo prevalecendo", () => {
    // Processo isolado compara, chave a chave, carregarAmbiente("super-admin") (o que o script usa
    // para validar E conectar) com o carregamento original do script (loadEnv do Vite). Só imprime
    // nomes de chaves divergentes, o host e um booleano.
    const harness = [
      'import { createRequire } from "node:module";',
      "const { carregarAmbiente } = await import(process.env.AMBIENTE_LOCAL_URL);",
      'const { loadEnv } = createRequire(process.env.RAIZ_PKG)("vite");',
      'const a = carregarAmbiente("super-admin");',
      'const b = loadEnv("development", process.cwd(), "");',
      "const diferentes = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);",
      "console.log(JSON.stringify({ diferentes, url: new URL(a.NEXT_PUBLIC_SUPABASE_URL).host, service: a.SUPABASE_SERVICE_ROLE_KEY === process.env.ESPERADO_SERVICE }));",
    ].join("\n");
    const arquivos = {
      ".env": arquivoEnv("http://localhost:1111"),
      ".env.local": arquivoEnv("http://localhost:2222"),
      ".env.development": arquivoEnv("http://localhost:3333"),
      ".env.development.local": "NEXT_PUBLIC_SUPABASE_URL=http://localhost:4444\n",
      "equivalencia.mjs": harness,
    };
    const casos: [Record<string, string>, string][] = [
      [{}, "localhost:4444"], // no Vite, .env.development.local é o arquivo de maior precedência
      [{ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5555" }, "127.0.0.1:5555"], // o processo prevalece
    ];
    for (const [processo, host] of casos) {
      const r = rodar("equivalencia.mjs", [], arquivos, {
        ...processo,
        AMBIENTE_LOCAL_URL: pathToFileURL(AMBIENTE_LOCAL).href,
        RAIZ_PKG: join(RAIZ, "package.json"),
        ESPERADO_SERVICE: SERVICE_LOCAL,
      });
      expect(r.codigo, r.saida).toBe(0);
      expect(JSON.parse(r.saida)).toEqual({ diferentes: [], url: host, service: true });
    }
  });
});

describe("não bloqueia Vercel, workflows de produção nem CI", () => {
  const scripts = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")).scripts as Record<string, string>;

  it("dev e start rodam a trava antes do Next; os demais comandos ficam livres", () => {
    expect(scripts.dev).toMatch(/^node .*checar-ambiente-local\.mjs dev && next dev$/);
    expect(scripts.start).toMatch(/^node .*checar-ambiente-local\.mjs start && next start$/);
    for (const livre of ["build", "lint", "typecheck", "test", "db:reset", "db:types"]) {
      expect(scripts[livre], livre).not.toMatch(/checar-ambiente-local/);
    }
  });

  it("workflows (CI, banco, seeds) não chamam dev, start nem super-admin", () => {
    const dir = join(RAIZ, ".github", "workflows");
    for (const arquivo of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
      const texto = readFileSync(join(dir, arquivo), "utf8");
      expect(texto, arquivo).not.toMatch(/pnpm (run )?(dev|start|super-admin)\b|next (dev|start)\b|criar-super-admin/);
    }
  });
});
