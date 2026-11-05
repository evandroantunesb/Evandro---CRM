/**
 * Pagamento informado pelo vendedor (Evandro, 03/11/2026; 20261113100000_aviso_pagamento_vendedor.sql): o vendedor
 * avisa que o cliente pagou, com comprovante obrigatório; admin, gestor ou qualquer pessoa do setor Operacional ou
 * Administrativo (20261119100100_setor_administrativo.sql) confirma ou devolve com motivo. O Operacional não vê o negócio: só a lista `pagamentos_a_confirmar`.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "comprovantes-pagamento";

let vendedor: Usuario;
let vendedor2: Usuario;
let gestor: Usuario;
let admin: Usuario;
let operacional: Usuario;
let compras: Usuario;
let administrativo: Usuario;
let gestorOutra: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapa: string;
let contato: string;

beforeAll(async () => {
  [vendedor, vendedor2, gestor, admin, operacional, compras, gestorOutra, administrativo] = await Promise.all(
    ["ap-vendedor", "ap-vendedor2", "ap-gestor", "ap-admin", "ap-operacional", "ap-compras", "ap-outra", "ap-administrativo"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Aviso pagamento ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: vendedor2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: operacional.id, papel: "operacao" },
      { empresa_id: empresa, user_id: compras.id, papel: "operacao" },
      { empresa_id: empresa, user_id: administrativo.id, papel: "operacao" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  for (const [quem, setor] of [
    [operacional, "operacional"],
    [compras, "compras"],
    [administrativo, "administrativo"],
  ] as const) {
    const { error } = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro[quem.id],
      p_setores: [{ setor, capacidade: "executar" }] as never,
    });
    if (error) throw error;
  }

  const { data: emp2 } = await servico.from("empresas").insert({ nome: `Outra aviso ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: emp2!.id, user_id: gestorOutra.id, papel: "gestor" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: "Cliente aviso", cidade: "Ponta Grossa", uf: "PR" })
    .select("id")
    .single();
  contato = c!.id;

  // O gestor vê os negócios do vendedor pela equipe.
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe aviso" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);
});

async function criarContrato(assinar = true, responsavel: Usuario = vendedor) {
  const { data: negocio, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: empresa,
      titulo: `Negócio aviso ${randomUUID().slice(0, 6)}`,
      contato_id: contato,
      funil_id: funil,
      etapa_id: etapa,
      responsavel_id: membro[responsavel.id],
      valor: 38900,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: contrato, error: e2 } = await responsavel.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocio!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (e2) throw e2;
  if (assinar) {
    const { error: e3 } = await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
    if (e3) throw e3;
  }
  return { negocioId: negocio!.id, contratoId: contrato!.id };
}

const pdf = () => new Blob(["%PDF-1.4 comprovante de teste"], { type: "application/pdf" });

async function enviarComprovante(quem: Usuario, contratoId: string) {
  const caminho = `${empresa}/${contratoId}/${randomUUID()}-comprovante.pdf`;
  const { error } = await quem.cliente.storage.from(BUCKET).upload(caminho, pdf(), { contentType: "application/pdf" });
  return { caminho, error };
}

async function informar(quem: Usuario, contratoId: string, extra: { data?: string; caminho?: string } = {}) {
  let caminho = extra.caminho;
  if (!caminho) {
    const envio = await enviarComprovante(quem, contratoId);
    if (envio.error) throw envio.error;
    caminho = envio.caminho;
  }
  return quem.cliente.rpc("informar_pagamento", {
    p_contrato_id: contratoId,
    p_data_pagamento: extra.data ?? "2026-11-02",
    p_observacao: "PIX da conta do filho do cliente.",
    p_caminho: caminho,
    p_nome: "comprovante.pdf",
  });
}

describe("informar_pagamento", () => {
  it("o vendedor informa com comprovante; um segundo aviso aberto é recusado", async () => {
    const { contratoId, negocioId } = await criarContrato();
    const { data, error } = await informar(vendedor, contratoId);
    expect(error).toBeNull();
    expect(data).toMatchObject({ situacao: "aberto", informado_por_membro_id: membro[vendedor.id], comprovante_tipo: "application/pdf" });

    const { error: dup } = await informar(vendedor, contratoId);
    expect(dup?.message).toContain("aguardando confirmação");

    const { data: atividades } = await servico.from("atividades").select("tipo").eq("negocio_id", negocioId);
    expect(atividades!.map((a) => a.tipo)).toContain("pagamento_informado");
  });

  it("comprovante é obrigatório e precisa estar na pasta do contrato", async () => {
    const { contratoId } = await criarContrato();
    const { error: semArquivo } = await informar(vendedor, contratoId, { caminho: `${empresa}/${contratoId}/${randomUUID()}-nada.pdf` });
    expect(semArquivo?.message).toContain("Comprovante não encontrado");

    const outro = await criarContrato();
    const { caminho } = await enviarComprovante(vendedor, outro.contratoId);
    const { error: pastaErrada } = await informar(vendedor, contratoId, { caminho });
    expect(pastaErrada?.message).toContain("Anexe o comprovante");
  });

  it("data no futuro é recusada", async () => {
    const { contratoId } = await criarContrato();
    const { error } = await informar(vendedor, contratoId, { data: "2099-01-01" });
    expect(error?.message).toContain("futuro");
  });

  it("contrato não assinado: nem envia o comprovante nem informa", async () => {
    const { contratoId } = await criarContrato(false);
    const { error: envio } = await enviarComprovante(vendedor, contratoId);
    expect(envio).not.toBeNull();
  });

  it("quem não vê o negócio não envia comprovante nem informa; o Operacional também não informa", async () => {
    const { contratoId } = await criarContrato();
    const { error: envio } = await enviarComprovante(vendedor2, contratoId);
    expect(envio).not.toBeNull();
    const { caminho } = await enviarComprovante(vendedor, contratoId);
    const { error } = await informar(vendedor2, contratoId, { caminho });
    expect(error?.message).toContain("não pode informar");
    const { error: op } = await informar(operacional, contratoId, { caminho });
    expect(op?.message).toContain("não pode informar");
  });

  it("ninguém escreve direto na tabela", async () => {
    const { contratoId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);
    await vendedor.cliente.from("avisos_pagamento").update({ situacao: "cancelado" }).eq("id", aviso!.id);
    await vendedor.cliente.from("avisos_pagamento").delete().eq("id", aviso!.id);
    const { data } = await servico.from("avisos_pagamento").select("situacao").eq("id", aviso!.id).single();
    expect(data!.situacao).toBe("aberto");
    const { error } = await servico.from("avisos_pagamento").update({ situacao: "cancelado" }).eq("id", aviso!.id);
    expect(error).not.toBeNull();
  });
});

describe("pagamentos_a_confirmar e o que o Operacional vê", () => {
  it("Operacional vê o aviso com valor e baixa o comprovante, sem ver o negócio nem a tabela", async () => {
    const { contratoId, negocioId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);

    const { data: lista, error } = await operacional.cliente.rpc("pagamentos_a_confirmar", { p_empresa_id: empresa });
    expect(error).toBeNull();
    const linha = lista!.find((l) => l.aviso_id === aviso!.id);
    expect(linha).toMatchObject({ contrato_id: contratoId, cliente_nome: "Cliente aviso", cidade: "Ponta Grossa", uf: "PR", valor: 38900 });

    const { data: negocios } = await operacional.cliente.from("negocios").select("id").eq("id", negocioId);
    expect(negocios).toEqual([]);
    const { data: avisos } = await operacional.cliente.from("avisos_pagamento").select("id").eq("id", aviso!.id);
    expect(avisos).toEqual([]);

    const { data: arquivo, error: erroArquivo } = await operacional.cliente.storage.from(BUCKET).download(aviso!.comprovante_caminho);
    expect(erroArquivo).toBeNull();
    expect(arquivo).not.toBeNull();
  });

  it("quem é só de Compras, o vendedor que não vê o negócio e outra empresa não veem nada", async () => {
    const { contratoId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);
    for (const quem of [compras, vendedor2, gestorOutra]) {
      const { data } = await quem.cliente.rpc("pagamentos_a_confirmar", { p_empresa_id: empresa });
      expect((data ?? []).some((l) => l.aviso_id === aviso!.id)).toBe(false);
      const { error } = await quem.cliente.storage.from(BUCKET).download(aviso!.comprovante_caminho);
      expect(error).not.toBeNull();
    }
    const { error } = await compras.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error?.message).toBe("Só gestor, admin, o Operacional ou o Administrativo pode confirmar pagamento.");
    const { error: dev } = await compras.cliente.rpc("devolver_aviso_pagamento", { p_aviso_id: aviso!.id, p_motivo: "x" });
    expect(dev?.message).toBe("Só gestor, admin, o Operacional ou o Administrativo pode devolver o aviso de pagamento.");
    expect(dev).not.toBeNull();
  });

  it("gestor vê os avisos dos negócios da equipe", async () => {
    const { contratoId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);
    const { data } = await gestor.cliente.rpc("pagamentos_a_confirmar", { p_empresa_id: empresa });
    expect(data!.some((l) => l.aviso_id === aviso!.id)).toBe(true);
  });
});

describe("devolver, cancelar e confirmar", () => {
  it("Operacional devolve com motivo; o vendedor é avisado e informa de novo", async () => {
    const { contratoId, negocioId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);

    const { error: semMotivo } = await operacional.cliente.rpc("devolver_aviso_pagamento", { p_aviso_id: aviso!.id, p_motivo: "  " });
    expect(semMotivo?.message).toContain("Informe por que");
    const { error: vendedorDevolve } = await vendedor.cliente.rpc("devolver_aviso_pagamento", { p_aviso_id: aviso!.id, p_motivo: "x" });
    expect(vendedorDevolve).not.toBeNull();

    const { data: devolvido, error } = await operacional.cliente.rpc("devolver_aviso_pagamento", {
      p_aviso_id: aviso!.id,
      p_motivo: "O PIX não caiu na conta.",
    });
    expect(error).toBeNull();
    expect(devolvido).toMatchObject({ situacao: "devolvido", motivo_devolucao: "O PIX não caiu na conta.", encerrado_por_membro_id: membro[operacional.id] });

    const { data: notif } = await servico
      .from("notificacoes")
      .select("tipo, mensagem, link")
      .eq("membro_id", membro[vendedor.id])
      .eq("tipo", "pagamento_aviso_devolvido")
      .like("link", `%${negocioId}%`);
    expect(notif).toHaveLength(1);
    expect(notif![0].mensagem).toContain("O PIX não caiu na conta.");

    const { error: denovo } = await informar(vendedor, contratoId);
    expect(denovo).toBeNull();
  });

  it("só quem informou cancela, e só uma vez", async () => {
    const { contratoId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);
    const { error: gestorCancela } = await gestor.cliente.rpc("cancelar_aviso_pagamento", { p_aviso_id: aviso!.id });
    expect(gestorCancela?.message).toContain("Só quem informou");
    const { data, error } = await vendedor.cliente.rpc("cancelar_aviso_pagamento", { p_aviso_id: aviso!.id });
    expect(error).toBeNull();
    expect(data!.situacao).toBe("cancelado");
    const { error: deNovo } = await vendedor.cliente.rpc("cancelar_aviso_pagamento", { p_aviso_id: aviso!.id });
    expect(deNovo?.message).toContain("encerrado");
  });

  it("Operacional confirma: crédito do vendedor, aviso encerrado e vendedor avisado", async () => {
    const { contratoId, negocioId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);

    const { data: conf, error } = await operacional.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    expect(conf).toMatchObject({
      confirmado_por_membro_id: membro[operacional.id],
      beneficiario_membro_id: membro[vendedor.id],
      beneficiario_user_id: vendedor.id,
    });
    const { data: evento } = await servico.from("eventos").select("tipo, ator_id, beneficiario_id").eq("id", conf!.evento_confirmacao_id).single();
    expect(evento).toEqual({ tipo: "pagamento.confirmado", ator_id: operacional.id, beneficiario_id: vendedor.id });

    const { data: encerrado } = await servico.from("avisos_pagamento").select("situacao, confirmacao_id").eq("id", aviso!.id).single();
    expect(encerrado).toEqual({ situacao: "confirmado", confirmacao_id: conf!.id });

    const { data: notif } = await servico
      .from("notificacoes")
      .select("id")
      .eq("membro_id", membro[vendedor.id])
      .eq("tipo", "pagamento_aviso_confirmado")
      .like("link", `%${negocioId}%`);
    expect(notif).toHaveLength(1);

    const { data: lista } = await operacional.cliente.rpc("pagamentos_a_confirmar", { p_empresa_id: empresa });
    expect(lista!.some((l) => l.aviso_id === aviso!.id)).toBe(false);
    const { error: aposConfirmar } = await informar(vendedor, contratoId);
    expect(aposConfirmar?.message).toContain("já está confirmado");
  });

  it("Administrativo vê a lista, devolve e confirma como o Operacional", async () => {
    const { contratoId, negocioId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);

    const { data: lista, error: erroLista } = await administrativo.cliente.rpc("pagamentos_a_confirmar", { p_empresa_id: empresa });
    expect(erroLista).toBeNull();
    expect(lista!.some((l) => l.aviso_id === aviso!.id)).toBe(true);
    const { data: arquivo } = await administrativo.cliente.storage.from(BUCKET).download(aviso!.comprovante_caminho);
    expect(arquivo).not.toBeNull();
    const { data: negocios } = await administrativo.cliente.from("negocios").select("id").eq("id", negocioId);
    expect(negocios).toEqual([]);

    const { data: devolvido, error: erroDevolver } = await administrativo.cliente.rpc("devolver_aviso_pagamento", {
      p_aviso_id: aviso!.id,
      p_motivo: "Não achei o PIX.",
    });
    expect(erroDevolver).toBeNull();
    expect(devolvido).toMatchObject({ situacao: "devolvido", encerrado_por_membro_id: membro[administrativo.id] });

    const { error: semAviso } = await administrativo.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(semAviso?.message).toBe("O Operacional e o Administrativo confirmam só pagamento informado pelo vendedor.");

    await informar(vendedor, contratoId);
    const { data: conf, error } = await administrativo.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    expect(conf).toMatchObject({ confirmado_por_membro_id: membro[administrativo.id], beneficiario_membro_id: membro[vendedor.id] });
  });

  it("Operacional não confirma sem aviso do vendedor; gestor confirma direto, como antes", async () => {
    const { contratoId } = await criarContrato();
    const { error } = await operacional.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error?.message).toContain("só pagamento informado");
    const { error: direto } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(direto).toBeNull();
  });

  it("gestor que confirma com aviso aberto encerra o aviso", async () => {
    const { contratoId } = await criarContrato();
    const { data: aviso } = await informar(vendedor, contratoId);
    const { data: conf, error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    const { data } = await servico.from("avisos_pagamento").select("situacao, confirmacao_id, encerrado_por_membro_id").eq("id", aviso!.id).single();
    expect(data).toEqual({ situacao: "confirmado", confirmacao_id: conf!.id, encerrado_por_membro_id: membro[gestor.id] });
  });

  it("o vendedor continua sem confirmar", async () => {
    const { contratoId } = await criarContrato();
    await informar(vendedor, contratoId);
    const { error } = await vendedor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error?.message).toBe("Só gestor, admin, o Operacional ou o Administrativo pode confirmar pagamento.");
  });
});
