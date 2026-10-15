/**
 * Integridade de contratos na escrita direta pela API (20261015100000_integridade_contratos.sql).
 * Quem tem acesso financeiro (admin, gestor, vendedor) não grava contrato de uma empresa em outra,
 * não troca empresa/negócio, não cria contrato já assinado e não escolhe o beneficiário da assinatura;
 * o fluxo legítimo (rascunho -> upsert do texto -> assinatura por UPDATE -> confirmação) segue igual.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string };

let multi: Usuario; // vendedor na A, gestor na B
let gestorA: Usuario, vendedorA: Usuario, adminA: Usuario, adminB: Usuario;
let A: Empresa, B: Empresa;
const membro: Record<string, string> = {};

async function criarEmpresa(nome: string): Promise<Empresa> {
  const { data: e, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", e!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: e!.id, nome: `Cliente ${nome}` }).select("id").single();
  return { id: e!.id, funil: f!.id, etapa: et!.id, contato: c!.id };
}

async function vincular(e: Empresa, vs: { u: Usuario; papel: "admin" | "gestor" | "vendedor" | "sdr" }[]) {
  const { data, error } = await servico
    .from("empresa_membros")
    .insert(vs.map((v) => ({ empresa_id: e.id, user_id: v.u.id, papel: v.papel, perfil_gamificacao: "closer" as const })))
    .select("id, user_id");
  if (error) throw error;
  for (const v of data!) membro[`${e.id}:${v.user_id}`] = v.id;
}

const m = (e: Empresa, u: Usuario) => membro[`${e.id}:${u.id}`];

async function criarNegocio(e: Empresa, titulo: string, responsavel: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: e.id, titulo, contato_id: e.contato, funil_id: e.funil, etapa_id: e.etapa, responsavel_id: m(e, responsavel), valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

const contratoNoBanco = async (id: string) => (await servico.from("contratos").select("*").eq("id", id).single()).data!;
const eventosDo = async (negocioId: string) =>
  ((await servico.from("eventos").select("tipo, ator_id, beneficiario_id").eq("entidade_id", negocioId).order("id")).data ?? []);

async function rascunho(u: Usuario, e: Empresa, negocioId: string) {
  const r = await u.cliente
    .from("contratos")
    .insert({ empresa_id: e.id, negocio_id: negocioId, conteudo: "Contrato de teste", criado_por: m(e, u) })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

beforeAll(async () => {
  [multi, gestorA, vendedorA, adminA, adminB] = await Promise.all(["ic-multi", "ic-gestor", "ic-vend", "ic-admina", "ic-adminb"].map(criarUsuario));
  A = await criarEmpresa("Integridade A");
  B = await criarEmpresa("Integridade B");
  await vincular(A, [{ u: multi, papel: "vendedor" }, { u: gestorA, papel: "gestor" }, { u: vendedorA, papel: "vendedor" }, { u: adminA, papel: "admin" }]);
  await vincular(B, [{ u: multi, papel: "gestor" }, { u: adminB, papel: "admin" }]);
});

describe("empresa do contrato = empresa do negócio", () => {
  it("INSERT com empresa_id de outra empresa onde o usuário também tem papel é recusado", async () => {
    const n = await criarNegocio(A, "ic-insert-cruzado", multi);
    const r = await multi.cliente.from("contratos").insert({ empresa_id: B.id, negocio_id: n, conteudo: "x", criado_por: m(A, multi) }).select("id");
    expect(r.error).not.toBeNull();
    expect((await servico.from("contratos").select("id").eq("negocio_id", n)).data).toHaveLength(0);
  });

  it("nem o service_role grava contrato com empresa diferente da do negócio", async () => {
    const n = await criarNegocio(A, "ic-insert-service", multi);
    const r = await servico.from("contratos").insert({ empresa_id: B.id, negocio_id: n, conteudo: "x" });
    expect(r.error).not.toBeNull();
    expect((await servico.from("contratos").select("id").eq("negocio_id", n)).data).toHaveLength(0);
  });

  it("UPDATE de empresa_id (para outra empresa ou para qualquer UUID) e de negocio_id é recusado, em rascunho e assinado", async () => {
    const n1 = await criarNegocio(A, "ic-upd-1", multi);
    const n2 = await criarNegocio(A, "ic-upd-2", multi);
    const id = await rascunho(multi, A, n1);
    const tentativas = [{ empresa_id: B.id }, { empresa_id: crypto.randomUUID() }, { negocio_id: n2 }];
    for (const t of tentativas) expect((await multi.cliente.from("contratos").update(t).eq("id", id).select("id")).error).not.toBeNull();

    expect((await multi.cliente.from("contratos").update({ status: "assinado" }).eq("id", id)).error).toBeNull();
    for (const t of tentativas) expect((await multi.cliente.from("contratos").update(t).eq("id", id).select("id")).error).not.toBeNull();

    const c = await contratoNoBanco(id);
    expect(c.empresa_id).toBe(A.id);
    expect(c.negocio_id).toBe(n1);
  });

  it("manutenção pelo service_role: muda de negócio na mesma empresa; a FK composta recusa trocar de empresa", async () => {
    const n1 = await criarNegocio(A, "ic-manut-1", multi);
    const n2 = await criarNegocio(A, "ic-manut-2", multi);
    const nB = await criarNegocio(B, "ic-manut-B", multi);
    const id = await rascunho(multi, A, n1);
    expect((await servico.from("contratos").update({ negocio_id: n2 }).eq("id", id)).error).toBeNull();
    expect((await servico.from("contratos").update({ negocio_id: nB }).eq("id", id)).error).not.toBeNull();
    expect((await contratoNoBanco(id)).negocio_id).toBe(n2);
  });
});

describe("a assinatura nasce do UPDATE, com responsável e eventos do banco", () => {
  it("INSERT já assinado é recusado e não emite evento", async () => {
    const n = await criarNegocio(A, "ic-ja-assinado", vendedorA);
    const r = await vendedorA.cliente.from("contratos").insert({ empresa_id: A.id, negocio_id: n, conteudo: "x", criado_por: m(A, vendedorA), status: "assinado" });
    expect(r.error).not.toBeNull();
    expect((await servico.from("contratos").select("id").eq("negocio_id", n)).data).toHaveLength(0);
    expect((await eventosDo(n)).filter((e) => e.tipo === "contrato.assinado")).toHaveLength(0);
  });

  it("INSERT com responsavel_assinatura_id ou perfil_assinatura é recusado", async () => {
    const n = await criarNegocio(A, "ic-forja-colunas", gestorA);
    const base = { empresa_id: A.id, negocio_id: n, conteudo: "x", criado_por: m(A, gestorA) };
    expect((await gestorA.cliente.from("contratos").insert({ ...base, responsavel_assinatura_id: m(A, vendedorA) })).error).not.toBeNull();
    expect((await gestorA.cliente.from("contratos").insert({ ...base, perfil_assinatura: "closer" })).error).not.toBeNull();
    expect((await servico.from("contratos").select("id").eq("negocio_id", n)).data).toHaveLength(0);
  });

  it("o gestor dono do negócio não consegue apontar um colega como beneficiário para se autoconfirmar", async () => {
    const n = await criarNegocio(A, "ic-autoconfirma", gestorA);
    const forjado = await gestorA.cliente
      .from("contratos")
      .insert({ empresa_id: A.id, negocio_id: n, conteudo: "x", criado_por: m(A, gestorA), responsavel_assinatura_id: m(A, vendedorA) })
      .select("id")
      .single();
    expect(forjado.error).not.toBeNull();

    // Caminho legítimo: o banco congela o próprio gestor como responsável, e ele não confirma o que assinou.
    const id = await rascunho(gestorA, A, n);
    expect((await gestorA.cliente.from("contratos").update({ status: "assinado" }).eq("id", id)).error).toBeNull();
    expect((await contratoNoBanco(id)).responsavel_assinatura_id).toBe(m(A, gestorA));
    const conf = await gestorA.cliente.rpc("confirmar_pagamento", { p_contrato_id: id });
    expect(conf.error).not.toBeNull();
    expect((await eventosDo(n)).filter((e) => e.tipo === "pagamento.confirmado")).toHaveLength(0);
  });
});

describe("fluxo legítimo continua igual", () => {
  it("rascunho, upsert do texto (como a geração da interface), assinatura, confirmação pelo admin", async () => {
    const n = await criarNegocio(A, "ic-fluxo", vendedorA);
    const id = await rascunho(vendedorA, A, n);

    // A geração da interface usa upsert por negocio_id: no rascunho regrava o texto sem trocar a chave.
    const up = await vendedorA.cliente
      .from("contratos")
      .upsert({ empresa_id: A.id, negocio_id: n, conteudo: "Texto regerado", criado_por: m(A, vendedorA), atualizado_por: m(A, vendedorA) }, { onConflict: "negocio_id" })
      .select("id, conteudo")
      .single();
    expect(up.error).toBeNull();
    expect(up.data).toMatchObject({ id, conteudo: "Texto regerado" });

    expect((await vendedorA.cliente.from("contratos").update({ status: "assinado", atualizado_por: m(A, vendedorA) }).eq("id", id)).error).toBeNull();
    const assinado = await contratoNoBanco(id);
    expect(assinado.responsavel_assinatura_id).toBe(m(A, vendedorA));
    expect((await eventosDo(n)).filter((e) => e.tipo === "contrato.assinado")).toHaveLength(1);

    expect((await adminA.cliente.rpc("confirmar_pagamento", { p_contrato_id: id })).error).toBeNull();
    const pagamento = (await eventosDo(n)).filter((e) => e.tipo === "pagamento.confirmado");
    expect(pagamento).toHaveLength(1);
    expect(pagamento[0]).toMatchObject({ ator_id: adminA.id, beneficiario_id: vendedorA.id });
  });

  it("admin cria e edita o contrato de um vendedor da própria empresa", async () => {
    const n = await criarNegocio(A, "ic-gestor-cria", vendedorA);
    const id = await rascunho(adminA, A, n);
    expect((await adminA.cliente.from("contratos").update({ conteudo: "Editado pelo admin" }).eq("id", id)).error).toBeNull();
    expect((await contratoNoBanco(id)).conteudo).toBe("Editado pelo admin");
  });
});

describe("isolamento entre empresas", () => {
  it("admin de outra empresa não cria, move nem edita contrato de negócio alheio", async () => {
    const n = await criarNegocio(A, "ic-isolamento", vendedorA);
    const id = await rascunho(vendedorA, A, n);
    expect((await adminB.cliente.from("contratos").insert({ empresa_id: B.id, negocio_id: n, conteudo: "x" })).error).not.toBeNull();
    expect((await adminB.cliente.from("contratos").insert({ empresa_id: A.id, negocio_id: n, conteudo: "x" })).error).not.toBeNull();
    const upd = await adminB.cliente.from("contratos").update({ empresa_id: B.id, conteudo: "invadido" }).eq("id", id).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const c = await contratoNoBanco(id);
    expect(c).toMatchObject({ empresa_id: A.id, negocio_id: n, conteudo: "Contrato de teste" });
  });
});
