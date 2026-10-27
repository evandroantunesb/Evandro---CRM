/** Distribuição automática de responsáveis na criação de Obras. Usa Supabase local. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let compras: Usuario;
let comprasNovo: Usuario;
let engenharia: Usuario;
let operacional: Usuario;
let externo: Usuario;
let empresa: string;
const membro = new Map<string, string>();

async function criarObra(titulo: string) {
  const { data: funil } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: etapa } = await servico.from("etapas").select("id").eq("funil_id", funil!.id).eq("inicial", true).single();
  const { data: contato } = await servico.from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente ${titulo} ${sufixo}` }).select("id").single();
  const { data: negocio, error } = await servico.from("negocios").insert({
    empresa_id: empresa, titulo, contato_id: contato!.id,
    funil_id: funil!.id, etapa_id: etapa!.id, responsavel_id: membro.get(vendedor.id)!, valor: 30000,
  }).select("id").single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await vendedor.cliente.from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocio!.id, conteudo: "Contrato de teste" }).select("id").single();
  if (erroContrato) throw erroContrato;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const confirmado = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (confirmado.error) throw confirmado.error;
  const { data: obra, error: erroObra } = await servico.from("obras")
    .select("id").eq("negocio_id", negocio!.id).single();
  if (erroObra) throw erroObra;
  return obra!.id;
}

const definir = (ator: Usuario, setor: "compras" | "engenharia" | "operacional", alvo: string | null) =>
  ator.cliente.rpc("definir_responsavel_padrao_obra", {
    p_empresa_id: empresa, p_setor: setor, p_membro_id: alvo as string,
  });

beforeAll(async () => {
  [admin, vendedor, compras, comprasNovo, engenharia, operacional, externo] = await Promise.all(
    ["ro-admin", "ro-vendedor", "ro-compras", "ro-compras-novo", "ro-engenharia", "ro-operacional", "ro-externo"].map(criarUsuario),
  );
  const { data: e, error } = await servico.from("empresas").insert({ nome: `Roteamento ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = e!.id;
  const { data: membros, error: erroMembros } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: empresa, user_id: compras.id, papel: "operacao" },
    { empresa_id: empresa, user_id: comprasNovo.id, papel: "operacao" },
    { empresa_id: empresa, user_id: engenharia.id, papel: "operacao" },
    { empresa_id: empresa, user_id: operacional.id, papel: "operacao" },
  ]).select("id, user_id");
  if (erroMembros) throw erroMembros;
  for (const m of membros!) membro.set(m.user_id, m.id);
  for (const [usuario, setor] of [
    [compras, "compras"], [comprasNovo, "compras"], [engenharia, "engenharia"], [operacional, "operacional"],
  ] as const) {
    const resultado = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro.get(usuario.id)!, p_setores: [{ setor, capacidade: "executar" }],
    });
    if (resultado.error) throw resultado.error;
  }
});

describe("responsáveis padrão das obras", () => {
  it("só admin configura membro ativo do setor da mesma empresa", async () => {
    expect((await definir(vendedor, "compras", membro.get(compras.id)!)).error).toBeTruthy();
    expect((await definir(externo, "compras", membro.get(compras.id)!)).error).toBeTruthy();
    expect((await definir(admin, "compras", membro.get(engenharia.id)!)).error?.message)
      .toContain("acesso a este setor");
    expect((await definir(admin, "compras", membro.get(compras.id)!)).error).toBeNull();
    expect((await definir(admin, "engenharia", membro.get(engenharia.id)!)).error).toBeNull();
    expect((await definir(admin, "operacional", membro.get(operacional.id)!)).error).toBeNull();
    expect((await vendedor.cliente.from("empresa_responsaveis_obra_padrao").select("setor").eq("empresa_id", empresa)).data).toEqual([]);
    expect((await admin.cliente.from("empresa_responsaveis_obra_padrao").select("setor").eq("empresa_id", empresa)).data).toHaveLength(3);
  });

  it("atribui os três responsáveis uma vez, após pago e assinado", async () => {
    const obra = await criarObra("Obra roteada");
    const { data: participantes } = await admin.cliente.from("obra_participantes")
      .select("setor, membro_id, principal").eq("obra_id", obra).neq("setor", "comercial");
    expect(participantes).toEqual(expect.arrayContaining([
      { setor: "compras", membro_id: membro.get(compras.id), principal: true },
      { setor: "engenharia", membro_id: membro.get(engenharia.id), principal: true },
      { setor: "operacional", membro_id: membro.get(operacional.id), principal: true },
    ]));
    expect(participantes).toHaveLength(3);
    const { data: historico } = await admin.cliente.from("obra_historico")
      .select("tipo, dados").eq("obra_id", obra).eq("tipo", "participante_atribuido");
    expect(historico).toHaveLength(3);
    expect(historico?.every((h) => h.dados && typeof h.dados === "object" && "origem" in h.dados && h.dados.origem === "padrao_empresa")).toBe(true);
    expect((await compras.cliente.rpc("obras_operacao", { p_obra_id: obra })).data).toHaveLength(1);
    expect((await engenharia.cliente.rpc("obras_operacao", { p_obra_id: obra })).data).toHaveLength(1);
  });

  it("nova configuração afeta só obras futuras; remoção de setor limpa o padrão", async () => {
    expect((await definir(admin, "compras", membro.get(comprasNovo.id)!)).error).toBeNull();
    const segunda = await criarObra("Nova pessoa em Compras");
    const { data: atual } = await admin.cliente.from("obra_participantes")
      .select("membro_id").eq("obra_id", segunda).eq("setor", "compras").eq("principal", true).single();
    expect(atual?.membro_id).toBe(membro.get(comprasNovo.id));
    const retirarSetor = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro.get(comprasNovo.id)!, p_setores: [],
    });
    expect(retirarSetor.error).toBeNull();
    const { data: padrao } = await admin.cliente.from("empresa_responsaveis_obra_padrao")
      .select("membro_id").eq("empresa_id", empresa).eq("setor", "compras");
    expect(padrao).toEqual([]);
    const terceira = await criarObra("Sem padrão em Compras");
    const { data: participantes } = await admin.cliente.from("obra_participantes")
      .select("membro_id").eq("obra_id", terceira).eq("setor", "compras");
    expect(participantes).toEqual([]);
  });
});
