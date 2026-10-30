/**
 * Engenharia — protocolos (20261030120000_engenharia_protocolos.sql): gate G2 (checklist resolvido para registrar),
 * gate G3 (avançar além do projeto exige protocolo), registro com pacote enviado e avanço automático da etapa,
 * transições das respostas, exigências (aberta → reenviada → resolvida), arquivos dos eventos, visibilidade só para
 * admin e Engenharia da obra, escrita direta revogada, obra pausada e cancelada. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Protocolo A/B" + sufixo, usuários "ep-*" + sufixo). Os testes seguem em ordem.
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
let execCompras: Usuario;
let adminB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let obraB: string;

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

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const amanha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86_400_000));

const etapa = (quem: Usuario, status: string) =>
  quem.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "engenharia", p_status: status });
const registrar = (quem: Usuario, extra: Record<string, unknown> = {}) =>
  quem.cliente.rpc("registrar_protocolo_engenharia", {
    p_obra_id: obra,
    p_distribuidora: "Copel",
    p_canal: "pew",
    p_numero: `P-${sufixo}`,
    p_tipo_solicitacao: "nova_conexao",
    p_protocolado_em: hoje(),
    ...extra,
  });
const evento = (quem: Usuario, protocolo: string, tipo: string, extra: Record<string, unknown> = {}) =>
  quem.cliente.rpc("registrar_evento_protocolo_engenharia", { p_protocolo_id: protocolo, p_tipo: tipo, p_ocorrido_em: hoje(), ...extra });

let contador = 0;
async function enviarArquivo(quem: Usuario, emp = empresa, o = obra) {
  const caminho = `${emp}/${o}/${Date.now()}-${++contador}.pdf`;
  const up = await quem.cliente.storage.from(BUCKET).upload(caminho, new Blob([new Uint8Array(64)], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  return caminho;
}

async function fluxoEngenharia() {
  const { data } = await servico.from("obra_fluxos").select("status").eq("obra_id", obra).eq("setor", "engenharia").single();
  return data!.status;
}

describe("Engenharia: protocolos (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let primeiroItem: string;
  let protocolo: string;

  beforeAll(async () => {
    [admin, vendedor, coordEng, execEng, execCompras, adminB, vendedorB] = await Promise.all(
      ["ep-admin", "ep-vendedor", "ep-coord-eng", "ep-exec-eng", "ep-exec-compras", "ep-admin-b", "ep-vendedor-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Protocolo A ${sufixo}` }, { nome: `Protocolo B ${sufixo}` }])
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
      [execCompras, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
      [vendedorB, empresaB, { papel: "vendedor", perfil_gamificacao: "closer" }],
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
      [execCompras, [{ setor: "compras", capacidade: "executar" }]],
    ] as [Usuario, unknown][]) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    obra = await criarVenda(empresa, vendedor, admin, `Protocolo ${sufixo}`);
    for (const [alvo, setor] of [
      [execEng, "engenharia"],
      [execCompras, "compras"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: membro[alvo.id],
        p_setor: setor,
        p_funcao: "apoio",
        p_principal: false,
      });
      if (e) throw e;
    }
    obraB = await criarVenda(empresaB, vendedorB, adminB, `Protocolo B ${sufixo}`);
  });

  it("gate G3: sem protocolo, a Engenharia não passa do projeto (nem pelo admin); voltar é livre", async () => {
    expect((await etapa(execEng, "projeto_em_elaboracao")).error).toBeNull();
    for (const s of ["enviado_concessionaria", "aprovado", "aguardando_vistoria", "concluido"]) {
      const r = await etapa(admin, s);
      expect(r.error?.code, s).toBe("23514");
      expect(r.error?.message).toContain("Registre o protocolo");
    }
    expect((await etapa(execEng, "a_iniciar")).error).toBeNull();
    expect((await etapa(execEng, "projeto_em_elaboracao")).error).toBeNull();
  });

  it("gate G2: registrar exige o checklist aplicado e os obrigatórios resolvidos", async () => {
    expect((await registrar(execEng)).error?.message).toContain("Aplique o checklist");
    expect((await execEng.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra })).error).toBeNull();
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id, obrigatorio").eq("obra_id", obra).order("ordem");
    const obrigatorios = itens!.filter((i) => i.obrigatorio);
    expect((await registrar(execEng)).error?.message).toContain("Itens obrigatórios do checklist ainda não resolvidos");

    primeiroItem = obrigatorios[0].id;
    const caminho = await enviarArquivo(execEng);
    expect((await execEng.cliente.rpc("registrar_documento_engenharia", { p_item_id: primeiroItem, p_caminho: caminho, p_nome: "fatura.pdf" })).error).toBeNull();
    expect((await execEng.cliente.rpc("alterar_item_engenharia", { p_item_id: primeiroItem, p_status: "valido" })).error).toBeNull();
    for (const i of obrigatorios.slice(1)) {
      const r = await coordEng.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" });
      expect(r.error).toBeNull();
    }
  });

  it("validações do registro; quem não atua na Engenharia da obra não registra", async () => {
    expect((await registrar(execEng, { p_protocolado_em: amanha() })).error?.code).toBe("23514");
    expect((await registrar(execEng, { p_canal: "fax" })).error?.code).toBe("23514");
    expect((await registrar(execEng, { p_numero: "  " })).error?.code).toBe("23514");
    for (const quem of [vendedor, execCompras, adminB]) {
      expect((await registrar(quem)).error?.code, quem.email).toBe("42501");
    }
  });

  it("registrar guarda o pacote enviado e leva a Engenharia para 'Enviado à concessionária' sozinho", async () => {
    const r = await registrar(execEng);
    expect(r.error).toBeNull();
    protocolo = r.data as string;
    expect(await fluxoEngenharia()).toBe("enviado_concessionaria");

    const { data: ev } = await servico.from("obra_engenharia_protocolo_eventos").select("id, tipo, status_para").eq("protocolo_id", protocolo);
    expect(ev).toEqual([expect.objectContaining({ tipo: "registrado", status_para: "protocolado" })]);
    const { data: pacote } = await servico.from("obra_engenharia_protocolo_documentos").select("documento_id").eq("evento_id", ev![0].id);
    expect(pacote).toHaveLength(1);

    const { data: hist } = await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra).order("id", { ascending: false }).limit(2);
    expect(hist!.map((h) => h.tipo)).toEqual(["fluxo_alterado", "protocolo_engenharia_registrado"]);
    expect(hist![0].dados).toMatchObject({ de: "projeto_em_elaboracao", para: "enviado_concessionaria", origem: "protocolo" });

    expect((await registrar(execEng, { p_numero: "Outro" })).error?.message).toContain("já tem um protocolo em andamento");
  });

  it("protocolos, eventos e exigências: só admin e Engenharia da obra veem", async () => {
    for (const quem of [admin, coordEng, execEng]) {
      expect((await quem.cliente.from("obra_engenharia_protocolos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(1);
    }
    for (const quem of [vendedor, execCompras, adminB]) {
      expect((await quem.cliente.from("obra_engenharia_protocolos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(0);
      expect((await quem.cliente.from("obra_engenharia_protocolo_eventos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(0);
    }
  });

  it("exigência abre; transição fora da regra é recusada; reenvio guarda a nova versão e marca reenviada", async () => {
    expect((await evento(execEng, protocolo, "exigencia", { p_descricao: "Diagrama ilegível" })).error?.message).toContain("categoria");
    expect((await evento(execEng, protocolo, "exigencia", { p_categoria: "projeto_eletrico" })).error?.code).toBe("23514");
    expect((await evento(execEng, protocolo, "exigencia", { p_categoria: "projeto_eletrico", p_descricao: "Diagrama ilegível", p_prazo_interno: amanha() })).error).toBeNull();
    const { data: aberta } = await servico.from("obra_engenharia_exigencias").select("status, categoria, prazo_interno").eq("protocolo_id", protocolo);
    expect(aberta).toEqual([{ status: "aberta", categoria: "projeto_eletrico", prazo_interno: amanha() }]);

    // Com exigência aberta, não se aprova sem reenviar; encerrar só depois de aprovado.
    expect((await evento(execEng, protocolo, "aprovado")).error?.code).toBe("23514");
    expect((await evento(execEng, protocolo, "encerrado")).error?.code).toBe("23514");

    const caminho = await enviarArquivo(execEng);
    expect((await execEng.cliente.rpc("registrar_documento_engenharia", { p_item_id: primeiroItem, p_caminho: caminho, p_nome: "fatura-v2.pdf" })).error).toBeNull();
    expect((await execEng.cliente.rpc("alterar_item_engenharia", { p_item_id: primeiroItem, p_status: "valido" })).error).toBeNull();
    const reenvio = await evento(execEng, protocolo, "reenvio", { p_descricao: "Diagrama corrigido" });
    expect(reenvio.error).toBeNull();

    const { data: p } = await servico.from("obra_engenharia_protocolos").select("status").eq("id", protocolo).single();
    expect(p!.status).toBe("em_analise");
    const { data: ex } = await servico.from("obra_engenharia_exigencias").select("status").eq("protocolo_id", protocolo);
    expect(ex!.map((e) => e.status)).toEqual(["reenviada"]);
    const { data: pacote } = await servico
      .from("obra_engenharia_protocolo_documentos")
      .select("obra_engenharia_documentos(versao)")
      .eq("evento_id", reenvio.data as string);
    expect(pacote).toEqual([{ obra_engenharia_documentos: { versao: 2 } }]);
    // Em análise de novo: outro reenvio não cabe.
    expect((await evento(execEng, protocolo, "reenvio")).error?.message).toContain("não cabe na situação atual");
  });

  it("arquivo do evento: na pasta da obra, de quem chama; outra obra é recusada", async () => {
    const { data: ev } = await servico.from("obra_engenharia_protocolo_eventos").select("id").eq("protocolo_id", protocolo).eq("tipo", "registrado").single();
    const caminho = await enviarArquivo(execEng);
    expect((await execEng.cliente.rpc("registrar_arquivo_protocolo_engenharia", { p_evento_id: ev!.id, p_caminho: caminho, p_nome: "comprovante.pdf" })).error).toBeNull();
    const deFora = await enviarArquivo(adminB, empresaB, obraB);
    expect((await execEng.cliente.rpc("registrar_arquivo_protocolo_engenharia", { p_evento_id: ev!.id, p_caminho: deFora, p_nome: "x.pdf" })).error?.code).toBe("23514");
  });

  it("aprovado resolve as exigências; encerrado fecha; aí um novo protocolo é aceito", async () => {
    expect((await evento(coordEng, protocolo, "aprovado", { p_descricao: "Parecer favorável" })).error).toBeNull();
    const { data: ex } = await servico.from("obra_engenharia_exigencias").select("status, resolvida_em").eq("protocolo_id", protocolo);
    expect(ex![0].status).toBe("resolvida");
    expect(ex![0].resolvida_em).not.toBeNull();
    expect((await evento(coordEng, protocolo, "encerrado")).error).toBeNull();
    expect((await registrar(execEng, { p_numero: `P2-${sufixo}`, p_tipo_solicitacao: "ampliacao" })).error).toBeNull();
    // Já estava adiante do projeto: a etapa não volta nem muda.
    expect(await fluxoEngenharia()).toBe("enviado_concessionaria");
  });

  it("escrita direta é revogada", async () => {
    expect((await admin.cliente.from("obra_engenharia_protocolos").update({ status: "aprovado" }).eq("id", protocolo)).error).not.toBeNull();
    expect((await admin.cliente.from("obra_engenharia_exigencias").delete().eq("protocolo_id", protocolo)).error).not.toBeNull();
    expect((await admin.cliente.from("obra_engenharia_protocolo_eventos").delete().eq("protocolo_id", protocolo)).error).not.toBeNull();
  });

  it("obra pausada aceita resposta, não novo protocolo; cancelada não aceita nada", async () => {
    const { data: atual } = await servico.from("obra_engenharia_protocolos").select("id").eq("obra_id", obra).eq("status", "protocolado").single();
    expect((await evento(coordEng, atual!.id, "cancelado", { p_descricao: "Protocolo duplicado" })).error).toBeNull();
    await noBanco("update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1", [obra]);
    expect((await registrar(execEng, { p_numero: `P3-${sufixo}` })).error?.message).toContain("pausada");
    await noBanco("update public.obras set pausada_em = null, pausa_motivo = null where id = $1", [obra]);
    const r = await registrar(execEng, { p_numero: `P3-${sufixo}` });
    expect(r.error).toBeNull();
    await noBanco("update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1", [obra]);
    expect((await evento(execEng, r.data as string, "em_analise")).error).toBeNull();
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1", [obra]);
    expect((await evento(execEng, r.data as string, "aprovado")).error?.code).toBe("23514");
  });
});
