/**
 * Engenharia — obra de rede com custo (20261116100000_engenharia_obra_rede.sql): só com orçamento da distribuidora;
 * documentação, pagamento (com o prazo da obra em dias úteis) e obra concluída; etapa já registrada só muda com motivo;
 * a vistoria do padrão novo só é pedida depois da obra; o prazo da obra entra em `prazos_engenharia`. Precisa do
 * Supabase local (CI).
 *
 * Cenário próprio ("Obra de rede" + sufixo, usuários "or-*" + sufixo). Os testes seguem em ordem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let execEng: Usuario;
let execOp: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let obra: string;
let protocolo: string;

async function criarVenda(responsavel: Usuario, confirmador: Usuario, titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[responsavel.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  ok(await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  const { data: contrato } = ok(
    await responsavel.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinar");
  ok(await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const dia = (deslocamento: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + deslocamento * 86_400_000));
const hoje = () => dia(0);

function ok<T extends { error: unknown }>(r: T, contexto: string): T {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
}
const rede = (quem: Usuario, etapa: string, extra: Record<string, unknown> = {}) =>
  quem.cliente.rpc("registrar_obra_rede_engenharia", { p_obra_id: obra, p_etapa: etapa, p_data: hoje(), ...extra });
const pedirVistoria = () => execEng.cliente.rpc("solicitar_vistoria_engenharia", { p_obra_id: obra, p_solicitada_em: hoje() });

describe("Engenharia: obra de rede com custo (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, execEng, execOp] = await Promise.all(["or-admin", "or-vendedor", "or-exec-eng", "or-exec-op"].map(criarUsuario));
    const { data: emp } = await servico.from("empresas").insert({ nome: `Obra de rede ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert([
        { empresa_id: empresa, user_id: admin.id, papel: "admin" },
        { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
        { empresa_id: empresa, user_id: execEng.id, papel: "operacao" },
        { empresa_id: empresa, user_id: execOp.id, papel: "operacao" },
      ])
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [alvo, setor] of [
      [execEng, "engenharia"],
      [execOp, "operacional"],
    ] as const) {
      ok(
        await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: [{ setor, capacidade: "executar" }] as never }),
        "setores",
      );
    }

    obra = await criarVenda(vendedor, admin, `Obra de rede ${sufixo}`);
    for (const [alvo, setor] of [
      [execEng, "engenharia"],
      [execOp, "operacional"],
    ] as const) {
      ok(
        await admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[alvo.id], p_setor: setor, p_funcao: "apoio", p_principal: false }),
        "atribuir",
      );
    }
    ok(await execEng.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
    const r = ok(
      await execEng.cliente.rpc("registrar_protocolo_engenharia", {
        p_obra_id: obra,
        p_distribuidora: "Copel",
        p_canal: "pew",
        p_numero: `OR-${sufixo}`,
        p_tipo_solicitacao: "nova_conexao",
        p_protocolado_em: hoje(),
      }),
      "protocolo",
    );
    protocolo = r.data as string;
    ok(await execOp.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "operacional", p_status: "em_instalacao" }), "em instalação");
    ok(await execOp.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "operacional", p_status: "instalacao_concluida" }), "instalação");
  });

  it("sem orçamento da distribuidora não há obra de rede", async () => {
    expect((await rede(execEng, "documentos")).error?.message).toContain("orçamento emitido");
  });

  it("com orçamento: documentação, pagamento com prazo e obra concluída, nessa ordem de dependência", async () => {
    ok(await execEng.cliente.rpc("registrar_evento_protocolo_engenharia", { p_protocolo_id: protocolo, p_tipo: "orcamento_emitido", p_ocorrido_em: hoje() }), "orçamento");
    expect((await rede(execEng, "concluida")).error?.message).toContain("pagamento");
    expect((await rede(execEng, "pagamento")).error?.message).toContain("prazo da obra");
    expect((await rede(execEng, "documentos", { p_data: dia(5) })).error?.message).toContain("futura");
    // Quem não atua na Engenharia da obra não registra.
    expect((await rede(execOp, "documentos")).error).not.toBeNull();
    expect((await rede(vendedor, "documentos")).error).not.toBeNull();

    ok(await rede(execEng, "documentos"), "documentos");
    ok(await rede(execEng, "pagamento", { p_prazo_dias: 60 }), "pagamento");
    const { data } = await servico.from("obra_engenharia_obra_rede").select("documentos_enviados_em, pagamento_em, prazo_dias, concluida_em").eq("obra_id", obra).single();
    expect(data).toEqual({ documentos_enviados_em: hoje(), pagamento_em: hoje(), prazo_dias: 60, concluida_em: null });
  });

  it("o prazo da obra de rede corre em dias úteis desde o pagamento", async () => {
    const { data } = await execEng.cliente.rpc("prazos_engenharia", { p_empresa_id: empresa });
    const p = (data ?? []).find((x) => x.obra_id === obra && x.chave === "distribuidora_obra_rede");
    const { data: limite } = await execEng.cliente.rpc("somar_dias_prazo", { p_empresa_id: empresa, p_inicio: hoje(), p_dias: 60, p_contagem: "uteis" });
    expect(p).toMatchObject({ inicio: hoje(), contagem: "uteis", limite });
  });

  it("vistoria bloqueada até a obra de rede concluída", async () => {
    expect((await pedirVistoria()).error?.message).toContain("obra de rede concluída");
  });

  it("etapa registrada só muda com motivo; a correção fica no histórico", async () => {
    expect((await rede(execEng, "documentos", { p_data: dia(-1) })).error?.message).toContain("informe o motivo");
    ok(await rede(execEng, "documentos", { p_data: dia(-1), p_motivo: "Data digitada errada" }), "corrigir");
    const { data: hist } = await servico
      .from("obra_historico")
      .select("dados")
      .eq("obra_id", obra)
      .eq("tipo", "obra_rede_engenharia")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(hist!.dados).toMatchObject({ etapa: "documentos", data: dia(-1), de: hoje(), motivo: "Data digitada errada" });
  });

  it("obra concluída libera a vistoria e encerra o prazo", async () => {
    ok(await rede(execEng, "concluida"), "concluída");
    const { data } = await execEng.cliente.rpc("prazos_engenharia", { p_empresa_id: empresa });
    expect((data ?? []).some((x) => x.obra_id === obra && x.chave === "distribuidora_obra_rede")).toBe(false);
    ok(await pedirVistoria(), "vistoria");
  });

  it("ninguém escreve direto; quem só vê a obra não lê", async () => {
    expect((await execEng.cliente.from("obra_engenharia_obra_rede").update({ concluida_em: null }).eq("obra_id", obra)).error).not.toBeNull();
    const { data: doVendedor } = await vendedor.cliente.from("obra_engenharia_obra_rede").select("obra_id").eq("obra_id", obra);
    expect(doVendedor ?? []).toEqual([]);
  });
});
