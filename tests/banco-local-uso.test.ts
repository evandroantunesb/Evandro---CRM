import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Teste estático (só lê arquivos): impede que uma suíte nova contorne a trava global resolvendo o
// banco por conta própria (variável de ambiente, porta fixa ou connection string literal).
const RAIZ = process.cwd();
const ISENTOS = new Set(["banco-local.ts", "preparar-banco.ts", "global-setup.ts"]);
// Testes das próprias travas citam variáveis/portas como dados de teste.
const TESTES_DAS_TRAVAS = /^(guard-|stack-supabase-local|banco-local-uso)/;

const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const arquivos = (pasta: string) =>
  readdirSync(join(RAIZ, pasta))
    .filter((n) => /\.(ts|mts)$/.test(n))
    .map((n) => ({ nome: n, caminho: `${pasta}/${n}`, texto: semComentarios(readFileSync(join(RAIZ, pasta, n), "utf8")) }));

describe("conexões diretas com o Postgres passam só pela trava global", () => {
  const suites = arquivos("tests").filter((a) => !ISENTOS.has(a.nome) && !TESTES_DAS_TRAVAS.test(a.nome));

  it("nenhuma suíte lê SUPABASE_DB_URL, usa porta fixa de banco ou connection string literal", () => {
    const infratores = suites
      .filter((a) => /SUPABASE_DB_URL|\b54322\b|postgres(ql)?:\/\//.test(a.texto))
      .map((a) => a.caminho);
    expect(infratores).toEqual([]);
  });

  it("toda suíte que usa o driver pg importa a URL de tests/banco-local", () => {
    const comPg = suites.filter((a) => /from "pg"/.test(a.texto));
    expect(comPg.length).toBeGreaterThan(0);
    const semHelper = comPg.filter((a) => !/from "\.\/banco-local"/.test(a.texto)).map((a) => a.caminho);
    expect(semHelper).toEqual([]);
    const conexaoPropria = comPg
      .filter((a) => /connectionString:\s*(?!\s|urlBancoLocal\(\))/.test(a.texto) || /new Client\(\s*\)/.test(a.texto))
      .map((a) => a.caminho);
    expect(conexaoPropria).toEqual([]);
  });

  it("o e2e não tem banco padrão: só usa a URL definida após a verificação", () => {
    const base = semComentarios(readFileSync(join(RAIZ, "e2e/base-ficticia.ts"), "utf8"));
    expect(base).not.toMatch(/\b54322\b|postgres(ql)?:\/\//);
    const setup = readFileSync(join(RAIZ, "e2e/global-setup.ts"), "utf8");
    const iTrava = setup.indexOf("verificarAmbienteLocal(efetivo)");
    const iStack = setup.indexOf("exigirStackLocal(");
    expect(iTrava).toBeGreaterThanOrEqual(0);
    expect(iStack).toBeGreaterThan(iTrava);
    expect(iStack).toBeLessThan(setup.indexOf("criarBaseFicticia()"));
  });
});

describe("a trava roda antes de qualquer suíte", () => {
  it("vitest.config.mts registra tests/global-setup.ts e nada além dele", () => {
    const cfg = readFileSync(join(RAIZ, "vitest.config.mts"), "utf8");
    expect(cfg).toMatch(/globalSetup:\s*\["\.\/tests\/global-setup\.ts"\]/);
  });

  it("o banco só é entregue depois das duas verificações", () => {
    const codigo = readFileSync(join(RAIZ, "tests/preparar-banco.ts"), "utf8");
    const ordem = ["verificarAmbienteLocal(efetivo)", "exigirStackLocal(", "projeto.provide("].map((t) => codigo.indexOf(t));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });
});
