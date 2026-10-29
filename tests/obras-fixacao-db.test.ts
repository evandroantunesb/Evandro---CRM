/**
 * Obras — fixação do telhado (20261029150000_obras_fixacao_telhado.sql): lista da empresa
 * (`fixacoes_telhado`, só admin escreve, sem DELETE), lista inicial para empresa nova e a escolha
 * na obra pela RPC `definir_fixacao_obra` (Engenharia, Compras ou Operacional; obra cancelada não
 * aceita; histórico com autor real). Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Fixação A/B" + sufixo, usuários "of-*" + sufixo). Os testes seguem em ordem:
 * cada um parte da escolha que o anterior deixou.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let coordEng: Usuario;
let execCompras: Usuario;
let opSemObra: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let gancho: string;
let trilho: string;
let opcaoDeB: string;

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: emp, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[responsavel.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await responsavel.cliente
    .from("contratos")
    .insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (erroContrato) throw erroContrato;
  const assinado = await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (erroPagamento) throw erroPagamento;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const definir = (quem: Usuario, fixacao?: string) =>
  quem.cliente.rpc("definir_fixacao_obra", { p_obra_id: obra, ...(fixacao ? { p_fixacao_id: fixacao } : {}) });

async function escolha() {
  const { data } = await servico.from("obra_fixacao").select("fixacao_id").eq("obra_id", obra).maybeSingle();
  return data?.fixacao_id ?? null;
}

async function historico() {
  const { data } = await servico
    .from("obra_historico")
    .select("setor, autor_membro_id, dados")
    .eq("obra_id", obra)
    .eq("tipo", "fixacao_definida")
    .order("id");
  return data!;
}

describe("Obras: fixação do telhado (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, coordEng, execCompras, opSemObra, adminB] = await Promise.all(
      ["of-admin", "of-gestor", "of-vendedor", "of-coord-eng", "of-exec-compras", "of-op-sem-obra", "of-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Fixação A ${sufixo}` }, { nome: `Fixação B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordEng, empresa, operacao],
      [execCompras, empresa, operacao],
      [opSemObra, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    const setores: [Usuario, unknown][] = [
      [coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [execCompras, [{ setor: "compras", capacidade: "executar" }]],
      [opSemObra, [{ setor: "operacional", capacidade: "executar" }]],
    ];
    for (const [alvo, s] of setores) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    obra = await criarVenda(empresa, vendedor, admin, `Fixação ${sufixo}`);
    const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
      p_obra_id: obra,
      p_membro_id: membro[execCompras.id],
      p_setor: "compras",
      p_funcao: "apoio",
      p_principal: false,
    });
    if (e) throw e;
  });

  it("empresa nova já nasce com a lista inicial, ativa", async () => {
    const { data } = await servico.from("fixacoes_telhado").select("nome, ativa").eq("empresa_id", empresa);
    expect(data).toHaveLength(11);
    expect(data!.every((f) => f.ativa)).toBe(true);
    expect(data!.map((f) => f.nome)).toContain("Carport");
  });

  it("só o admin cria e edita; ninguém apaga; membros da empresa leem", async () => {
    const criada = await admin.cliente.from("fixacoes_telhado").insert({ empresa_id: empresa, nome: "Gancho teste" }).select("id").single();
    expect(criada.error).toBeNull();
    gancho = criada.data!.id;
    const outra = await admin.cliente.from("fixacoes_telhado").insert({ empresa_id: empresa, nome: "Trilho teste" }).select("id").single();
    trilho = outra.data!.id;
    const deB = await adminB.cliente.from("fixacoes_telhado").insert({ empresa_id: empresaB, nome: "Opção B" }).select("id").single();
    opcaoDeB = deB.data!.id;

    // Mesmo nome, outra caixa e espaços: duplicada.
    const duplicada = await admin.cliente.from("fixacoes_telhado").insert({ empresa_id: empresa, nome: "  gancho TESTE " });
    expect(duplicada.error?.code).toBe("23505");

    for (const quem of [gestor, vendedor, coordEng]) {
      const r = await quem.cliente.from("fixacoes_telhado").insert({ empresa_id: empresa, nome: `Não pode ${quem.email}` });
      expect(r.error).not.toBeNull();
      const u = await quem.cliente.from("fixacoes_telhado").update({ nome: "Trocado" }).eq("id", gancho).select("id");
      expect(u.data ?? []).toHaveLength(0);
    }
    // Admin de outra empresa não grava na lista desta.
    const deFora = await adminB.cliente.from("fixacoes_telhado").insert({ empresa_id: empresa, nome: "De fora" });
    expect(deFora.error).not.toBeNull();

    const apagar = await admin.cliente.from("fixacoes_telhado").delete().eq("id", trilho);
    expect(apagar.error).not.toBeNull();

    const lida = await coordEng.cliente.from("fixacoes_telhado").select("id").eq("id", gancho);
    expect(lida.data).toHaveLength(1);
    const deOutra = await adminB.cliente.from("fixacoes_telhado").select("id").eq("id", gancho);
    expect(deOutra.data).toHaveLength(0);
  });

  it("coordenador da Engenharia escolhe; histórico com setor e autor real", async () => {
    expect((await definir(coordEng, gancho)).error).toBeNull();
    expect(await escolha()).toBe(gancho);
    const h = await historico();
    expect(h).toHaveLength(1);
    expect(h[0].setor).toBe("engenharia");
    expect(h[0].autor_membro_id).toBe(membro[coordEng.id]);
    expect(h[0].dados).toMatchObject({ de: null, para: "Gancho teste", autorizacao: "coordenar" });
  });

  it("mesma opção de novo não grava nada", async () => {
    expect((await definir(coordEng, gancho)).error).toBeNull();
    expect(await historico()).toHaveLength(1);
  });

  it("participante ativo de Compras troca a opção", async () => {
    expect((await definir(execCompras, trilho)).error).toBeNull();
    expect(await escolha()).toBe(trilho);
    const h = await historico();
    expect(h[1].setor).toBe("compras");
    expect(h[1].dados).toMatchObject({ de: "Gancho teste", para: "Trilho teste", autorizacao: "executar" });
  });

  it("sem setor na obra (operação fora da obra, gestor, vendedor, outra empresa) não altera", async () => {
    for (const quem of [opSemObra, gestor, vendedor, adminB]) {
      const r = await definir(quem, gancho);
      expect(r.error?.code).toBe("42501");
    }
    expect(await escolha()).toBe(trilho);
  });

  it("opção de outra empresa ou desativada é recusada", async () => {
    expect((await definir(admin, opcaoDeB)).error?.code).toBe("23514");
    expect((await admin.cliente.from("fixacoes_telhado").update({ ativa: false }).eq("id", gancho)).error).toBeNull();
    expect((await definir(admin, gancho)).error?.code).toBe("23514");
    expect(await escolha()).toBe(trilho);
  });

  it("vendedor da venda lê a escolha; escrita direta é revogada", async () => {
    const lida = await vendedor.cliente.from("obra_fixacao").select("fixacao_id").eq("obra_id", obra);
    expect(lida.data).toEqual([{ fixacao_id: trilho }]);
    const direta = await admin.cliente.from("obra_fixacao").update({ fixacao_id: gancho }).eq("obra_id", obra);
    expect(direta.error).not.toBeNull();
  });

  it("sem opção limpa a escolha e registra", async () => {
    expect((await definir(admin)).error).toBeNull();
    expect(await escolha()).toBeNull();
    const h = await historico();
    expect(h[2].dados).toMatchObject({ de: "Trilho teste", para: null, autorizacao: "admin" });
  });

  it("obra pausada aceita; obra cancelada não aceita", async () => {
    await noBanco("update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1", [obra]);
    expect((await definir(coordEng, trilho)).error).toBeNull();
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1", [obra]);
    expect((await definir(coordEng)).error?.code).toBe("23514");
    expect(await escolha()).toBe(trilho);
  });
});
