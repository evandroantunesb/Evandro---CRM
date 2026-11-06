/**
 * Compras, P2b (20261127100000_compras_pdf_documentos.sql): documentos do cliente exigidos no contrato (CPF: documento
 * com foto e comprovante de residência; CNPJ: cartão CNPJ e comprovante), Compras vendo todos os dados e os documentos
 * do cliente (do negócio, da Engenharia ou anexados por Compras), frete CIF/FOB no pedido e no orçamento, faturamento,
 * entrega e observações no pedido. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Documentos A/B" + sufixo, usuários "cpd-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { anexarDocumentosContrato, CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let comprador: Usuario;
let operacional: Usuario;
let administrativo: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let negocioObra: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const dia = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + n * 86400000));
const pdf = (texto = "%PDF-1.4 teste") => new Blob([texto], { type: "application/pdf" });

async function negocio(emp: string, titulo: string, contato: Record<string, unknown> = CLIENTE_CONTRATO): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = ok(await servico.from("contatos").insert({ ...contato, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single(), "contato");
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: emp, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  return neg!.id;
}

const anexo = (negocioId: string, categoria: string) =>
  servico.from("anexos").insert({
    empresa_id: empresa,
    negocio_id: negocioId,
    categoria,
    caminho: `${empresa}/${negocioId}/${randomUUID()}-${categoria}.pdf`,
    nome: `${categoria}.pdf`,
    tamanho: 10,
    tipo_mime: "application/pdf",
  });
const gerarContrato = (negocioId: string) =>
  vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato" }).select("id").single();

const ITENS = [{ kit_indice: null, descricao: "Kit fotovoltaico", unidade: "un", quantidade: 1, valor_unitario: 10000 }];
const criarPedido = (quem: Usuario, extra: Partial<Record<string, unknown>> = {}) =>
  quem.cliente.rpc("criar_pedido_compra", {
    p_obra_id: obra,
    p_fornecedor: "Distribuidora Solar Sul",
    p_categoria: "equipamentos",
    p_entrega_prevista: dia(8),
    p_vencimento: dia(30),
    p_numero_fornecedor: null,
    p_frete: 0,
    p_itens: ITENS,
    ...extra,
  } as never);
const pedido = async (id: string) => (await servico.from("compras_pedidos").select("*").eq("id", id).single()).data!;

describe("Compras P2b: documentos do cliente, faturamento e frete (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, comprador, operacional, administrativo, adminB] = await Promise.all(
      ["cpd-admin", "cpd-vendedor", "cpd-comprador", "cpd-operacional", "cpd-administrativo", "cpd-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Documentos A ${sufixo}`, cnpj: "11.222.333/0001-81" }, { nome: `Documentos B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [comprador, empresa, { papel: "operacao" }],
      [operacional, empresa, { papel: "operacao" }],
      [administrativo, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, setor, capacidade] of [
      [comprador, "compras", "executar"],
      [operacional, "operacional", "coordenar"],
      [administrativo, "administrativo", "coordenar"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never }), "setor");
    }
  });

  it("empresa nova: o checklist da Engenharia marca os três documentos do cliente pelo título", async () => {
    const { data } = await servico.from("engenharia_checklist_modelo").select("titulo, documento_cliente").eq("empresa_id", empresa).not("documento_cliente", "is", null);
    expect(data!.map((m) => m.documento_cliente).sort()).toEqual(["cartao_cnpj", "comprovante_residencia", "documento_foto"]);
  });

  it("cliente CPF: o contrato exige documento com foto e comprovante de residência", async () => {
    const n = await negocio(empresa, "Contrato CPF");
    expect((await gerarContrato(n)).error?.message).toContain("documento com foto, comprovante de residência");
    ok(await anexo(n, "cnh"), "cnh");
    expect((await gerarContrato(n)).error?.message).toContain("anexe os documentos do cliente: comprovante de residência");
    ok(await anexo(n, "fatura_gerador"), "fatura");
    ok(await gerarContrato(n), "contrato CPF");
  });

  it("cliente CNPJ: o contrato exige cartão CNPJ e comprovante de residência (sem documento com foto)", async () => {
    const n = await negocio(empresa, "Contrato CNPJ", {
      ...CLIENTE_CONTRATO,
      tipo: "pj",
      documento: "11.222.333/0001-81",
      rg: null,
      data_nascimento: null,
    });
    expect((await gerarContrato(n)).error?.message).toContain("cartão CNPJ, comprovante de residência");
    ok(await anexo(n, "fatura_gerador"), "fatura");
    ok(await anexo(n, "cartao_cnpj"), "cartão CNPJ");
    ok(await gerarContrato(n), "contrato CNPJ");
  });

  it("obra criada; Compras vê todos os dados do cliente para o faturamento; Operacional e Administrativo não", async () => {
    negocioObra = await negocio(empresa, "Obra Documentos");
    ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioObra), "ganho");
    await anexarDocumentosContrato(negocioObra);
    const { data: contrato } = ok(await gerarContrato(negocioObra), "contrato");
    ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
    ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
    obra = (await servico.from("obras").select("id").eq("negocio_id", negocioObra).single()).data!.id;
    ok(await comprador.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra }), "iniciar");

    const { data: dados } = ok(await comprador.cliente.rpc("dados_faturamento_obra", { p_obra_id: obra }), "dados");
    expect(dados![0]).toMatchObject({ documento: CLIENTE_CONTRATO.documento, rg: CLIENTE_CONTRATO.rg, email: CLIENTE_CONTRATO.email, cep: CLIENTE_CONTRATO.cep });
    const { data: operacao } = ok(await comprador.cliente.rpc("obras_operacao", { p_obra_id: obra }), "obras_operacao");
    expect(operacao![0]).toMatchObject({ cliente_documento: CLIENTE_CONTRATO.documento, cliente_email: CLIENTE_CONTRATO.email, cliente_rg: CLIENTE_CONTRATO.rg });
    for (const quem of [operacional, administrativo, vendedor, adminB]) {
      const { data } = await quem.cliente.rpc("dados_faturamento_obra", { p_obra_id: obra });
      expect(data ?? [], quem.email).toHaveLength(0);
    }
  });

  it("documentos do cliente: do negócio, só os três tipos, e o arquivo lido por Compras (não pelo Operacional)", async () => {
    const caminhoCnh = `${empresa}/${negocioObra}/${randomUUID()}-cnh.pdf`;
    ok(await vendedor.cliente.storage.from("anexos").upload(caminhoCnh, pdf(), { contentType: "application/pdf" }), "upload anexo");
    ok(await servico.from("anexos").insert({ empresa_id: empresa, negocio_id: negocioObra, categoria: "cnh", caminho: caminhoCnh, nome: "cnh-real.pdf", tamanho: 10 }), "anexo cnh");
    const caminhoGeral = `${empresa}/${negocioObra}/${randomUUID()}-proposta.pdf`;
    ok(await vendedor.cliente.storage.from("anexos").upload(caminhoGeral, pdf(), { contentType: "application/pdf" }), "upload geral");
    ok(await servico.from("anexos").insert({ empresa_id: empresa, negocio_id: negocioObra, categoria: "geral", caminho: caminhoGeral, nome: "proposta.pdf", tamanho: 10 }), "anexo geral");

    const { data } = ok(await comprador.cliente.rpc("documentos_cliente_obra", { p_obra_id: obra }), "documentos");
    const doNegocio = data!.filter((d) => d.origem === "negocio");
    expect(doNegocio.map((d) => d.documento).sort()).toEqual(["cartao_cnpj", "comprovante_residencia", "documento_foto"]);
    expect(doNegocio.find((d) => d.documento === "documento_foto")!.nome).toBe("cnh-real.pdf");
    expect(JSON.stringify(data)).not.toContain("proposta.pdf");

    expect((await comprador.cliente.storage.from("anexos").download(caminhoCnh)).error).toBeNull();
    expect((await comprador.cliente.storage.from("anexos").download(caminhoGeral)).error).not.toBeNull();
    expect((await operacional.cliente.storage.from("anexos").download(caminhoCnh)).error).not.toBeNull();
    expect((await operacional.cliente.rpc("documentos_cliente_obra", { p_obra_id: obra })).data ?? []).toHaveLength(0);
  });

  it("documentos do cliente: o item marcado no checklist da Engenharia também aparece", async () => {
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: item } = await servico
      .from("obra_engenharia_itens")
      .select("id, engenharia_checklist_modelo!inner(documento_cliente)")
      .eq("obra_id", obra)
      .eq("engenharia_checklist_modelo.documento_cliente", "comprovante_residencia")
      .single();
    const caminho = `${empresa}/${obra}/${randomUUID()}-fatura.pdf`;
    ok(await admin.cliente.storage.from("engenharia-documentos").upload(caminho, pdf(), { contentType: "application/pdf" }), "upload engenharia");
    ok(await admin.cliente.rpc("registrar_documento_engenharia", { p_item_id: item!.id, p_caminho: caminho, p_nome: "fatura-engenharia.pdf" }), "documento engenharia");
    const { data } = ok(await comprador.cliente.rpc("documentos_cliente_obra", { p_obra_id: obra }), "documentos");
    expect(data!.find((d) => d.origem === "engenharia")).toMatchObject({ documento: "comprovante_residencia", nome: "fatura-engenharia.pdf" });
    expect((await comprador.cliente.storage.from("engenharia-documentos").download(caminho)).error).toBeNull();
  });

  it("Compras anexa documento do cliente (e outro documento, com descrição)", async () => {
    const caminho = `${empresa}/${obra}/${randomUUID()}-contrato-social.pdf`;
    ok(await comprador.cliente.storage.from("compras-obra").upload(caminho, pdf(), { contentType: "application/pdf" }), "upload");
    const sem = await comprador.cliente.rpc("anexar_documento_cliente_compra", { p_obra_id: obra, p_documento: "outro", p_caminho: caminho, p_nome: "contrato-social.pdf" });
    expect(sem.error?.message).toContain("que documento");
    ok(
      await comprador.cliente.rpc("anexar_documento_cliente_compra", { p_obra_id: obra, p_documento: "outro", p_caminho: caminho, p_nome: "contrato-social.pdf", p_descricao: "Contrato social" }),
      "outro documento",
    );
    const outro = `${empresa}/${obra}/${randomUUID()}-cartao.pdf`;
    ok(await comprador.cliente.storage.from("compras-obra").upload(outro, pdf(), { contentType: "application/pdf" }), "upload 2");
    expect((await operacional.cliente.rpc("anexar_documento_cliente_compra", { p_obra_id: obra, p_documento: "cartao_cnpj", p_caminho: outro, p_nome: "c.pdf" })).error?.code).toBe("42501");
    const { data } = await servico.from("compras_arquivos").select("tipo, documento, descricao").eq("obra_id", obra).eq("tipo", "documento_cliente");
    expect(data).toEqual([{ tipo: "documento_cliente", documento: "outro", descricao: "Contrato social" }]);
  });

  it("pedido: CIF zera o frete; FOB leva o valor; sem modalidade, FOB se há frete", async () => {
    const cif = ok(await criarPedido(comprador, { p_frete: 300, p_frete_modalidade: "cif" }), "CIF").data as unknown as string;
    expect(await pedido(cif)).toMatchObject({ frete_modalidade: "cif", frete: 0, valor_total: 10000, faturar_para: "cliente", entrega_endereco: null });
    const fob = ok(await criarPedido(comprador, { p_frete: 350, p_frete_modalidade: "fob" }), "FOB").data as unknown as string;
    expect(await pedido(fob)).toMatchObject({ frete_modalidade: "fob", frete: 350, valor_total: 10350 });
    const antigo = ok(await criarPedido(comprador, { p_frete: 120 }), "sem modalidade").data as unknown as string;
    expect((await pedido(antigo)).frete_modalidade).toBe("fob");
  });

  it("pedido: faturar para a empresa exige endereço de entrega; observações vão no pedido", async () => {
    expect((await criarPedido(comprador, { p_faturar_para: "empresa" })).error?.message).toContain("endereço de entrega");
    expect((await criarPedido(comprador, { p_entrega_endereco: "Sítio Boa Vista, km 3" })).error?.message).toContain("quem recebe");
    expect((await criarPedido(comprador, { p_observacao: "x".repeat(501) })).error?.message).toContain("500");
    const id = ok(
      await criarPedido(comprador, {
        p_faturar_para: "empresa",
        p_entrega_endereco: "Sítio Boa Vista, km 3, Valinhos/SP",
        p_entrega_recebe: "Marcos",
        p_entrega_telefone: "(19) 99999-0000",
        p_observacao: "Entregar pela manhã.",
      }),
      "pedido empresa",
    ).data as unknown as string;
    expect(await pedido(id)).toMatchObject({
      faturar_para: "empresa",
      entrega_endereco: "Sítio Boa Vista, km 3, Valinhos/SP",
      entrega_recebe: "Marcos",
      entrega_telefone: "(19) 99999-0000",
      observacao: "Entregar pela manhã.",
    });
    // Editar volta ao padrão: cliente, no endereço do faturamento.
    ok(
      await comprador.cliente.rpc("editar_pedido_compra", {
        p_pedido_id: id,
        p_fornecedor: "Distribuidora Solar Sul",
        p_categoria: "equipamentos",
        p_entrega_prevista: dia(8),
        p_vencimento: dia(30),
        p_numero_fornecedor: null,
        p_frete: 0,
        p_itens: ITENS,
      } as never),
      "editar",
    );
    expect(await pedido(id)).toMatchObject({ faturar_para: "cliente", entrega_endereco: null, entrega_recebe: null, observacao: null, frete_modalidade: "cif" });
  });

  it("orçamento: CIF sem frete, FOB com o valor do frete", async () => {
    const anexar = async (extra: Record<string, unknown>) => {
      const caminho = `${empresa}/${obra}/${randomUUID()}-orc.pdf`;
      ok(await comprador.cliente.storage.from("compras-obra").upload(caminho, pdf(), { contentType: "application/pdf" }), "upload orçamento");
      return comprador.cliente.rpc("anexar_orcamento_compra", {
        p_obra_id: obra,
        p_fornecedor: "Atacado Energia",
        p_valor: 13590,
        p_cobertura: "kit_completo",
        p_itens: "",
        p_entrega_prevista: dia(6),
        p_valido_ate: dia(3),
        p_condicao_pagamento: "",
        p_observacao: "",
        p_caminho: caminho,
        p_nome: "orc.pdf",
        ...extra,
      } as never);
    };
    const cif = ok(await anexar({ p_frete_modalidade: "cif", p_frete: 200 }), "CIF").data as unknown as string;
    const fob = ok(await anexar({ p_frete_modalidade: "fob", p_frete: 350 }), "FOB").data as unknown as string;
    expect((await anexar({ p_frete_modalidade: "xyz" })).error?.message).toContain("CIF ou FOB");
    const { data } = await servico.from("compras_orcamentos").select("id, frete_modalidade, frete").in("id", [cif, fob]);
    expect(data!.find((o) => o.id === cif)).toMatchObject({ frete_modalidade: "cif", frete: 0 });
    expect(data!.find((o) => o.id === fob)).toMatchObject({ frete_modalidade: "fob", frete: 350 });
  });
});
