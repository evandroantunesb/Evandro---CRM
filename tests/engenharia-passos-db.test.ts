/**
 * Engenharia — passos guiados (20261101100000_engenharia_passos.sql): confirmação formal dos passos 2, 3, 5 e 7, só
 * por RPC (admin, coordenador da Engenharia ou participante ativo dela), só inserção, travas do passo 5 (checklist
 * apto) e do passo 7 (protocolo aprovado), motivo para reabrir e "não se aplica", leitura por quem vê a obra e
 * isolamento entre empresas. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Passos A/B" + sufixo, usuários "ep-*" + sufixo). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let coordEng: Usuario;
let execEng: Usuario;
let engSemObra: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;

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

const registrar = (quem: Usuario, passo: number, acao: string, observacao?: string) =>
  quem.cliente.rpc("registrar_passo_engenharia", { p_obra_id: obra, p_passo: passo, p_acao: acao, ...(observacao ? { p_observacao: observacao } : {}) });

// Ontem: a data do protocolo não pode ser futura no horário de Brasília.
const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function registros(passo: number) {
  const { data } = await servico
    .from("obra_engenharia_passo_registros")
    .select("acao, observacao, autor_membro_id")
    .eq("obra_id", obra)
    .eq("passo", passo)
    .order("created_at");
  return data!;
}

describe("Engenharia: passos guiados (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, coordEng, execEng, engSemObra, adminB] = await Promise.all(
      ["ep-admin", "ep-gestor", "ep-vendedor", "ep-coord-eng", "ep-exec-eng", "ep-eng-sem-obra", "ep-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Passos A ${sufixo}` }, { nome: `Passos B ${sufixo}` }])
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
      [execEng, empresa, operacao],
      [engSemObra, empresa, operacao],
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
      [execEng, [{ setor: "engenharia", capacidade: "executar" }]],
      [engSemObra, [{ setor: "engenharia", capacidade: "executar" }]],
    ];
    for (const [alvo, s] of setores) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    obra = await criarVenda(empresa, vendedor, admin, `Passos ${sufixo}`);
    const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
      p_obra_id: obra,
      p_membro_id: membro[execEng.id],
      p_setor: "engenharia",
      p_funcao: "apoio",
      p_principal: false,
    });
    if (e) throw e;
  });

  it("só admin, coordenador e participante ativo da Engenharia registram; os demais são recusados", async () => {
    for (const quem of [vendedor, gestor, engSemObra, adminB]) {
      const r = await registrar(quem, 2, "confirmado");
      expect(r.error?.code, quem.email).toBe("42501");
    }
    expect((await registrar(execEng, 2, "confirmado", "Copel, micro, telhado")).error).toBeNull();
    expect((await registrar(coordEng, 3, "confirmado")).error).toBeNull();
    expect((await registrar(admin, 3, "confirmado")).error).toBeNull();

    const passo2 = await registros(2);
    expect(passo2).toEqual([{ acao: "confirmado", observacao: "Copel, micro, telhado", autor_membro_id: membro[execEng.id] }]);
    // Histórico com passo e ação, sem a observação.
    const { data: hist } = await servico.from("obra_historico").select("setor, autor_membro_id, dados").eq("obra_id", obra).eq("tipo", "passo_engenharia_registrado").order("id");
    expect(hist![0]).toMatchObject({ setor: "engenharia", autor_membro_id: membro[execEng.id], dados: { passo: 2, acao: "confirmado", autorizacao: "executar" } });
    expect(JSON.stringify(hist)).not.toContain("Copel, micro");
  });

  it("ninguém escreve direto na tabela; quem vê a obra lê; outra empresa não lê", async () => {
    const insercao = await admin.cliente
      .from("obra_engenharia_passo_registros")
      .insert({ empresa_id: empresa, obra_id: obra, passo: 2, acao: "confirmado" } as never);
    expect(insercao.error).not.toBeNull();
    const apagar = await admin.cliente.from("obra_engenharia_passo_registros").delete().eq("obra_id", obra).select("id");
    expect(apagar.data ?? []).toHaveLength(0);
    expect(await registros(2)).toHaveLength(1);

    const { data: doVendedor } = await vendedor.cliente.from("obra_engenharia_passo_registros").select("passo").eq("obra_id", obra);
    expect(doVendedor!.length).toBeGreaterThan(0);
    const { data: deFora } = await adminB.cliente.from("obra_engenharia_passo_registros").select("passo").eq("obra_id", obra);
    expect(deFora).toEqual([]);
  });

  it("valida passo, ação e motivo; reabrir só o que está concluído", async () => {
    expect((await registrar(admin, 4, "confirmado")).error?.message).toMatch(/Passo inválido/);
    expect((await registrar(admin, 2, "aprovado")).error?.message).toMatch(/Ação inválida/);
    expect((await registrar(admin, 3, "nao_se_aplica", "Sem dados")).error?.message).toMatch(/Só as condições de conexão/);
    expect((await registrar(admin, 2, "reaberto")).error?.message).toMatch(/Informe o motivo/);
    expect((await registrar(admin, 5, "reaberto", "Revisar de novo")).error?.message).toMatch(/não está concluído/);

    expect((await registrar(coordEng, 2, "reaberto", "Categoria errada")).error).toBeNull();
    expect((await registrar(coordEng, 2, "reaberto", "De novo")).error?.message).toMatch(/não está concluído/);
    expect((await registros(2)).map((r) => r.acao)).toEqual(["confirmado", "reaberto"]);
  });

  it("passo 5 exige o checklist aplicado e os obrigatórios resolvidos", async () => {
    expect((await registrar(admin, 5, "confirmado")).error?.message).toMatch(/Aplique o checklist/);

    expect((await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra })).error).toBeNull();
    expect((await registrar(admin, 5, "confirmado")).error?.message).toMatch(/Aplique o checklist/);

    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) {
      const r = await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste dos passos" });
      expect(r.error).toBeNull();
    }
    expect((await registrar(execEng, 5, "confirmado")).error).toBeNull();
    // Confirmar de novo é a nova revisão (depois de o checklist mudar).
    expect((await registrar(execEng, 5, "confirmado")).error).toBeNull();
  });

  it("passo 7 exige protocolo aprovado; 'não se aplica' com motivo e sem repetir", async () => {
    expect((await registrar(admin, 7, "confirmado")).error?.message).toMatch(/aprovação ou o orçamento/);
    expect((await registrar(admin, 7, "nao_se_aplica", "Sem orçamento")).error?.message).toMatch(/aprovação ou o orçamento/);

    const protocolo = await admin.cliente.rpc("registrar_protocolo_engenharia", {
      p_obra_id: obra,
      p_distribuidora: "Copel",
      p_canal: "pew",
      p_numero: `P-${sufixo}`,
      p_tipo_solicitacao: "nova_conexao",
      p_protocolado_em: ontem(),
    });
    expect(protocolo.error).toBeNull();
    expect((await registrar(admin, 7, "confirmado")).error?.message).toMatch(/aprovação ou o orçamento/);

    const aprovado = await admin.cliente.rpc("registrar_evento_protocolo_engenharia", {
      p_protocolo_id: protocolo.data as string,
      p_tipo: "aprovado",
      p_ocorrido_em: ontem(),
    });
    expect(aprovado.error).toBeNull();
    expect((await registrar(admin, 7, "nao_se_aplica")).error?.message).toMatch(/Informe o motivo/);
    expect((await registrar(coordEng, 7, "nao_se_aplica", "Aprovado sem orçamento de conexão")).error).toBeNull();
    expect((await registrar(coordEng, 7, "nao_se_aplica", "De novo")).error?.message).toMatch(/já está marcado/);
    expect((await registrar(coordEng, 7, "reaberto", "Chegou orçamento")).error).toBeNull();
    expect((await registrar(execEng, 7, "confirmado", "Orçamento aceito pelo cliente")).error).toBeNull();
    expect((await registros(7)).map((r) => r.acao)).toEqual(["nao_se_aplica", "reaberto", "confirmado"]);
  });
});
