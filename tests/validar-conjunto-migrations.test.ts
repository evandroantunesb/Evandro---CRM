// Trava do job "aplicar" do workflow `banco-producao.yml`: o conjunto pendente do dry-run precisa ser
// exatamente o autorizado. Testa o script e a ligação dele no workflow. Não usa banco nem rede.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = ".github/scripts/validar-conjunto-migrations.sh";
const WORKFLOW = ".github/workflows/banco-producao.yml";
const AUTORIZADA = "20261015100000_integridade_contratos.sql";
// Migration da #190, já aplicada: se voltar a aparecer como pendente, não é a autorizada.
const JA_APLICADA = "20261014100000_blindagem_contratos_confirmacoes.sql";
// No Windows o `bash` do PATH pode ser o do WSL; o do Git for Windows lê os caminhos como estão.
const BASH_WINDOWS = "C:\\Program Files\\Git\\bin\\bash.exe";
const BASH = process.platform === "win32" && existsSync(BASH_WINDOWS) ? BASH_WINDOWS : "bash";

const pasta = mkdtempSync(join(tmpdir(), "conjunto-migrations-"));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

let contador = 0;
function validar(saidaDryRun: string | null, autorizadas: string | null = AUTORIZADA) {
  const arquivo = join(pasta, `dry-run-${contador++}.txt`);
  if (saidaDryRun !== null) writeFileSync(arquivo, saidaDryRun);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.MIGRATIONS_AUTORIZADAS;
  if (autorizadas !== null) env.MIGRATIONS_AUTORIZADAS = autorizadas;
  const r = spawnSync(BASH, [SCRIPT, saidaDryRun === null ? join(pasta, "nao-existe.txt") : arquivo], {
    env,
    encoding: "utf8",
  });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

// Formato da saída de `supabase db push --dry-run` com migrations pendentes.
function dryRunCom(...migrations: string[]) {
  return [
    "Initialising login role...",
    "Connecting to remote database...",
    "Would push these migrations:",
    ...migrations.map((m) => ` • ${m}`),
    "",
    "DRY RUN: migrations will *not* be pushed to the database.",
    "",
  ].join("\n");
}

describe("conjunto exatamente igual ao autorizado", () => {
  it("uma migration, a autorizada: passa", () => {
    const r = validar(dryRunCom(AUTORIZADA));
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain("Conjunto confirmado");
  });

  it("vários itens autorizados, em qualquer ordem, e o dry-run lista os mesmos: passa", () => {
    const outra = JA_APLICADA;
    const r = validar(dryRunCom(outra, AUTORIZADA), `${AUTORIZADA}\n${outra}\n`);
    expect(r.codigo).toBe(0);
  });
});

describe("conjunto diferente do autorizado: encerra com erro", () => {
  it("nenhuma migration pendente", () => {
    const r = validar("Connecting to remote database...\nRemote database is up to date.\n");
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("não interpretável");
  });

  it("migration extra além da autorizada", () => {
    const r = validar(dryRunCom("20261014120000_pagamento_registrado_solo.sql", AUTORIZADA));
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("20261014120000_pagamento_registrado_solo.sql");
  });

  it("várias migrations extras", () => {
    const r = validar(
      dryRunCom(AUTORIZADA, "20261014120000_pagamento_registrado_solo.sql", "20261014130000_situacao_registro_pagamento.sql"),
    );
    expect(r.codigo).toBe(1);
  });

  it("só uma migration diferente da autorizada", () => {
    const r = validar(dryRunCom(JA_APLICADA));
    expect(r.codigo).toBe(1);
  });

  it("falta uma das autorizadas (dois itens autorizados, um listado)", () => {
    const outra = JA_APLICADA;
    const r = validar(dryRunCom(AUTORIZADA), `${AUTORIZADA} ${outra}`);
    expect(r.codigo).toBe(1);
  });

  it("nome parecido com o autorizado (sufixo ou prefixo a mais) não passa", () => {
    expect(validar(dryRunCom(AUTORIZADA.replace(".sql", "_v2.sql"))).codigo).toBe(1);
    expect(validar(dryRunCom(`x${AUTORIZADA}`)).codigo).toBe(1);
  });

  it("versão extra citada sem o nome do arquivo (não interpretável)", () => {
    const r = validar(`${dryRunCom(AUTORIZADA)}\nversion 20261014120000 pending\n`);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("20261014120000");
  });
});

describe("entradas inválidas: encerra com erro antes de qualquer aplicação", () => {
  it("saída do dry-run vazia", () => {
    expect(validar("").codigo).toBe(1);
  });

  it("arquivo do dry-run inexistente", () => {
    expect(validar(null).codigo).toBe(1);
  });

  it("lista autorizada ausente, vazia ou só espaços", () => {
    expect(validar(dryRunCom(AUTORIZADA), null).codigo).toBe(1);
    expect(validar(dryRunCom(AUTORIZADA), "").codigo).toBe(1);
    expect(validar(dryRunCom(AUTORIZADA), " \n ").codigo).toBe(1);
  });

  it("item autorizado fora do formato ou repetido", () => {
    expect(validar(dryRunCom(AUTORIZADA), "blindagem.sql").codigo).toBe(1);
    expect(validar(dryRunCom(AUTORIZADA), `${AUTORIZADA} ${AUTORIZADA}`).codigo).toBe(1);
  });

  it("sem argumento", () => {
    const r = spawnSync(BASH, [SCRIPT], { env: { ...process.env, MIGRATIONS_AUTORIZADAS: AUTORIZADA }, encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("ligação no workflow", () => {
  const texto = readFileSync(WORKFLOW, "utf8");
  const aplicar = texto.slice(texto.indexOf("\n  aplicar:"));

  it("o job aplicar confere o conjunto depois do dry-run e antes de aplicar", () => {
    const dryRun = aplicar.indexOf("name: Dry-run imediatamente antes de aplicar");
    const trava = aplicar.indexOf("name: Conferir que o conjunto pendente é exatamente o autorizado");
    const aplicacao = aplicar.indexOf("name: Aplicar (supabase db push --include-all)");
    expect(dryRun).toBeGreaterThan(-1);
    expect(trava).toBeGreaterThan(dryRun);
    expect(aplicacao).toBeGreaterThan(trava);
  });

  it("a trava usa o arquivo do dry-run e a lista com só a migration autorizada, sem entrada do operador", () => {
    const trecho = aplicar.slice(aplicar.indexOf("name: Conferir que o conjunto"), aplicar.indexOf("name: Aplicar (supabase"));
    expect(trecho).toContain('bash .github/scripts/validar-conjunto-migrations.sh "$RUNNER_TEMP/dry-run.txt"');
    expect(trecho).toContain(AUTORIZADA);
    expect(trecho.match(/\d{14}_[A-Za-z0-9_.-]+\.sql/g)).toEqual([AUTORIZADA]);
    expect(trecho).not.toContain("inputs.");
    expect(trecho).not.toContain("secrets.");
    expect(trecho).not.toContain("continue-on-error");
  });

  it("as verificações de ref, SHA, destino e ambiente protegido continuam no job aplicar", () => {
    expect(aplicar).toContain("environment: producao-banco");
    expect(aplicar).toContain("bash .github/scripts/validar-disparo-producao.sh");
    expect(aplicar).toContain("validar-destino-producao.mjs banco");
    expect(aplicar).toContain("needs: validar");
  });

  it("o dry-run do job aplicar grava a saída no arquivo que a trava lê", () => {
    expect(aplicar).toContain('--include-all --dry-run 2>&1 | tee "$RUNNER_TEMP/dry-run.txt"');
  });
});
