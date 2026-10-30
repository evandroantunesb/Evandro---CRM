/**
 * Engenharia — checklist e documentos (20261030100000_engenharia_checklist.sql): modelo da empresa (só admin
 * escreve, sem DELETE, lista inicial), checklist aplicado na obra (cópia; RPCs), arquivos versionados no bucket
 * privado `engenharia-documentos` (só admin e quem atua em Engenharia na obra), regras de conferência e dispensa,
 * histórico com autor real. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Checklist A/B" + sufixo, usuários "ec-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "engenharia-documentos";

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
let coordEng: Usuario;
let execEng: Usuario;
let execCompras: Usuario;
let engSemObra: Usuario;
let adminB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let obraB: string;

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: emp, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[responsavel.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await responsavel.cliente
    .from("contratos")
    .insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (erroContrato) throw erroContrato;
  const assinado = await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (erroPagamento) throw erroPagamento;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const aplicar = (quem: Usuario, o = obra) => quem.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: o });
const alterar = (quem: Usuario, item: string, status: string, motivo?: string) =>
  quem.cliente.rpc("alterar_item_engenharia", { p_item_id: item, p_status: status, ...(motivo ? { p_motivo: motivo } : {}) });

let contador = 0;
/** Envia um arquivo à pasta da obra e registra como versão do item. */
async function enviar(quem: Usuario, item: string, emp = empresa, o = obra) {
  const caminho = `${emp}/${o}/${Date.now()}-${++contador}.pdf`;
  const up = await quem.cliente.storage.from(BUCKET).upload(caminho, new Blob([new Uint8Array(64)], { type: "application/pdf" }), {
    contentType: "application/pdf",
  });
  if (up.error) return { caminho, upload: up.error, registro: null };
  const r = await quem.cliente.rpc("registrar_documento_engenharia", { p_item_id: item, p_caminho: caminho, p_nome: "arquivo.pdf" });
  return { caminho, upload: null, registro: r };
}

async function itens(o = obra) {
  const { data } = await servico.from("obra_engenharia_itens").select("id, titulo, obrigatorio, status, motivo").eq("obra_id", o).order("ordem");
  return data!;
}

async function historico(tipo: string) {
  const { data } = await servico.from("obra_historico").select("setor, autor_membro_id, dados").eq("obra_id", obra).eq("tipo", tipo).order("id");
  return data!;
}

describe("Engenharia: checklist e documentos (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obrigatorio: string;
  let opcional: string;

  beforeAll(async () => {
    [admin, gestor, vendedor, coordEng, execEng, execCompras, engSemObra, adminB, vendedorB] = await Promise.all(
      ["ec-admin", "ec-gestor", "ec-vendedor", "ec-coord-eng", "ec-exec-eng", "ec-exec-compras", "ec-eng-sem-obra", "ec-admin-b", "ec-vendedor-b"].map(
        criarUsuario,
      ),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Checklist A ${sufixo}` }, { nome: `Checklist B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordEng, empresa, operacao],
      [execEng, empresa, operacao],
      [execCompras, empresa, operacao],
      [engSemObra, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
      [vendedorB, empresaB, { papel: "vendedor", perfil_gamificacao: "closer" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    const setores: [Usuario, unknown][] = [
      [coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [execEng, [{ setor: "engenharia", capacidade: "executar" }]],
      [execCompras, [{ setor: "compras", capacidade: "executar" }]],
      [engSemObra, [{ setor: "engenharia", capacidade: "executar" }]],
    ];
    for (const [alvo, s] of setores) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    obra = await criarVenda(empresa, vendedor, admin, `Checklist ${sufixo}`);
    for (const [alvo, setor] of [
      [execEng, "engenharia"],
      [execCompras, "compras"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: membro[alvo.id],
        p_setor: setor,
        p_funcao: "apoio",
        p_principal: false,
      });
      if (e) throw e;
    }
  });

  it("empresa nova já nasce com o modelo inicial; só o admin edita; ninguém apaga", async () => {
    const { data } = await servico.from("engenharia_checklist_modelo").select("id, titulo, obrigatorio, ativo").eq("empresa_id", empresa);
    expect(data).toHaveLength(11);
    expect(data!.filter((m) => !m.obrigatorio)).toHaveLength(3);

    const criado = await admin.cliente
      .from("engenharia_checklist_modelo")
      .insert({ empresa_id: empresa, grupo: "Outros", titulo: "Foto do padrão de entrada", obrigatorio: false, ordem: 120 })
      .select("id")
      .single();
    expect(criado.error).toBeNull();
    const duplicado = await admin.cliente.from("engenharia_checklist_modelo").insert({ empresa_id: empresa, grupo: "Outros", titulo: " foto do PADRÃO de entrada " });
    expect(duplicado.error?.code).toBe("23505");

    for (const quem of [gestor, coordEng, adminB]) {
      const r = await quem.cliente.from("engenharia_checklist_modelo").insert({ empresa_id: empresa, grupo: "X", titulo: `Não pode ${quem.email}` });
      expect(r.error).not.toBeNull();
    }
    expect((await admin.cliente.from("engenharia_checklist_modelo").delete().eq("id", criado.data!.id)).error).not.toBeNull();
    // Desativado não entra em obra.
    expect((await admin.cliente.from("engenharia_checklist_modelo").update({ ativo: false }).eq("id", criado.data!.id)).error).toBeNull();
  });

  it("só quem atua em Engenharia na obra aplica o checklist (cópia dos ativos, sem repetir)", async () => {
    for (const quem of [gestor, vendedor, execCompras, engSemObra, adminB]) {
      expect((await aplicar(quem)).error?.code).toBe("42501");
    }
    const r = await aplicar(execEng);
    expect(r.error).toBeNull();
    expect(r.data).toBe(11);
    expect((await aplicar(coordEng)).data).toBe(0);
    const lista = await itens();
    expect(lista).toHaveLength(11);
    expect(lista.every((i) => i.status === "pendente")).toBe(true);
    obrigatorio = lista.find((i) => i.obrigatorio)!.id;
    opcional = lista.find((i) => !i.obrigatorio)!.id;

    const h = await historico("checklist_engenharia_aplicado");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ setor: "engenharia", autor_membro_id: membro[execEng.id], dados: { itens: 11, autorizacao: "executar" } });
  });

  it("válido exige arquivo; arquivo novo vira versão e manda o item para conferência", async () => {
    expect((await alterar(execEng, obrigatorio, "valido")).error?.code).toBe("23514");

    const v1 = await enviar(execEng, obrigatorio);
    expect(v1.upload).toBeNull();
    expect(v1.registro!.error).toBeNull();
    expect((await itens()).find((i) => i.id === obrigatorio)!.status).toBe("em_conferencia");

    expect((await alterar(execEng, obrigatorio, "valido")).error).toBeNull();
    const v2 = await enviar(coordEng, obrigatorio);
    expect(v2.registro!.error).toBeNull();
    const { data: versoes } = await servico.from("obra_engenharia_documentos").select("versao, enviado_por").eq("item_id", obrigatorio).order("versao");
    expect(versoes).toEqual([
      { versao: 1, enviado_por: membro[execEng.id] },
      { versao: 2, enviado_por: membro[coordEng.id] },
    ]);
    // Nova versão de item válido volta para conferência.
    expect((await itens()).find((i) => i.id === obrigatorio)!.status).toBe("em_conferencia");
    expect(await historico("documento_engenharia_enviado")).toHaveLength(2);
  });

  it("inválido e dispensado exigem motivo; obrigatório só admin ou coordenador dispensa", async () => {
    expect((await alterar(execEng, obrigatorio, "invalido")).error?.code).toBe("23514");
    expect((await alterar(execEng, obrigatorio, "invalido", "Ilegível")).error).toBeNull();
    expect((await itens()).find((i) => i.id === obrigatorio)).toMatchObject({ status: "invalido", motivo: "Ilegível" });

    expect((await alterar(execEng, obrigatorio, "dispensado", "Cliente sem fatura")).error?.code).toBe("42501");
    expect((await alterar(coordEng, obrigatorio, "dispensado", "Cliente sem fatura")).error).toBeNull();
    // Opcional: o executor marca "não se aplica".
    expect((await alterar(execEng, opcional, "dispensado", "Titular assina pessoalmente")).error).toBeNull();
    // De volta a pendente, sem motivo antigo.
    expect((await alterar(execEng, obrigatorio, "pendente")).error).toBeNull();
    expect((await itens()).find((i) => i.id === obrigatorio)).toMatchObject({ status: "pendente", motivo: null });
    // Em conferência não é escolha manual.
    expect((await alterar(execEng, obrigatorio, "em_conferencia")).error?.code).toBe("23514");

    const h = await historico("item_engenharia_alterado");
    expect(h.at(-1)).toMatchObject({ autor_membro_id: membro[execEng.id], dados: { de: "dispensado", para: "pendente", autorizacao: "executar" } });
  });

  it("checklist é visto por quem vê a obra; documentos e arquivos só por admin e Engenharia da obra", async () => {
    // O gestor sem equipe não vê esta obra (regra de Obras): só confere que não lê documentos.
    for (const quem of [admin, vendedor, execCompras, execEng]) {
      const { data } = await quem.cliente.from("obra_engenharia_itens").select("id").eq("obra_id", obra);
      expect(data, quem.email).toHaveLength(11);
    }
    const { data: doc } = await servico.from("obra_engenharia_documentos").select("caminho").eq("item_id", obrigatorio).eq("versao", 1).single();
    for (const quem of [admin, coordEng, execEng]) {
      expect((await quem.cliente.from("obra_engenharia_documentos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(2);
      expect((await quem.cliente.storage.from(BUCKET).download(doc!.caminho)).error, quem.email).toBeNull();
    }
    for (const quem of [gestor, vendedor, execCompras, engSemObra, adminB]) {
      expect((await quem.cliente.from("obra_engenharia_documentos").select("id").eq("obra_id", obra)).data, quem.email).toHaveLength(0);
      expect((await quem.cliente.storage.from(BUCKET).download(doc!.caminho)).data, quem.email).toBeNull();
    }
    for (const quem of [gestor, execCompras]) {
      const r = await enviar(quem, obrigatorio);
      expect(r.upload, quem.email).not.toBeNull();
    }
  });

  it("escrita direta é revogada; nada se apaga; pasta de outra obra é recusada", async () => {
    expect((await admin.cliente.from("obra_engenharia_itens").update({ status: "valido" }).eq("id", obrigatorio)).error).not.toBeNull();
    expect((await admin.cliente.from("obra_engenharia_documentos").delete().eq("item_id", obrigatorio)).error).not.toBeNull();
    const { data: doc } = await servico.from("obra_engenharia_documentos").select("caminho").eq("item_id", obrigatorio).eq("versao", 1).single();
    await admin.cliente.storage.from(BUCKET).remove([doc!.caminho]);
    const { data: ainda } = await servico.storage.from(BUCKET).download(doc!.caminho);
    expect(ainda).not.toBeNull();

    // Admin B tem a obra dele; o arquivo enviado lá não pode virar versão de item desta obra.
    obraB = await criarVenda(empresaB, vendedorB, adminB, `Checklist B ${sufixo}`);
    const r = await enviar(adminB, obrigatorio, empresaB, obraB);
    expect(r.upload).toBeNull();
    expect(r.registro!.error?.code).toBe("42501");
  });

  it("obra pausada aceita; obra cancelada não aceita", async () => {
    await noBanco("update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1", [obra]);
    expect((await enviar(execEng, obrigatorio)).registro!.error).toBeNull();
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1", [obra]);
    expect((await alterar(execEng, obrigatorio, "valido")).error?.code).toBe("23514");
    expect((await enviar(execEng, obrigatorio)).upload).not.toBeNull();
  });
});
