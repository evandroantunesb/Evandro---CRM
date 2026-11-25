import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

/**
 * Geração e consumo mês a mês (20261222100000_geracao_mensal.sql, proposta completa PR 4): a curva da empresa e o
 * consumo dos 12 meses do negócio. Os dois são "12 ou nenhum"; a curva só tem valores > 0 e só o admin a altera; o
 * consumo aceita 0. Gravar a curva não apaga a confirmação da produtividade.
 */

const CURVA = [5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1];
const CONSUMO = [720, 700, 680, 630, 600, 600, 610, 620, 630, 650, 680, 700];

let empresaId: string;
let negocioId: string;
let admin: Usuario;
let vendedor: Usuario;

beforeAll(async () => {
  [admin, vendedor] = await Promise.all([criarUsuario("mensal-admin"), criarUsuario("mensal-vend")]);
  const { data: empresa, error } = await servico.from("empresas").insert({ nome: `Geração mensal ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresaId = empresa.id;
  const { data: membros, error: erroMembros } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresaId, user_id: admin.id, papel: "admin" },
      { empresa_id: empresaId, user_id: vendedor.id, papel: "vendedor" },
    ])
    .select("id, user_id");
  if (erroMembros) throw erroMembros;
  const vendedorMembro = membros!.find((m) => m.user_id === vendedor.id)!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresaId).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresaId, nome: "Cliente mensal" }).select("id").single();
  const { data: neg, error: erroNeg } = await servico
    .from("negocios")
    .insert({ empresa_id: empresaId, titulo: "Negócio mensal", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: vendedorMembro, valor: 30000 })
    .select("id")
    .single();
  if (erroNeg) throw erroNeg;
  negocioId = neg.id;
});

const curvaDaEmpresa = async () =>
  (await servico.from("parametros_calculadora").select("curva_geracao_mensal").eq("empresa_id", empresaId).single()).data!.curva_geracao_mensal;
const gravarCurva = (u: Usuario, curva: (number | null)[] | null) =>
  u.cliente.from("parametros_calculadora").update({ curva_geracao_mensal: curva as number[] | null }).eq("empresa_id", empresaId).select("curva_geracao_mensal");
const gravarConsumo = (u: Usuario, consumo: (number | null)[] | null) =>
  u.cliente.from("negocios").update({ consumo_mensal_kwh: consumo as number[] | null }).eq("id", negocioId).select("consumo_mensal_kwh");

describe("curva de geração da empresa", () => {
  it("o admin grava 12 valores positivos e pode apagar", async () => {
    const { data, error } = await gravarCurva(admin, CURVA);
    expect(error).toBeNull();
    expect(data![0]!.curva_geracao_mensal!.map(Number)).toEqual(CURVA);
    expect((await gravarCurva(admin, null)).error).toBeNull();
    expect(await curvaDaEmpresa()).toBeNull();
  });

  it("recusa curva sem 12 valores, com zero ou com nulo", async () => {
    expect((await gravarCurva(admin, CURVA.slice(0, 11))).error?.message).toMatch(/curva_geracao_mensal_ck/);
    expect((await gravarCurva(admin, [0, ...CURVA.slice(1)])).error?.message).toMatch(/curva_geracao_mensal_ck/);
    expect((await gravarCurva(admin, [null, ...CURVA.slice(1)])).error?.message).toMatch(/curva_geracao_mensal_ck/);
  });

  it("o vendedor não altera a curva", async () => {
    await gravarCurva(admin, CURVA);
    const { data } = await gravarCurva(vendedor, CURVA.map((v) => v + 1));
    expect(data ?? []).toHaveLength(0);
    expect((await curvaDaEmpresa())!.map(Number)).toEqual(CURVA);
  });

  it("gravar a curva não apaga a confirmação da produtividade", async () => {
    const { data: p } = await servico.from("parametros_calculadora").select("produtividade_kwh_kwp_mes").eq("empresa_id", empresaId).single();
    const { error } = await admin.cliente.rpc("confirmar_produtividade_calculadora", {
      p_empresa_id: empresaId,
      p_valor: Number(p!.produtividade_kwh_kwp_mes),
      p_fonte: "Geração real das usinas",
      p_responsavel: "Eng. Teste",
    });
    expect(error).toBeNull();
    await gravarCurva(admin, CURVA.map((v) => v * 2));
    const { data } = await servico.from("parametros_calculadora").select("produtividade_confirmada_em").eq("empresa_id", empresaId).single();
    expect(data!.produtividade_confirmada_em).not.toBeNull();
  });
});

describe("consumo dos 12 meses do negócio", () => {
  it("o responsável grava 12 valores, com zero", async () => {
    const consumo = [0, ...CONSUMO.slice(1)];
    const { data, error } = await gravarConsumo(vendedor, consumo);
    expect(error).toBeNull();
    expect(data![0]!.consumo_mensal_kwh!.map(Number)).toEqual(consumo);
  });

  it("recusa negativo, 13 valores e nulo no meio", async () => {
    expect((await gravarConsumo(vendedor, [-1, ...CONSUMO.slice(1)])).error?.message).toMatch(/consumo_mensal_kwh_ck/);
    expect((await gravarConsumo(vendedor, [...CONSUMO, 700])).error?.message).toMatch(/consumo_mensal_kwh_ck/);
    expect((await gravarConsumo(vendedor, [null, ...CONSUMO.slice(1)])).error?.message).toMatch(/consumo_mensal_kwh_ck/);
  });
});
