/**
 * Contas a pagar da obra e nota fiscal do cliente (20261121100000_contas_pagar_obra.sql): o Administrativo lança e paga
 * contas de fornecedor (pagamento com comprovante vira custo real; erro se corrige com estorno), anexa notas fiscais e
 * a NF do cliente (que conclui o marco). Quem vê: admin, gestor, Administrativo e Operacional; o arquivo da NF do
 * cliente, sem o Operacional. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Contas A/B" + sufixo, usuários "cp-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "financeiro-obra";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let operacional: Usuario;
let administrativo: Usuario;
let adminB: Usuario;
let empresa: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const amanha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86400000));
const pdf = () => new Blob(["%PDF-1.4 arquivo de teste"], { type: "application/pdf" });

async function criarObra(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function enviar(quem: Usuario, obra: string, tipo: "fornecedor" | "cliente", obraEmpresa = empresa) {
  const caminho = `${obraEmpresa}/${obra}/${tipo}/${randomUUID()}-arquivo.pdf`;
  const { error } = await quem.cliente.storage.from(BUCKET).upload(caminho, pdf(), { contentType: "application/pdf" });
  return { caminho, error };
}

const lancar = (quem: Usuario, obra: string, extra: Partial<Record<string, unknown>> = {}) =>
  quem.cliente.rpc("lancar_conta_pagar_obra", {
    p_obra_id: obra,
    p_fornecedor: "Distribuidora Solar Sul",
    p_categoria: "equipamentos",
    p_descricao: "Kit",
    p_valor: 1800,
    p_vencimento: hoje(),
    ...extra,
  } as never);

const conta = async (id: string) => (await servico.from("obra_contas_pagar").select("*").eq("id", id).single()).data!;
const historico = async (obra: string, tipo: string) =>
  (await servico.from("obra_historico").select("setor, dados").eq("obra_id", obra).eq("tipo", tipo).order("id")).data ?? [];

describe("Contas a pagar da obra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;
  let paga: string;

  beforeAll(async () => {
    [admin, gestor, vendedor, operacional, administrativo, adminB] = await Promise.all(
      ["cp-admin", "cp-gestor", "cp-vendedor", "cp-operacional", "cp-administrativo", "cp-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Contas A ${sufixo}` }, { nome: `Contas B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [operacional, empresa, { papel: "operacao" }],
      [administrativo, empresa, { papel: "operacao" }],
      [adminB, empresas![1].id, { papel: "admin" }],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    const { data: equipe } = ok(await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe contas" }).select("id").single(), "equipe");
    ok(
      await servico.from("equipe_membros").insert([
        { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
        { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
      ]),
      "equipe membros",
    );
    for (const [quem, setor] of [
      [operacional, "operacional"],
      [administrativo, "administrativo"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade: "coordenar" }] as never }), "setor");
    }
    obra = await criarObra("Contas");
  });

  it("lança só o Administrativo (ou admin); o histórico diz fornecedor e categoria, nunca o valor", async () => {
    for (const quem of [operacional, gestor, vendedor, adminB]) expect((await lancar(quem, obra)).error?.code, quem.email).toBe("42501");
    expect((await lancar(administrativo, obra, { p_fornecedor: "X" })).error?.message).toContain("fornecedor");
    expect((await lancar(administrativo, obra, { p_valor: 0 })).error?.message).toContain("maior que zero");
    expect((await lancar(administrativo, obra, { p_categoria: "outra" })).error?.message).toContain("Categoria");
    const { data: id } = ok(await lancar(administrativo, obra), "lançar");
    paga = id as string;
    expect(await conta(paga)).toMatchObject({ situacao: "a_pagar", fornecedor: "Distribuidora Solar Sul", valor: 1800, custo_id: null });
    const [h] = await historico(obra, "conta_pagar_lancada");
    expect(h).toMatchObject({ setor: "administrativo", dados: { fornecedor: "Distribuidora Solar Sul", categoria: "equipamentos" } });
    expect(JSON.stringify(h)).not.toContain("1800");
  });

  it("veem as contas: admin, gestor, Administrativo e Operacional; vendedor e outra empresa não", async () => {
    for (const quem of [admin, gestor, administrativo, operacional]) {
      const { data } = await quem.cliente.from("obra_contas_pagar").select("id").eq("id", paga);
      expect(data, quem.email).toHaveLength(1);
    }
    for (const quem of [vendedor, adminB]) expect((await quem.cliente.from("obra_contas_pagar").select("id").eq("id", paga)).data).toEqual([]);
  });

  it("anexos: só o Administrativo envia, e só na pasta de uma obra da empresa", async () => {
    expect((await enviar(operacional, obra, "fornecedor")).error).not.toBeNull();
    expect((await enviar(vendedor, obra, "fornecedor")).error).not.toBeNull();
    expect((await enviar(administrativo, obra, "outra" as never)).error).not.toBeNull();
    expect((await enviar(administrativo, randomUUID(), "fornecedor")).error).not.toBeNull();
    expect((await enviar(administrativo, obra, "fornecedor")).error).toBeNull();
  });

  it("pagar pede data até hoje e comprovante desta obra; vira custo real na categoria", async () => {
    const pagar = (quem: Usuario, extra: Partial<Record<string, unknown>>) =>
      quem.cliente.rpc("registrar_pagamento_conta_pagar", { p_conta_id: paga, p_pago_em: hoje(), p_comprovante_caminho: null, p_comprovante_nome: "c.pdf", ...extra } as never);
    const { caminho } = await enviar(administrativo, obra, "fornecedor");
    expect((await pagar(operacional, { p_comprovante_caminho: caminho })).error?.code).toBe("42501");
    expect((await pagar(administrativo, {})).error?.message).toBe("Envie o arquivo.");
    expect((await pagar(administrativo, { p_comprovante_caminho: caminho, p_pago_em: amanha() })).error?.message).toContain("hoje ou antes");
    expect((await pagar(administrativo, { p_comprovante_caminho: `${empresa}/${obra}/fornecedor/inexistente.pdf` })).error?.message).toContain("não é desta obra");
    ok(await pagar(administrativo, { p_comprovante_caminho: caminho }), "pagar");

    const c = await conta(paga);
    expect(c).toMatchObject({ situacao: "paga", pago_em: hoje(), comprovante_caminho: caminho, pago_por: membro[administrativo.id], nf_caminho: null });
    const { data: custo } = await servico.from("obra_custos").select("categoria, valor, ocorrido_em, descricao").eq("id", c.custo_id!).single();
    expect(custo).toMatchObject({ categoria: "equipamentos", valor: 1800, ocorrido_em: hoje(), descricao: "Distribuidora Solar Sul · Kit" });
    expect((await pagar(administrativo, { p_comprovante_caminho: caminho })).error?.message).toContain("não está a pagar");

    // Quem vê os custos baixa o comprovante; o vendedor não.
    expect((await operacional.cliente.storage.from(BUCKET).download(caminho)).error).toBeNull();
    expect((await vendedor.cliente.storage.from(BUCKET).download(caminho)).error).not.toBeNull();
  });

  it("NF do fornecedor pode vir depois do pagamento", async () => {
    const { caminho } = await enviar(administrativo, obra, "fornecedor");
    ok(await administrativo.cliente.rpc("anexar_nf_conta_pagar", { p_conta_id: paga, p_caminho: caminho, p_nome: "nf.pdf" }), "nf");
    expect(await conta(paga)).toMatchObject({ nf_caminho: caminho, nf_nome: "nf.pdf" });
    expect((await historico(obra, "nf_fornecedor_anexada")).length).toBe(1);
  });

  it("custo de conta paga só se estorna pela conta; o estorno deixa a conta estornada", async () => {
    const c = await conta(paga);
    expect((await administrativo.cliente.rpc("estornar_custo_obra", { p_custo_id: c.custo_id!, p_motivo: "Errado" })).error?.message).toContain("estorne pelo pagamento");
    expect((await administrativo.cliente.rpc("cancelar_conta_pagar", { p_conta_id: paga, p_motivo: "Errado" })).error?.message).toContain("estorno");
    expect((await administrativo.cliente.rpc("estornar_pagamento_conta_pagar", { p_conta_id: paga, p_motivo: "x" })).error?.message).toContain("motivo");
    ok(await administrativo.cliente.rpc("estornar_pagamento_conta_pagar", { p_conta_id: paga, p_motivo: "Valor errado" }), "estorno");
    expect(await conta(paga)).toMatchObject({ situacao: "estornada", motivo: "Valor errado", encerrada_por: membro[administrativo.id] });
    const { data: custos } = await servico.from("obra_custos").select("valor").eq("obra_id", obra);
    expect(custos!.reduce((s, l) => s + Number(l.valor), 0)).toBe(0);
    expect((await administrativo.cliente.rpc("estornar_pagamento_conta_pagar", { p_conta_id: paga, p_motivo: "De novo" })).error?.message).toContain("Só uma conta paga");
  });

  it("conta a pagar se cancela com motivo", async () => {
    const { data: id } = ok(await lancar(administrativo, obra, { p_fornecedor: "Transportadora Rápida", p_categoria: "frete", p_valor: 380 }), "lançar");
    expect((await administrativo.cliente.rpc("cancelar_conta_pagar", { p_conta_id: id as string, p_motivo: "" })).error?.message).toContain("motivo");
    ok(await administrativo.cliente.rpc("cancelar_conta_pagar", { p_conta_id: id as string, p_motivo: "Lançada em dobro" }), "cancelar");
    expect(await conta(id as string)).toMatchObject({ situacao: "cancelada", motivo: "Lançada em dobro" });
  });

  it("o Administrativo também lança custo real direto, em nome do próprio setor", async () => {
    ok(
      await administrativo.cliente.rpc("lancar_custo_obra", { p_obra_id: obra, p_categoria: "frete", p_valor: 50, p_data: hoje(), p_descricao: "Taxa de entrega" }),
      "custo",
    );
    const linhas = await historico(obra, "custo_lancado");
    expect(linhas.at(-1)?.setor).toBe("administrativo");
    ok(
      await operacional.cliente.rpc("lancar_custo_obra", { p_obra_id: obra, p_categoria: "frete", p_valor: 20, p_data: hoje(), p_descricao: "Despesa de campo" }),
      "custo operacional",
    );
    expect((await historico(obra, "custo_lancado")).at(-1)?.setor).toBe("operacional");
  });

  it("NF do cliente: o Administrativo anexa e o marco conclui; o Operacional não vê o arquivo", async () => {
    expect((await enviar(operacional, obra, "cliente")).error).not.toBeNull();
    const { caminho, error } = await enviar(administrativo, obra, "cliente");
    expect(error).toBeNull();
    expect((await operacional.cliente.rpc("anexar_nf_cliente_obra", { p_obra_id: obra, p_caminho: caminho, p_nome: "nf.pdf" })).error?.code).toBe("42501");
    ok(await administrativo.cliente.rpc("anexar_nf_cliente_obra", { p_obra_id: obra, p_caminho: caminho, p_nome: "nf-cliente.pdf" }), "nf cliente");

    const { data: marco } = await servico.from("obra_marcos").select("status").eq("obra_id", obra).eq("marco", "nf_cliente").single();
    expect(marco!.status).toBe("concluido");
    for (const quem of [admin, gestor, administrativo]) {
      expect((await quem.cliente.from("obra_nf_cliente").select("nome").eq("obra_id", obra)).data, quem.email).toEqual([{ nome: "nf-cliente.pdf" }]);
      expect((await quem.cliente.storage.from(BUCKET).download(caminho)).error, quem.email).toBeNull();
    }
    expect((await operacional.cliente.from("obra_nf_cliente").select("nome").eq("obra_id", obra)).data).toEqual([]);
    expect((await operacional.cliente.storage.from(BUCKET).download(caminho)).error).not.toBeNull();
  });

  it("pagamento do cliente na obra: para quem vê os custos", async () => {
    const { data } = ok(await administrativo.cliente.rpc("pagamento_cliente_obra", { p_obra_id: obra }), "pagamento cliente");
    expect(data).toEqual([expect.objectContaining({ situacao: "confirmado", valor: 30000, confirmado_por_membro_id: membro[admin.id] })]);
    expect((await vendedor.cliente.rpc("pagamento_cliente_obra", { p_obra_id: obra })).data).toEqual([]);
  });

  it("ninguém escreve direto nas tabelas", async () => {
    expect((await admin.cliente.from("obra_contas_pagar").update({ situacao: "paga" }).eq("id", paga).select("id")).error).not.toBeNull();
    expect((await admin.cliente.from("obra_nf_cliente").delete().eq("obra_id", obra).select("obra_id")).error).not.toBeNull();
    expect((await administrativo.cliente.storage.from(BUCKET).remove([`${empresa}/${obra}/cliente/x.pdf`])).data ?? []).toEqual([]);
  });
});
