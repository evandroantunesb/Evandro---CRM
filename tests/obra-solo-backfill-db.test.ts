/**
 * Backfill da obra do Solo (4b, 20261207100000_obra_solo.sql): as obras do Solo que já existiam antes da migration
 * ganham o checklist (contrato e entrada pelas datas reais) e o link do cliente; a obra com a entrada estornada fica
 * com a etapa pendente; a obra de empresa PRO não é tocada; rodar de novo não muda nada. O trecho do backfill é lido
 * da própria migration e reexecutado sobre obras criadas aqui (sem checklist e sem link, como antes da migration).
 * Precisa do Supabase local.
 *
 * Cenário próprio ("Backfill Solo" + sufixo, usuários "bf-*" + sufixo). Os testes seguem em ordem.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { urlBancoLocal } from "./banco-local";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato, gerarContratoTeste } from "./ajuda";

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

/** O backfill como está na migration: do comentário "Obras do Solo que já existem" até o da nova confirmação. */
function trechoDoBackfill(): string {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261207100000_obra_solo.sql"), "utf8").replace(/\r\n/g, "\n");
  const ini = sql.indexOf("-- Obras do Solo que já existem");
  const fim = sql.indexOf("-- Nova confirmação:", ini);
  if (ini < 0 || fim < 0) throw new Error("Trecho do backfill não encontrado na migration.");
  return sql.slice(ini, fim);
}

let admin: Usuario;
let adminPro: Usuario;
let solo: string;
let pro: string;

async function criarObra(empresa: string, dono: Usuario, titulo: string): Promise<string> {
  const { data: m } = await servico.from("empresa_membros").select("id").eq("empresa_id", empresa).eq("user_id", dono.id).single();
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: m!.id, valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await dono.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await gerarContratoTeste(dono.cliente, { empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }),
    "contrato",
  );
  ok(await dono.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await dono.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const etapasDa = async (obra: string) =>
  Object.fromEntries(
    (await noBanco("select etapa::text as etapa, feita_em::text as feita_em from public.obra_checklist where obra_id = $1 order by etapa", [obra])).map((e) => [e.etapa, e.feita_em as string | null]),
  );
const linkDa = async (obra: string) => (await noBanco("select link_cliente from public.obras where id = $1", [obra]))[0].link_cliente as string | null;
/** Volta a obra ao que era antes da migration: sem checklist e sem link. */
const comoAntesDaMigration = async (obra: string) => {
  await noBanco("delete from public.obra_checklist where obra_id = $1", [obra]);
  await noBanco("update public.obras set link_cliente = null where id = $1", [obra]);
};

describe("Backfill da obra do Solo (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let normal: string;
  let estornada: string;
  let dePro: string;
  let esperado: Record<string, string | null>;
  let esperadoEstornada: Record<string, string | null>;

  beforeAll(async () => {
    [admin, adminPro] = await Promise.all(["bf-admin-solo", "bf-admin-pro"].map(criarUsuario));
    const { data: emps } = ok(
      await servico
        .from("empresas")
        .insert([{ nome: `Backfill Solo A ${sufixo}` }, { nome: `Backfill Solo B ${sufixo}` }])
        .select("id, nome")
        .order("nome"),
      "empresas",
    );
    solo = emps![0].id;
    pro = emps![1].id;
    ok(await servico.from("planos_empresa").upsert({ empresa_id: solo, produto: "solo" } as never, { onConflict: "empresa_id" }), "plano solo");
    ok(
      await servico.from("empresa_membros").insert([
        { empresa_id: solo, user_id: admin.id, papel: "admin" },
        { empresa_id: pro, user_id: adminPro.id, papel: "admin" },
      ] as never),
      "membros",
    );
    normal = await criarObra(solo, admin, "Backfill normal");
    estornada = await criarObra(solo, admin, "Backfill estornada");
    dePro = await criarObra(pro, adminPro, "Backfill PRO");

    // Datas reais de contrato e entrada, como a migration as calcula (a obra recém-criada já as tem).
    esperado = await etapasDa(normal);
    esperadoEstornada = await etapasDa(estornada);
    await noBanco("update public.obras set alerta_pagamento_estornado_em = now() where id = $1", [estornada]);
    await comoAntesDaMigration(normal);
    await comoAntesDaMigration(estornada);
  });

  it("a obra criada pelo fluxo atual tem contrato e entrada feitos (base do esperado)", () => {
    expect(esperado.contrato).not.toBeNull();
    expect(esperado.entrada).not.toBeNull();
  });

  it("o backfill dá o checklist com as datas reais e o link às obras do Solo", async () => {
    expect(Object.keys(await etapasDa(normal))).toHaveLength(0);
    await noBanco(trechoDoBackfill());

    const etapas = await etapasDa(normal);
    expect(Object.keys(etapas)).toHaveLength(10);
    expect(etapas.contrato).toBe(esperado.contrato);
    expect(etapas.entrada).toBe(esperado.entrada);
    expect(Object.entries(etapas).filter(([e, v]) => e !== "contrato" && e !== "entrada" && v !== null)).toEqual([]);
    expect(await linkDa(normal)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("obra com a entrada estornada: etapa entrada pendente, contrato mantido, com link", async () => {
    const etapas = await etapasDa(estornada);
    expect(Object.keys(etapas)).toHaveLength(10);
    expect(etapas.contrato).toBe(esperadoEstornada.contrato);
    expect(etapas.entrada).toBeNull();
    expect(await linkDa(estornada)).not.toBeNull();
  });

  it("obra de empresa PRO não ganha checklist nem link", async () => {
    expect(Object.keys(await etapasDa(dePro))).toHaveLength(0);
    expect(await linkDa(dePro)).toBeNull();
  });

  it("rodar de novo não muda nada (checklist e link mantidos)", async () => {
    const [antesEtapas, antesLink] = [await etapasDa(normal), await linkDa(normal)];
    await noBanco(trechoDoBackfill());
    expect(await etapasDa(normal)).toEqual(antesEtapas);
    expect(await linkDa(normal)).toBe(antesLink);
  });
});
