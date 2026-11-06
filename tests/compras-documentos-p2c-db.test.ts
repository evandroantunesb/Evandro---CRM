/**
 * Compras, P2c (20261128100000_documentos_cliente_engenharia_administrativo.sql): a Engenharia vê e usa como versão do
 * item o documento do cliente anexado no negócio; marcar inválido a versão vinda do negócio avisa o vendedor e aparece
 * como recusa no negócio; o Administrativo da obra vê os documentos do cliente e os dados para a NF (inscrição estadual
 * e e-mail). Precisa do Supabase local (CI).
 *
 * Cenário próprio ("P2c A/B" + sufixo, usuários "p2c-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { anexarDocumentosContrato, CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let engenheiro: Usuario;
let comprador: Usuario;
let operacional: Usuario;
let administrativo: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let negocioObra: string;
let itemFoto: string;
let itemFatura: string;
let anexoFoto: { id: string; caminho: string };
let anexoFatura: { id: string; caminho: string };

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const pdf = (texto = "%PDF-1.4 teste") => new Blob([texto], { type: "application/pdf" });
const IE = "123.456.789.110";

/** Anexo real do negócio (arquivo no Storage + registro), mais novo que os da base. */
async function anexoReal(categoria: string, nome: string, texto = `%PDF-1.4 ${nome}`) {
  const caminho = `${empresa}/${negocioObra}/${randomUUID()}-${nome}`;
  ok(await vendedor.cliente.storage.from("anexos").upload(caminho, pdf(texto), { contentType: "application/pdf" }), "upload anexo");
  const { data } = ok(
    await vendedor.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocioObra, categoria, caminho, nome, tamanho: texto.length })
      .select("id")
      .single(),
    "anexo",
  );
  return { id: data!.id, caminho };
}

/** O que o app faz: copia o anexo para a pasta da obra e registra como versão do item. */
async function usar(quem: Usuario, itemId: string, anexo: { id: string; caminho: string }) {
  const destino = `${empresa}/${obra}/${randomUUID()}-copia.pdf`;
  const copia = await quem.cliente.storage.from("anexos").copy(anexo.caminho, destino, { destinationBucket: "engenharia-documentos" });
  if (copia.error) return { data: null, error: copia.error };
  return quem.cliente.rpc("usar_documento_negocio_engenharia", { p_item_id: itemId, p_anexo_id: anexo.id, p_caminho: destino });
}

const notificacoes = async (quem: Usuario) =>
  (await servico.from("notificacoes").select("tipo, mensagem, link").eq("membro_id", membro[quem.id]).eq("tipo", "documento_cliente_recusado")).data ?? [];

describe("Compras P2c: documentos do cliente na Engenharia e no Administrativo (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, engenheiro, comprador, operacional, administrativo, adminB] = await Promise.all(
      ["p2c-admin", "p2c-vendedor", "p2c-engenheiro", "p2c-comprador", "p2c-operacional", "p2c-administrativo", "p2c-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `P2c A ${sufixo}` }, { nome: `P2c B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engenheiro, empresa, { papel: "operacao" }],
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
    for (const [quem, setor] of [
      [engenheiro, "engenharia"],
      [comprador, "compras"],
      [operacional, "operacional"],
      [administrativo, "administrativo"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade: "coordenar" }] as never }), "setor");
    }

    // Negócio ganho, contrato assinado e pagamento confirmado: nasce a obra.
    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
    const { data: c } = ok(
      await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, inscricao_estadual: IE, empresa_id: empresa, nome: "Juliana P2c" }).select("id").single(),
      "contato",
    );
    const { data: neg } = ok(
      await servico
        .from("negocios")
        .insert({ empresa_id: empresa, titulo: "Obra P2c", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
        .select("id")
        .single(),
      "negócio",
    );
    negocioObra = neg!.id;
    ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioObra), "ganho");
    await anexarDocumentosContrato(negocioObra);
    const { data: contrato } = ok(
      await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioObra, conteudo: "Contrato" }).select("id").single(),
      "contrato",
    );
    ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
    ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
    obra = (await servico.from("obras").select("id").eq("negocio_id", negocioObra).single()).data!.id;
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const item = async (documento: string) =>
      (
        await servico
          .from("obra_engenharia_itens")
          .select("id, engenharia_checklist_modelo!inner(documento_cliente)")
          .eq("obra_id", obra)
          .eq("engenharia_checklist_modelo.documento_cliente", documento)
          .single()
      ).data!.id;
    itemFoto = await item("documento_foto");
    itemFatura = await item("comprovante_residencia");
  });

  it("Engenharia vê o anexo mais recente de cada documento do cliente; os outros setores e outra empresa não", async () => {
    anexoFoto = await anexoReal("cnh", "cnh-juliana.pdf");
    anexoFatura = await anexoReal("fatura_gerador", "fatura-outubro.pdf");
    const geral = await anexoReal("geral", "proposta.pdf");

    const { data } = ok(await engenheiro.cliente.rpc("documentos_negocio_engenharia", { p_obra_id: obra }), "documentos do negócio");
    expect(data!.map((d) => d.documento).sort()).toEqual(["cartao_cnpj", "comprovante_residencia", "documento_foto"]);
    expect(data!.find((d) => d.documento === "documento_foto")).toMatchObject({ anexo_id: anexoFoto.id, nome: "cnh-juliana.pdf", enviado_por: membro[vendedor.id] });
    expect(JSON.stringify(data)).not.toContain("proposta.pdf");
    for (const quem of [comprador, operacional, administrativo, vendedor, adminB]) {
      expect((await quem.cliente.rpc("documentos_negocio_engenharia", { p_obra_id: obra })).data ?? [], quem.email).toHaveLength(0);
    }

    expect((await engenheiro.cliente.storage.from("anexos").download(anexoFoto.caminho)).error).toBeNull();
    expect((await engenheiro.cliente.storage.from("anexos").download(geral.caminho)).error).not.toBeNull();
    expect((await operacional.cliente.storage.from("anexos").download(anexoFoto.caminho)).error).not.toBeNull();
  });

  it("usar o arquivo do negócio: copia para a obra, vira versão do item (do negócio) e o item vai para conferência", async () => {
    const id = ok(await usar(engenheiro, itemFoto, anexoFoto), "usar").data as unknown as string;
    const { data: versao } = await servico.from("obra_engenharia_documentos").select("versao, nome, do_negocio, anexo_origem_id, caminho").eq("id", id).single();
    expect(versao).toMatchObject({ versao: 1, nome: "cnh-juliana.pdf", do_negocio: true, anexo_origem_id: anexoFoto.id });
    expect(versao!.caminho.startsWith(`${empresa}/${obra}/`)).toBe(true);
    const { data: item } = await servico.from("obra_engenharia_itens").select("status").eq("id", itemFoto).single();
    expect(item!.status).toBe("em_conferencia");
    // A cópia é da obra: o vendedor apagar o anexo não apaga a versão.
    expect((await engenheiro.cliente.storage.from("engenharia-documentos").download(versao!.caminho)).error).toBeNull();
    const { data: hist } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", "documento_engenharia_enviado");
    expect(hist!.some((h) => (h.dados as { origem?: string }).origem === "negocio")).toBe(true);
  });

  it("recusa: anexo repetido, de outra categoria, de outro negócio, item que não é documento e quem não atua na Engenharia", async () => {
    expect((await usar(engenheiro, itemFoto, anexoFoto)).error?.message).toContain("já é a versão atual");
    expect((await usar(engenheiro, itemFatura, anexoFoto)).error?.message).toContain("não encontrado para este item");
    const { data: outroItem } = await servico
      .from("obra_engenharia_itens")
      .select("id, engenharia_checklist_modelo!inner(documento_cliente)")
      .eq("obra_id", obra)
      .is("engenharia_checklist_modelo.documento_cliente", null)
      .limit(1)
      .single();
    expect((await usar(engenheiro, outroItem!.id, anexoFatura)).error?.message).toBeTruthy();
    // Arquivo que não é a cópia do anexo (tamanho diferente).
    const falso = `${empresa}/${obra}/${randomUUID()}-falso.pdf`;
    ok(await engenheiro.cliente.storage.from("engenharia-documentos").upload(falso, pdf("outro conteúdo, bem maior que o original")), "upload falso");
    const r = await engenheiro.cliente.rpc("usar_documento_negocio_engenharia", { p_item_id: itemFatura, p_anexo_id: anexoFatura.id, p_caminho: falso });
    expect(r.error?.message).toContain("não confere");
    // Quem não atua na Engenharia não lê nem registra.
    expect((await usar(comprador, itemFatura, anexoFatura)).error).not.toBeNull();
    expect((await adminB.cliente.rpc("usar_documento_negocio_engenharia", { p_item_id: itemFatura, p_anexo_id: anexoFatura.id, p_caminho: falso })).error).not.toBeNull();
  });

  it("inválido de versão vinda do negócio avisa o vendedor; inválido de versão da Engenharia não avisa", async () => {
    ok(await usar(engenheiro, itemFatura, anexoFatura), "usar fatura");
    ok(await engenheiro.cliente.rpc("alterar_item_engenharia", { p_item_id: itemFatura, p_status: "invalido", p_motivo: "Fatura de agosto" }), "inválido");
    const avisos = await notificacoes(vendedor);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem).toContain("o comprovante de residência de Juliana P2c");
    expect(avisos[0].mensagem).toContain("Fatura de agosto");
    expect(avisos[0].link).toBe(`/negocios/${negocioObra}?aba=proposta#documentos-cliente`);
    expect(await notificacoes(engenheiro)).toHaveLength(0);

    // Versão enviada pela própria Engenharia: sem aviso.
    const caminho = `${empresa}/${obra}/${randomUUID()}-cnh-engenharia.pdf`;
    ok(await engenheiro.cliente.storage.from("engenharia-documentos").upload(caminho, pdf(), { contentType: "application/pdf" }), "upload engenharia");
    ok(await engenheiro.cliente.rpc("registrar_documento_engenharia", { p_item_id: itemFoto, p_caminho: caminho, p_nome: "cnh-engenharia.pdf" }), "versão engenharia");
    ok(await engenheiro.cliente.rpc("alterar_item_engenharia", { p_item_id: itemFoto, p_status: "invalido", p_motivo: "Foto cortada" }), "inválido 2");
    expect(await notificacoes(vendedor)).toHaveLength(1);
  });

  it("no negócio: quem vê o negócio sabe o que a Engenharia recusou; anexado outro, a Engenharia pode usar como nova versão", async () => {
    const { data } = ok(await vendedor.cliente.rpc("documentos_recusados_negocio", { p_negocio_id: negocioObra }), "recusados");
    expect(data).toEqual([
      expect.objectContaining({ documento: "comprovante_residencia", anexo_id: anexoFatura.id, motivo: "Fatura de agosto", recusado_por: membro[engenheiro.id] }),
    ]);
    expect((await adminB.cliente.rpc("documentos_recusados_negocio", { p_negocio_id: negocioObra })).data ?? []).toHaveLength(0);

    const nova = await anexoReal("fatura_gerador", "fatura-novembro.pdf");
    const { data: doNegocio } = await engenheiro.cliente.rpc("documentos_negocio_engenharia", { p_obra_id: obra });
    expect(doNegocio!.find((d) => d.documento === "comprovante_residencia")!.anexo_id).toBe(nova.id);
    ok(await usar(engenheiro, itemFatura, nova), "nova versão");
    const { data: item } = await servico.from("obra_engenharia_itens").select("status").eq("id", itemFatura).single();
    expect(item!.status).toBe("em_conferencia");
    expect((await vendedor.cliente.rpc("documentos_recusados_negocio", { p_negocio_id: negocioObra })).data ?? []).toHaveLength(0);
  });

  it("negócio sem responsável: o aviso vai para os admins", async () => {
    ok(await servico.from("negocios").update({ responsavel_id: null }).eq("id", negocioObra), "sem responsável");
    ok(await engenheiro.cliente.rpc("alterar_item_engenharia", { p_item_id: itemFatura, p_status: "invalido", p_motivo: "Ilegível" }), "inválido 3");
    expect((await notificacoes(admin)).map((n) => n.mensagem)).toEqual([expect.stringContaining("Ilegível")]);
    expect(await notificacoes(vendedor)).toHaveLength(1);
    ok(await servico.from("negocios").update({ responsavel_id: membro[vendedor.id] }).eq("id", negocioObra), "responsável de volta");
  });

  it("Administrativo: dados para a NF (inscrição estadual e e-mail, sem telefone); Compras e Operacional não", async () => {
    const { data } = ok(await administrativo.cliente.rpc("dados_nf_cliente_obra", { p_obra_id: obra }), "dados NF");
    expect(data![0]).toMatchObject({ nome: "Juliana P2c", documento: CLIENTE_CONTRATO.documento, inscricao_estadual: IE, email: CLIENTE_CONTRATO.email, cep: CLIENTE_CONTRATO.cep });
    expect(data![0]).not.toHaveProperty("telefone");
    expect((await admin.cliente.rpc("dados_nf_cliente_obra", { p_obra_id: obra })).data).toHaveLength(1);
    for (const quem of [comprador, operacional, engenheiro, vendedor, adminB]) {
      expect((await quem.cliente.rpc("dados_nf_cliente_obra", { p_obra_id: obra })).data ?? [], quem.email).toHaveLength(0);
    }
  });

  it("Administrativo: vê e lê os documentos do cliente (negócio, Engenharia e Compras); o Operacional continua sem", async () => {
    const caminhoCompras = `${empresa}/${obra}/${randomUUID()}-contrato-social.pdf`;
    ok(await comprador.cliente.rpc("iniciar_compra_obra", { p_obra_id: obra }), "iniciar compra");
    ok(await comprador.cliente.storage.from("compras-obra").upload(caminhoCompras, pdf(), { contentType: "application/pdf" }), "upload compras");
    ok(
      await comprador.cliente.rpc("anexar_documento_cliente_compra", {
        p_obra_id: obra,
        p_documento: "outro",
        p_caminho: caminhoCompras,
        p_nome: "contrato-social.pdf",
        p_descricao: "Contrato social",
      }),
      "documento de Compras",
    );

    const { data: docs } = ok(await administrativo.cliente.rpc("documentos_cliente_obra", { p_obra_id: obra }), "documentos");
    expect(docs!.filter((d) => d.origem === "negocio").map((d) => d.documento).sort()).toEqual(["cartao_cnpj", "comprovante_residencia", "documento_foto"]);
    const daEngenharia = docs!.find((d) => d.origem === "engenharia")!;
    expect(daEngenharia).toBeTruthy();
    const { data: deCompras } = ok(await administrativo.cliente.rpc("documentos_cliente_compras_obra", { p_obra_id: obra }), "de Compras");
    expect(deCompras).toEqual([expect.objectContaining({ documento: "outro", descricao: "Contrato social", nome: "contrato-social.pdf" })]);

    expect((await administrativo.cliente.storage.from("anexos").download(anexoFoto.caminho)).error).toBeNull();
    expect((await administrativo.cliente.storage.from("engenharia-documentos").download(daEngenharia.caminho)).error).toBeNull();
    expect((await administrativo.cliente.storage.from("compras-obra").download(caminhoCompras)).error).toBeNull();

    for (const quem of [operacional, vendedor, adminB]) {
      expect((await quem.cliente.rpc("documentos_cliente_obra", { p_obra_id: obra })).data ?? [], quem.email).toHaveLength(0);
      expect((await quem.cliente.rpc("documentos_cliente_compras_obra", { p_obra_id: obra })).data ?? [], quem.email).toHaveLength(0);
    }
    expect((await operacional.cliente.storage.from("anexos").download(anexoFoto.caminho)).error).not.toBeNull();
    expect((await operacional.cliente.storage.from("engenharia-documentos").download(daEngenharia.caminho)).error).not.toBeNull();
  });
});
