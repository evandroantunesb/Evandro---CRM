/**
 * Obra do Solo, pendências da 4b (20261208100000_obra_solo_trocas_plano.sql, decisões do Evandro de 13/11/2026):
 * obra cancelada só deixa apagar foto; caminho da foto por prefixo exato; empresa que vira Solo dá checklist e link às
 * obras abertas; empresa que sai do Solo dá os setores às obras abertas e desliga o link. Precisa do Supabase local.
 *
 * Cenário próprio ("Troca Plano" + sufixo, usuários "tp-*" + sufixo). Os testes seguem em ordem.
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

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

let adminSolo: Usuario;
let adminPro: Usuario;
let solo: string;
let pro: string;

async function criarObra(empresa: string, dono: Usuario, titulo: string): Promise<string> {
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
  return o!.id;
}

const etapasDa = async (obra: string) =>
  noBanco("select etapa::text as etapa, feita_em::text as feita_em from public.obra_checklist where obra_id = $1 order by etapa", [obra]);
const setoresDa = async (obra: string) =>
  (await noBanco("select setor::text as setor, status from public.obra_fluxos where obra_id = $1 order by setor", [obra])).map((f) => `${f.setor}:${f.status}`);
const linkDa = async (obra: string) => (await noBanco("select link_cliente from public.obras where id = $1", [obra]))[0].link_cliente as string | null;
const cancelar = (obra: string) =>
  noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência (teste)' where id = $1", [obra]);
const trocarPlano = async (empresa: string, produto: "solo" | "pro") =>
  ok(await servico.from("planos_empresa").upsert({ empresa_id: empresa, produto } as never, { onConflict: "empresa_id" }), `plano ${produto}`);
/** Objeto no bucket das fotos (o app envia antes de registrar). */
const objetoFoto = (nome: string) => noBanco("insert into storage.objects (bucket_id, name) values ('obra-fotos', $1)", [nome]);

describe("Obra do Solo: cancelada, prefixo da foto e troca de plano (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [adminSolo, adminPro] = await Promise.all(["tp-admin-solo", "tp-admin-pro"].map(criarUsuario));
    const { data: emps } = ok(
      await servico
        .from("empresas")
        .insert([{ nome: `Troca Plano A ${sufixo}` }, { nome: `Troca Plano B ${sufixo}` }])
        .select("id, nome")
        .order("nome"),
      "empresas",
    );
    solo = emps![0].id;
    pro = emps![1].id;
    await trocarPlano(solo, "solo");
    ok(
      await servico.from("empresa_membros").insert([
        { empresa_id: solo, user_id: adminSolo.id, papel: "admin" },
        { empresa_id: pro, user_id: adminPro.id, papel: "admin" },
      ] as never),
      "membros",
    );
  });

  it("foto: o caminho é conferido por prefixo exato (o _ da etapa não é coringa)", async () => {
    const obra = await criarObra(solo, adminSolo, "Foto prefixo");
    const parecido = `${solo}/${obra}/materialXentregue/a.jpg`;
    await objetoFoto(parecido);
    const recusada = await adminSolo.cliente.rpc("registrar_foto_etapa_obra", { p_obra_id: obra, p_etapa: "material_entregue", p_caminho: parecido });
    expect(recusada.error?.message).toBe("Foto inválida.");
    const certo = `${solo}/${obra}/material_entregue/a.jpg`;
    await objetoFoto(certo);
    ok(await adminSolo.cliente.rpc("registrar_foto_etapa_obra", { p_obra_id: obra, p_etapa: "material_entregue", p_caminho: certo }), "foto certa");
  });

  it("obra cancelada: o checklist não muda; apagar foto continua", async () => {
    const obra = await criarObra(solo, adminSolo, "Cancelada");
    const caminho = `${solo}/${obra}/instalacao/a.jpg`;
    await objetoFoto(caminho);
    const { data: fotoId } = ok(
      await adminSolo.cliente.rpc("registrar_foto_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_caminho: caminho }),
      "foto",
    );
    await cancelar(obra);

    const recusas = await Promise.all([
      adminSolo.cliente.rpc("marcar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_feita: true, p_data: hoje() }),
      adminSolo.cliente.rpc("prever_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_data: hoje() }),
      adminSolo.cliente.rpc("anotar_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_texto: "nota" }),
      adminSolo.cliente.rpc("etapa_nao_se_aplica_obra", { p_obra_id: obra, p_etapa: "vistoria", p_motivo: "sem vistoria" }),
      adminSolo.cliente.rpc("gerar_link_cliente_obra", { p_obra_id: obra }),
      adminSolo.cliente.rpc("registrar_foto_etapa_obra", { p_obra_id: obra, p_etapa: "instalacao", p_caminho: caminho }),
    ]);
    for (const r of recusas) expect(r.error?.message).toBe("A obra foi cancelada: o checklist não muda mais.");
    expect((await etapasDa(obra)).find((e) => e.etapa === "instalacao")!.feita_em).toBeNull();

    // Admin de outra empresa não apaga; o da empresa apaga mesmo com a obra cancelada.
    const deFora = await adminPro.cliente.rpc("apagar_foto_etapa_obra", { p_foto_id: fotoId! });
    expect(deFora.error?.code).toBe("42501");
    const { data: apagado } = ok(await adminSolo.cliente.rpc("apagar_foto_etapa_obra", { p_foto_id: fotoId! }), "apagar");
    expect(apagado).toBe(caminho);
  });

  it("empresa que vira Solo: todas ganham checklist (concluída entregue, cancelada cancelada); só a aberta ganha link", async () => {
    const aberta = await criarObra(pro, adminPro, "Pro aberta");
    const estornada = await criarObra(pro, adminPro, "Pro estornada");
    const cancelada = await criarObra(pro, adminPro, "Pro cancelada");
    const concluida = await criarObra(pro, adminPro, "Pro concluída");
    await cancelar(cancelada);
    await noBanco("update public.obras set alerta_pagamento_estornado_em = now() where id = $1", [estornada]);
    await noBanco(
      "update public.obra_fluxos set status = case when setor = 'compras' then 'material_entregue' else 'concluido' end where obra_id = $1",
      [concluida],
    );
    await noBanco(
      "update public.obra_fluxos set concluido_em = now() - interval '3 days' where obra_id = $1 and concluido_em is null",
      [concluida],
    );
    await noBanco("update public.obra_marcos set status = 'concluido', concluido_em = now() - interval '2 days' where obra_id = $1", [concluida]);
    const setoresAntes = await setoresDa(aberta);

    await trocarPlano(pro, "solo");

    const etapas = await etapasDa(aberta);
    expect(etapas).toHaveLength(10);
    expect(etapas.find((e) => e.etapa === "contrato")!.feita_em).toBeTruthy();
    expect(etapas.find((e) => e.etapa === "entrada")!.feita_em).toBeTruthy();
    expect(etapas.filter((e) => e.feita_em === null)).toHaveLength(8);
    expect(await linkDa(aberta)).toBeTruthy();
    expect(await setoresDa(aberta)).toEqual(setoresAntes); // os fluxos que já tinha ficam

    expect((await etapasDa(estornada)).find((e) => e.etapa === "entrada")!.feita_em).toBeNull();

    // Cancelada: checklist pelos fatos (aparece em "Canceladas"), sem link.
    const etapasCancelada = await etapasDa(cancelada);
    expect(etapasCancelada).toHaveLength(10);
    expect(etapasCancelada.filter((e) => e.feita_em !== null).map((e) => e.etapa)).toEqual(["contrato", "entrada"]);
    expect(await linkDa(cancelada)).toBeNull();

    // Concluída: entrega na data da conclusão dos setores e marcos, etapas do meio "não se aplica" (aparece em "Entregues"), sem link.
    const fimConcluida = (
      await noBanco(
        `select (greatest((select max(concluido_em) from public.obra_fluxos where obra_id = $1),
                          (select max(concluido_em) from public.obra_marcos where obra_id = $1)) at time zone 'America/Sao_Paulo')::date::text as d`,
        [concluida],
      )
    )[0].d as string;
    const etapasConcluida = await noBanco(
      "select etapa::text as etapa, feita_em::text as feita_em, nao_se_aplica_motivo from public.obra_checklist where obra_id = $1 order by etapa",
      [concluida],
    );
    expect(etapasConcluida).toHaveLength(10);
    expect(etapasConcluida.find((e) => e.etapa === "entrega")!.feita_em).toBe(fimConcluida);
    expect(etapasConcluida.filter((e) => e.nao_se_aplica_motivo !== null)).toHaveLength(7);
    expect(etapasConcluida.every((e) => e.feita_em !== null || e.nao_se_aplica_motivo !== null)).toBe(true);
    expect(await linkDa(concluida)).toBeNull();

    // O admin da empresa (agora Solo) já marca no checklist da obra que veio do PRO.
    ok(await adminPro.cliente.rpc("marcar_etapa_obra", { p_obra_id: aberta, p_etapa: "instalacao", p_feita: true, p_data: hoje() }), "marcar");
  });

  it("empresa que sai do Solo: obras abertas ganham os setores e perdem o link; a concluída fica como está", async () => {
    // Engenharia desligada: a obra recebe só os setores que a empresa tem.
    ok(
      await servico.from("empresa_telas").upsert({ empresa_id: solo, setores_desligados: ["engenharia"] } as never, { onConflict: "empresa_id" }),
      "setores desligados",
    );
    const aberta = await criarObra(solo, adminSolo, "Solo aberta");
    const concluida = await criarObra(solo, adminSolo, "Solo concluída");
    await noBanco("update public.obra_checklist set feita_em = coalesce(feita_em, current_date) where obra_id = $1", [concluida]);
    expect(await setoresDa(aberta)).toEqual([]);
    const linkConcluida = await linkDa(concluida);

    await trocarPlano(solo, "pro");

    expect(await setoresDa(aberta)).toEqual(["administrativo:pagando_fornecedores", "compras:a_comprar", "operacional:aguardando_liberacao"]);
    expect(await linkDa(aberta)).toBeNull();
    expect(await etapasDa(aberta)).toHaveLength(10); // o checklist fica guardado
    expect(await setoresDa(concluida)).toEqual([]);
    expect(await linkDa(concluida)).toBe(linkConcluida);

    // Voltar ao Solo: a obra aberta tem checklist e ganha um link novo; os setores ficam.
    await trocarPlano(solo, "solo");
    expect(await linkDa(aberta)).toBeTruthy();
    expect(await setoresDa(aberta)).toHaveLength(3);
  });
});
