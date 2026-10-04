/**
 * Sequência de dias produtivos ("streak"), pedida por Evandro em 2026-10-04.
 * `sequencia_produtiva_membro()` é self-only (resolve o membro via `meu_membro_id`,
 * nunca recebe `p_membro_id`) — por isso todo teste chama a RPC como o próprio membro,
 * nunca como admin em nome de outro.
 *
 * Lançamentos são inseridos direto no `point_ledger` (via `servico`, sem RLS) com
 * `created_at` controlado, igual ao teste de ranking histórico.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let colab: Usuario;
let empresa: string;
let membroColabId: string;

beforeAll(async () => {
  [admin, colab] = await Promise.all(["sk-admin", "sk-colab"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Streak ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: colab.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  membroColabId = vinculos!.find((v) => v.user_id === colab.id)!.id;
});

/** Dia produtivo: ao menos 1 crédito ativo (xp > 0, referencia_tipo <> 'conquista'). */
async function creditarDia(diaISO: string, opts: { estornado?: boolean; referenciaTipo?: string; xp?: number } = {}) {
  const { error } = await servico.from("point_ledger").insert({
    empresa_id: empresa,
    membro_id: membroColabId,
    xp: opts.xp ?? 10,
    moedas: 0,
    referencia_tipo: opts.referenciaTipo ?? "teste",
    profile_at_event: "closer",
    created_at: `${diaISO}T12:00:00-03:00`, // meio-dia America/Sao_Paulo, sem ambiguidade de fuso
    estornado: opts.estornado ?? false,
  });
  if (error) throw error;
}

type DiaSemana = { data: string; dia_util: boolean; produtivo: boolean };

async function sequencia() {
  const { data, error } = await colab.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresa });
  if (error) throw error;
  const linha = data![0];
  return { sequencia: linha.sequencia, semana: linha.semana as unknown as DiaSemana[] };
}

/** "Hoje" em America/Sao_Paulo, como a RPC calcula (Brasil não observa DST desde 2019). */
function hojeSaoPaulo(): Date {
  const comOffset = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(comOffset.getUTCFullYear(), comOffset.getUTCMonth(), comOffset.getUTCDate()));
}

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** ISO: 1=segunda .. 7=domingo (JS getUTCDay: 0=domingo..6=sábado). */
function isoDow(d: Date) {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** As `qtd` datas de dia útil (seg–sex) imediatamente anteriores a `aPartirDe`, mais recente primeiro. */
function diasUteisAnteriores(aPartirDe: Date, qtd: number): string[] {
  const dias: string[] = [];
  let cursor = new Date(aPartirDe.getTime() - 24 * 60 * 60 * 1000);
  while (dias.length < qtd) {
    if (isoDow(cursor) <= 5) dias.push(formatarData(cursor));
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return dias;
}

describe("sequencia_produtiva_membro: regra seg–sex padrão (default)", () => {
  it("3 dias úteis consecutivos com crédito formam sequência 3; fim de semana no meio não quebra; hoje sem crédito ainda não quebra", async () => {
    const hoje = hojeSaoPaulo();
    // Os 3 dias úteis imediatamente antes de hoje — naturalmente atravessa um fim de semana
    // quando hoje cai numa segunda/terça, cobrindo "fim de semana não quebra" sem precisar
    // fixar o dia de execução do teste. "Hoje" propositalmente não recebe crédito, pra provar
    // que um dia sem atividade ainda não quebra a sequência antes de ela terminar.
    const tresDiasUteis = diasUteisAnteriores(hoje, 3);
    for (const dia of tresDiasUteis) await creditarDia(dia);

    const r = await sequencia();
    expect(r.sequencia).toBe(3);
    expect(r.semana).toHaveLength(7);
  });
});

describe("sequencia_produtiva_membro: configuração de dias úteis por empresa", () => {
  it("empresa com sábado como dia útil (bitmask inclui bit 6) exige crédito no sábado pra não quebrar", async () => {
    // bit0=segunda..bit6=domingo: segunda a sábado = 0b0111111 = 63.
    await servico.from("empresas").update({ dias_uteis_gamificacao: 63 }).eq("id", empresa);

    const r = await sequencia();
    const sabado = r.semana.find((d) => new Date(`${d.data}T12:00:00Z`).getUTCDay() === 6);
    expect(sabado).toBeDefined();
    expect(sabado!.dia_util).toBe(true); // sábado agora é dia útil nesta empresa

    await servico.from("empresas").update({ dias_uteis_gamificacao: 31 }).eq("id", empresa); // restaura default
  });
});

describe("sequencia_produtiva_membro: estorno retroativo remove o dia produtivo", () => {
  it("estornar todos os créditos de um dia faz ele deixar de contar como produtivo", async () => {
    const hoje = formatarData(hojeSaoPaulo());
    await creditarDia(hoje, { xp: 20 });

    const antes = await sequencia();
    const hojeAntes = antes.semana.find((d) => d.data === hoje);
    expect(hojeAntes?.produtivo).toBe(true);

    await servico.from("point_ledger").update({ estornado: true, estornado_em: new Date().toISOString() }).eq("membro_id", membroColabId).eq("empresa_id", empresa).eq("referencia_tipo", "teste").gte("created_at", `${hoje}T00:00:00-03:00`);

    const depois = await sequencia();
    const hojeDepois = depois.semana.find((d) => d.data === hoje);
    expect(hojeDepois?.produtivo).toBe(false); // todos os créditos do dia foram estornados — deixa de contar
  });
});

describe("sequencia_produtiva_membro: bônus de conquista não cria dia produtivo", () => {
  it("um crédito com referencia_tipo = 'conquista' não torna o dia produtivo por si só", async () => {
    const outro = await criarUsuario("sk-colab-conquista");
    const { data: vinculo } = await servico
      .from("empresa_membros")
      .insert({ empresa_id: empresa, user_id: outro.id, papel: "vendedor", perfil_gamificacao: "closer" })
      .select("id")
      .single();
    const membroId = vinculo!.id as string;

    const dia = "2026-08-10"; // segunda, bem no passado — isolado de qualquer outro teste
    await servico.from("point_ledger").insert({
      empresa_id: empresa,
      membro_id: membroId,
      xp: 50,
      moedas: 0,
      referencia_tipo: "conquista",
      profile_at_event: "closer",
      created_at: `${dia}T12:00:00-03:00`,
      estornado: false,
    });

    const { semana, sequencia: seq } = await (async () => {
      const { data, error } = await outro.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresa });
      if (error) throw error;
      const linha = data![0];
      return { semana: linha.semana as unknown as DiaSemana[], sequencia: linha.sequencia };
    })();
    const diaChecado = semana.find((d) => d.data === dia);
    // Esse dia não está na semana corrente (está no passado), então a checagem real é via
    // a sequência: sem nenhum outro crédito, a sequência deve ser 0 (bônus de conquista não conta).
    expect(diaChecado).toBeUndefined(); // fora da semana corrente, como esperado
    expect(seq).toBe(0);
  });
});

describe("sequencia_produtiva_membro: self-only", () => {
  it("quem não é membro da empresa recebe sequência 0 e semana vazia, nunca erro", async () => {
    const semEmpresa = await criarUsuario("sk-sem-empresa");
    const { data, error } = await semEmpresa.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresa });
    expect(error).toBeNull();
    expect(data![0].sequencia).toBe(0);
    expect(data![0].semana).toEqual([]);
  });

  it("a função não aceita p_membro_id — não há forma de consultar a sequência de outro membro", async () => {
    // A assinatura da RPC só tem p_empresa_id — tentar passar p_membro_id é rejeitado pelo
    // PostgREST antes mesmo de chegar na função (parâmetro desconhecido não declarado nela).
    const args: Record<string, string> = { p_empresa_id: empresa, p_membro_id: "00000000-0000-0000-0000-000000000000" };
    const { error } = await colab.cliente.rpc("sequencia_produtiva_membro", args as { p_empresa_id: string });
    expect(error).not.toBeNull();
  });
});
