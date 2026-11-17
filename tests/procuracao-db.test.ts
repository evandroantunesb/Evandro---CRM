/**
 * Procuração (20261212100000_procuracao.sql): modelo por empresa com as regras do modelo de contrato, item do checklist
 * da Copel marcado com `gera_procuracao` e `dados_procuracao_obra`, que entrega à Engenharia só os dados que a
 * procuração usa (sem valor, e-mail nem telefones). Precisa do Supabase local. Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { anexarDocumentosContrato, CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let engenheiro: Usuario;
let comprador: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
let obra: string;
const membro: Record<string, string> = {};

async function darSetor(quem: Usuario, setor: string) {
  const { error } = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[quem.id],
    p_setores: [{ setor, capacidade: "executar" }] as never,
  });
  if (error) throw error;
}

async function venderAteObra(): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente procuração ${sufixo}` })
    .select("id")
    .single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: empresa,
      titulo: `Procuração ${sufixo}`,
      contato_id: c!.id,
      funil_id: f!.id,
      etapa_id: et!.id,
      responsavel_id: membro[vendedor.id],
      valor: 30000,
      unidade_consumidora: "58213907",
    })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato, error: e2 } = await vendedor.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (e2) throw e2;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const pago = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (pago.error) throw pago.error;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const temModelo = async (quem: Usuario, emp = empresa) => {
  const { data, error } = await quem.cliente.rpc("tem_modelo_procuracao", { p_empresa_id: emp });
  if (error) throw error;
  return data;
};

beforeAll(async () => {
  [admin, vendedor, engenheiro, comprador, adminB] = await Promise.all(
    ["proc-admin", "proc-vendedor", "proc-eng", "proc-comprador", "proc-admin-b"].map(criarUsuario),
  );
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Procuração A ${sufixo}` }, { nome: `Procuração B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  [empresa, empresaB] = [emps![0].id, emps![1].id];
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: empresa, user_id: engenheiro.id, papel: "operacao" },
    { empresa_id: empresa, user_id: comprador.id, papel: "operacao" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
  const { data: ms } = await servico.from("empresa_membros").select("id, user_id").in("empresa_id", [empresa, empresaB]);
  for (const m of ms ?? []) membro[m.user_id] = m.id;
  await darSetor(engenheiro, "engenharia");
  await darSetor(comprador, "compras");
  obra = await venderAteObra();
  const { error: eP } = await admin.cliente.rpc("atribuir_participante_obra", {
    p_obra_id: obra,
    p_membro_id: membro[engenheiro.id],
    p_setor: "engenharia",
    p_funcao: "responsavel",
    p_principal: true,
  });
  if (eP) throw eP;
});

describe("modelo de procuração", () => {
  it("sem modelo, tem_modelo_procuracao é falso", async () => {
    expect(await temModelo(admin)).toBe(false);
  });

  it("modelo só com espaços não conta", async () => {
    const { error } = await admin.cliente.from("modelos_procuracao").upsert({ empresa_id: empresa, conteudo: "   \n " });
    expect(error).toBeNull();
    expect(await temModelo(engenheiro)).toBe(false);
  });

  it("admin grava o modelo; vendedor lê; operação não lê a tabela; admin de B não lê o de A", async () => {
    const texto = "OUTORGANTE: {{cliente_nome}}, UC {{negocio_uc}}. VALOR {{negocio_valor}} TEL {{cliente_telefone}}";
    const { error } = await admin.cliente.from("modelos_procuracao").upsert({ empresa_id: empresa, conteudo: texto });
    expect(error).toBeNull();
    expect((await vendedor.cliente.from("modelos_procuracao").select("conteudo").eq("empresa_id", empresa)).data).toEqual([{ conteudo: texto }]);
    expect((await engenheiro.cliente.from("modelos_procuracao").select("conteudo").eq("empresa_id", empresa)).data).toEqual([]);
    expect((await adminB.cliente.from("modelos_procuracao").select("conteudo").eq("empresa_id", empresa)).data).toEqual([]);
    expect(await temModelo(engenheiro)).toBe(true);
  });

  it("vendedor não grava o modelo", async () => {
    const { data } = await vendedor.cliente.from("modelos_procuracao").update({ conteudo: "outro" }).eq("empresa_id", empresa).select("empresa_id");
    expect(data ?? []).toEqual([]);
  });

  it("quem não é da empresa recebe falso em tem_modelo_procuracao", async () => {
    expect(await temModelo(adminB)).toBe(false);
  });
});

describe("item do checklist que gera a procuração", () => {
  it("empresa nova nasce com o item da procuração marcado, e só ele", async () => {
    const { data } = await servico.from("engenharia_checklist_modelo").select("titulo").eq("empresa_id", empresa).eq("gera_procuracao", true);
    expect(data).toEqual([{ titulo: "Procuração no modelo da Engenharia, com os documentos do cliente" }]);
  });

  it("item renomeado continua marcado", async () => {
    const { data: item } = await servico.from("engenharia_checklist_modelo").select("id").eq("empresa_id", empresa).eq("gera_procuracao", true).single();
    const { error } = await servico.from("engenharia_checklist_modelo").update({ titulo: "Procuração do titular" }).eq("id", item!.id);
    expect(error).toBeNull();
    const { data } = await servico.from("engenharia_checklist_modelo").select("gera_procuracao").eq("id", item!.id).single();
    expect(data!.gera_procuracao).toBe(true);
  });
});

describe("dados da procuração para a Engenharia", () => {
  it("engenheiro participante recebe os dados, sem valor, e-mail nem telefone", async () => {
    const { data, error } = await engenheiro.cliente.rpc("dados_procuracao_obra", { p_obra_id: obra });
    expect(error).toBeNull();
    const d = data as { modelo: string; empresa_id: string; empresa: Record<string, unknown>; negocio: Record<string, unknown>; contato: Record<string, unknown> };
    expect(d.modelo).toContain("{{cliente_nome}}");
    expect(d.empresa_id).toBe(empresa);
    expect(Object.keys(d.contato).sort()).toEqual(["cidade", "documento", "endereco", "inscricao_estadual", "nome", "rg", "uf"]);
    expect(Object.keys(d.negocio).sort()).toEqual(["consumo_medio_kwh", "numero", "qualif_distribuidora", "titulo", "unidade_consumidora"]);
    expect(Object.keys(d.empresa).sort()).toEqual(["cnpj", "nome"]);
    expect(d.negocio.unidade_consumidora).toBe("58213907");
    expect(d.contato.nome).toBe(`Cliente procuração ${sufixo}`);
  });

  it("quem é de Compras (sem a Engenharia da obra) é recusado", async () => {
    const { error } = await comprador.cliente.rpc("dados_procuracao_obra", { p_obra_id: obra });
    expect(error?.code).toBe("42501");
  });

  it("admin de outra empresa é recusado", async () => {
    const { error } = await adminB.cliente.rpc("dados_procuracao_obra", { p_obra_id: obra });
    expect(error?.code).toBe("42501");
  });
});
