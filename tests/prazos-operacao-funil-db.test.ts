/**
 * Prazos pela Operação e funil pelo gestor (20261124100000_prazos_operacao_funil_gestor.sql): o coordenador de cada
 * setor muda os prazos das etapas do setor; o do Operacional também a entrega contratada (padrão e de cada obra); o da
 * Engenharia também os prazos da Engenharia; quem só executa não muda nada. O gestor edita funis e etapas como o admin.
 * Precisa do Supabase local (roda no CI). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let coordCompras: Usuario;
let coordEng: Usuario;
let coordOp: Usuario;
let execOp: Usuario;
let adminB: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let obra: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

async function criarObra(titulo: string): Promise<string> {
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
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

/** Muda um prazo das etapas e devolve se a linha foi gravada (a RLS recusa sem erro, com zero linhas). */
async function mudarPrazo(quem: Usuario, chave: string, dias: number): Promise<boolean> {
  const { data, error } = await quem.cliente.from("obra_prazos_etapas").update({ dias_uteis: dias }).eq("empresa_id", empresa).eq("chave", chave).select("chave");
  if (error) throw error;
  return (data ?? []).length === 1;
}

async function mudarPrazoEngenharia(quem: Usuario, dias: number): Promise<boolean> {
  const { data, error } = await quem.cliente.from("engenharia_prazos").update({ dias_uteis: dias }).eq("empresa_id", empresa).eq("chave", "a_iniciar").select("chave");
  if (error) throw error;
  return (data ?? []).length === 1;
}

describe("prazos pela Operação e funil pelo gestor (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, coordCompras, coordEng, coordOp, execOp, adminB] = await Promise.all(
      ["po-admin", "po-gestor", "po-vendedor", "po-coord-compras", "po-coord-eng", "po-coord-op", "po-exec-op", "po-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = ok(
      await servico.from("empresas").insert([{ nome: `Prazos A ${sufixo}` }, { nome: `Prazos B ${sufixo}` }]).select("id, nome").order("nome"),
      "empresas",
    );
    empresa = empresas![0].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordCompras, empresa, { papel: "operacao" }],
      [coordEng, empresa, { papel: "operacao" }],
      [coordOp, empresa, { papel: "operacao" }],
      [execOp, empresa, { papel: "operacao" }],
      [adminB, empresas![1].id, { papel: "admin" }],
    ];
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, setor, capacidade] of [
      [coordCompras, "compras", "coordenar"],
      [coordEng, "engenharia", "coordenar"],
      [coordOp, "operacional", "coordenar"],
      [execOp, "operacional", "executar"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never }), `setor ${setor}`);
    }
    obra = await criarObra("Prazos");
  });

  it("prazos das etapas: cada coordenador muda os do seu setor; quem só executa e o vendedor, nenhum", async () => {
    expect(await mudarPrazo(coordCompras, "compra", 4)).toBe(true);
    expect(await mudarPrazo(coordCompras, "entrega_material", 6)).toBe(true);
    expect(await mudarPrazo(coordCompras, "projeto", 9)).toBe(false);
    expect(await mudarPrazo(coordEng, "projeto", 8)).toBe(true);
    expect(await mudarPrazo(coordEng, "vistoria", 3)).toBe(true);
    expect(await mudarPrazo(coordEng, "instalacao", 9)).toBe(false);
    expect(await mudarPrazo(coordOp, "instalacao", 5)).toBe(true);
    expect(await mudarPrazo(coordOp, "entrega_contratada", 70)).toBe(true);
    expect(await mudarPrazo(coordOp, "compra", 9)).toBe(false);
    for (const quem of [execOp, vendedor, adminB]) expect(await mudarPrazo(quem, "instalacao", 9), quem.email).toBe(false);
    // Admin e gestor continuam mudando todos.
    expect(await mudarPrazo(gestor, "homologacao", 12)).toBe(true);
    expect(await mudarPrazo(admin, "conexao", 4)).toBe(true);

    const { data } = await servico.from("obra_prazos_etapas").select("chave, dias_uteis").eq("empresa_id", empresa);
    const dias = Object.fromEntries((data ?? []).map((p) => [p.chave, p.dias_uteis]));
    expect(dias).toMatchObject({ compra: 4, entrega_material: 6, projeto: 8, vistoria: 3, instalacao: 5, entrega_contratada: 70, homologacao: 12, conexao: 4 });
  });

  it("prazos da Engenharia: o coordenador da Engenharia e o gestor mudam; os outros coordenadores, não", async () => {
    expect(await mudarPrazoEngenharia(coordEng, 3)).toBe(true);
    expect(await mudarPrazoEngenharia(gestor, 4)).toBe(true);
    for (const quem of [coordCompras, coordOp, execOp, vendedor]) expect(await mudarPrazoEngenharia(quem, 9), quem.email).toBe(false);
    const { data } = await servico.from("engenharia_prazos").select("dias_uteis").eq("empresa_id", empresa).eq("chave", "a_iniciar").single();
    expect(data!.dias_uteis).toBe(4);
  });

  it("entrega contratada da obra: o coordenador do Operacional ajusta; quem só executa e os outros coordenadores, não", async () => {
    const ajustar = (quem: Usuario, data: string) =>
      quem.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obra, p_data: data, p_motivo: "Cliente pediu para adiar" });
    for (const quem of [execOp, coordCompras, coordEng, vendedor]) expect((await ajustar(quem, "2099-01-10")).error?.code, quem.email).toBe("42501");
    ok(await ajustar(coordOp, "2099-01-10"), "coordenador do Operacional");
    ok(await ajustar(gestor, "2099-01-11"), "gestor");
    const { data } = await servico.from("obras").select("entrega_contratada").eq("id", obra).single();
    expect(data!.entrega_contratada).toBe("2099-01-11");
  });

  it("funil: o gestor cria funil, cria e edita etapas; o vendedor não", async () => {
    const { data: funil } = ok(await gestor.cliente.from("funis").insert({ empresa_id: empresa, nome: "Funil do gestor" }).select("id").single(), "funil");
    const { data: etapa } = ok(
      await gestor.cliente.from("etapas").insert({ empresa_id: empresa, funil_id: funil!.id, nome: "Primeiro contato", ordem: 1, inicial: true }).select("id").single(),
      "etapa",
    );
    const { data: editada } = ok(await gestor.cliente.from("etapas").update({ nome: "Contato feito", chance_fechamento: 10 }).eq("id", etapa!.id).select("nome"), "editar");
    expect(editada).toEqual([{ nome: "Contato feito" }]);

    expect((await vendedor.cliente.from("funis").insert({ empresa_id: empresa, nome: "Funil do vendedor" })).error?.code).toBe("42501");
    expect((await vendedor.cliente.from("etapas").insert({ empresa_id: empresa, funil_id: funil!.id, nome: "X", ordem: 2 })).error?.code).toBe("42501");
    expect((await vendedor.cliente.from("etapas").update({ nome: "Hackeado" }).eq("id", etapa!.id).select("id")).data ?? []).toEqual([]);
    expect((await adminB.cliente.from("etapas").update({ nome: "De fora" }).eq("id", etapa!.id).select("id")).data ?? []).toEqual([]);
  });
});
