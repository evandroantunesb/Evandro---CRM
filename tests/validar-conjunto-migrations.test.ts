// Trava do job "aplicar" do workflow `banco-producao.yml`: o conjunto pendente do dry-run precisa ser
// exatamente o autorizado. Testa o script e a ligação dele no workflow. Não usa banco nem rede.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = ".github/scripts/validar-conjunto-migrations.sh";
const WORKFLOW = ".github/workflows/banco-producao.yml";
// Prazos e indicadores da Engenharia (P5): só ela, nenhuma a mais ou a menos.
const AUTORIZADA = "20261030160000_engenharia_prazos_indicadores.sql";
// Vistoria e conexão da Engenharia (#261): aplicada em 30/10/2026, antes desta. Se voltar a aparecer como pendente, não
// é autorizada.
const VISTORIA = "20261030140000_engenharia_vistoria.sql";
// Protocolos da Engenharia (#258): aplicada em 30/10/2026, antes desta. Se voltar a aparecer como pendente, não é
// autorizada.
const PROTOCOLOS = "20261030120000_engenharia_protocolos.sql";
// Checklist da Engenharia (#257): aplicada em 30/10/2026, antes desta. Se voltar a aparecer como pendente, não é
// autorizada.
const CHECKLIST = "20261030100000_engenharia_checklist.sql";
// Notificações das tarefas de setor (#251): aplicada em 29/10/2026, antes desta. Se voltar a aparecer como pendente,
// não é autorizada.
const NOTIFICACOES = "20261029235000_tarefas_setor_notificacoes.sql";
// Anexos das tarefas de setor (#251): aplicada em 29/10/2026, antes desta. Se voltar a aparecer como pendente, não é
// autorizada.
const ANEXOS_TAREFA = "20261029230000_tarefas_setor_anexos.sql";
// Tarefas de setor (#249): aplicada em 29/10/2026, antes desta. Se voltar a aparecer como pendente, não é autorizada.
const TAREFAS_SETOR = "20261029210000_tarefas_setor.sql";
// Dados do cliente para o contrato (#248): aplicada em 29/10/2026, antes desta. Se voltar a aparecer como pendente,
// não é autorizada.
const DADOS_CLIENTE = "20261029190000_dados_cliente_contrato.sql";
// Dados pessoais da obra fora da API (#247): aplicada em 29/10/2026, antes da #248. Se voltar a aparecer como pendente,
// não é autorizada.
const CLIENTE_OCULTO = "20261029170000_obras_cliente_oculto.sql";
// Fixação do telhado na obra (#245): aplicada em 29/10/2026, antes da #247. Se voltar a aparecer como pendente, não é
// autorizada.
const FIXACAO = "20261029150000_obras_fixacao_telhado.sql";
// Validade padrão da proposta (#244): aplicada em 29/10/2026, antes da fixação. Se voltar a aparecer como pendente, não é
// autorizada.
const VALIDADE_PROPOSTA = "20261029130000_proposta_preferencias.sql";
// Eletroposto para o SDR e pontuação por tipo de negócio (#225): aplicada em 27/10/2026, antes da validade. Se voltar a
// aparecer como pendente, não é autorizada.
const ELETROPOSTO_SDR = "20261027100000_eletroposto_sdr_pontuacao.sql";
// Eletroposto (#223): aplicada em 26/10/2026, antes do eletroposto SDR. Se voltar a aparecer como pendente, não é autorizada.
const ELETROPOSTO = "20261026120000_eletroposto.sql";
// Temperatura do negócio (#222): aplicada em 24/10/2026, antes do eletroposto. Se voltar a aparecer como pendente,
// não é autorizada.
const TEMPERATURA = "20261024100000_temperatura_negocio.sql";
// Calculadora GD II, lotes 1 (#210 mais as seis preparatórias da #214) e 2 (revogação da escrita direta): já aplicados
// antes da temperatura. Se voltarem a aparecer como pendentes, não são autorizados.
const CALCULADORA = [
  "20261021100000_negocio_consumo_estimado.sql",
  "20261022100000_propostas_emissoes.sql",
  "20261022110000_produtividade_confirmada.sql",
  "20261023200000_calculos_estimativa_incompleta.sql",
  "20261023210000_calculo_gd2_fio_b.sql",
  "20261023220000_calculos_solares_gravacao_servidor.sql",
  "20261023230000_calculos_solares_exclusao_historico.sql",
  "20261023240000_calculos_solares_revogar_escrita_direta.sql",
];
// Migrations já aplicadas (#192, #191, #190 e o conjunto Solo #186, #188 e #189): se voltarem a aparecer como
// pendentes, não são autorizadas.
const SOLO = [
  "20261014120000_pagamento_registrado_solo.sql",
  "20261014130000_situacao_registro_pagamento.sql",
  "20261014140000_rls_financeiro_sdr.sql",
];
const JA_APLICADA = "20261015110000_integridade_handoff_origem.sql";
const JA_APLICADAS = [
  JA_APLICADA,
  "20261015100000_integridade_contratos.sql",
  "20261014100000_blindagem_contratos_confirmacoes.sql",
  ...SOLO,
];
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
    const r = validar(dryRunCom("20261016100000_nova_inesperada.sql", AUTORIZADA));
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("20261016100000_nova_inesperada.sql");
  });

  it("várias migrations extras", () => {
    expect(validar(dryRunCom(AUTORIZADA, ...SOLO)).codigo).toBe(1);
  });

  it("só uma migration diferente da autorizada (substituição)", () => {
    expect(validar(dryRunCom(JA_APLICADA)).codigo).toBe(1);
    expect(validar(dryRunCom("20261016100000_nova_inesperada.sql")).codigo).toBe(1);
  });

  it("migration anterior já aplicada (inclusive as três do Solo), sozinha ou junto com a autorizada, não passa", () => {
    for (const anterior of JA_APLICADAS) {
      expect(validar(dryRunCom(anterior)).codigo, anterior).toBe(1);
      expect(validar(dryRunCom(anterior, AUTORIZADA)).codigo, anterior).toBe(1);
    }
  });

  it("as três do Solo, já aplicadas, são recusadas pela lista atual e só passariam se alguém as autorizasse de novo", () => {
    const r = validar(dryRunCom(...SOLO));
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain(AUTORIZADA);
    expect(validar(dryRunCom(...SOLO), SOLO.join("\n")).codigo).toBe(0);
  });

  it("falta uma das autorizadas (dois itens autorizados, um listado)", () => {
    const outra = JA_APLICADA;
    const r = validar(dryRunCom(AUTORIZADA), `${AUTORIZADA} ${outra}`);
    expect(r.codigo).toBe(1);
  });

  it("migration autorizada listada em duplicidade no dry-run, com extra: não passa", () => {
    expect(validar(dryRunCom(AUTORIZADA, AUTORIZADA, JA_APLICADA)).codigo).toBe(1);
  });

  it("nome parecido com o autorizado (sufixo ou prefixo a mais) não passa", () => {
    expect(validar(dryRunCom(AUTORIZADA.replace(".sql", "_v2.sql"))).codigo).toBe(1);
    expect(validar(dryRunCom(`x${AUTORIZADA}`)).codigo).toBe(1);
  });

  it("versão extra citada sem o nome do arquivo (não interpretável)", () => {
    const r = validar(`${dryRunCom(AUTORIZADA)}\nversion 20261015120000 pending\n`);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("20261015120000");
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
    expect(validar(dryRunCom(AUTORIZADA), `${AUTORIZADA}\narquivamento.sql`).codigo).toBe(1);
    expect(validar(dryRunCom(AUTORIZADA), `${AUTORIZADA}\n${AUTORIZADA}`).codigo).toBe(1);
  });

  it("sem argumento", () => {
    const r = spawnSync(BASH, [SCRIPT], { env: { ...process.env, MIGRATIONS_AUTORIZADAS: AUTORIZADA }, encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("protocolos da Engenharia", () => {
  it("só ela pendente (checklist, tarefas de setor, dados do cliente, dados pessoais da obra, fixação, validade da proposta, eletroposto SDR, eletroposto, temperatura e calculadora já aplicados): passa", () => {
    expect(validar(dryRunCom(AUTORIZADA)).codigo).toBe(0);
  });

  it("checklist, tarefas de setor, dados do cliente, dados pessoais da obra, fixação, validade da proposta, eletroposto SDR, eletroposto, temperatura ou qualquer migration da calculadora pendente junto, ou sozinha, não passa", () => {
    for (const m of [VISTORIA, PROTOCOLOS, CHECKLIST, NOTIFICACOES, ANEXOS_TAREFA, TAREFAS_SETOR, DADOS_CLIENTE, CLIENTE_OCULTO, FIXACAO, VALIDADE_PROPOSTA, ELETROPOSTO_SDR, ELETROPOSTO, TEMPERATURA, ...CALCULADORA]) {
      expect(validar(dryRunCom(AUTORIZADA, m)).codigo, m).toBe(1);
      expect(validar(dryRunCom(m)).codigo, m).toBe(1);
    }
  });

  it("a calculadora inteira pendente, com ou sem a autorizada, não passa", () => {
    expect(validar(dryRunCom(...CALCULADORA)).codigo).toBe(1);
    expect(validar(dryRunCom(...CALCULADORA, AUTORIZADA)).codigo).toBe(1);
  });

  it("a autorizada existe na pasta e é a única da lista autorizada do workflow", () => {
    expect(existsSync(`supabase/migrations/${AUTORIZADA}`)).toBe(true);
    const texto = readFileSync(WORKFLOW, "utf8");
    expect(texto).toContain(AUTORIZADA);
    for (const m of [VISTORIA, PROTOCOLOS, CHECKLIST, NOTIFICACOES, ANEXOS_TAREFA, TAREFAS_SETOR, DADOS_CLIENTE, CLIENTE_OCULTO, FIXACAO, VALIDADE_PROPOSTA, ELETROPOSTO_SDR, ELETROPOSTO, TEMPERATURA, ...CALCULADORA]) expect(texto, m).not.toContain(m);
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

  it("a trava usa o arquivo do dry-run e a lista com só as migrations autorizadas, sem entrada do operador", () => {
    const trecho = aplicar.slice(aplicar.indexOf("name: Conferir que o conjunto"), aplicar.indexOf("name: Aplicar (supabase"));
    expect(trecho).toContain('bash .github/scripts/validar-conjunto-migrations.sh "$RUNNER_TEMP/dry-run.txt"');
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
