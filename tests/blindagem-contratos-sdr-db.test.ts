/**
 * Contratos e confirmações do Pro fora do alcance do SDR (20261014100000_blindagem_contratos_confirmacoes.sql).
 * O SDR que vê o negócio não cria, edita, assina, apaga nem lê contrato; não lê confirmação de
 * pagamento nem atividade `pagamento_*`. Admin, gestor e vendedor seguem como antes, inclusive
 * eventos causais (`contrato.assinado`, `pagamento.confirmado`) e o beneficiário congelado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string };

let admin: Usuario, gestor: Usuario, vendedor: Usuario, sdr: Usuario, outroAdmin: Usuario;
let emp: Empresa, outra: Empresa;
const membro: Record<string, string> = {};
const MOTIVO = "Motivo sigiloso do estorno Pro";

let negocioPago: string; // vendedor assina, gestor confirma, estorna e confirma; depois vai para o SDR
let contratoPago: string;
let negocioDoSdr: string; // SDR responsável; admin gera o contrato
let contratoDoSdr: string;

async function criarEmpresa(nome: string): Promise<Empresa> {
  const { data: e, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", e!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: e!.id, nome: `Cliente ${nome}` }).select("id").single();
  return { id: e!.id, funil: f!.id, etapa: et!.id, contato: c!.id };
}

async function vincular(e: Empresa, vs: { u: Usuario; papel: "admin" | "gestor" | "vendedor" | "sdr" }[]) {
  const { data, error } = await servico
    .from("empresa_membros")
    .insert(vs.map((v) => ({ empresa_id: e.id, user_id: v.u.id, papel: v.papel })))
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

async function gerarContrato(e: Empresa, negocioId: string, u: Usuario) {
  const { data, error } = await u.cliente
    .from("contratos")
    .insert({ empresa_id: e.id, negocio_id: negocioId, conteudo: "Contrato de teste", criado_por: m(e, u) })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

const sem = <T>(r: { data: T | null; error: unknown }) => {
  expect(r.error).toBeNull();
  return r.data!;
};

const contratoNoBanco = async (id: string) => (await servico.from("contratos").select("*").eq("id", id).single()).data!;
const eventosDo = async (negocioId: string) =>
  ((await servico.from("eventos").select("tipo, ator_id, beneficiario_id").eq("entidade_id", negocioId).order("id")).data ?? []);

beforeAll(async () => {
  [admin, gestor, vendedor, sdr, outroAdmin] = await Promise.all(["bc-admin", "bc-gestor", "bc-vend", "bc-sdr", "bc-outro"].map(criarUsuario));
  emp = await criarEmpresa("Blindagem contratos");
  outra = await criarEmpresa("Blindagem outra");
  await vincular(emp, [{ u: admin, papel: "admin" }, { u: gestor, papel: "gestor" }, { u: vendedor, papel: "vendedor" }, { u: sdr, papel: "sdr" }]);
  // O SDR é vendedor em outra empresa: não pode usar esse papel para escrever no negócio desta.
  await vincular(outra, [{ u: outroAdmin, papel: "admin" }, { u: sdr, papel: "vendedor" }]);
  const { data: eq } = await servico.from("equipes").insert({ empresa_id: emp.id, nome: `Equipe ${sufixo}` }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: emp.id, equipe_id: eq!.id, membro_id: m(emp, gestor), e_gestor: true },
    { empresa_id: emp.id, equipe_id: eq!.id, membro_id: m(emp, vendedor), e_gestor: false },
    { empresa_id: emp.id, equipe_id: eq!.id, membro_id: m(emp, sdr), e_gestor: false },
  ]);

  negocioPago = await criarNegocio(emp, "Venda paga", vendedor);
  contratoPago = await gerarContrato(emp, negocioPago, vendedor);
  sem(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoPago).select("id"));
  sem(await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoPago }));
  sem(await gestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contratoPago, p_motivo: MOTIVO }));
  sem(await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoPago }));
  await servico.from("negocios").update({ responsavel_id: m(emp, sdr) }).eq("id", negocioPago);

  negocioDoSdr = await criarNegocio(emp, "Negócio do SDR", sdr);
  contratoDoSdr = await gerarContrato(emp, negocioDoSdr, admin);
});

describe("SDR não escreve em contratos pela API", () => {
  it("vê o negócio (a restrição é de papel, não de visibilidade)", async () => {
    expect(sem(await sdr.cliente.from("negocios").select("id").in("id", [negocioPago, negocioDoSdr]))).toHaveLength(2);
  });

  it("não cria contrato no próprio negócio", async () => {
    const outroNegocio = await criarNegocio(emp, "SDR tenta gerar", sdr);
    const { error } = await sdr.cliente.from("contratos").insert({ empresa_id: emp.id, negocio_id: outroNegocio, conteudo: "Contrato do SDR" });
    expect(error?.code).toBe("42501");
    expect((await servico.from("contratos").select("id").eq("negocio_id", outroNegocio)).data).toEqual([]);
  });

  it("não cria usando o papel de vendedor que tem em outra empresa", async () => {
    const outroNegocio = await criarNegocio(emp, "SDR tenta pela outra empresa", sdr);
    const { error } = await sdr.cliente.from("contratos").insert({ empresa_id: outra.id, negocio_id: outroNegocio, conteudo: "Contrato" });
    expect(error?.code).toBe("42501");
  });

  it("não assina, não edita conteúdo nem token: nada muda e nenhum evento é emitido", async () => {
    const antes = await contratoNoBanco(contratoDoSdr);
    const eventosAntes = await eventosDo(negocioDoSdr);
    for (const mudanca of [{ status: "assinado" as const }, { conteudo: "Alterado pelo SDR" }, { token: `token-${sufixo}` }]) {
      expect(sem(await sdr.cliente.from("contratos").update(mudanca).eq("id", contratoDoSdr).select("id"))).toEqual([]);
    }
    expect(await contratoNoBanco(contratoDoSdr)).toEqual(antes);
    expect(await eventosDo(negocioDoSdr)).toEqual(eventosAntes);
  });

  it("não apaga contrato", async () => {
    expect(sem(await sdr.cliente.from("contratos").delete().eq("id", contratoDoSdr).select("id"))).toEqual([]);
    expect(await contratoNoBanco(contratoDoSdr)).toBeTruthy();
  });
});

describe("SDR não lê dados de contrato nem de pagamento", () => {
  it("contratos: nenhuma linha (conteúdo, token, status)", async () => {
    expect(sem(await sdr.cliente.from("contratos").select("conteudo, token, status").in("negocio_id", [negocioPago, negocioDoSdr]))).toEqual([]);
    expect(sem(await sdr.cliente.from("contratos").select("id"))).toEqual([]);
  });

  it("confirmações de pagamento: nenhuma linha, nem motivo de estorno", async () => {
    expect(sem(await sdr.cliente.from("confirmacoes_pagamento").select("*").eq("negocio_id", negocioPago))).toEqual([]);
    expect(sem(await sdr.cliente.from("confirmacoes_pagamento").select("motivo_estorno"))).toEqual([]);
  });

  it("status do pagamento não vaza pela função (o contrato não é visível)", async () => {
    expect(sem(await sdr.cliente.rpc("status_pagamento_contrato", { p_contrato_id: contratoPago }))).toBeNull();
  });

  it("atividades: nenhuma de pagamento nem o JSON `dados`; os demais eventos continuam", async () => {
    const vistas = sem(await sdr.cliente.from("atividades").select("tipo, dados").eq("negocio_id", negocioPago));
    expect(vistas.filter((a) => a.tipo.startsWith("pagamento_"))).toEqual([]);
    expect(JSON.stringify(vistas)).not.toContain(MOTIVO);
    expect(vistas.map((a) => a.tipo)).toContain("negocio_criado");
    expect(sem(await sdr.cliente.from("atividades").select("id").like("tipo", "pagamento%"))).toEqual([]);
  });
});

describe("papéis autorizados mantêm os fluxos", () => {
  it("vendedor gera, edita, assina; o banco congela o responsável e emite contrato.assinado", async () => {
    const negocioId = await criarNegocio(emp, "Fluxo do vendedor", vendedor);
    const contratoId = await gerarContrato(emp, negocioId, vendedor);
    sem(await vendedor.cliente.from("contratos").update({ conteudo: "Revisado" }).eq("id", contratoId).select("id"));
    expect(sem(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoId).select("id"))).toHaveLength(1);
    expect(await contratoNoBanco(contratoId)).toMatchObject({ status: "assinado", conteudo: "Revisado", responsavel_assinatura_id: m(emp, vendedor) });
    expect((await eventosDo(negocioId)).map((e) => e.tipo)).toContain("contrato.assinado");
  });

  it("gestor confirma: evento pagamento.confirmado com o vendedor como beneficiário; duplicata recusada", async () => {
    const negocioId = await criarNegocio(emp, "Fluxo de confirmação", vendedor);
    const contratoId = await gerarContrato(emp, negocioId, vendedor);
    sem(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoId).select("id"));
    sem(await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId }));
    expect((await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId })).error?.message).toContain("já está confirmado");
    const pagos = (await eventosDo(negocioId)).filter((e) => e.tipo === "pagamento.confirmado");
    expect(pagos).toEqual([{ tipo: "pagamento.confirmado", ator_id: gestor.id, beneficiario_id: vendedor.id }]);
    expect(sem(await vendedor.cliente.rpc("status_pagamento_contrato", { p_contrato_id: contratoId }))).toBe("confirmado");
  });

  it("gestor e admin leem contrato, confirmações e atividades de pagamento (com motivo)", async () => {
    for (const u of [gestor, admin]) {
      expect(sem(await u.cliente.from("contratos").select("id").eq("id", contratoPago))).toHaveLength(1);
      expect(sem(await u.cliente.from("confirmacoes_pagamento").select("id").eq("negocio_id", negocioPago))).toHaveLength(2);
      const atividades = sem(await u.cliente.from("atividades").select("tipo, dados").eq("negocio_id", negocioPago));
      expect(JSON.stringify(atividades)).toContain(MOTIVO);
    }
  });

  it("vendedor lê o contrato e a confirmação do próprio negócio, não os de outro responsável", async () => {
    const negocioId = await criarNegocio(emp, "Leitura do vendedor", vendedor);
    const contratoId = await gerarContrato(emp, negocioId, vendedor);
    expect(sem(await vendedor.cliente.from("contratos").select("id").eq("id", contratoId))).toHaveLength(1);
    expect(sem(await vendedor.cliente.from("contratos").select("id").eq("id", contratoDoSdr))).toEqual([]);
  });

  it("admin apaga contrato sem pagamento; quem criou também; contrato com pagamento continua protegido", async () => {
    const n1 = await criarNegocio(emp, "Apagar pelo admin", vendedor);
    const c1 = await gerarContrato(emp, n1, vendedor);
    expect(sem(await admin.cliente.from("contratos").delete().eq("id", c1).select("id"))).toHaveLength(1);
    const n2 = await criarNegocio(emp, "Apagar por quem criou", vendedor);
    const c2 = await gerarContrato(emp, n2, vendedor);
    expect(sem(await vendedor.cliente.from("contratos").delete().eq("id", c2).select("id"))).toHaveLength(1);
    const { error } = await admin.cliente.from("contratos").delete().eq("id", contratoPago);
    expect(error?.message).toContain("histórico de pagamento");
  });
});

describe("isolamento entre empresas", () => {
  it("admin de outra empresa não lê nem altera contrato, confirmação ou atividade de pagamento", async () => {
    expect(sem(await outroAdmin.cliente.from("contratos").select("id").eq("id", contratoPago))).toEqual([]);
    expect(sem(await outroAdmin.cliente.from("contratos").update({ conteudo: "invasão" }).eq("id", contratoPago).select("id"))).toEqual([]);
    expect(sem(await outroAdmin.cliente.from("confirmacoes_pagamento").select("id").eq("negocio_id", negocioPago))).toEqual([]);
    expect(sem(await outroAdmin.cliente.from("atividades").select("id").eq("negocio_id", negocioPago))).toEqual([]);
    expect((await outroAdmin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoDoSdr })).error).not.toBeNull();
  });
});

describe("funções de autorização", () => {
  it("pode_ver_financeiro_negocio e tem_acesso_financeiro: admin/gestor/vendedor sim; SDR e outra empresa não", async () => {
    const pv = async (u: Usuario, n: string) => sem(await u.cliente.rpc("pode_ver_financeiro_negocio", { p_negocio_id: n }));
    expect(await pv(admin, negocioDoSdr)).toBe(true);
    expect(await pv(gestor, negocioDoSdr)).toBe(true);
    expect(await pv(sdr, negocioDoSdr)).toBe(false);
    expect(await pv(outroAdmin, negocioDoSdr)).toBe(false);
    expect(sem(await sdr.cliente.rpc("tem_acesso_financeiro", { p_empresa_id: emp.id }))).toBe(false);
    expect(sem(await sdr.cliente.rpc("tem_acesso_financeiro", { p_empresa_id: outra.id }))).toBe(true);
  });
});
