/**
 * Reavaliação de crédito condicionado após correção de valor pós-ganho (Evandro,
 * 2026-10-02, PR seguinte à #123/fechamento antifraude). Ver
 * `20261002190000_gamificacao_reavaliacao_valor_corrigido.sql`:
 * - `corrigir_valor_negocio` passa a reavaliar, pra cada lançamento ATIVO do `deal.won`
 *   daquele ciclo com `condicao_avaliada` congelada sobre `valor`, se o novo valor ainda
 *   satisfaz a condição CONGELADA (nunca a regra atual) — se não satisfizer mais, estorna.
 * - Nunca concede crédito retroativo: lançamento já estornado nunca é reativado.
 * - Lançamento sem `condicao_avaliada` nunca é tocado (nem estornado por inferência).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [admin, gestor] = await Promise.all(["rv-admin", "rv-gestor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Reavaliação valor corrigido ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente reavaliação" }).select("id").single();
  contato = c!.id;
});

async function criarRegraDealWon(opts: { condicao?: { campo: string; operador: string; valor: string } | null; xp?: number; moedas?: number }) {
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({
      empresa_id: empresa,
      nome: `deal.won ${sufixo}-${Math.random()}`,
      evento_tipo: "deal.won",
      xp: opts.xp ?? 50,
      moedas: opts.moedas ?? 50,
      condicao: opts.condicao ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function criarNegocioGanho(valor: number) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio reavaliação ${sufixo}-${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro[admin.id], valor })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await servico.from("negocios").update({ status: "ganho" }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id;
}

async function corrigirValor(negocioId: string, novoValor: number, motivo = "Correção de teste") {
  return admin.cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: novoValor, p_motivo: motivo });
}

async function ledgerDaRegra(regraId: string) {
  const { data } = await servico.from("point_ledger").select("id, estornado, condicao_avaliada").eq("regra_id", regraId).order("created_at");
  return data!;
}

describe("estorna quando o novo valor deixa de satisfazer a condição congelada", () => {
  it("60k com regra >=50k → corrige para 40k → estorna", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const negocioId = await criarNegocioGanho(60000);

    const antes = await ledgerDaRegra(regraId);
    expect(antes).toHaveLength(1);
    expect(antes[0].estornado).toBe(false);

    const { error } = await corrigirValor(negocioId, 40000);
    expect(error).toBeNull();

    const depois = await ledgerDaRegra(regraId);
    expect(depois).toHaveLength(1);
    expect(depois[0].estornado).toBe(true);
  });
});

describe("mantém quando o novo valor continua satisfazendo a condição congelada", () => {
  it("60k com regra >=50k → corrige para 55k → mantém ativo", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const negocioId = await criarNegocioGanho(60000);

    const { error } = await corrigirValor(negocioId, 55000);
    expect(error).toBeNull();

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].estornado).toBe(false);
  });
});

describe("nunca concede crédito retroativo", () => {
  it("40k sem crédito (condição não satisfeita na origem) → corrige para 60k → não cria lançamento", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const negocioId = await criarNegocioGanho(40000);

    expect(await ledgerDaRegra(regraId)).toHaveLength(0);

    const { error } = await corrigirValor(negocioId, 60000);
    expect(error).toBeNull();

    // Continua vazio: a correção nunca gera lançamento novo, só reavalia os existentes.
    expect(await ledgerDaRegra(regraId)).toHaveLength(0);
  });

  it("60k→40k (estorna)→70k: lançamento estornado não é reativado pela correção seguinte", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const negocioId = await criarNegocioGanho(60000);

    const { error: e1 } = await corrigirValor(negocioId, 40000, "Primeira correção");
    expect(e1).toBeNull();
    let ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].estornado).toBe(true);

    const { error: e2 } = await corrigirValor(negocioId, 70000, "Segunda correção, valor volta a satisfazer");
    expect(e2).toBeNull();
    ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    // Continua estornado — sem reativação/crédito retroativo.
    expect(ledger[0].estornado).toBe(true);
  });
});

describe("usa a condição congelada no lançamento, nunca a regra atual", () => {
  it("edita gamification_rules.condicao depois do crédito: reavaliação continua usando a condição antiga", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const negocioId = await criarNegocioGanho(60000);

    // Regra passa a exigir >=100000 (o lançamento, criado quando a regra exigia >=50000,
    // continua com condicao_avaliada congelada em >=50000).
    await admin.cliente.from("gamification_rules").update({ condicao: { campo: "valor", operador: ">=", valor: "100000" } }).eq("id", regraId);

    // 60000 não satisfaria a regra atual (>=100000), mas satisfaz a condição congelada
    // (>=50000) — corrigir para 55000 (ainda >=50000) deve manter o lançamento ativo.
    const { error } = await corrigirValor(negocioId, 55000);
    expect(error).toBeNull();

    const ledger = await ledgerDaRegra(regraId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].estornado).toBe(false);
  });
});

describe("lançamento sem condicao_avaliada nunca é tocado", () => {
  it("regra deal.won sem condição (credita sempre) não é estornada por nenhuma correção de valor", async () => {
    const regraSemCondicao = await criarRegraDealWon({ condicao: null });
    const negocioId = await criarNegocioGanho(60000);

    const antes = await ledgerDaRegra(regraSemCondicao);
    expect(antes).toHaveLength(1);
    expect(antes[0].condicao_avaliada).toBeNull();

    const { error } = await corrigirValor(negocioId, 100);
    expect(error).toBeNull();

    const depois = await ledgerDaRegra(regraSemCondicao);
    expect(depois).toHaveLength(1);
    expect(depois[0].estornado).toBe(false);
  });

  it("negócio com duas regras (com e sem condição): correção estorna só a condicionada", async () => {
    const regraCondicionada = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" } });
    const regraSemCondicao = await criarRegraDealWon({ condicao: null });
    const negocioId = await criarNegocioGanho(60000);

    expect(await ledgerDaRegra(regraCondicionada)).toHaveLength(1);
    expect(await ledgerDaRegra(regraSemCondicao)).toHaveLength(1);

    const { error } = await corrigirValor(negocioId, 10000);
    expect(error).toBeNull();

    const condicionada = await ledgerDaRegra(regraCondicionada);
    const semCondicao = await ledgerDaRegra(regraSemCondicao);
    expect(condicionada[0].estornado).toBe(true);
    expect(semCondicao[0].estornado).toBe(false);
  });
});

describe("preserva xp/moedas e vínculo causal", () => {
  it("lançamento estornado mantém xp/moedas originais e evento_id do deal.won", async () => {
    const regraId = await criarRegraDealWon({ condicao: { campo: "valor", operador: ">=", valor: "50000" }, xp: 77, moedas: 33 });
    const negocioId = await criarNegocioGanho(60000);

    const { data: dealWon } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "deal.won").single();

    const { error } = await corrigirValor(negocioId, 10000);
    expect(error).toBeNull();

    const { data: lancamento } = await servico.from("point_ledger").select("xp, moedas, evento_id, estornado, estornado_em, estornado_por").eq("regra_id", regraId).single();
    expect(lancamento!.xp).toBe(77);
    expect(lancamento!.moedas).toBe(33);
    expect(lancamento!.evento_id).toBe(dealWon!.id);
    expect(lancamento!.estornado).toBe(true);
    expect(lancamento!.estornado_em).not.toBeNull();
    expect(lancamento!.estornado_por).toBe(membro[admin.id]);
  });
});
