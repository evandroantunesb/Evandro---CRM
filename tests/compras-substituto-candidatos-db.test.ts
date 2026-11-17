/**
 * Compras, setor que atende no lugar dele (20261211100000_compras_substituto_candidatos.sql): enquanto ninguém ativo
 * tem o setor Compras, quem atua no setor escolhido pelo admin entra na lista de candidatos (`membros_do_setor`) e conta
 * como quem atua em Compras (`membro_atua_no_setor`); com alguém em Compras, só ele; sem escolha, ninguém. Os demais
 * setores não mudam. O substituto entra como participante de Compras na obra e recebe a tarefa automática de Compras; o
 * coordenador do setor substituto coordena as tarefas de Compras. Precisa do Supabase local. Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { anexarDocumentosContrato, CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { urlBancoLocal } from "./banco-local";

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
let gestor: Usuario;
let adminB: Usuario;
let adm: Usuario; // atua no Administrativo
let comprador: Usuario; // atua em Compras
let coordAdm: Usuario; // coordena o Administrativo (a partir do bloco da obra)
let vendedor: Usuario;
let obra: string;
let negocio: string;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

const atua = async (quem: Usuario, setor: string, emp = empresa) =>
  (await noBanco("select public.membro_atua_no_setor($1, $2, $3::public.setor_obra) as ok", [emp, membro[quem.id], setor]))[0].ok as boolean;

const candidatos = async (quem: Usuario, setor = "compras") => {
  const { data, error } = await quem.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: setor as never });
  if (error) throw error;
  return (data ?? []).map((l) => l.membro_id).sort();
};

/** Só o admin define os setores de um membro (a tabela não aceita escrita direta). */
async function darSetor(quem: Usuario, setor: string, capacidade = "executar") {
  const { error } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade }] as never });
  if (error) throw error;
}

/** Desativar apaga os setores do membro (`obra_ao_alterar_membro`): reativado, o comprador recebe Compras de novo. */
const compradorAtivo = async (ativo: boolean) => {
  const { error } = await servico
    .from("empresa_membros")
    .update({ ativo, status: ativo ? "ativo" : "inativo" } as never)
    .eq("id", membro[comprador.id]);
  if (error) throw error;
  if (ativo) await darSetor(comprador, "compras");
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function venderAteObra(): Promise<{ obra: string; negocio: string }> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente CSC ${sufixo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `CSC ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato, error: e2 } = await vendedor.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (e2) throw e2;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const pago = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (pago.error) throw pago.error;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return { obra: o!.id, negocio: neg!.id };
}

const participarCompras = (principal: boolean) =>
  admin.cliente.rpc("atribuir_participante_obra", {
    p_obra_id: obra,
    p_membro_id: membro[adm.id],
    p_setor: "compras",
    p_funcao: principal ? "responsavel" : "apoio",
    p_principal: principal,
  });

beforeAll(async () => {
  [admin, gestor, adminB, adm, comprador, coordAdm, vendedor] = await Promise.all(
    ["csc-admin", "csc-gestor", "csc-admin-b", "csc-adm", "csc-comprador", "csc-coord-adm", "csc-vendedor"].map(criarUsuario),
  );
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `CSC A ${sufixo}` }, { nome: `CSC B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  [empresa, empresaB] = [emps![0].id, emps![1].id];
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: adm.id, papel: "operacao" },
    { empresa_id: empresa, user_id: comprador.id, papel: "operacao" },
    { empresa_id: empresa, user_id: coordAdm.id, papel: "operacao" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
  const { data: ms } = await servico.from("empresa_membros").select("id, user_id").in("empresa_id", [empresa, empresaB]);
  for (const m of ms ?? []) membro[m.user_id] = m.id;
  await darSetor(adm, "administrativo");
});

describe("Compras atendida no lugar dele: candidatos e quem atua", () => {
  it("sem escolha do admin, ninguém atua em Compras nem é candidato", async () => {
    expect(await atua(adm, "compras")).toBe(false);
    expect(await candidatos(admin)).toEqual([]);
  });

  it("com o Administrativo escolhido, ele é candidato e conta como quem atua em Compras", async () => {
    const r = await admin.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresa, p_setor: "administrativo" });
    expect(r.error).toBeNull();
    expect(await atua(adm, "compras")).toBe(true);
    expect(await candidatos(admin)).toEqual([membro[adm.id]]);
    expect(await candidatos(gestor)).toEqual([membro[adm.id]]);
  });

  it("os demais setores não mudam: o Administrativo segue no Administrativo e fora de Engenharia", async () => {
    expect(await atua(adm, "administrativo")).toBe(true);
    expect(await atua(adm, "engenharia")).toBe(false);
    expect(await candidatos(admin, "administrativo")).toEqual([membro[adm.id]]);
    expect(await candidatos(admin, "engenharia")).toEqual([]);
  });

  it("quem é só executor não recebe a lista (continua restrito a admin, gestor e coordenador)", async () => {
    expect(await candidatos(adm)).toEqual([]);
  });

  it("com alguém ativo em Compras, só ele: o substituto deixa de atuar e de ser candidato", async () => {
    await darSetor(comprador, "compras");
    expect(await atua(comprador, "compras")).toBe(true);
    expect(await atua(adm, "compras")).toBe(false);
    expect(await candidatos(admin)).toEqual([membro[comprador.id]]);
    // o Administrativo dele continua valendo no próprio setor
    expect(await atua(adm, "administrativo")).toBe(true);
  });

  it("sem o comprador ativo, a regra volta ao setor escolhido", async () => {
    await compradorAtivo(false);
    expect(await atua(adm, "compras")).toBe(true);
    expect(await candidatos(admin)).toEqual([membro[adm.id]]);
  });

  it("outra empresa não enxerga nem herda a escolha", async () => {
    const { data } = await adminB.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: "compras" });
    expect(data ?? []).toEqual([]);
    expect(await atua(adm, "compras", empresaB)).toBe(false);
  });
});

describe("Compras atendida no lugar dele: participante, tarefa automática e coordenador", () => {
  beforeAll(async () => {
    ({ obra, negocio } = await venderAteObra());
  });

  it("com alguém ativo em Compras, o Administrativo não entra como participante de Compras na obra", async () => {
    await compradorAtivo(true);
    const { error } = await participarCompras(false);
    expect(error?.code).toBe("23514");
    expect(error?.message).toBe("O colaborador não tem este setor.");
    await compradorAtivo(false);
  });

  it("sem ninguém em Compras, o admin põe o Administrativo como responsável principal de Compras na obra", async () => {
    const { error } = await participarCompras(true);
    expect(error).toBeNull();
    const { data } = await servico.from("obra_participantes").select("setor, funcao, principal").eq("obra_id", obra).eq("membro_id", membro[adm.id]);
    expect(data).toEqual([{ setor: "compras", funcao: "responsavel", principal: true }]);
  });

  it("a tarefa automática de Compras vai para o substituto, responsável principal de Compras na obra", async () => {
    const { data: regra, error } = await admin.cliente
      .from("tarefas_automaticas_regras")
      .insert({ empresa_id: empresa, gatilho_setor: "operacional", gatilho_status: "agendada", setor: "compras", titulo: "Conferir material antes da instalação" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const st = await admin.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "operacional", p_status: "agendada" });
    expect(st.error).toBeNull();
    const { data: tarefas } = await servico.from("tarefas_setor").select("setor, responsavel_id").eq("obra_id", obra).eq("regra_id", regra!.id);
    expect(tarefas).toEqual([{ setor: "compras", responsavel_id: membro[adm.id] }]);
  });

  it("o coordenador do Administrativo cria tarefa de Compras na obra escolhendo o responsável", async () => {
    await darSetor(coordAdm, "administrativo", "coordenar");
    expect(await candidatos(coordAdm)).toEqual([membro[adm.id], membro[coordAdm.id]].sort());
    const { data: id, error } = await coordAdm.cliente.rpc("criar_tarefa_setor", {
      p_setor: "compras",
      p_titulo: "Cotar inversor reserva",
      p_prazo: hoje(),
      p_obra_id: obra,
      p_responsavel_id: membro[adm.id],
    });
    expect(error).toBeNull();
    const { data: t } = await servico.from("tarefas_setor").select("setor, responsavel_id").eq("id", id!).single();
    expect(t).toEqual({ setor: "compras", responsavel_id: membro[adm.id] });
  });

  it("o coordenador do Administrativo coordena a tarefa de Compras sem obra (do negócio) e atribui ao substituto", async () => {
    const { data: id, error } = await admin.cliente.rpc("criar_tarefa_setor", {
      p_setor: "compras",
      p_titulo: "Confirmar prazo do fornecedor",
      p_prazo: hoje(),
      p_negocio_id: negocio,
    });
    expect(error).toBeNull();
    const r = await coordAdm.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: id!, p_membro_id: membro[adm.id] });
    expect(r.error).toBeNull();
    const { data: t } = await servico.from("tarefas_setor").select("responsavel_id").eq("id", id!).single();
    expect(t!.responsavel_id).toBe(membro[adm.id]);

    // Com alguém ativo em Compras, o coordenador do Administrativo deixa de coordenar Compras.
    await compradorAtivo(true);
    const r2 = await coordAdm.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: id!, p_membro_id: null as never });
    expect(r2.error?.code).toBe("42501");
    await compradorAtivo(false);
  });
});
