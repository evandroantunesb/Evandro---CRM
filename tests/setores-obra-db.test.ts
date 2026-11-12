/**
 * Setores da obra (Onboarding, subprojeto 4a — 20261206100000_setores_da_obra.sql): a empresa PRO desliga Engenharia
 * e/ou Administrativo em `empresa_telas.setores_desligados`; a obra nova nasce só com os setores ligados, a entrega
 * contratada desconta os dias das etapas do setor que a obra não tem e o cronograma mostra só as etapas que ficam.
 * Obras que já existiam não mudam. Só o admin grava; Compras e Operacional nunca desligam. Precisa do Supabase local.
 *
 * Cenário próprio ("Setores" + sufixo, usuários "so-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { urlBancoLocal } from "./banco-local";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato } from "./ajuda";

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
let vendedor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

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
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function fluxos(obra: string): Promise<string[]> {
  const { data } = await servico.from("obra_fluxos").select("setor").eq("obra_id", obra);
  return (data ?? []).map((l) => l.setor as string).sort();
}

const gravarSetores = (u: Usuario, setores: string[]) =>
  u.cliente.from("empresa_telas").upsert({ empresa_id: empresa, setores_desligados: setores } as never, { onConflict: "empresa_id" });

async function setoresGravados(): Promise<string[] | null> {
  const [l] = await noBanco("select setores_desligados from public.empresa_telas where empresa_id = $1", [empresa]);
  return l ? (l.setores_desligados as string[]) : null;
}

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

describe("Setores da obra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obraAntes: string;
  let obraSemSetores: string;

  beforeAll(async () => {
    [admin, gestor, vendedor] = await Promise.all(["so-admin", "so-gestor", "so-vendedor"].map(criarUsuario));
    const { data: emp } = ok(await servico.from("empresas").insert({ nome: `Setores ${sufixo}` }).select("id").single(), "empresa");
    empresa = emp!.id;
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert([
          { empresa_id: empresa, user_id: admin.id, papel: "admin" },
          { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
          { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
        ] as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
  });

  it("sem escolha, a obra nova nasce com os 4 setores", async () => {
    obraAntes = await criarObra("Setores antes");
    expect(await fluxos(obraAntes)).toEqual(["administrativo", "compras", "engenharia", "operacional"]);
  });

  it("só o admin grava os setores desligados", async () => {
    await gravarSetores(gestor, ["engenharia"]);
    expect(await setoresGravados()).toBeNull();
    ok(await gravarSetores(admin, ["engenharia", "administrativo"]), "admin grava");
    expect(await setoresGravados()).toEqual(["engenharia", "administrativo"]);
    await gestor.cliente.from("empresa_telas").update({ setores_desligados: [] } as never).eq("empresa_id", empresa);
    expect(await setoresGravados()).toEqual(["engenharia", "administrativo"]);
  });

  it("Compras e Operacional não desligam", async () => {
    expect((await gravarSetores(admin, ["compras"])).error).not.toBeNull();
    expect((await gravarSetores(admin, ["operacional"])).error).not.toBeNull();
    expect(await setoresGravados()).toEqual(["engenharia", "administrativo"]);
  });

  it("Engenharia e Administrativo desligados: a obra nova só tem Compras e Operacional", async () => {
    obraSemSetores = await criarObra("Setores sem eng e adm");
    expect(await fluxos(obraSemSetores)).toEqual(["compras", "operacional"]);
    const { data: marcos } = await servico.from("obra_marcos").select("marco").eq("obra_id", obraSemSetores);
    expect((marcos ?? []).map((m) => m.marco).sort()).toEqual(["garantia", "nf_cliente"]);
  });

  it("obra criada antes de desligar continua com os 4 fluxos", async () => {
    expect(await fluxos(obraAntes)).toEqual(["administrativo", "compras", "engenharia", "operacional"]);
  });

  it("entrega contratada desconta as etapas de Engenharia", async () => {
    const [l] = await noBanco(
      `select o.entrega_contratada::text as gravada,
              public.somar_dias_uteis(o.empresa_id, (o.created_at at time zone 'America/Sao_Paulo')::date, 17)::text as esperada
       from public.obras o where o.id = $1`,
      [obraSemSetores],
    );
    expect(l.gravada).toBe(l.esperada);
  });

  it("cronograma de obra sem Engenharia tem só compra, entrega do material e instalação", async () => {
    const { data, error } = await admin.cliente.rpc("cronograma_obra", { p_obra_id: obraSemSetores });
    expect(error).toBeNull();
    expect((data ?? []).map((l) => l.etapa)).toEqual(["compra", "entrega_material", "instalacao"]);
    const { data: antes } = await admin.cliente.rpc("cronograma_obra", { p_obra_id: obraAntes });
    expect((antes ?? []).map((l) => l.etapa)).toHaveLength(7);
  });

  it("alterar status de setor que a obra não tem falha", async () => {
    const { error } = await admin.cliente.rpc("alterar_status_fluxo_obra", {
      p_obra_id: obraSemSetores,
      p_setor: "engenharia",
      p_status: "projeto_em_elaboracao",
    });
    expect(error?.message).toContain("Fluxo do setor não encontrado.");
  });

  it("obra sem Administrativo: o admin ainda lança conta a pagar", async () => {
    ok(
      await admin.cliente.rpc("lancar_conta_pagar_obra", {
        p_obra_id: obraSemSetores,
        p_fornecedor: "Distribuidora Solar Sul",
        p_categoria: "equipamentos",
        p_descricao: "Kit",
        p_valor: 1800,
        p_vencimento: hoje(),
      } as never),
      "conta a pagar",
    );
  });
});
