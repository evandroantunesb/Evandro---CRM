/**
 * Confirmação da produtividade da calculadora (20261022110000_produtividade_confirmada.sql): só o admin confirma, com
 * nota; vale só para o valor atual (mudar a produtividade apaga); ninguém grava os campos de confirmação direto.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario, gestor: Usuario, vendedor: Usuario, outroAdmin: Usuario;
let empresa: string, outra: string;

const FONTE = "Relatório de geração real das usinas da região";
const RESPONSAVEL = "Eng. Ana Prado (CREA 12345)";
const confirmar = (u: Usuario, e: string, sobrescrever: { valor?: number | null; fonte?: string; responsavel?: string } = {}) =>
  u.cliente.rpc("confirmar_produtividade_calculadora", {
    p_empresa_id: e,
    p_valor: sobrescrever.valor === undefined ? 120 : (sobrescrever.valor as number),
    p_fonte: sobrescrever.fonte ?? FONTE,
    p_responsavel: sobrescrever.responsavel ?? RESPONSAVEL,
  });

async function parametros(e: string) {
  const { data, error } = await servico.from("parametros_calculadora").select("*").eq("empresa_id", e).single();
  expect(error).toBeNull();
  return data!;
}

beforeAll(async () => {
  [admin, gestor, vendedor, outroAdmin] = await Promise.all(["pc-admin", "pc-gestor", "pc-vend", "pc-outro"].map(criarUsuario));
  const { data: emps } = await servico.from("empresas").insert([{ nome: `Produtividade ${sufixo}` }, { nome: `Produtividade outra ${sufixo}` }]).select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  outra = emps!.find((e) => e.nome.includes("outra"))!.id;
  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: outra, user_id: outroAdmin.id, papel: "admin" },
  ]);
});

describe("produtividade_confirmada", () => {
  it("toda empresa começa SEM confirmação (o padrão de fábrica não vale sozinho)", async () => {
    const p = await parametros(empresa);
    expect(p.produtividade_kwh_kwp_mes).toBe(120);
    expect([p.produtividade_confirmada_valor, p.produtividade_confirmada_em, p.produtividade_confirmada_por, p.produtividade_confirmada_fonte, p.produtividade_confirmada_responsavel]).toEqual([null, null, null, null, null]);
  });

  it("só o admin da PRÓPRIA empresa confirma", async () => {
    for (const u of [gestor, vendedor]) expect((await confirmar(u, empresa)).error).not.toBeNull();
    expect((await confirmar(outroAdmin, empresa)).error).not.toBeNull();
    expect((await parametros(empresa)).produtividade_confirmada_valor).toBeNull();
  });

  it("exige valor, fonte e responsável; o valor tem que ser o atual", async () => {
    expect((await confirmar(admin, empresa, { fonte: "   " })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { fonte: "curta" })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { fonte: "x".repeat(121) })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { responsavel: "  " })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { responsavel: "ab" })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { responsavel: "x".repeat(61) })).error).not.toBeNull();
    expect((await confirmar(admin, empresa, { valor: 135 })).error?.message).toMatch(/valor atual/);
    expect((await confirmar(admin, empresa, { valor: null })).error).not.toBeNull();
    expect((await parametros(empresa)).produtividade_confirmada_valor).toBeNull();
  });

  it("o admin confirma o valor atual e a confirmação fica registrada", async () => {
    const { error } = await confirmar(admin, empresa);
    expect(error).toBeNull();
    const p = await parametros(empresa);
    expect(p.produtividade_confirmada_valor).toBe(120);
    expect(p.produtividade_confirmada_em).not.toBeNull();
    expect(p.produtividade_confirmada_fonte).toBe(FONTE);
    expect(p.produtividade_confirmada_responsavel).toBe(RESPONSAVEL);
  });

  it("salvar os parâmetros sem mudar a produtividade mantém a confirmação", async () => {
    const { error } = await admin.cliente.from("parametros_calculadora").update({ percentual_fio_b: 0.6, produtividade_kwh_kwp_mes: 120 }).eq("empresa_id", empresa);
    expect(error).toBeNull();
    expect((await parametros(empresa)).produtividade_confirmada_valor).toBe(120);
  });

  it("mudar a produtividade apaga a confirmação; voltar ao valor antigo não a ressuscita", async () => {
    expect((await admin.cliente.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 135 }).eq("empresa_id", empresa)).error).toBeNull();
    let p = await parametros(empresa);
    expect([p.produtividade_confirmada_valor, p.produtividade_confirmada_em, p.produtividade_confirmada_fonte, p.produtividade_confirmada_responsavel]).toEqual([null, null, null, null]);
    expect((await admin.cliente.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 120 }).eq("empresa_id", empresa)).error).toBeNull();
    p = await parametros(empresa);
    expect(p.produtividade_confirmada_valor).toBeNull();
  });

  it("ninguém grava os campos de confirmação direto (nem o admin, nem a service role)", async () => {
    const forjado = { produtividade_confirmada_valor: 120, produtividade_confirmada_em: new Date().toISOString(), produtividade_confirmada_fonte: "Confirmado por fora da função", produtividade_confirmada_responsavel: "Fulano de Tal" };
    expect((await admin.cliente.from("parametros_calculadora").update(forjado).eq("empresa_id", empresa)).error).not.toBeNull();
    expect((await servico.from("parametros_calculadora").update(forjado).eq("empresa_id", empresa)).error).not.toBeNull();
    expect((await parametros(empresa)).produtividade_confirmada_valor).toBeNull();
  });

  it("a confirmação é por empresa (a outra continua sem)", async () => {
    expect((await confirmar(admin, empresa)).error).toBeNull();
    expect((await parametros(outra)).produtividade_confirmada_valor).toBeNull();
  });

  it("ninguém apaga o autor de uma confirmação válida por fora da função", async () => {
    expect((await admin.cliente.from("parametros_calculadora").update({ produtividade_confirmada_por: null }).eq("empresa_id", empresa)).error).not.toBeNull();
    expect((await servico.from("parametros_calculadora").update({ produtividade_confirmada_por: null }).eq("empresa_id", empresa)).error).not.toBeNull();
    expect((await parametros(empresa)).produtividade_confirmada_por).not.toBeNull();
  });

  it("apagar o membro que confirmou não é bloqueado: a confirmação continua, sem autor", async () => {
    // A empresa precisa continuar com um admin: o gestor da primeira empresa vira admin também desta.
    expect((await servico.from("empresa_membros").insert({ empresa_id: outra, user_id: gestor.id, papel: "admin" })).error).toBeNull();
    expect((await confirmar(outroAdmin, outra)).error).toBeNull();
    const antes = await parametros(outra);
    expect(antes.produtividade_confirmada_por).not.toBeNull();
    const { error } = await servico.from("empresa_membros").delete().eq("id", antes.produtividade_confirmada_por!);
    expect(error?.message ?? null).toBeNull();
    const depois = await parametros(outra);
    expect(depois.produtividade_confirmada_por).toBeNull();
    expect(depois.produtividade_confirmada_valor).toBe(antes.produtividade_confirmada_valor);
    expect(depois.produtividade_confirmada_fonte).toBe(antes.produtividade_confirmada_fonte);
    expect(depois.produtividade_confirmada_responsavel).toBe(antes.produtividade_confirmada_responsavel);
  });
});
