/**
 * Concessionárias, entrega 2 (20261223100000_concessionarias.sql; desenho em
 * docs/superpowers/specs/2026-11-23-concessionarias-design.md): cadastro por empresa com a Copel pronta, obra com a
 * concessionária herdada do negócio, correção pela Engenharia e checklist só com concessionária definida.
 * Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Concessionárias A/B" + sufixo, usuários "cc-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizarNome } from "@/lib/tarifa-gd";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato, gerarContratoTeste } from "./ajuda";

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
let adminB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string, distribuidora: string | null): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: emp,
      titulo,
      contato_id: c!.id,
      funil_id: f!.id,
      etapa_id: et!.id,
      responsavel_id: membro[responsavel.id],
      valor: 30000,
      qualif_distribuidora: distribuidora,
    })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato, error: erroContrato } = await gerarContratoTeste(responsavel.cliente, { empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" });
  if (erroContrato) throw erroContrato;
  const assinado = await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (erroPagamento) throw erroPagamento;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function concessionariaDaObra(obra: string): Promise<string | null> {
  const [l] = await noBanco("select concessionaria_id from public.obras where id = $1", [obra]);
  return l.concessionaria_id;
}

async function idPorSigla(emp: string, sigla: string): Promise<string> {
  const [l] = await noBanco("select id from public.concessionarias where empresa_id = $1 and distribuidora = $2", [emp, sigla]);
  return l.id;
}

const definir = (quem: Usuario, obra: string, concessionaria: string) =>
  quem.cliente.rpc("definir_concessionaria_obra" as never, { p_obra_id: obra, p_concessionaria_id: concessionaria } as never);

describe("Concessionárias: cadastro e obra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let copelA: string;
  let copelB: string;
  let cemigB: string;

  beforeAll(async () => {
    [admin, vendedor, coordEng, adminB, vendedorB] = await Promise.all(["cc-admin", "cc-vendedor", "cc-coord-eng", "cc-admin-b", "cc-vendedor-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Concessionárias A ${sufixo}` }, { nome: `Concessionárias B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordEng, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
      [vendedorB, empresaB, { papel: "vendedor", perfil_gamificacao: "closer" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    const { error: e } = await admin.cliente.rpc("definir_setores_membro", {
      p_membro_id: membro[coordEng.id],
      p_setores: [{ setor: "engenharia", capacidade: "coordenar" }] as never,
    });
    if (e) throw e;
  });

  it("toda empresa nasce com a Copel; só o admin da empresa cria; ninguém apaga nem vê as de outra empresa", async () => {
    copelA = await idPorSigla(empresa, "COPEL-DIS");
    copelB = await idPorSigla(empresaB, "COPEL-DIS");
    const [{ nome }] = await noBanco("select nome from public.concessionarias where id = $1", [copelA]);
    expect(nome).toBe("Copel");

    const vistas = await adminB.cliente.from("concessionarias" as never).select("id").eq("empresa_id", empresa);
    expect(vistas.data).toEqual([]);
    expect((await vendedorB.cliente.from("concessionarias" as never).insert({ empresa_id: empresaB, nome: "Cemig", distribuidora: "CEMIG-D" } as never)).error).not.toBeNull();
    expect((await adminB.cliente.from("concessionarias" as never).insert({ empresa_id: empresa, nome: "Cemig", distribuidora: "CEMIG-D" } as never)).error).not.toBeNull();

    const criada = await adminB.cliente
      .from("concessionarias" as never)
      .insert({ empresa_id: empresaB, nome: "Cemig", distribuidora: "CEMIG-D" } as never)
      .select("id")
      .single();
    expect(criada.error).toBeNull();
    cemigB = (criada.data as unknown as { id: string }).id;

    expect((await adminB.cliente.from("concessionarias" as never).delete().eq("id", cemigB)).error).not.toBeNull();
    expect((await adminB.cliente.from("concessionarias" as never).update({ empresa_id: empresa } as never).eq("id", cemigB)).error).not.toBeNull();
  });

  it("normaliza o nome da distribuidora igual à calculadora", async () => {
    for (const nome of ["COPEL", " Copel  Distribuição ", "copel-dis", "Copel Distribuição S.A.", "ÁÉÍÓÚ àèìòù ÂÊÎÔÛ ÃÕ Ç ä"]) {
      const [l] = await noBanco("select public.normalizar_nome_distribuidora($1) as n", [nome]);
      expect(l.n).toBe(normalizarNome(nome));
    }
  });

  it("obra herda a concessionária pela distribuidora do negócio", async () => {
    const obra = await criarVenda(empresa, vendedor, admin, `Herda ${sufixo}`, "Copel Distribuição");
    expect(await concessionariaDaObra(obra)).toBe(copelA);
    const obraB = await criarVenda(empresaB, vendedorB, adminB, `Herda B ${sufixo}`, "CEMIG");
    expect(await concessionariaDaObra(obraB)).toBe(cemigB);
  });

  it("distribuidora vazia: usa a única concessionária; com duas, fica sem", async () => {
    expect(await concessionariaDaObra(await criarVenda(empresa, vendedor, admin, `Vazia ${sufixo}`, null))).toBe(copelA);
    expect(await concessionariaDaObra(await criarVenda(empresa, vendedor, admin, `Branca ${sufixo}`, "   "))).toBe(copelA);
    expect(await concessionariaDaObra(await criarVenda(empresaB, vendedorB, adminB, `Vazia B ${sufixo}`, null))).toBeNull();
  });

  it("distribuidora sem cadastro na empresa: obra sem concessionária e checklist recusado", async () => {
    const obra = await criarVenda(empresa, vendedor, admin, `Sem cadastro ${sufixo}`, "Cemig");
    expect(await concessionariaDaObra(obra)).toBeNull();

    const recusa = await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra });
    expect(recusa.error?.message).toBe("Escolha a concessionária da obra antes de aplicar o checklist.");
    const [{ n }] = await noBanco("select count(*)::int as n from public.obra_engenharia_itens where obra_id = $1", [obra]);
    expect(n).toBe(0);

    // A Engenharia corrige; o checklist passa a ser aplicado como antes.
    expect((await definir(coordEng, obra, copelA)).error).toBeNull();
    expect(await concessionariaDaObra(obra)).toBe(copelA);
    const [h] = await noBanco("select setor, dados from public.obra_historico where obra_id = $1 and tipo = 'concessionaria_obra_alterada'", [obra]);
    expect(h.setor).toBe("engenharia");
    expect(h.dados).toMatchObject({ de: null, para: "Copel" });
    const aplicado = await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra });
    expect(aplicado.error).toBeNull();
    expect(aplicado.data).toBeGreaterThan(0);

    // Mesma concessionária: nada muda nem entra no histórico.
    expect((await definir(coordEng, obra, copelA)).error).toBeNull();
    const [{ total }] = await noBanco("select count(*)::int as total from public.obra_historico where obra_id = $1 and tipo = 'concessionaria_obra_alterada'", [obra]);
    expect(total).toBe(1);
  });

  it("correção: recusa concessionária de outra empresa, quem não atua na Engenharia e obra cancelada", async () => {
    const obra = await criarVenda(empresa, vendedor, admin, `Correção ${sufixo}`, null);

    const outra = await definir(coordEng, obra, copelB);
    expect(outra.error?.message).toBe("Concessionária não encontrada.");
    const inexistente = await definir(coordEng, obra, "00000000-0000-0000-0000-000000000000");
    expect(inexistente.error?.message).toBe("Concessionária não encontrada.");

    const vend = await definir(vendedor, obra, copelA);
    expect(vend.error?.message).toBe("Você não tem permissão para alterar este setor da obra.");
    const deOutraEmpresa = await definir(adminB, obra, copelB);
    expect(deOutraEmpresa.error?.message).toBe("Você não tem permissão para alterar este setor da obra.");

    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1", [obra]);
    const cancelada = await definir(coordEng, obra, copelA);
    expect(cancelada.error?.message).toBe("Esta obra foi cancelada e não aceita alterações.");
  });

  it("empresa criada depois também recebe a Copel", async () => {
    const { data } = await servico.from("empresas").insert({ nome: `Concessionárias C ${sufixo}` }).select("id").single();
    const linhas = await noBanco("select nome, distribuidora from public.concessionarias where empresa_id = $1", [data!.id]);
    expect(linhas).toEqual([{ nome: "Copel", distribuidora: "COPEL-DIS" }]);
  });
});
