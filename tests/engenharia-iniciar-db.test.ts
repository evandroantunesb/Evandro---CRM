/**
 * Engenharia — "Iniciar atuação" e fila de Novas obras (20261102100000_engenharia_iniciar_atuacao.sql): quem atua na
 * Engenharia vê a obra em curso sem responsável principal (sem o contato do cliente), assume com um clique (vira
 * responsável principal e a etapa vai para "Projeto em elaboração"), só um leva quando dois clicam juntos, a obra sai
 * da fila dos outros e ninguém fora da Engenharia (nem de outra empresa) inicia. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Iniciar A/B" + sufixo, usuários "ei-*" + sufixo). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let eng1: Usuario;
let eng2: Usuario;
let coordEng: Usuario;
let execCompras: Usuario;
let engB: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let obraCorrida: string;
let obraApoio: string;

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

const iniciar = (quem: Usuario, obraId: string) => quem.cliente.rpc("iniciar_atuacao_engenharia", { p_obra_id: obraId });
const ver = async (quem: Usuario, obraId: string) => {
  const { data, error } = await quem.cliente.rpc("obras_operacao", { p_obra_id: obraId });
  if (error) throw error;
  return data ?? [];
};
const principais = async (obraId: string) => {
  const { data } = await servico
    .from("obra_participantes")
    .select("membro_id, funcao")
    .eq("obra_id", obraId)
    .eq("setor", "engenharia")
    .eq("principal", true)
    .is("fim", null);
  return data!;
};
const etapa = async (obraId: string) => {
  const { data } = await servico.from("obra_fluxos").select("status").eq("obra_id", obraId).eq("setor", "engenharia").single();
  return data!.status;
};

describe("Engenharia: iniciar atuação (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, eng1, eng2, coordEng, execCompras, engB, adminB] = await Promise.all(
      ["ei-admin", "ei-gestor", "ei-vendedor", "ei-eng1", "ei-eng2", "ei-coord-eng", "ei-exec-compras", "ei-eng-b", "ei-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Iniciar A ${sufixo}` }, { nome: `Iniciar B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [eng1, empresa, operacao],
      [eng2, empresa, operacao],
      [coordEng, empresa, operacao],
      [execCompras, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
      [engB, empresaB, operacao],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    const setores: [Usuario, Usuario, unknown][] = [
      [admin, eng1, [{ setor: "engenharia", capacidade: "executar" }]],
      [admin, eng2, [{ setor: "engenharia", capacidade: "executar" }]],
      [admin, coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [admin, execCompras, [{ setor: "compras", capacidade: "executar" }]],
      [adminB, engB, [{ setor: "engenharia", capacidade: "executar" }]],
    ];
    for (const [quem, alvo, s] of setores) {
      const { error: e } = await quem.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    obra = await criarVenda(empresa, vendedor, admin, `Iniciar ${sufixo}`);
    obraCorrida = await criarVenda(empresa, vendedor, admin, `Iniciar corrida ${sufixo}`);
    obraApoio = await criarVenda(empresa, vendedor, admin, `Iniciar apoio ${sufixo}`);
  });

  it("a obra nova aparece para quem atua na Engenharia, sem o contato do cliente; Compras e outra empresa não veem", async () => {
    const [linha] = await ver(eng1, obra);
    expect(linha?.obra_id).toBe(obra);
    expect(linha?.cliente_nome).toBe(`Cliente Iniciar ${sufixo}`);
    expect(linha?.cliente_telefone).toBeNull();
    expect(await ver(eng2, obra)).toHaveLength(1);
    expect(await ver(execCompras, obra)).toHaveLength(0);
    expect(await ver(engB, obra)).toHaveLength(0);
    expect(await etapa(obra)).toBe("a_iniciar");
  });

  it("quem não atua na Engenharia da empresa não inicia: admin, gestor, vendedor, Compras e outra empresa", async () => {
    for (const quem of [admin, gestor, vendedor, execCompras, engB, adminB]) {
      const r = await iniciar(quem, obra);
      expect(r.error?.code, quem.email).toBe("42501");
    }
    expect(await principais(obra)).toHaveLength(0);
  });

  it("o engenheiro inicia: vira responsável principal, a etapa vai para Documentação e o contato do cliente aparece", async () => {
    const r = await iniciar(eng1, obra);
    expect(r.error).toBeNull();
    expect(await principais(obra)).toEqual([{ membro_id: membro[eng1.id], funcao: "responsavel" }]);
    expect(await etapa(obra)).toBe("projeto_em_elaboracao");
    const [linha] = await ver(eng1, obra);
    expect(linha?.cliente_telefone).toBe(CLIENTE_CONTRATO.telefone);

    const { data: historico } = await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra).eq("setor", "engenharia");
    expect(historico!.some((h) => h.tipo === "participante_atribuido" && (h.dados as { origem?: string }).origem === "iniciar_atuacao")).toBe(true);
    expect(historico!.some((h) => h.tipo === "fluxo_alterado" && (h.dados as { origem?: string }).origem === "iniciar_atuacao")).toBe(true);
  });

  it("depois de iniciada, sai da fila dos outros engenheiros e um segundo 'Iniciar' é recusado", async () => {
    expect(await ver(eng2, obra)).toHaveLength(0);
    const r = await iniciar(eng2, obra);
    expect(r.error?.message).toMatch(/já foi iniciada/);
    // O coordenador continua vendo todas as obras da empresa.
    expect(await ver(coordEng, obra)).toHaveLength(1);
  });

  it("dois cliques ao mesmo tempo: só um leva", async () => {
    const [a, b] = await Promise.all([iniciar(eng1, obraCorrida), iniciar(eng2, obraCorrida)]);
    expect([a.error, b.error].filter((e) => e === null)).toHaveLength(1);
    expect([a.error, b.error].find((e) => e !== null)?.message).toMatch(/já foi iniciada/);
    expect(await principais(obraCorrida)).toHaveLength(1);
  });

  it("quem já é responsável (não principal) na obra recebe a mensagem própria, e nada muda", async () => {
    const { error } = await admin.cliente.rpc("atribuir_participante_obra", {
      p_obra_id: obraApoio,
      p_membro_id: membro[eng2.id],
      p_setor: "engenharia",
      p_funcao: "responsavel",
      p_principal: false,
    });
    if (error) throw error;
    const r = await iniciar(eng2, obraApoio);
    expect(r.error?.message).toMatch(/já está nesta obra como responsável/);
    expect(await principais(obraApoio)).toHaveLength(0);
    expect(await etapa(obraApoio)).toBe("a_iniciar");
  });
});
