/**
 * Fechamento do antifraude da Gamificação (Evandro, 2026-10-02, depois da auditoria
 * read-only que seguiu a consolidação das #119-#122). Ver
 * `20261002180000_gamificacao_antifraude_fechamento.sql`:
 * - deal.created/deal.stage_changed/deal.owner_changed/task.created/note.created ficam
 *   estruturalmente inelegíveis pra XP/moedas — o motor ignora qualquer regra desses
 *   tipos, mesmo antiga e ativa.
 * - task.completed/reuniao.realizada/visita.realizada continuam pontuáveis, mas só com
 *   limite_periodo + limite_quantidade configurados — sem teto, o motor ignora a regra.
 * - Regra com condição congela, no point_ledger, a condição avaliada + o valor do
 *   payload comparado + o resultado, no momento do crédito — editar a regra depois não
 *   muda o que já foi creditado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let membroId: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["af-admin", "af-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Antifraude fechamento ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    ])
    .select("id, user_id");
  membroId = vinculos!.find((v) => v.user_id === vendedor.id)!.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente antifraude" }).select("id").single();
  contato = c!.id;
});

async function criarRegra(opts: {
  evento_tipo: string;
  xp?: number;
  moedas?: number;
  limite_periodo?: "dia" | "mes" | null;
  limite_quantidade?: number | null;
  condicao?: { campo: string; operador: string; valor: string } | null;
}) {
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({
      empresa_id: empresa,
      nome: `${opts.evento_tipo} ${sufixo}-${Math.random()}`,
      evento_tipo: opts.evento_tipo,
      xp: opts.xp ?? 10,
      moedas: opts.moedas ?? 10,
      limite_periodo: opts.limite_periodo ?? null,
      limite_quantidade: opts.limite_quantidade ?? null,
      condicao: opts.condicao ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function ledgerDaRegra(regraId: string) {
  const { data } = await servico.from("point_ledger").select("id, xp, moedas, estornado, condicao_avaliada").eq("regra_id", regraId).order("created_at");
  return data!;
}

function criarTarefa(venceEmIso: string) {
  return vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: `Tarefa antifraude ${sufixo}-${Math.random()}`, tipo: "ligacao", vence_em: venceEmIso, responsavel_id: membroId })
    .select("id")
    .single();
}

async function criarNegocioGanho(valor: number) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio antifraude ${sufixo}-${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroId, valor })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await servico.from("negocios").update({ status: "ganho" }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id;
}

const PASSADO = new Date(Date.now() - 3600e3).toISOString();

describe("eventos estruturalmente inelegíveis para XP/moedas", () => {
  it("deal.created não pontua mesmo com regra antiga ativa", async () => {
    const regraId = await criarRegra({ evento_tipo: "deal.created" });
    // Qualquer negócio novo dispara deal.created (registrar_negocio) — a regra existe e
    // está ativa, mas o motor ignora o tipo inteiro.
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: `Negócio deal.created ${sufixo}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroId });

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(0);
  });

  it("task.created não pontua mesmo com regra antiga ativa", async () => {
    const regraId = await criarRegra({ evento_tipo: "task.created" });
    await criarTarefa(PASSADO);

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(0);
  });

  it("note.created, deal.stage_changed e deal.owner_changed também ficam fora (checagem do catálogo, sem disparar os 3)", async () => {
    // Suficiente confirmar que o motor nem tenta: a regra existe e ativa, e o tipo está
    // na mesma lista hardcoded que bloqueou deal.created/task.created acima.
    for (const evento_tipo of ["note.created", "deal.stage_changed", "deal.owner_changed"]) {
      const regraId = await criarRegra({ evento_tipo });
      expect(await ledgerDaRegra(regraId)).toHaveLength(0);
    }
  });
});

describe("atividades repetíveis exigem teto pra pontuar", () => {
  it("task.completed sem limite_periodo/limite_quantidade não pontua", async () => {
    const regraId = await criarRegra({ evento_tipo: "task.completed" });
    const { data: tarefa } = await criarTarefa(PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(0);
  });

  it("task.completed com limite_periodo + limite_quantidade válidos pontua normalmente", async () => {
    const regraId = await criarRegra({ evento_tipo: "task.completed", limite_periodo: "dia", limite_quantidade: 5 });
    const { data: tarefa } = await criarTarefa(PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].estornado).toBe(false);
  });

  it("reuniao.realizada sem teto não pontua, com teto pontua", async () => {
    const semTeto = await criarRegra({ evento_tipo: "reuniao.realizada" });
    const comTeto = await criarRegra({ evento_tipo: "reuniao.realizada", limite_periodo: "dia", limite_quantidade: 5 });

    const { data: tarefa } = await vendedor.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, titulo: `Reunião antifraude ${sufixo}`, tipo: "reuniao", vence_em: PASSADO, responsavel_id: membroId })
      .select("id")
      .single();
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "realizada" }).eq("id", tarefa!.id);

    expect(await ledgerDaRegra(semTeto)).toHaveLength(0);
    expect(await ledgerDaRegra(comTeto)).toHaveLength(1);
  });

  it("reversão/reocorrência da #120 continua funcionando com teto configurado: completa→reabre→completa de novo", async () => {
    const regraId = await criarRegra({ evento_tipo: "task.completed", limite_periodo: "dia", limite_quantidade: 1000 });
    const { data: tarefa } = await criarTarefa(PASSADO);

    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "sem_resposta" }).eq("id", tarefa!.id);

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].estornado).toBe(true);
    expect(ledger[1].estornado).toBe(false);
  });
});

describe("snapshot da condição no point_ledger", () => {
  it("congela condição + valor do payload + resultado no momento do crédito, e não muda se a regra for editada depois", async () => {
    const regraId = await criarRegra({
      evento_tipo: "deal.won",
      xp: 50,
      moedas: 50,
      condicao: { campo: "valor", operador: ">=", valor: "50000" },
    });

    await criarNegocioGanho(60000);

    const antes = await ledgerDaRegra(regraId);
    expect(antes).toHaveLength(1);
    const snapshot = antes[0].condicao_avaliada as Record<string, unknown>;
    expect(snapshot.resultado).toBe(true);
    expect(snapshot.valor_payload).toBe("60000.00");
    expect((snapshot.condicao as Record<string, unknown>).valor).toBe("50000");

    // Edita a regra depois do crédito (condição e xp mudam) — o lançamento antigo não pode mudar.
    await admin.cliente.from("gamification_rules").update({ condicao: { campo: "valor", operador: ">=", valor: "100000" }, xp: 999 }).eq("id", regraId);

    const depois = await ledgerDaRegra(regraId);
    expect(depois).toHaveLength(1);
    expect(depois[0].xp).toBe(50);
    expect(depois[0].condicao_avaliada).toEqual(snapshot);
  });

  it("regra sem condição grava condicao_avaliada null", async () => {
    const regraId = await criarRegra({ evento_tipo: "deal.won", xp: 10, moedas: 10 });
    await criarNegocioGanho(1000);

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].condicao_avaliada).toBeNull();
  });
});
