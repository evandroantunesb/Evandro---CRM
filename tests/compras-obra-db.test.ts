/** Compras: acesso setorial, orçamento versionado, aprovação técnica e pedido. Usa Supabase local. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let comprador: Usuario;
let tecnico: Usuario;
let financeiro: Usuario;
let externo: Usuario;
let empresa: string;
let obra: string;
const membro = new Map<string, string>();
const pdf = Uint8Array.from(Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF", "utf8"));

async function criarObra() {
  const { data: funil } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: etapa } = await servico.from("etapas").select("id").eq("funil_id", funil!.id).eq("inicial", true).single();
  const { data: contato } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente compras ${sufixo}` }).select("id").single();
  const { data: negocio, error } = await servico.from("negocios").insert({
    empresa_id: empresa, titulo: "Usina com compras", contato_id: contato!.id,
    funil_id: funil!.id, etapa_id: etapa!.id, responsavel_id: membro.get(vendedor.id)!, valor: 30000,
  }).select("id").single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await vendedor.cliente.from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocio!.id, conteudo: "Contrato de teste" }).select("id").single();
  if (erroContrato) throw erroContrato;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const confirmado = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (confirmado.error) throw confirmado.error;
  const { data: obraCriada, error: erroObra } = await servico.from("obras").select("id").eq("negocio_id", negocio!.id).single();
  if (erroObra) throw erroObra;
  return obraCriada!.id;
}

async function enviarArquivo(ator: Usuario) {
  const caminho = `${empresa}/${obra}/compras/${crypto.randomUUID()}.pdf`;
  const envio = await ator.cliente.storage.from("obra-compras").upload(caminho, pdf, { contentType: "application/pdf" });
  return { caminho, erro: envio.error };
}

async function enviarFinanceiro(ator: Usuario) {
  const caminho = `${empresa}/${obra}/financeiro/${crypto.randomUUID()}.pdf`;
  const envio = await ator.cliente.storage.from("obra-compras").upload(caminho, pdf, { contentType: "application/pdf" });
  return { caminho, erro: envio.error };
}

const registrar = (ator: Usuario, tipo: "orcamento" | "pedido", caminho: string, fornecedor = "Fornecedor solar") =>
  ator.cliente.rpc("registrar_documento_compras_obra", {
    p_obra_id: obra, p_tipo: tipo, p_caminho: caminho,
    p_nome: `${tipo}.pdf`, p_fornecedor: fornecedor, ...(tipo === "orcamento" ? { p_valor: 12000 } : {}),
  });

beforeAll(async () => {
  [admin, vendedor, comprador, tecnico, financeiro, externo] = await Promise.all(
    ["co-admin", "co-vendedor", "co-comprador", "co-tecnico", "co-financeiro", "co-externo"].map(criarUsuario),
  );
  const { data: e, error } = await servico.from("empresas").insert({ nome: `Compras ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = e!.id;
  const { data: membros, error: erroMembros } = await servico.from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: comprador.id, papel: "operacao" },
      { empresa_id: empresa, user_id: tecnico.id, papel: "operacao" },
      { empresa_id: empresa, user_id: financeiro.id, papel: "operacao" },
    ]).select("id, user_id");
  if (erroMembros) throw erroMembros;
  for (const m of membros!) membro.set(m.user_id, m.id);
  const setoresComprador = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro.get(comprador.id)!, p_setores: [{ setor: "compras", capacidade: "executar" }],
  });
  if (setoresComprador.error) throw setoresComprador.error;
  const setoresTecnico = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro.get(tecnico.id)!, p_setores: [{ setor: "operacional", capacidade: "executar" }],
  });
  if (setoresTecnico.error) throw setoresTecnico.error;
  const setoresFinanceiro = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro.get(financeiro.id)!, p_setores: [{ setor: "operacional", capacidade: "coordenar" }],
  });
  if (setoresFinanceiro.error) throw setoresFinanceiro.error;
  obra = await criarObra();
  const compradorAtribuido = await admin.cliente.rpc("atribuir_participante_obra", {
    p_obra_id: obra, p_membro_id: membro.get(comprador.id)!, p_setor: "compras",
    p_funcao: "responsavel", p_principal: true,
  });
  if (compradorAtribuido.error) throw compradorAtribuido.error;
  const tecnicoAtribuido = await admin.cliente.rpc("atribuir_participante_obra", {
    p_obra_id: obra, p_membro_id: membro.get(tecnico.id)!, p_setor: "operacional",
    p_funcao: "responsavel", p_principal: true,
  });
  if (tecnicoAtribuido.error) throw tecnicoAtribuido.error;
});

describe("documentos e aprovação de Compras", () => {
  it("restringe upload e leitura aos setores autorizados", async () => {
    expect((await enviarArquivo(vendedor)).erro).toBeTruthy();
    expect((await enviarArquivo(externo)).erro).toBeTruthy();
    const arquivo = await enviarArquivo(comprador);
    expect(arquivo.erro).toBeNull();
    const registrado = await registrar(comprador, "orcamento", arquivo.caminho);
    expect(registrado.error).toBeNull();
    const { data: docsComprador } = await comprador.cliente.from("obra_compras_documentos").select("id, revisao, versao").eq("obra_id", obra);
    expect(docsComprador).toHaveLength(1);
    expect(docsComprador?.[0]).toMatchObject({ revisao: "pendente", versao: 1 });
    expect((await vendedor.cliente.from("obra_compras_documentos").select("id").eq("obra_id", obra)).data).toEqual([]);
    expect((await tecnico.cliente.from("obra_compras_documentos").select("id").eq("obra_id", obra)).data).toHaveLength(1);
    expect((await comprador.cliente.rpc("alterar_status_fluxo_obra", {
      p_obra_id: obra, p_setor: "compras", p_status: "pedido_realizado",
    })).error?.message).toContain("Anexe o pedido");
  });

  it("impede pedido e aprovação por Compras antes da conferência técnica", async () => {
    const quote = await comprador.cliente.from("obra_compras_documentos").select("id").eq("obra_id", obra).eq("tipo", "orcamento").single();
    expect((await comprador.cliente.rpc("revisar_orcamento_obra", { p_documento_id: quote.data!.id, p_aprovar: true })).error).toBeTruthy();
    const pedido = await enviarArquivo(comprador);
    expect(pedido.erro).toBeNull();
    expect((await registrar(comprador, "pedido", pedido.caminho)).error?.message).toContain("aprovação técnica");
  });

  it("responsável técnico aprova; Compras registra o pedido; nova versão exige nova aprovação", async () => {
    const quote = await comprador.cliente.from("obra_compras_documentos").select("id").eq("obra_id", obra).eq("tipo", "orcamento").single();
    expect((await tecnico.cliente.rpc("revisar_orcamento_obra", { p_documento_id: quote.data!.id, p_aprovar: true })).error).toBeNull();
    const pedido = await enviarArquivo(comprador);
    expect(pedido.erro).toBeNull();
    expect((await registrar(comprador, "pedido", pedido.caminho)).error).toBeNull();
    const { data: fluxo } = await comprador.cliente.from("obra_fluxos").select("status").eq("obra_id", obra).eq("setor", "compras").single();
    expect(fluxo?.status).toBe("pedido_realizado");
    expect((await comprador.cliente.rpc("alterar_status_fluxo_obra", {
      p_obra_id: obra, p_setor: "compras", p_status: "faturado_fornecedor",
    })).error?.message).toContain("comprovante e a nota fiscal");
    expect((await registrar(comprador, "pedido", pedido.caminho)).error).toBeTruthy();

    const novo = await enviarArquivo(comprador);
    expect(novo.erro).toBeNull();
    expect((await registrar(comprador, "orcamento", novo.caminho, "Fornecedor alternativo")).error).toBeNull();
    const { data: orcamentos } = await comprador.cliente.from("obra_compras_documentos")
      .select("versao, revisao").eq("obra_id", obra).eq("tipo", "orcamento").order("versao");
    expect(orcamentos).toEqual([{ versao: 1, revisao: "aprovado" }, { versao: 2, revisao: "pendente" }]);
    const semAprovacao = await enviarArquivo(comprador);
    expect(semAprovacao.erro).toBeNull();
    expect((await registrar(comprador, "pedido", semAprovacao.caminho)).error?.message).toContain("aprovação técnica");
  });

  it("devolução exige motivo e preserva a decisão na versão anterior", async () => {
    const { data: atual } = await comprador.cliente.from("obra_compras_documentos")
      .select("id").eq("obra_id", obra).eq("tipo", "orcamento").order("versao", { ascending: false }).limit(1).single();
    expect((await tecnico.cliente.rpc("revisar_orcamento_obra", {
      p_documento_id: atual!.id, p_aprovar: false,
    })).error?.message).toContain("motivo");
    expect((await tecnico.cliente.rpc("revisar_orcamento_obra", {
      p_documento_id: atual!.id, p_aprovar: false, p_motivo: "Inversor incompatível com o conjunto de módulos.",
    })).error).toBeNull();
    const proxima = await enviarArquivo(comprador);
    expect(proxima.erro).toBeNull();
    expect((await registrar(comprador, "orcamento", proxima.caminho, "Fornecedor revisado")).error).toBeNull();
    const { data: versoes } = await comprador.cliente.from("obra_compras_documentos")
      .select("versao, revisao, motivo_reprovacao").eq("obra_id", obra).eq("tipo", "orcamento").order("versao");
    expect(versoes).toHaveLength(3);
    expect(versoes?.[1]).toMatchObject({ versao: 2, revisao: "reprovado", motivo_reprovacao: "Inversor incompatível com o conjunto de módulos." });
    expect(versoes?.[2]).toMatchObject({ versao: 3, revisao: "pendente" });
  });
});

describe("pagamento ao fornecedor", () => {
  let pedidoId: string;
  let pagamentoId: string;

  it("exige permissão financeira explícita e orçamento aprovado", async () => {
    const { data: quote } = await tecnico.cliente.from("obra_compras_documentos")
      .select("id").eq("obra_id", obra).eq("tipo", "orcamento").order("versao", { ascending: false }).limit(1).single();
    expect((await financeiro.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: quote!.id, p_valor: 12000,
    })).error).toBeTruthy();
    expect((await enviarFinanceiro(comprador)).erro).toBeTruthy();
    expect((await enviarFinanceiro(financeiro)).erro).toBeTruthy();
    const autoConcessao = await financeiro.cliente.from("empresa_membros")
      .update({ pode_pagar_fornecedor: true }).eq("id", membro.get(financeiro.id)!).select("id");
    expect(autoConcessao.data).toEqual([]);
    expect((await admin.cliente.from("empresa_membros").update({ pode_pagar_fornecedor: true })
      .eq("id", membro.get(financeiro.id)!)).error).toBeNull();
    expect((await enviarFinanceiro(financeiro)).erro).toBeNull();
    expect((await tecnico.cliente.rpc("revisar_orcamento_obra", {
      p_documento_id: quote!.id, p_aprovar: true,
    })).error).toBeNull();
    const pedidoArquivo = await enviarArquivo(comprador);
    expect(pedidoArquivo.erro).toBeNull();
    expect((await registrar(comprador, "pedido", pedidoArquivo.caminho)).error).toBeNull();
    const { data: pedido } = await comprador.cliente.from("obra_compras_documentos")
      .select("id").eq("obra_id", obra).eq("tipo", "pedido").order("versao", { ascending: false }).limit(1).single();
    pedidoId = pedido!.id;
    expect((await comprador.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 12000,
    })).error).toBeTruthy();
    expect((await tecnico.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 12000,
    })).error).toBeTruthy();
    expect((await vendedor.cliente.from("obra_pagamentos_fornecedor").select("id").eq("obra_id", obra)).data).toEqual([]);
  });

  it("versiona a autorização e impede comprovante fora do valor aprovado", async () => {
    const primeira = await financeiro.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 12000,
    });
    expect(primeira.error).toBeNull();
    expect((await financeiro.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 12500,
    })).error?.message).toContain("por que");
    const segunda = await financeiro.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 12500, p_justificativa: "Frete adicional validado.",
    });
    expect(segunda.error).toBeNull();
    pagamentoId = segunda.data!;
    const arquivo = await enviarFinanceiro(financeiro);
    expect(arquivo.erro).toBeNull();
    expect((await financeiro.cliente.rpc("registrar_arquivo_pagamento_fornecedor", {
      p_pagamento_id: primeira.data!, p_tipo: "comprovante", p_caminho: arquivo.caminho,
      p_nome: "comprovante.pdf", p_valor_pago: 12000,
    })).error?.message).toContain("mais recente");
    expect((await financeiro.cliente.rpc("registrar_arquivo_pagamento_fornecedor", {
      p_pagamento_id: pagamentoId, p_tipo: "nota_fiscal", p_caminho: arquivo.caminho,
      p_nome: "nf.pdf",
    })).error?.message).toContain("após o comprovante");
    expect((await financeiro.cliente.rpc("registrar_arquivo_pagamento_fornecedor", {
      p_pagamento_id: pagamentoId, p_tipo: "comprovante", p_caminho: arquivo.caminho,
      p_nome: "comprovante.pdf", p_valor_pago: 12000,
    })).error?.message).toContain("valor pago");
    expect((await financeiro.cliente.rpc("registrar_arquivo_pagamento_fornecedor", {
      p_pagamento_id: pagamentoId, p_tipo: "comprovante", p_caminho: arquivo.caminho,
      p_nome: "comprovante.pdf", p_valor_pago: 12500,
    })).error).toBeNull();
    expect((await financeiro.cliente.rpc("autorizar_pagamento_fornecedor", {
      p_pedido_id: pedidoId, p_valor: 13000, p_justificativa: "Tentativa após pagamento.",
    })).error?.message).toContain("já possui pagamento");
    const { data: versoes } = await financeiro.cliente.from("obra_pagamentos_fornecedor")
      .select("versao, valor_autorizado, valor_pago").eq("pedido_id", pedidoId).order("versao");
    expect(versoes).toEqual([
      { versao: 1, valor_autorizado: 12000, valor_pago: null },
      { versao: 2, valor_autorizado: 12500, valor_pago: 12500 },
    ]);
  });

  it("só conclui Compras após a nota e mantém documentos financeiros privados", async () => {
    expect((await comprador.cliente.rpc("alterar_status_fluxo_obra", {
      p_obra_id: obra, p_setor: "compras", p_status: "faturado_fornecedor",
    })).error?.message).toContain("nota fiscal");
    const arquivo = await enviarFinanceiro(financeiro);
    expect(arquivo.erro).toBeNull();
    expect((await financeiro.cliente.rpc("registrar_arquivo_pagamento_fornecedor", {
      p_pagamento_id: pagamentoId, p_tipo: "nota_fiscal", p_caminho: arquivo.caminho,
      p_nome: "nota-fiscal.pdf",
    })).error).toBeNull();
    const { data: fluxo } = await comprador.cliente.from("obra_fluxos")
      .select("status").eq("obra_id", obra).eq("setor", "compras").single();
    expect(fluxo?.status).toBe("faturado_fornecedor");
    expect((await vendedor.cliente.storage.from("obra-compras").createSignedUrl(arquivo.caminho, 60)).error).toBeTruthy();
    expect((await comprador.cliente.storage.from("obra-compras").createSignedUrl(arquivo.caminho, 60)).error).toBeTruthy();
    expect((await financeiro.cliente.storage.from("obra-compras").createSignedUrl(arquivo.caminho, 60)).error).toBeNull();
    expect((await admin.cliente.from("empresa_membros")
      .update({ pode_pagar_fornecedor: false }).eq("id", membro.get(financeiro.id)!)).error).toBeNull();
    expect((await financeiro.cliente.from("obra_pagamentos_fornecedor").select("id").eq("obra_id", obra)).data).toEqual([]);
    expect((await financeiro.cliente.storage.from("obra-compras").createSignedUrl(arquivo.caminho, 60)).error).toBeTruthy();
  });
});
