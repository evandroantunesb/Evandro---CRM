/**
 * Obra do Solo (Onboarding, subprojeto 4b — 20261207100000_obra_solo.sql): checklist de 10 etapas criado com a obra
 * do Solo (contrato e entrada feitas nas datas reais, sem setores), escrito só pelo admin por funções que gravam no
 * histórico; "não se aplica" com motivo só da etapa 3 à 9; link do cliente trocável. Precisa do Supabase local.
 *
 * Cenário próprio ("Obra Solo" + sufixo, usuários "os-*" + sufixo). Os testes seguem em ordem.
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/lib/supabase/database.types";
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

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

const ETAPAS = ["contrato", "entrada", "projeto_art", "material_comprado", "protocolo", "material_entregue", "instalacao", "vistoria", "conexao", "entrega"];
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

let admin: Usuario;
let gestor: Usuario;
let adminPro: Usuario;
let solo: string;
let pro: string;

async function criarObra(empresa: string, dono: Usuario, titulo: string): Promise<{ obra: string; contrato: string; negocio: string }> {
  const { data: m } = await servico.from("empresa_membros").select("id").eq("empresa_id", empresa).eq("user_id", dono.id).single();
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: m!.id, valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await dono.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(
    await dono.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await dono.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await dono.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return { obra: o!.id, contrato: contrato!.id, negocio: neg!.id };
}

const checklist = async (obra: string) =>
  noBanco(
    "select c.etapa::text as etapa, c.feita_em::text as feita_em, c.nao_se_aplica_motivo, c.prevista_para::text as prevista_para, c.anotacao, c.marcada_por from public.obra_checklist c where c.obra_id = $1 order by c.etapa",
    [obra],
  );
const linha = async (obra: string, etapa: string) => (await checklist(obra)).find((l) => l.etapa === etapa)!;

describe("Obra do Solo: checklist no banco (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;

  beforeAll(async () => {
    [admin, gestor, adminPro] = await Promise.all(["os-admin", "os-gestor", "os-admin-pro"].map(criarUsuario));
    const { data: emps } = ok(
      await servico
        .from("empresas")
        .insert([{ nome: `Obra Solo A ${sufixo}` }, { nome: `Obra Solo B ${sufixo}` }])
        .select("id, nome")
        .order("nome"),
      "empresas",
    );
    solo = emps![0].id;
    pro = emps![1].id;
    ok(await servico.from("planos_empresa").upsert({ empresa_id: solo, produto: "solo" } as never), "plano solo");
    ok(
      await servico.from("empresa_membros").insert([
        { empresa_id: solo, user_id: admin.id, papel: "admin" },
        { empresa_id: solo, user_id: gestor.id, papel: "gestor" },
        { empresa_id: pro, user_id: adminPro.id, papel: "admin" },
      ] as never),
      "membros",
    );
  });

  it("obra do Solo nasce com as 10 etapas, contrato e entrada feitas nas datas reais e sem setores", async () => {
    const criada = await criarObra(solo, admin, "Solo 1");
    obra = criada.obra;
    const linhas = await checklist(obra);
    expect(linhas.map((l) => l.etapa)).toEqual(ETAPAS);
    const [datas] = await noBanco(
      `select (select (min(e.created_at) at time zone 'America/Sao_Paulo')::date::text from public.eventos e
                where e.tipo = 'contrato.assinado' and e.entidade_id = $1) as assinatura,
              (select (c.confirmado_em at time zone 'America/Sao_Paulo')::date::text from public.confirmacoes_pagamento c
                where c.contrato_id = $2) as entrada`,
      [criada.negocio, criada.contrato],
    );
    expect(linhas[0].feita_em).toBe(datas.assinatura ?? hoje());
    expect(linhas[1].feita_em).toBe(datas.entrada);
    expect(linhas.slice(2).every((l) => l.feita_em === null)).toBe(true);
    const { data: fluxos } = await servico.from("obra_fluxos").select("setor").eq("obra_id", obra);
    expect(fluxos).toEqual([]);
    const [o] = await noBanco("select link_cliente from public.obras where id = $1", [obra]);
    expect(o.link_cliente).toBeTruthy();
  });

  it("obra do PRO não tem checklist nem link", async () => {
    const { obra: obraPro } = await criarObra(pro, adminPro, "Pro 1");
    expect(await checklist(obraPro)).toEqual([]);
    const [o] = await noBanco("select link_cliente from public.obras where id = $1", [obraPro]);
    expect(o.link_cliente).toBeNull();
    const { data: fluxos } = await servico.from("obra_fluxos").select("setor").eq("obra_id", obraPro);
    expect(fluxos).toHaveLength(4);
  });

  it("só o admin marca", async () => {
    for (const u of [gestor, adminPro]) {
      const { error } = await u.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_feita: true, p_data: hoje() });
      expect(error?.code).toBe("42501");
    }
    expect((await linha(obra, "instalacao")).feita_em).toBeNull();
  });

  it("marcar e desmarcar; contrato e entrada não desmarcam", async () => {
    ok(await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_feita: true, p_data: hoje() }), "marcar");
    const marcada = await linha(obra, "instalacao");
    expect(marcada.feita_em).toBe(hoje());
    expect(marcada.marcada_por).not.toBeNull();
    ok(await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_feita: false, p_data: null } as never), "desmarcar");
    expect((await linha(obra, "instalacao")).feita_em).toBeNull();
    for (const etapa of ["contrato", "entrada"]) {
      const { error } = await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: etapa, p_feita: false, p_data: null } as never);
      expect(error?.message).toContain("não pode ser desmarcada");
    }
  });

  it("data de feita no futuro é recusada", async () => {
    const { error } = await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "vistoria", p_feita: true, p_data: "2099-01-01" });
    expect(error?.message).toContain("futuro");
  });

  it("não se aplica exige motivo e vale só da 3 à 9", async () => {
    const naoSeAplica = (etapa: string, motivo: string | null) =>
      admin.cliente.rpc("etapa_nao_se_aplica_obra", { p_obra_id: obra, p_etapa: etapa, p_motivo: motivo } as never);
    expect((await naoSeAplica("vistoria", " ")).error).not.toBeNull();
    for (const etapa of ["contrato", "entrada", "entrega"]) expect((await naoSeAplica(etapa, "Não tem")).error).not.toBeNull();
    ok(await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "vistoria", p_feita: true, p_data: hoje() }), "feita");
    ok(await naoSeAplica("vistoria", "Distribuidora dispensou"), "não se aplica");
    expect(await linha(obra, "vistoria")).toMatchObject({ feita_em: null, nao_se_aplica_motivo: "Distribuidora dispensou" });
    ok(await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "vistoria", p_feita: true, p_data: hoje() }), "feita de novo");
    expect(await linha(obra, "vistoria")).toMatchObject({ feita_em: hoje(), nao_se_aplica_motivo: null });
    ok(await naoSeAplica("vistoria", "Dispensada"), "de novo");
    ok(await naoSeAplica("vistoria", null), "desfaz");
    expect(await linha(obra, "vistoria")).toMatchObject({ feita_em: null, nao_se_aplica_motivo: null });
  });

  it("data prevista e anotação", async () => {
    ok(await admin.cliente.rpc("prever_etapa_obra", { p_obra_id: obra, p_etapa: "protocolo", p_data: "2099-02-10" }), "prever");
    ok(await admin.cliente.rpc("anotar_etapa_obra", { p_obra_id: obra, p_etapa: "protocolo", p_texto: "Ligar para o Zé" }), "anotar");
    expect(await linha(obra, "protocolo")).toMatchObject({ prevista_para: "2099-02-10", anotacao: "Ligar para o Zé" });
    ok(await admin.cliente.rpc("prever_etapa_obra", { p_obra_id: obra, p_etapa: "protocolo", p_data: null } as never), "sem previsão");
    ok(await admin.cliente.rpc("anotar_etapa_obra", { p_obra_id: obra, p_etapa: "protocolo", p_texto: null } as never), "sem anotação");
    expect(await linha(obra, "protocolo")).toMatchObject({ prevista_para: null, anotacao: null });
    const { error } = await admin.cliente.rpc("anotar_etapa_obra", { p_obra_id: obra, p_etapa: "protocolo", p_texto: "x".repeat(1001) });
    expect(error).not.toBeNull();
  });

  it("cada mudança entra no histórico da obra", async () => {
    const { data } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", "checklist_alterado");
    const etapas = new Set((data ?? []).map((h) => (h.dados as { etapa?: string }).etapa));
    expect(etapas).toEqual(new Set(["instalacao", "vistoria", "protocolo"]));
  });

  it("gerar link troca o token", async () => {
    const [antes] = await noBanco("select link_cliente from public.obras where id = $1", [obra]);
    expect((await gestor.cliente.rpc("gerar_link_cliente_obra", { p_obra_id: obra })).error?.code).toBe("42501");
    const { data: novo } = ok(await admin.cliente.rpc("gerar_link_cliente_obra", { p_obra_id: obra }), "link");
    expect(novo).toBeTruthy();
    expect(novo).not.toBe(antes.link_cliente);
    expect(await noBanco("select 1 from public.obras where link_cliente = $1", [antes.link_cliente])).toEqual([]);
  });

  it("RLS: outra empresa não lê o checklist", async () => {
    const { data } = await adminPro.cliente.from("obra_checklist").select("etapa").eq("obra_id", obra);
    expect(data ?? []).toEqual([]);
    const { data: proprio } = await admin.cliente.from("obra_checklist").select("etapa").eq("obra_id", obra);
    expect(proprio).toHaveLength(10);
  });
});

// --- Tarefa 2: fotos e leitura pública do cliente ------------------------------------------------

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const anonimo = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

describe("Obra do Solo: fotos e acompanhamento (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;
  let token: string;
  const caminhoDe = (etapa: string, n: number | string, empresa = solo, obraId = obra) => `${empresa}/${obraId}/${etapa}/${n}-${sufixo}.png`;
  const enviar = async (u: Usuario, caminho: string) => u.cliente.storage.from("obra-fotos").upload(caminho, PNG, { contentType: "image/png" });
  const registrar = (u: Usuario, etapa: string, caminho: string) =>
    u.cliente.rpc("registrar_foto_etapa_obra", { p_obra_id: obra, p_etapa: etapa, p_caminho: caminho } as never);

  beforeAll(async () => {
    obra = (await criarObra(solo, admin, "Solo fotos")).obra;
    const [o] = await noBanco("select link_cliente from public.obras where id = $1", [obra]);
    token = o.link_cliente;
    ok(await admin.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_feita: true, p_data: hoje() }), "instalação");
    ok(await admin.cliente.rpc("anotar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_texto: "ANOTACAO-SECRETA" }), "anotação");
    ok(await admin.cliente.rpc("etapa_nao_se_aplica_obra", { p_obra_id: obra, p_etapa: "vistoria", p_motivo: "MOTIVO-SECRETO" }), "nsa");
    ok(await admin.cliente.rpc("prever_etapa_obra", { p_obra_id: obra, p_etapa: "conexao", p_data: "2099-03-01" }), "prevista");
  });

  it("só o admin envia e apaga foto", async () => {
    const doGestor = caminhoDe("instalacao", "g");
    expect((await enviar(gestor, doGestor)).error).not.toBeNull();
    expect((await registrar(gestor, "instalacao", doGestor)).error?.code).toBe("42501");

    const caminho = caminhoDe("instalacao", 1);
    ok(await enviar(admin, caminho), "upload");
    const { data: fotoId } = ok(await registrar(admin, "instalacao", caminho), "registrar");
    expect((await gestor.cliente.rpc("apagar_foto_etapa_obra", { p_foto_id: fotoId as string })).error?.code).toBe("42501");
    const { data: apagado } = ok(await admin.cliente.rpc("apagar_foto_etapa_obra", { p_foto_id: fotoId as string }), "apagar");
    expect(apagado).toBe(caminho);
    expect((await gestor.cliente.storage.from("obra-fotos").remove([caminho])).data ?? []).toEqual([]);
    ok(await admin.cliente.storage.from("obra-fotos").remove([caminho]), "apagar arquivo");
  });

  it("caminho fora da pasta da obra é recusado", async () => {
    expect((await registrar(admin, "instalacao", caminhoDe("vistoria", "x"))).error).not.toBeNull();
    expect((await registrar(admin, "instalacao", caminhoDe("instalacao", "y", pro))).error).not.toBeNull();
    expect((await enviar(admin, caminhoDe("instalacao", "z", pro))).error).not.toBeNull();
  });

  it("até 10 fotos por etapa", async () => {
    for (let n = 1; n <= 10; n++) {
      const caminho = caminhoDe("instalacao", `lote${n}`);
      ok(await enviar(admin, caminho), `upload ${n}`);
      ok(await registrar(admin, "instalacao", caminho), `registrar ${n}`);
    }
    const onze = caminhoDe("instalacao", "lote11");
    ok(await enviar(admin, onze), "upload 11");
    expect((await registrar(admin, "instalacao", onze)).error?.message).toContain("10 fotos");
  });

  it("acompanhamento_obra como anon devolve só os campos públicos", async () => {
    const { data, error } = await anonimo.rpc("acompanhamento_obra", { p_token: token });
    expect(error).toBeNull();
    const r = data as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["atualizado_em", "cliente_primeiro_nome", "empresa", "etapas", "situacao"]);
    expect(r.situacao).toBe("ativa");
    expect(r.cliente_primeiro_nome).toBe("Cliente");
    expect(Object.keys(r.empresa as object).sort()).toEqual(["cor_destaque", "cor_primaria", "logo_escura", "nome", "whatsapp"]);
    const etapas = r.etapas as { etapa: string; feita_em: string | null; prevista_para: string | null; nao_se_aplica: boolean; fotos: string[] }[];
    expect(etapas.map((e) => e.etapa)).toEqual(ETAPAS);
    expect(Object.keys(etapas[0]).sort()).toEqual(["etapa", "feita_em", "fotos", "nao_se_aplica", "prevista_para"]);
    const instalacao = etapas.find((e) => e.etapa === "instalacao")!;
    expect(instalacao.feita_em).toBe(hoje());
    expect(instalacao.fotos).toHaveLength(10);
    expect(etapas.find((e) => e.etapa === "vistoria")!.nao_se_aplica).toBe(true);
    expect(etapas.find((e) => e.etapa === "conexao")!.prevista_para).toBe("2099-03-01");
    const json = JSON.stringify(r);
    for (const proibido of ["ANOTACAO-SECRETA", "MOTIVO-SECRETO", CLIENTE_CONTRATO.telefone, "30000"]) expect(json).not.toContain(proibido);
  });

  it("token inválido, token antigo e obra do PRO não devolvem nada", async () => {
    expect((await anonimo.rpc("acompanhamento_obra", { p_token: "nao-existe" })).data).toBeNull();
    expect((await anonimo.rpc("acompanhamento_obra", { p_token: "" })).data).toBeNull();
    ok(await admin.cliente.rpc("gerar_link_cliente_obra", { p_obra_id: obra }), "novo link");
    expect((await anonimo.rpc("acompanhamento_obra", { p_token: token })).data).toBeNull();
    const [o] = await noBanco("select link_cliente from public.obras where id = $1", [obra]);
    token = o.link_cliente;
    expect((await anonimo.rpc("acompanhamento_obra", { p_token: token })).data).not.toBeNull();
  });

  it("obra cancelada devolve só a situação encerrada e a empresa", async () => {
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Cliente desistiu' where id = $1", [obra]);
    const { data } = await anonimo.rpc("acompanhamento_obra", { p_token: token });
    expect(Object.keys(data as object).sort()).toEqual(["empresa", "situacao"]);
    expect((data as { situacao: string }).situacao).toBe("encerrada");
  });
});
