/**
 * OPR 2 — detalhe da obra com RLS REAL (Supabase local, roda no CI). Chama o mesmo
 * `carregarDetalheObra` da página com o cliente autenticado de cada papel e confere o que
 * cada um recebe: acesso (404 = null), valor vendido, contato do cliente por setor, link do
 * negócio e participantes comerciais. Nenhuma regra nova: valida a #145/#148/#149 através
 * da camada de visualização.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const PESSOAIS = {
  documento: "123.456.789-09",
  telefone: "(62) 96666-0001",
  endereco: "Rua do Detalhe, 77",
  email: "cliente-detalhe@segredo.test",
};

let admin: Usuario;
let gestor: Usuario;
let gestorFora: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let sdr: Usuario;
let opOperacional: Usuario;
let opEngenharia: Usuario;
let opCompras: Usuario;
let opSemParticipacao: Usuario;
let adminB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let obraDeB: string;

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string) {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico
    .from("contatos")
    .insert({ empresa_id: emp, nome: `Cliente ${titulo}`, cidade: "Goiânia", uf: "GO", ...PESSOAIS })
    .select("id")
    .single();
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

beforeAll(async () => {
  [admin, gestor, gestorFora, vendedor, vendedor2, sdr, opOperacional, opEngenharia, opCompras, opSemParticipacao, adminB, vendedorB] = await Promise.all(
    ["od-admin", "od-gestor", "od-gestor-fora", "od-vendedor", "od-vendedor2", "od-sdr", "od-op-operacional", "od-op-engenharia", "od-op-compras", "od-op-sem", "od-admin-b", "od-vendedor-b"].map(
      criarUsuario,
    ),
  );
  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Detalhe A ${sufixo}` }, { nome: `Detalhe B ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => e.nome.startsWith("Detalhe A"))!.id;
  empresaB = emps!.find((e) => e.nome.startsWith("Detalhe B"))!.id;

  const closer = { papel: "vendedor", perfil_gamificacao: "closer" };
  const vinculos: [Usuario, string, object][] = [
    [admin, empresa, { papel: "admin" }],
    [gestor, empresa, { papel: "gestor" }],
    [gestorFora, empresa, { papel: "gestor" }],
    [vendedor, empresa, closer],
    [vendedor2, empresa, closer],
    [sdr, empresa, { papel: "sdr", perfil_gamificacao: "sdr" }],
    ...[opOperacional, opEngenharia, opCompras, opSemParticipacao].map((u): [Usuario, string, object] => [u, empresa, { papel: "operacao" }]),
    [adminB, empresaB, { papel: "admin" }],
    [vendedorB, empresaB, closer],
  ];
  const { data: linhas, error } = await servico
    .from("empresa_membros")
    .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
    .select("id, user_id");
  if (error) throw error;
  for (const l of linhas!) membro[l.user_id] = l.id;

  // Gestor da equipe do vendedor (gestorFora não tem equipe).
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe detalhe" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);

  // Setores (admin) e obras pelo mecanismo real.
  for (const [alvo, setor] of [
    [opOperacional, "operacional"],
    [opEngenharia, "engenharia"],
    [opCompras, "compras"],
    [opSemParticipacao, "engenharia"],
  ] as const) {
    const { error: e } = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro[alvo.id],
      p_setores: [{ setor, capacidade: "executar" }] as never,
    });
    if (e) throw e;
  }
  obra = await criarVenda(empresa, vendedor, admin, "Obra detalhe");
  obraDeB = await criarVenda(empresaB, vendedorB, adminB, "Obra B");

  // Participantes operacionais (admin, pela RPC da 3b-3).
  for (const [alvo, setor] of [
    [opOperacional, "operacional"],
    [opEngenharia, "engenharia"],
    [opCompras, "compras"],
  ] as const) {
    const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
      p_obra_id: obra,
      p_membro_id: membro[alvo.id],
      p_setor: setor,
      p_funcao: "responsavel",
      p_principal: true,
    });
    if (e) throw e;
  }
});

const detalhe = (usuario: Usuario, papel: string, obraId = obra, empresaId = empresa) =>
  carregarDetalheObra(usuario.cliente as unknown as SupabaseServidor, { empresaId, papel, obraId });

function semPessoais(vm: unknown, exceto: string[] = []) {
  const json = JSON.stringify(vm);
  for (const [chave, valor] of Object.entries(PESSOAIS)) {
    if (!exceto.includes(chave)) expect(json, chave).not.toContain(valor);
  }
  expect(json).not.toContain("snapshot");
}

describe("detalhe da obra com RLS real", () => {
  it("admin, vendedor da venda e gestor da equipe: obra, valor vendido e link do negócio; sem contato do cliente", async () => {
    for (const [usuario, papel] of [
      [admin, "admin"],
      [vendedor, "vendedor"],
      [gestor, "gestor"],
    ] as const) {
      const vm = await detalhe(usuario, papel);
      expect(vm, papel).not.toBeNull();
      expect(vm!.valorVendido, papel).toBe(30000);
      expect(vm!.resumo.negocioId, papel).not.toBeNull();
      expect(vm!.contatoCliente, papel).toBeNull();
      expect(vm!.participantesComerciais.map((p) => p.principal), papel).toContain(true);
      semPessoais(vm);
    }
  });

  it("outro vendedor, gestor fora da equipe e SDR que não originou a venda: 404", async () => {
    for (const [usuario, papel] of [
      [vendedor2, "vendedor"],
      [gestorFora, "gestor"],
      [sdr, "sdr"],
    ] as const) {
      expect(await detalhe(usuario, papel), papel).toBeNull();
    }
  });

  it("operacao participante do operacional: endereço e telefone; sem documento, valor ou negócio", async () => {
    const vm = await detalhe(opOperacional, "operacao");
    expect(vm).not.toBeNull();
    expect(vm!.contatoCliente).toMatchObject({ endereco: PESSOAIS.endereco, telefone: PESSOAIS.telefone, documento: null });
    expect(vm!.valorVendido).toBeNull();
    expect(vm!.resumo.negocioId).toBeNull();
    semPessoais(vm, ["endereco", "telefone"]);
  });

  it("operacao participante da engenharia: endereço e documento; sem telefone", async () => {
    const vm = await detalhe(opEngenharia, "operacao");
    expect(vm!.contatoCliente).toMatchObject({ endereco: PESSOAIS.endereco, documento: PESSOAIS.documento, telefone: null, telefone2: null });
    semPessoais(vm, ["endereco", "documento"]);
  });

  it("operacao participante de compras: sem contato do cliente", async () => {
    const vm = await detalhe(opCompras, "operacao");
    expect(vm).not.toBeNull();
    expect(vm!.contatoCliente).toBeNull();
    semPessoais(vm);
  });

  it("operacao vê vendedor/SDR da obra (só nome e função), como a RLS da #148 libera", async () => {
    const vm = await detalhe(opOperacional, "operacao");
    expect(vm!.participantesComerciais.length).toBeGreaterThan(0);
    expect(JSON.stringify(vm!.participantesComerciais)).not.toContain(membro[vendedor.id]);
  });

  it("operacao com setor mas sem participação: 404", async () => {
    expect(await detalhe(opSemParticipacao, "operacao")).toBeNull();
  });

  it("obra de outra empresa: 404, mesmo para admin", async () => {
    expect(await detalhe(admin, "admin", obraDeB)).toBeNull();
    expect(await detalhe(opOperacional, "operacao", obraDeB)).toBeNull();
  });
});
