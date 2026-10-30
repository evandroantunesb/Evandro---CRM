/**
 * Engenharia — vistoria, medição e conexão (20261030140000_engenharia_vistoria.sql): gate G5 (protocolo aprovado e
 * instalação concluída para pedir), pedido com avanço automático para "Aguardando vistoria", transições (agendada,
 * aprovada, não conformidade, cancelada; medidor e conexão só depois da aprovação, nessa ordem), datas, arquivos,
 * gate G6 (concluir exige conexão confirmada) e a exceção do admin, visibilidade (registros completos só para admin e
 * Engenharia; situação para quem vê a obra), escrita direta revogada. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Vistoria A/B" + sufixo, usuários "ev-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "engenharia-documentos";

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
let vendedor: Usuario;
let coordEng: Usuario;
let execEng: Usuario;
let execOp: Usuario;
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

const dia = (deslocamento: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + deslocamento * 86_400_000));
const hoje = () => dia(0);

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const etapa = (quem: Usuario, setor: string, status: string) =>
  quem.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: setor as never, p_status: status });
const pedir = (quem: Usuario, extra: Record<string, unknown> = {}) =>
  quem.cliente.rpc("solicitar_vistoria_engenharia", { p_obra_id: obra, p_solicitada_em: hoje(), ...extra });
const registrar = (quem: Usuario, vistoria: string, tipo: string, extra: Record<string, unknown> = {}) =>
  quem.cliente.rpc("registrar_evento_vistoria_engenharia", { p_vistoria_id: vistoria, p_tipo: tipo, p_data: hoje(), ...extra });

async function fluxo(setor: "engenharia" | "operacional") {
  const { data } = await servico.from("obra_fluxos").select("status").eq("obra_id", obra).eq("setor", setor).single();
  return data!.status;
}

describe("Engenharia: vistoria e conexão (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let protocolo: string;
  let vistoria: string;

  beforeAll(async () => {
    [admin, vendedor, coordEng, execEng, execOp, adminB] = await Promise.all(
      ["ev-admin", "ev-vendedor", "ev-coord-eng", "ev-exec-eng", "ev-exec-op", "ev-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Vistoria A ${sufixo}` }, { nome: `Vistoria B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordEng, empresa, operacao],
      [execEng, empresa, operacao],
      [execOp, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    for (const [alvo, s] of [
      [coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [execEng, [{ setor: "engenharia", capacidade: "executar" }]],
      [execOp, [{ setor: "operacional", capacidade: "executar" }]],
    ] as [Usuario, unknown][]) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never }), "setores");
    }

    obra = await criarVenda(empresa, vendedor, admin, `Vistoria ${sufixo}`);
    for (const [alvo, setor] of [
      [execEng, "engenharia"],
      [execOp, "operacional"],
    ] as const) {
      ok(
        await admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[alvo.id], p_setor: setor, p_funcao: "apoio", p_principal: false }),
        "atribuir",
      );
    }

    // Checklist resolvido (coordenador dispensa os obrigatórios) e protocolo registrado.
    ok(await execEng.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) ok(await coordEng.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
    const r = ok(
      await execEng.cliente.rpc("registrar_protocolo_engenharia", {
        p_obra_id: obra,
        p_distribuidora: "Copel",
        p_canal: "pew",
        p_numero: `V-${sufixo}`,
        p_tipo_solicitacao: "nova_conexao",
        p_protocolado_em: hoje(),
      }),
      "protocolo",
    );
    protocolo = r.data as string;
  });

  it("gate G5: pedir exige protocolo aprovado e instalação concluída", async () => {
    expect((await pedir(execEng)).error?.message).toContain("protocolo aprovado");
    ok(await execEng.cliente.rpc("registrar_evento_protocolo_engenharia", { p_protocolo_id: protocolo, p_tipo: "aprovado", p_ocorrido_em: hoje() }), "aprovar");
    expect((await pedir(execEng)).error?.message).toContain("instalação concluída");
    ok(await etapa(execOp, "operacional", "em_instalacao"), "em instalação");
    expect((await pedir(execEng)).error?.message).toContain("instalação concluída");
    ok(await etapa(execOp, "operacional", "instalacao_concluida"), "instalação concluída");
  });

  it("validações do pedido; quem não atua na Engenharia da obra não pede", async () => {
    expect((await pedir(execEng, { p_solicitada_em: dia(1) })).error?.code).toBe("23514");
    expect((await pedir(execEng, { p_numero: "x".repeat(61) })).error?.code).toBe("23514");
    for (const quem of [vendedor, execOp, adminB]) {
      expect((await pedir(quem)).error?.code, quem.email).toBe("42501");
    }
  });

  it("pedir leva a Engenharia para 'Aguardando vistoria' sozinho; só um pedido em andamento", async () => {
    expect(await fluxo("engenharia")).toBe("enviado_concessionaria");
    const r = await pedir(execEng, { p_numero: `VS-${sufixo}`, p_observacao: "Pedido pelo portal" });
    expect(r.error).toBeNull();
    vistoria = r.data as string;
    expect(await fluxo("engenharia")).toBe("aguardando_vistoria");

    const { data: hist } = await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra).order("id", { ascending: false }).limit(2);
    expect(hist!.map((h) => h.tipo)).toEqual(["fluxo_alterado", "vistoria_engenharia_solicitada"]);
    expect(hist![0].dados).toMatchObject({ de: "enviado_concessionaria", para: "aguardando_vistoria", origem: "vistoria" });

    expect((await pedir(execEng)).error?.message).toContain("já tem uma vistoria");
  });

  it("transições e datas: medidor e conexão só depois de aprovada, nessa ordem", async () => {
    expect((await registrar(execEng, vistoria, "medidor_adequado")).error?.message).toContain("não cabe");
    expect((await registrar(execEng, vistoria, "conexao_confirmada")).error?.message).toContain("não cabe");
    expect((await registrar(execEng, vistoria, "aprovada", { p_data: dia(1) })).error?.code).toBe("23514");
    expect((await registrar(execEng, vistoria, "nao_conformidade")).error?.message).toContain("Descreva");
    // Agendada aceita data futura (e reagendar).
    expect((await registrar(execEng, vistoria, "agendada", { p_data: dia(5) })).error).toBeNull();
    expect((await registrar(execEng, vistoria, "agendada", { p_data: dia(7) })).error).toBeNull();
    expect((await registrar(execEng, vistoria, "agendada", { p_data: dia(400) })).error?.code).toBe("23514");
    const { data: v } = await servico.from("obra_engenharia_vistorias").select("status, agendada_para").eq("id", vistoria).single();
    expect(v).toEqual({ status: "agendada", agendada_para: dia(7) });
  });

  it("não conformidade guarda o pedido e libera um novo, que a Engenharia leva até a conexão", async () => {
    expect((await registrar(coordEng, vistoria, "nao_conformidade", { p_descricao: "Placa de advertência ausente" })).error).toBeNull();
    expect((await registrar(execEng, vistoria, "aprovada")).error?.message).toContain("não cabe");

    const novo = await pedir(execEng);
    expect(novo.error).toBeNull();
    vistoria = novo.data as string;
    expect((await registrar(execEng, vistoria, "aprovada")).error).toBeNull();
    // Vistoria aprovada não é conexão: G6 ainda bloqueia.
    expect((await etapa(execEng, "engenharia", "concluido")).error?.message).toContain("conexão confirmada");
    expect((await registrar(execEng, vistoria, "conexao_confirmada")).error?.message).toContain("não cabe");
    expect((await registrar(execEng, vistoria, "medidor_adequado")).error).toBeNull();
    expect((await registrar(execEng, vistoria, "medidor_adequado")).error?.message).toContain("não cabe");
    expect((await etapa(execEng, "engenharia", "concluido")).error?.message).toContain("conexão confirmada");
    expect((await registrar(execEng, vistoria, "conexao_confirmada")).error).toBeNull();

    const { data: v } = await servico.from("obra_engenharia_vistorias").select("status, realizada_em, medidor_adequado_em, conexao_confirmada_em").eq("id", vistoria).single();
    expect(v).toEqual({ status: "aprovada", realizada_em: hoje(), medidor_adequado_em: hoje(), conexao_confirmada_em: hoje() });
    expect((await pedir(execEng)).error?.message).toContain("já tem uma vistoria");
  });

  it("arquivo do evento: na pasta da obra, de quem chama", async () => {
    const { data: ev } = await servico.from("obra_engenharia_vistoria_eventos").select("id").eq("vistoria_id", vistoria).eq("tipo", "aprovada").single();
    const caminho = `${empresa}/${obra}/${Date.now()}-relatorio.pdf`;
    ok(await execEng.cliente.storage.from(BUCKET).upload(caminho, new Blob([new Uint8Array(64)], { type: "application/pdf" }), { contentType: "application/pdf" }), "upload");
    const arq = { p_evento_id: ev!.id, p_caminho: caminho, p_nome: "relatorio.pdf" };
    expect((await coordEng.cliente.rpc("registrar_arquivo_vistoria_engenharia", arq)).error?.message).toContain("não encontrado");
    expect((await execEng.cliente.rpc("registrar_arquivo_vistoria_engenharia", arq)).error).toBeNull();
    expect((await execEng.cliente.rpc("registrar_arquivo_vistoria_engenharia", { ...arq, p_caminho: `${empresa}/outra/x.pdf` })).error?.code).toBe("23514");
  });

  it("registros completos só para admin e Engenharia; a situação para quem vê a obra", async () => {
    for (const quem of [admin, coordEng, execEng]) {
      expect((await quem.cliente.from("obra_engenharia_vistorias").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(2);
    }
    for (const quem of [vendedor, execOp, adminB]) {
      expect((await quem.cliente.from("obra_engenharia_vistorias").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(0);
      expect((await quem.cliente.from("obra_engenharia_vistoria_eventos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(0);
    }
    for (const quem of [vendedor, execOp, admin]) {
      const { data } = await quem.cliente.rpc("situacao_vistoria_obra", { p_obra_id: obra });
      expect(data, quem.email).toEqual([expect.objectContaining({ status: "aprovada", conexao_confirmada_em: hoje() })]);
      expect(Object.keys(data![0])).not.toContain("numero");
    }
    expect((await adminB.cliente.rpc("situacao_vistoria_obra", { p_obra_id: obra })).data).toEqual([]);
  });

  it("escrita direta é revogada", async () => {
    expect((await admin.cliente.from("obra_engenharia_vistorias").update({ status: "cancelada" }).eq("id", vistoria).select("id")).error).not.toBeNull();
    expect((await admin.cliente.from("obra_engenharia_vistoria_eventos").delete().eq("vistoria_id", vistoria)).error).not.toBeNull();
    expect((await servico.from("obra_engenharia_vistorias").update({ status: "cancelada" }).eq("id", vistoria)).error).not.toBeNull();
  });

  it("gate G6: com a conexão confirmada, a Engenharia conclui; a exceção é só do admin, com motivo", async () => {
    expect((await etapa(execEng, "engenharia", "concluido")).error).toBeNull();
    expect((await admin.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obra, p_motivo: "Obra sem conexão nova" })).error?.message).toContain("já está concluída");

    // Outra obra, sem vistoria: só o admin conclui, com motivo de verdade.
    obra = await criarVenda(empresa, vendedor, admin, `Vistoria exceção ${sufixo}`);
    ok(await admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[coordEng.id], p_setor: "engenharia", p_funcao: "apoio", p_principal: false }), "atribuir");
    expect((await coordEng.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obra, p_motivo: "Obra sem conexão nova" })).error?.code).toBe("42501");
    expect((await admin.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obra, p_motivo: "curto" })).error?.code).toBe("23514");
    expect((await admin.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obra, p_motivo: "Obra sem conexão nova" })).error).toBeNull();
    expect(await fluxo("engenharia")).toBe("concluido");
    const { data: hist } = await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra).order("id", { ascending: false }).limit(2);
    expect(hist!.map((h) => h.tipo)).toEqual(["fluxo_alterado", "engenharia_concluida_excecao"]);
    expect(hist![0].dados).toMatchObject({ para: "concluido", origem: "excecao" });
  });

  it("obra pausada não aceita pedido de vistoria", async () => {
    obra = await criarVenda(empresa, vendedor, admin, `Vistoria pausa ${sufixo}`);
    await noBanco("update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1", [obra]);
    expect((await pedir(admin)).error?.message).toContain("pausada");
  });
});
