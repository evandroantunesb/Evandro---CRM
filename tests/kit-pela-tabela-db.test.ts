/**
 * Compras, P4b (20261201100000_kit_pela_tabela.sql): kit ligado aos materiais, retrato do preço sugerido e do custo do
 * kit (só o servidor grava), materiais para o kit sem custo e o previsto de Equipamentos da obra pelo custo do kit.
 * Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Kit tabela A/B" + sufixo, usuários "ktb-*" + sufixo).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, anexarDocumentosContrato, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let comprador: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let modulo: string;
let moduloB: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

async function criarNegocio(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  return neg!.id;
}

describe("Compras: kit pela tabela de preços", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, comprador, adminB] = await Promise.all(["ktb-admin", "ktb-vendedor", "ktb-comprador", "ktb-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Kit tabela A ${sufixo}` }, { nome: `Kit tabela B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert([
          { empresa_id: empresa, user_id: admin.id, papel: "admin" },
          { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
          { empresa_id: empresa, user_id: comprador.id, papel: "operacao" },
          { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
        ] as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[comprador.id], p_setores: [{ setor: "compras", capacidade: "executar" }] as never }), "setor");
    modulo = ok(
      await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Módulo 550 W", p_categoria: "modulos", p_unidade: "un", p_potencia_w: 550 }),
      "módulo",
    ).data as string;
    ok(await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Estrutura", p_categoria: "estrutura", p_unidade: "un" }), "estrutura");
    ok(await comprador.cliente.rpc("lancar_preco_compra", { p_material_id: modulo, p_fornecedor: "Solar Sul", p_preco: 780, p_data: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) }), "preço");
    moduloB = ok(
      await adminB.cliente.rpc("criar_material_compra", { p_empresa_id: empresaB, p_nome: "Módulo B", p_categoria: "modulos", p_unidade: "un", p_potencia_w: 600 }),
      "módulo B",
    ).data as string;
  });

  it("materiais para o kit: quem é comercial vê nome, potência e se tem preço (sem custo); Compras e outra empresa não", async () => {
    const { data } = ok(await vendedor.cliente.rpc("materiais_para_kit", { p_empresa_id: empresa }), "vendedor");
    expect(data!.map((m) => [m.nome, m.potencia_w == null ? null : Number(m.potencia_w), m.tem_preco])).toEqual([
      ["Estrutura", null, false],
      ["Módulo 550 W", 550, true],
    ]);
    expect(Object.keys(data![0]).sort()).toEqual(["categoria", "data_preco", "id", "nome", "potencia_w", "tem_preco", "unidade"]);
    expect((await comprador.cliente.rpc("materiais_para_kit", { p_empresa_id: empresa })).data).toEqual([]);
    expect((await adminB.cliente.rpc("materiais_para_kit", { p_empresa_id: empresa })).data).toEqual([]);
    // O vendedor continua sem ler a tabela de preços.
    expect((await vendedor.cliente.from("compras_precos").select("preco").eq("empresa_id", empresa)).data).toEqual([]);
  });

  it("item do kit ligado ao material da própria empresa; preço à mão maior que zero", async () => {
    const negocio = await criarNegocio("Kit material");
    const base = { empresa_id: empresa, negocio_id: negocio, tipo: "modulo" as const, descricao: "Módulo", potencia_w: 550, quantidade: 10 };
    ok(await vendedor.cliente.from("kit_componentes").insert({ ...base, material_id: modulo }), "material da empresa");
    expect((await vendedor.cliente.from("kit_componentes").insert({ ...base, material_id: moduloB })).error).not.toBeNull();
    expect((await vendedor.cliente.from("kit_componentes").insert({ ...base, material_id: null, preco_venda_manual: 0 })).error).not.toBeNull();
    ok(await vendedor.cliente.from("kit_componentes").insert({ ...base, tipo: "outro", material_id: null, preco_venda_manual: 806 }), "preço à mão");
  });

  it("retrato: só o servidor grava; o vendedor vê o preço sugerido, não o custo; Compras vê o custo", async () => {
    const negocio = await criarNegocio("Retrato");
    expect((await vendedor.cliente.from("negocio_precificacao").insert({ negocio_id: negocio, empresa_id: empresa, preco_sugerido: 1 })).error).not.toBeNull();
    expect((await admin.cliente.from("negocio_custo_kit").insert({ negocio_id: negocio, empresa_id: empresa, custo_itens: 1 })).error).not.toBeNull();
    ok(await servico.from("negocio_precificacao").insert({ negocio_id: negocio, empresa_id: empresa, preco_sugerido: 22771.56 }), "precificação");
    ok(await servico.from("negocio_custo_kit").insert({ negocio_id: negocio, empresa_id: empresa, custo_itens: 15534 }), "custo");
    expect((await vendedor.cliente.from("negocio_precificacao").select("preco_sugerido").eq("negocio_id", negocio).single()).data?.preco_sugerido).toBe(22771.56);
    expect((await vendedor.cliente.from("negocio_custo_kit").select("custo_itens").eq("negocio_id", negocio)).data).toEqual([]);
    expect((await vendedor.cliente.from("negocio_precificacao").update({ preco_sugerido: 1 }).eq("negocio_id", negocio).select("negocio_id")).data ?? []).toEqual([]);
    expect((await comprador.cliente.from("negocio_custo_kit").select("custo_itens").eq("negocio_id", negocio).single()).data?.custo_itens).toBe(15534);
  });

  it("obra nova: previsto de Equipamentos = custo do kit pela tabela; sem retrato, o valor do kit", async () => {
    const comCusto = await criarNegocio("Obra com custo");
    const semCusto = await criarNegocio("Obra sem custo");
    ok(await servico.from("negocio_custo_kit").insert({ negocio_id: comCusto, empresa_id: empresa, custo_itens: 15534 }), "custo");
    const equipamentos = async (negocio: string) => {
      ok(await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: negocio, tipo: "modulo", descricao: "Módulo", potencia_w: 550, quantidade: 10 }), "kit");
      ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio), "ganho");
      await anexarDocumentosContrato(negocio);
      const { data: contrato } = ok(
        await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocio, conteudo: "Contrato de teste" }).select("id").single(),
        "contrato",
      );
      ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
      ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
      const { data: o } = await servico.from("obras").select("id").eq("negocio_id", negocio).single();
      const { data } = await servico.from("obra_orcamento").select("planejado").eq("obra_id", o!.id).eq("categoria", "equipamentos").single();
      return Number(data!.planejado);
    };
    expect(await equipamentos(comCusto)).toBe(15534);
    // Sem retrato de custo (e sem cálculo salvo), cai no valor do kit do cálculo; sem cálculo, zero (como antes).
    expect(await equipamentos(semCusto)).toBe(0);
  });
});
