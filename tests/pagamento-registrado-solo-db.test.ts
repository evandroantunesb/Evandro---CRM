/**
 * Raion Solo — registro manual de pagamento por negócio (20261014120000_pagamento_registrado_solo.sql).
 * O único admin ativo de uma empresa Solo marca "pago" sozinho, antes ou depois do contrato,
 * sem segundo aprovador e sem evento de gamificação. O Pro (`confirmar_pagamento`) não muda;
 * os dois caminhos nunca deixam dois pagamentos ativos no mesmo negócio.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string; motivoPerda: string };

let soloAdmin: Usuario;
let duploAdmin: Usuario;
let duploVendedor: Usuario;
let proAdmin: Usuario;
let proGestor: Usuario;
let proCloser: Usuario;
let solo: Empresa;
let duplo: Empresa;
let pro: Empresa;
const membro: Record<string, string> = {};

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function criarEmpresa(nome: string, produto: "solo" | "pro" | null, vinculos: { u: Usuario; papel: "admin" | "gestor" | "vendedor" }[]): Promise<Empresa> {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  if (produto) {
    const { error: erroPlano } = await servico.from("planos_empresa").insert({ empresa_id: emp!.id, produto });
    if (erroPlano) throw erroPlano;
  }
  const { data: vs, error: erroV } = await servico
    .from("empresa_membros")
    .insert(vinculos.map((v) => ({ empresa_id: emp!.id, user_id: v.u.id, papel: v.papel })))
    .select("id, user_id");
  if (erroV) throw erroV;
  for (const v of vs!) membro[`${emp!.id}:${v.user_id}`] = v.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: emp!.id, nome: `Cliente ${nome}` }).select("id").single();
  const { data: m } = await servico.from("motivos_perda").upsert({ empresa_id: emp!.id, nome: "Motivo teste" }, { onConflict: "empresa_id,nome" }).select("id").single();
  return { id: emp!.id, funil: f!.id, etapa: et!.id, contato: c!.id, motivoPerda: m!.id };
}

const membroDe = (e: Empresa, u: Usuario) => membro[`${e.id}:${u.id}`];

async function criarNegocio(e: Empresa, titulo: string, responsavel: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    // Valor obrigatório: o banco recusa marcar ganho sem valor.
    .insert({ empresa_id: e.id, titulo, contato_id: e.contato, funil_id: e.funil, etapa_id: e.etapa, responsavel_id: membroDe(e, responsavel), valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function gerarContrato(e: Empresa, negocioId: string, u: Usuario) {
  const { data, error } = await u.cliente.from("contratos").insert({ empresa_id: e.id, negocio_id: negocioId, conteudo: "Contrato de teste" }).select("id").single();
  if (error) throw error;
  return data!.id as string;
}

async function assinar(contratoId: string, u: Usuario) {
  const { error } = await u.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoId);
  if (error) throw error;
}

async function marcar(e: Empresa, negocioId: string, status: "ganho" | "perdido" | "aberto", u: Usuario) {
  const dados = status === "perdido" ? { status, motivo_perda_id: e.motivoPerda } : { status };
  const { error } = await u.cliente.from("negocios").update(dados).eq("id", negocioId);
  if (error) throw error;
}

const registrar = (u: Usuario, negocioId: string, extra: { p_data_recebimento?: string; p_observacao?: string } = {}) =>
  u.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioId, ...extra });

async function registrosDo(negocioId: string) {
  const { data, error } = await servico
    .from("registros_pagamento")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("registrado_em");
  if (error) throw error;
  return data;
}

async function eventosPagamento(negocioId: string) {
  const { data } = await servico.from("eventos").select("tipo").eq("entidade_id", negocioId).like("tipo", "pagamento.%");
  return data ?? [];
}

beforeAll(async () => {
  [soloAdmin, duploAdmin, duploVendedor, proAdmin, proGestor, proCloser] = await Promise.all(
    ["solo-admin", "duplo-admin", "duplo-vendedor", "pro-admin", "pro-gestor", "pro-closer"].map(criarUsuario),
  );
  [solo, duplo, pro] = await Promise.all([
    criarEmpresa("Solo", "solo", [{ u: soloAdmin, papel: "admin" }]),
    criarEmpresa("Solo com dois", "solo", [{ u: duploAdmin, papel: "admin" }, { u: duploVendedor, papel: "vendedor" }]),
    // Sem linha em planos_empresa: é Pro (padrão de todas as empresas existentes).
    criarEmpresa("Pro", null, [{ u: proAdmin, papel: "admin" }, { u: proGestor, papel: "gestor" }, { u: proCloser, papel: "vendedor" }]),
  ]);
});

describe("plano explícito", () => {
  it("empresa nova com linha de plano sem produto fica Pro", async () => {
    const { data: emp } = await servico.from("empresas").insert({ nome: `Padrão ${sufixo}` }).select("id").single();
    await servico.from("planos_empresa").insert({ empresa_id: emp!.id });
    const { data } = await servico.from("planos_empresa").select("produto").eq("empresa_id", emp!.id).single();
    expect(data!.produto).toBe("pro");
  });
});

describe("Solo: registrar pagamento sem segundo aprovador", () => {
  it("pagamento sem contrato: registra com autor real, data de hoje, linha do tempo e sem evento de gamificação", async () => {
    const negocioId = await criarNegocio(solo, "Sem contrato", soloAdmin);
    const { data, error } = await registrar(soloAdmin, negocioId);
    expect(error).toBeNull();
    const reg = data!;
    expect(reg.registrado_por_user_id).toBe(soloAdmin.id);
    expect(reg.registrado_por_membro_id).toBe(membroDe(solo, soloAdmin));
    expect(reg.data_recebimento).toBe(hojeSP());
    expect(reg.modalidade).toBe("solo_autonomo");

    const { data: ativ } = await servico.from("atividades").select("tipo, ator_id").eq("negocio_id", negocioId).eq("tipo", "pagamento_registrado");
    expect(ativ).toEqual([{ tipo: "pagamento_registrado", ator_id: soloAdmin.id }]);
    expect(await eventosPagamento(negocioId)).toEqual([]);
  });

  it("pode_registrar_pagamento_negocio: verdadeiro para o admin único do Solo", async () => {
    const negocioId = await criarNegocio(solo, "Pode registrar", soloAdmin);
    const { data } = await soloAdmin.cliente.rpc("pode_registrar_pagamento_negocio", { p_negocio_id: negocioId });
    expect(data).toBe(true);
  });

  it("ganho → pago → contrato gerado → assinado", async () => {
    const negocioId = await criarNegocio(solo, "Ganho primeiro", soloAdmin);
    await marcar(solo, negocioId, "ganho", soloAdmin);
    expect((await registrar(soloAdmin, negocioId)).error).toBeNull();
    const contratoId = await gerarContrato(solo, negocioId, soloAdmin);
    await assinar(contratoId, soloAdmin);
    const regs = await registrosDo(negocioId);
    expect(regs).toHaveLength(1);
    expect(regs[0].estornado_em).toBeNull();
  });

  it("pago → contrato gerado → assinado → ganho", async () => {
    const negocioId = await criarNegocio(solo, "Pago primeiro", soloAdmin);
    expect((await registrar(soloAdmin, negocioId)).error).toBeNull();
    const contratoId = await gerarContrato(solo, negocioId, soloAdmin);
    await assinar(contratoId, soloAdmin);
    await marcar(solo, negocioId, "ganho", soloAdmin);
    expect((await registrosDo(negocioId))[0].estornado_em).toBeNull();
  });

  it("contrato gerado e assinado → ganho → pago", async () => {
    const negocioId = await criarNegocio(solo, "Contrato primeiro", soloAdmin);
    const contratoId = await gerarContrato(solo, negocioId, soloAdmin);
    await assinar(contratoId, soloAdmin);
    await marcar(solo, negocioId, "ganho", soloAdmin);
    expect((await registrar(soloAdmin, negocioId)).error).toBeNull();
  });

  it("pagamento com contrato ainda em rascunho", async () => {
    const negocioId = await criarNegocio(solo, "Contrato rascunho", soloAdmin);
    await gerarContrato(solo, negocioId, soloAdmin);
    expect((await registrar(soloAdmin, negocioId)).error).toBeNull();
  });

  it("contrato gerado sem pagamento continua possível (geração não depende de ganho nem de pagamento)", async () => {
    const negocioId = await criarNegocio(solo, "Só contrato", soloAdmin);
    await gerarContrato(solo, negocioId, soloAdmin);
    expect(await registrosDo(negocioId)).toEqual([]);
  });

  it("ganho + assinado + registrado ainda NÃO cria Obra (o registro entra como marco na P1, com módulo e escopo)", async () => {
    const negocioId = await criarNegocio(solo, "Sem Obra antes da P1", soloAdmin);
    await registrar(soloAdmin, negocioId);
    await assinar(await gerarContrato(solo, negocioId, soloAdmin), soloAdmin);
    await marcar(solo, negocioId, "ganho", soloAdmin);
    const { data: obras } = await servico.from("obras").select("id").eq("negocio_id", negocioId);
    expect(obras).toEqual([]);
  });

  it("data do recebimento anterior é aceita; futura é recusada", async () => {
    const negocioId = await criarNegocio(solo, "Datas", soloAdmin);
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const { error: erroFutura } = await registrar(soloAdmin, negocioId, { p_data_recebimento: amanha });
    expect(erroFutura?.message).toContain("futura");

    const { data, error } = await registrar(soloAdmin, negocioId, { p_data_recebimento: "2026-09-30", p_observacao: "  Pix  " });
    expect(error).toBeNull();
    const reg = data!;
    expect(reg.data_recebimento).toBe("2026-09-30");
    expect(reg.observacao).toBe("Pix");
  });

  it("registro duplicado é recusado; chamadas simultâneas geram um único registro", async () => {
    const negocioId = await criarNegocio(solo, "Duplicado", soloAdmin);
    const resultados = await Promise.all([registrar(soloAdmin, negocioId), registrar(soloAdmin, negocioId), registrar(soloAdmin, negocioId)]);
    expect(resultados.filter((r) => r.error == null)).toHaveLength(1);
    expect(await registrosDo(negocioId)).toHaveLength(1);

    const { error } = await registrar(soloAdmin, negocioId);
    expect(error?.message).toContain("já tem pagamento registrado");
  });

  it("negócio perdido não recebe registro; registro existente não some quando o negócio é perdido depois", async () => {
    const perdido = await criarNegocio(solo, "Perdido antes", soloAdmin);
    await marcar(solo, perdido, "perdido", soloAdmin);
    const { error } = await registrar(soloAdmin, perdido);
    expect(error?.message).toContain("perdido");

    const depois = await criarNegocio(solo, "Perdido depois", soloAdmin);
    await registrar(soloAdmin, depois);
    await marcar(solo, depois, "perdido", soloAdmin);
    const regs = await registrosDo(depois);
    expect(regs).toHaveLength(1);
    expect(regs[0].estornado_em).toBeNull();
  });
});

describe("Solo: estorno e correção auditáveis", () => {
  it("estorno sem motivo é recusado; com motivo preserva a linha e registra na linha do tempo", async () => {
    const negocioId = await criarNegocio(solo, "Estorno", soloAdmin);
    await registrar(soloAdmin, negocioId);

    const { error: semMotivo } = await soloAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: " " });
    expect(semMotivo?.message).toContain("motivo");

    const { data, error } = await soloAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: "Pix devolvido" });
    expect(error).toBeNull();
    const reg = data!;
    expect(reg.motivo_estorno).toBe("Pix devolvido");
    expect(reg.estornado_por_user_id).toBe(soloAdmin.id);

    const { data: ativ } = await servico.from("atividades").select("tipo").eq("negocio_id", negocioId).eq("tipo", "pagamento_registro_estornado");
    expect(ativ).toHaveLength(1);

    // Depois do estorno, pode registrar de novo: 2 linhas, 1 ativa.
    expect((await registrar(soloAdmin, negocioId)).error).toBeNull();
    const regs = await registrosDo(negocioId);
    expect(regs).toHaveLength(2);
    expect(regs.filter((r) => r.estornado_em == null)).toHaveLength(1);
  });

  it("correção estorna o registro ativo e cria outro ligado por substitui_id, na mesma transação", async () => {
    const negocioId = await criarNegocio(solo, "Correção", soloAdmin);
    const { data: original } = await registrar(soloAdmin, negocioId);
    const originalId = original!.id;

    const { data, error } = await soloAdmin.cliente.rpc("corrigir_registro_pagamento", {
      p_negocio_id: negocioId,
      p_data_recebimento: "2026-10-01",
      p_observacao: "",
      p_motivo: "Data errada",
    });
    expect(error).toBeNull();
    const novo = data!;
    expect(novo.substitui_id).toBe(originalId);
    expect(novo.data_recebimento).toBe("2026-10-01");

    const regs = await registrosDo(negocioId);
    const antigo = regs.find((r) => r.id === originalId)!;
    expect(antigo.motivo_estorno).toBe("Data errada");
    expect(regs.filter((r) => r.estornado_em == null)).toHaveLength(1);

    const { data: ativ } = await servico.from("atividades").select("tipo").eq("negocio_id", negocioId).in("tipo", ["pagamento_registro_corrigido", "pagamento_registrado"]);
    expect(ativ!.map((a) => a.tipo).sort()).toEqual(["pagamento_registrado", "pagamento_registrado", "pagamento_registro_corrigido"]);
  });

  it("correção com data futura falha inteira: o registro original continua ativo", async () => {
    const negocioId = await criarNegocio(solo, "Correção inválida", soloAdmin);
    await registrar(soloAdmin, negocioId);
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const { error } = await soloAdmin.cliente.rpc("corrigir_registro_pagamento", { p_negocio_id: negocioId, p_data_recebimento: amanha, p_observacao: "", p_motivo: "x" });
    expect(error).not.toBeNull();
    const regs = await registrosDo(negocioId);
    expect(regs).toHaveLength(1);
    expect(regs[0].estornado_em).toBeNull();
  });

  it("ninguém escreve direto na tabela (nem service_role, nem o admin)", async () => {
    const negocioId = await criarNegocio(solo, "Escrita direta", soloAdmin);
    await registrar(soloAdmin, negocioId);
    const [reg] = await registrosDo(negocioId);

    const { error: insAdmin } = await soloAdmin.cliente.from("registros_pagamento").insert({
      empresa_id: solo.id, negocio_id: negocioId, data_recebimento: hojeSP(),
      registrado_por_membro_id: membroDe(solo, soloAdmin), registrado_por_user_id: soloAdmin.id,
    });
    expect(insAdmin).not.toBeNull();

    const { error: updServico } = await servico.from("registros_pagamento").update({ data_recebimento: "2026-01-01" }).eq("id", reg.id);
    expect(updServico).not.toBeNull();
    const { error: delServico } = await servico.from("registros_pagamento").delete().eq("id", reg.id);
    expect(delServico).not.toBeNull();
    expect(await registrosDo(negocioId)).toHaveLength(1);
  });

  it("negócio com registro de pagamento não pode ser apagado", async () => {
    const negocioId = await criarNegocio(solo, "Apagar", soloAdmin);
    await registrar(soloAdmin, negocioId);
    const { error } = await servico.from("negocios").delete().eq("id", negocioId);
    expect(error).not.toBeNull();
  });
});

describe("Critério Solo: plano explícito + um único vínculo ativo", () => {
  it("Pro (sem plano Solo): admin não registra; pode_registrar é falso", async () => {
    const negocioId = await criarNegocio(pro, "Pro tenta registrar", proCloser);
    const { error } = await registrar(proAdmin, negocioId);
    expect(error?.message).toContain("plano Solo");
    const { data } = await proAdmin.cliente.rpc("pode_registrar_pagamento_negocio", { p_negocio_id: negocioId });
    expect(data).toBe(false);
  });

  it("Solo com dois vínculos ativos: só o registro é recusado; volta a funcionar com um vínculo ativo", async () => {
    const negocioId = await criarNegocio(duplo, "Dois ativos", duploAdmin);
    const { error } = await registrar(duploAdmin, negocioId);
    expect(error?.message).toContain("único usuário ativo");

    // Nada foi suspenso: o vendedor continua ativo até alguém mudar de propósito.
    const { data: v } = await servico.from("empresa_membros").select("ativo").eq("id", membroDe(duplo, duploVendedor)).single();
    expect(v!.ativo).toBe(true);

    await servico.from("empresa_membros").update({ status: "inativo" }).eq("id", membroDe(duplo, duploVendedor));
    expect((await registrar(duploAdmin, negocioId)).error).toBeNull();
    await servico.from("empresa_membros").update({ status: "ativo" }).eq("id", membroDe(duplo, duploVendedor));
  });

  it("vendedor não registra, mesmo no Solo", async () => {
    const negocioId = await criarNegocio(duplo, "Vendedor tenta", duploVendedor);
    const { error } = await registrar(duploVendedor, negocioId);
    expect(error?.message).toContain("permissão");
  });

  it("admin de outra empresa não registra nem lê registros", async () => {
    const negocioId = await criarNegocio(solo, "Outra empresa", soloAdmin);
    await registrar(soloAdmin, negocioId);
    const { error } = await registrar(proAdmin, negocioId);
    expect(error?.message).toContain("permissão");
    const { data } = await proAdmin.cliente.from("registros_pagamento").select("id").eq("negocio_id", negocioId);
    expect(data).toEqual([]);
  });
});

describe("Pro intacto e um pagamento por negócio", () => {
  it("Pro: gestor da equipe confirma o pagamento do closer como antes", async () => {
    // O gestor só vê o negócio de quem está na equipe dele (pode_ver_responsavel).
    const { data: equipe } = await servico.from("equipes").insert({ empresa_id: pro.id, nome: `Equipe Pro ${sufixo}` }).select("id").single();
    await servico.from("equipe_membros").insert([
      { empresa_id: pro.id, equipe_id: equipe!.id, membro_id: membroDe(pro, proGestor), e_gestor: true },
      { empresa_id: pro.id, equipe_id: equipe!.id, membro_id: membroDe(pro, proCloser), e_gestor: false },
    ]);
    const negocioId = await criarNegocio(pro, "Pro fluxo", proCloser);
    const contratoId = await gerarContrato(pro, negocioId, proCloser);
    await assinar(contratoId, proCloser);
    const { error } = await proGestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    // Pro não registra pelo caminho do Solo.
    const { error: erroRegistro } = await registrar(proAdmin, negocioId);
    expect(erroRegistro).not.toBeNull();
  });

  it("upgrade: registro do Solo continua válido, com autor, e o admin ainda pode estorná-lo", async () => {
    const [admin, gestor] = await Promise.all(["up-admin", "up-gestor"].map(criarUsuario));
    const emp = await criarEmpresa("Upgrade", "solo", [{ u: admin, papel: "admin" }]);
    const negocioId = await criarNegocio(emp, "Venda do Solo", admin);
    await registrar(admin, negocioId);
    const contratoId = await gerarContrato(emp, negocioId, admin);
    await assinar(contratoId, admin);

    // Upgrade: plano Pro + novo gestor.
    await servico.from("planos_empresa").update({ produto: "pro" }).eq("empresa_id", emp.id);
    const { data: g } = await servico.from("empresa_membros").insert({ empresa_id: emp.id, user_id: gestor.id, papel: "gestor" }).select("id").single();
    membro[`${emp.id}:${gestor.id}`] = g!.id;

    const [reg] = await registrosDo(negocioId);
    expect(reg.estornado_em).toBeNull();
    expect(reg.registrado_por_user_id).toBe(admin.id);

    // Admin pode estornar o registro depois do upgrade (corrigir um fato do Solo não é incompatível com o Pro).
    const { error: erroEstorno } = await admin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: "Migrar para a confirmação do Pro" });
    expect(erroEstorno).toBeNull();
  });

  it("confirmação do Pro recusa negócio com registro ativo (mensagem do registro)", async () => {
    const [admin, gestor, closer] = await Promise.all(["rc-admin", "rc-gestor", "rc-closer"].map(criarUsuario));
    const emp = await criarEmpresa("Recusa confirmação", "solo", [{ u: admin, papel: "admin" }]);
    const negocioId = await criarNegocio(emp, "Registro antes", admin);
    await registrar(admin, negocioId);
    // Vira Pro com equipe; o closer assina como responsável e o admin tenta confirmar.
    await servico.from("planos_empresa").update({ produto: "pro" }).eq("empresa_id", emp.id);
    const { data: vs } = await servico
      .from("empresa_membros")
      .insert([{ empresa_id: emp.id, user_id: gestor.id, papel: "gestor" }, { empresa_id: emp.id, user_id: closer.id, papel: "vendedor" }])
      .select("id, user_id");
    const closerMembro = vs!.find((v) => v.user_id === closer.id)!.id;
    await servico.from("negocios").update({ responsavel_id: closerMembro }).eq("id", negocioId);
    const contratoId = await gerarContrato(emp, negocioId, admin);
    await assinar(contratoId, admin);

    const { error } = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error?.message).toContain("já tem pagamento registrado");
    expect(await eventosPagamento(negocioId)).toEqual([]);
  });

  it("downgrade: confirmação ativa do Pro impede registro no Solo (sem dois pagamentos)", async () => {
    const [admin, gestor, closer] = await Promise.all(["dn-admin", "dn-gestor", "dn-closer"].map(criarUsuario));
    const emp = await criarEmpresa("Downgrade", null, [{ u: admin, papel: "admin" }, { u: gestor, papel: "gestor" }, { u: closer, papel: "vendedor" }]);
    const negocioId = await criarNegocio(emp, "Venda do Pro", closer);
    const contratoId = await gerarContrato(emp, negocioId, closer);
    await assinar(contratoId, closer);
    const { error: erroConf } = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(erroConf).toBeNull();

    // Downgrade: plano Solo e só o admin ativo.
    await servico.from("planos_empresa").insert({ empresa_id: emp.id, produto: "solo" });
    await servico.from("empresa_membros").update({ status: "inativo" }).in("id", [membroDe(emp, gestor), membroDe(emp, closer)]);

    const { error } = await registrar(admin, negocioId);
    expect(error?.message).toContain("já tem pagamento confirmado");
  });
});

describe("Retificação de registro Solo depois do upgrade (decisão da PR #186)", () => {
  // Empresa que nasceu Solo, registrou pagamento e virou Pro com equipe.
  async function cenarioUpgrade(nome: string) {
    const [admin, gestor, vendedor] = await Promise.all([`${nome}-admin`, `${nome}-gestor`, `${nome}-vend`].map(criarUsuario));
    const emp = await criarEmpresa(nome, "solo", [{ u: admin, papel: "admin" }]);
    const negocioId = await criarNegocio(emp, `Venda ${nome}`, admin);
    const { data: original } = await registrar(admin, negocioId, { p_data_recebimento: "2026-10-01" });
    await servico.from("planos_empresa").update({ produto: "pro" }).eq("empresa_id", emp.id);
    const { data: vs } = await servico
      .from("empresa_membros")
      .insert([{ empresa_id: emp.id, user_id: gestor.id, papel: "gestor" }, { empresa_id: emp.id, user_id: vendedor.id, papel: "vendedor" }])
      .select("id, user_id");
    for (const v of vs!) membro[`${emp.id}:${v.user_id}`] = v.id;
    // Gestor vê o negócio pela equipe: a recusa dele tem de vir do papel, não da visibilidade.
    const { data: equipe } = await servico.from("equipes").insert({ empresa_id: emp.id, nome: `Equipe ${nome}` }).select("id").single();
    await servico.from("equipe_membros").insert([
      { empresa_id: emp.id, equipe_id: equipe!.id, membro_id: membroDe(emp, gestor), e_gestor: true },
      { empresa_id: emp.id, equipe_id: equipe!.id, membro_id: membroDe(emp, admin), e_gestor: false },
    ]);
    return { admin, gestor, vendedor, emp, negocioId, originalId: original!.id };
  }

  async function contarEventos(negocioId: string) {
    const { count } = await servico.from("eventos").select("id", { count: "exact", head: true }).eq("entidade_id", negocioId);
    return count ?? 0;
  }

  it("após upgrade, admin corrige data/observação: uma linha ativa, cadeia preservada, sem eventos", async () => {
    const c = await cenarioUpgrade("ret-corrige");
    const eventosAntes = await contarEventos(c.negocioId);
    const { data, error } = await c.admin.cliente.rpc("corrigir_registro_pagamento", {
      p_negocio_id: c.negocioId,
      p_data_recebimento: "2026-09-28",
      p_observacao: "Pix do dia 28",
      p_motivo: "Data informada errada",
    });
    expect(error).toBeNull();
    expect(data!.substitui_id).toBe(c.originalId);
    expect(data!.data_recebimento).toBe("2026-09-28");
    expect(data!.modalidade).toBe("solo_autonomo");
    expect(data!.registrado_por_user_id).toBe(c.admin.id);

    const regs = await registrosDo(c.negocioId);
    expect(regs.filter((r) => r.estornado_em == null)).toHaveLength(1);
    const original = regs.find((r) => r.id === c.originalId)!;
    expect(original.motivo_estorno).toBe("Data informada errada");
    expect(original.data_recebimento).toBe("2026-10-01");
    expect(await contarEventos(c.negocioId)).toBe(eventosAntes);
  });

  it("após upgrade, admin estorna; depois não consegue registrar novo pagamento pelo caminho do Solo", async () => {
    const c = await cenarioUpgrade("ret-estorna");
    const eventosAntes = await contarEventos(c.negocioId);
    const { error } = await c.admin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: c.negocioId, p_motivo: "Cliente desistiu" });
    expect(error).toBeNull();
    expect(await contarEventos(c.negocioId)).toBe(eventosAntes);

    const { error: novo } = await registrar(c.admin, c.negocioId);
    expect(novo?.message).toContain("plano Solo");
    const { data: pode } = await c.admin.cliente.rpc("pode_registrar_pagamento_negocio", { p_negocio_id: c.negocioId });
    expect(pode).toBe(false);
  });

  it("gestor e vendedor da empresa não estornam nem corrigem", async () => {
    const c = await cenarioUpgrade("ret-papel");
    for (const u of [c.gestor, c.vendedor]) {
      const { error: e1 } = await u.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: c.negocioId, p_motivo: "x" });
      expect(e1?.message).toContain("administrador");
      const { error: e2 } = await u.cliente.rpc("corrigir_registro_pagamento", { p_negocio_id: c.negocioId, p_data_recebimento: "2026-09-01", p_observacao: "", p_motivo: "x" });
      expect(e2?.message).toContain("administrador");
    }
    expect((await registrosDo(c.negocioId)).filter((r) => r.estornado_em == null)).toHaveLength(1);
  });

  it("admin de outra empresa não estorna nem corrige", async () => {
    const c = await cenarioUpgrade("ret-outra");
    const { error: e1 } = await proAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: c.negocioId, p_motivo: "x" });
    expect(e1?.message).toContain("administrador");
    const { error: e2 } = await proAdmin.cliente.rpc("corrigir_registro_pagamento", { p_negocio_id: c.negocioId, p_data_recebimento: "2026-09-01", p_observacao: "", p_motivo: "x" });
    expect(e2?.message).toContain("administrador");
  });

  it("empresa Pro sem registro Solo anterior: correção e estorno recusados, nada é criado", async () => {
    const negocioId = await criarNegocio(pro, "Pro sem registro", proCloser);
    const { error: e1 } = await proAdmin.cliente.rpc("corrigir_registro_pagamento", { p_negocio_id: negocioId, p_data_recebimento: "2026-09-01", p_observacao: "", p_motivo: "x" });
    expect(e1?.message).toContain("Não há pagamento registrado");
    const { error: e2 } = await proAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: "x" });
    expect(e2?.message).toContain("Não há pagamento registrado");
    expect(await registrosDo(negocioId)).toEqual([]);
  });

  it("correções simultâneas: só uma vale, sem duplicata ativa", async () => {
    const c = await cenarioUpgrade("ret-concorre");
    const chamadas = ["2026-09-20", "2026-09-21", "2026-09-22"].map((d) =>
      c.admin.cliente.rpc("corrigir_registro_pagamento", { p_negocio_id: c.negocioId, p_data_recebimento: d, p_observacao: "", p_motivo: `ajuste ${d}` }),
    );
    const resultados = await Promise.all(chamadas);
    // Cada correção bem-sucedida estorna a ativa anterior; o que importa é nunca haver duas ativas.
    expect(resultados.filter((r) => r.error == null).length).toBeGreaterThanOrEqual(1);
    const regs = await registrosDo(c.negocioId);
    expect(regs.filter((r) => r.estornado_em == null)).toHaveLength(1);
    // Cadeia íntegra: toda linha nova substitui exatamente uma linha estornada.
    const substituidos = regs.map((r) => r.substitui_id).filter(Boolean);
    expect(new Set(substituidos).size).toBe(substituidos.length);
  });

  it("negócio que virou perdido depois do registro: correção permitida (retificação); registro novo segue bloqueado", async () => {
    const negocioId = await criarNegocio(solo, "Perdido e corrigido", soloAdmin);
    await registrar(soloAdmin, negocioId);
    await marcar(solo, negocioId, "perdido", soloAdmin);

    const { data, error } = await soloAdmin.cliente.rpc("corrigir_registro_pagamento", {
      p_negocio_id: negocioId, p_data_recebimento: "2026-09-15", p_observacao: "", p_motivo: "Data errada",
    });
    expect(error).toBeNull();
    expect(data!.data_recebimento).toBe("2026-09-15");

    await soloAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: "Venda perdida" });
    const { error: novo } = await registrar(soloAdmin, negocioId);
    expect(novo?.message).toContain("perdido");
  });
});
