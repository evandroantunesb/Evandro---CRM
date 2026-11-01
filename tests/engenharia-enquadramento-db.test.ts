/**
 * Engenharia — enquadramento e checklist condicional (20261101120000_engenharia_enquadramento.sql): ficha só por RPC
 * (quem atua na Engenharia), respostas validadas, leitura por quem vê a obra, condições no modelo (só admin, validadas),
 * aplicar só o que vale e reconciliação ao salvar a ficha (entra o que passou a valer; pendente que deixou de valer
 * vira "não se aplica" e volta se valer de novo; dispensa da equipe não muda). Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Enquadramento A/B" + sufixo, usuários "eq-*" + sufixo). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let execEng: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let procuracao: string;
let licenca: string;

const BASE = {
  tipo_solicitacao: "nova_conexao",
  categoria: "micro",
  faixa_formulario: "ate_10kw",
  tipo_instalacao: "telhado",
  modalidade_scee: "local",
  titularidade: "pf",
  obra_rede: "nao",
  inversor_verificado: "sim",
  situacao_ambiental: "dispensa",
};

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

const salvar = (quem: Usuario, respostas: Record<string, unknown>) =>
  quem.cliente.rpc("salvar_enquadramento_engenharia", { p_obra_id: obra, p_respostas: respostas as never });

async function item(modeloId: string) {
  const { data } = await servico.from("obra_engenharia_itens").select("status, motivo, pelo_enquadramento").eq("obra_id", obra).eq("modelo_id", modeloId).maybeSingle();
  return data;
}

async function historico(tipo: string) {
  const { data } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", tipo).order("id");
  return data!.map((h) => h.dados as Record<string, unknown>);
}

describe("Engenharia: enquadramento e checklist condicional (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, execEng, adminB] = await Promise.all(["eq-admin", "eq-vendedor", "eq-exec-eng", "eq-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Enquadramento A ${sufixo}` }, { nome: `Enquadramento B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [execEng, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    const s = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro[execEng.id],
      p_setores: [{ setor: "engenharia", capacidade: "executar" }] as never,
    });
    if (s.error) throw s.error;

    obra = await criarVenda(empresa, vendedor, admin, `Enquadramento ${sufixo}`);
    const p = await admin.cliente.rpc("atribuir_participante_obra", {
      p_obra_id: obra,
      p_membro_id: membro[execEng.id],
      p_setor: "engenharia",
      p_funcao: "apoio",
      p_principal: false,
    });
    if (p.error) throw p.error;

    const { data: modelo } = await servico.from("engenharia_checklist_modelo").select("id, titulo").eq("empresa_id", empresa);
    procuracao = modelo!.find((m) => m.titulo.startsWith("Procuração"))!.id;
    licenca = modelo!.find((m) => m.titulo.startsWith("Licença ambiental"))!.id;
  });

  it("condições no modelo: só o admin grava, e só perguntas e respostas conhecidas", async () => {
    const ok = await admin.cliente.from("engenharia_checklist_modelo").update({ condicoes: { titularidade: ["terceiro_procuracao"] } }).eq("id", procuracao).select("id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    const ok2 = await admin.cliente.from("engenharia_checklist_modelo").update({ condicoes: { situacao_ambiental: ["licenca", "verificar"] } }).eq("id", licenca);
    expect(ok2.error).toBeNull();

    for (const ruim of [{ cor: ["azul"] }, { titularidade: ["inventada"] }, { titularidade: [] }, { titularidade: "pf" }, []]) {
      const r = await admin.cliente.from("engenharia_checklist_modelo").update({ condicoes: ruim as never }).eq("id", procuracao);
      expect(r.error?.code, JSON.stringify(ruim)).toBe("23514");
    }
    const doExecutor = await execEng.cliente.from("engenharia_checklist_modelo").update({ condicoes: {} }).eq("id", procuracao).select("id");
    expect(doExecutor.data ?? []).toHaveLength(0);
  });

  it("ficha: só quem atua na Engenharia grava; respostas validadas; leitura por quem vê a obra", async () => {
    expect((await salvar(vendedor, BASE)).error?.code).toBe("42501");
    expect((await salvar(adminB, BASE)).error?.code).toBe("42501");
    expect((await salvar(execEng, { ...BASE, titularidade: "inventada" })).error?.message).toMatch(/Resposta inválida/);
    expect((await salvar(execEng, { ...BASE, cor: "azul" })).error?.message).toMatch(/Pergunta desconhecida/);
    expect((await salvar(execEng, { ...BASE, potencia_modulos_kwp: -1 })).error?.message).toMatch(/Potência inválida/);
    expect((await salvar(execEng, { ...BASE, situacao_ambiental: "nao_aplicavel" })).error?.message).toMatch(/Explique/);

    expect((await salvar(execEng, { ...BASE, potencia_modulos_kwp: 8.68 })).error).toBeNull();
    const direto = await admin.cliente.from("obra_engenharia_enquadramento").update({ titularidade: "pj" }).eq("obra_id", obra).select("obra_id");
    expect(direto.data ?? []).toHaveLength(0);

    const { data: lido } = await vendedor.cliente.from("obra_engenharia_enquadramento").select("titularidade, potencia_modulos_kwp").eq("obra_id", obra).single();
    expect(lido).toEqual({ titularidade: "pf", potencia_modulos_kwp: 8.68 });
    const { data: deFora } = await adminB.cliente.from("obra_engenharia_enquadramento").select("obra_id").eq("obra_id", obra);
    expect(deFora).toEqual([]);

    // Histórico com as perguntas alteradas, sem os valores.
    const [h] = await historico("enquadramento_engenharia_salvo");
    expect(h.campos).toEqual(expect.arrayContaining(["titularidade", "potencia_modulos_kwp"]));
    expect(JSON.stringify(h)).not.toContain("8.68");

    // Salvar igual não grava de novo.
    expect((await salvar(execEng, { ...BASE, potencia_modulos_kwp: 8.68 })).error).toBeNull();
    expect(await historico("enquadramento_engenharia_salvo")).toHaveLength(1);
  });

  it("aplicar copia só os itens que valem para a ficha", async () => {
    expect((await execEng.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra })).error).toBeNull();
    expect(await item(procuracao)).toBeNull();
    expect(await item(licenca)).toBeNull();
    const { count } = await servico.from("obra_engenharia_itens").select("id", { count: "exact", head: true }).eq("obra_id", obra);
    expect(count).toBe(9);
  });

  it("salvar a ficha reconcilia: entra o que passou a valer; pendente que deixou de valer sai e volta", async () => {
    expect((await salvar(execEng, { ...BASE, titularidade: "terceiro_procuracao" })).error).toBeNull();
    expect(await item(procuracao)).toEqual({ status: "pendente", motivo: null, pelo_enquadramento: false });

    expect((await salvar(execEng, BASE)).error).toBeNull();
    expect(await item(procuracao)).toEqual({ status: "dispensado", motivo: "Fora do enquadramento", pelo_enquadramento: true });
    const alterados = await historico("item_engenharia_alterado");
    expect(alterados.at(-1)).toMatchObject({ para: "dispensado", motivo: "Fora do enquadramento", origem: "enquadramento", autorizacao: "executar" });

    // Pergunta sem resposta não exclui: volta a pendente.
    const semTitularidade: Record<string, unknown> = { ...BASE, titularidade: null };
    expect((await salvar(execEng, semTitularidade)).error).toBeNull();
    expect(await item(procuracao)).toEqual({ status: "pendente", motivo: null, pelo_enquadramento: false });
  });

  it("dispensa feita pela equipe não é desfeita pelo enquadramento", async () => {
    expect((await salvar(execEng, { ...BASE, situacao_ambiental: "licenca" })).error).toBeNull();
    const { data: i } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("modelo_id", licenca).single();
    expect((await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i!.id, p_status: "dispensado", p_motivo: "Cliente já tem a licença" })).error).toBeNull();

    expect((await salvar(execEng, { ...BASE, situacao_ambiental: "dispensa" })).error).toBeNull();
    expect((await salvar(execEng, { ...BASE, situacao_ambiental: "licenca" })).error).toBeNull();
    expect(await item(licenca)).toEqual({ status: "dispensado", motivo: "Cliente já tem a licença", pelo_enquadramento: false });
  });

  it("'não aplicável' guarda a justificativa; trocar a situação apaga", async () => {
    expect((await salvar(execEng, { ...BASE, situacao_ambiental: "nao_aplicavel", justificativa_ambiental: "Telhado abaixo de 1 MW" })).error).toBeNull();
    const { data: a } = await servico.from("obra_engenharia_enquadramento").select("justificativa_ambiental").eq("obra_id", obra).single();
    expect(a!.justificativa_ambiental).toBe("Telhado abaixo de 1 MW");
    expect((await salvar(execEng, { ...BASE, justificativa_ambiental: "Sobra" })).error).toBeNull();
    const { data: b } = await servico.from("obra_engenharia_enquadramento").select("justificativa_ambiental").eq("obra_id", obra).single();
    expect(b!.justificativa_ambiental).toBeNull();
  });
});
