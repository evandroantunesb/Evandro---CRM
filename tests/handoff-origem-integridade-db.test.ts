/**
 * Integridade de `negocios.handoff_origem_id` (20261015110000_integridade_handoff_origem.sql).
 * Só `aceitar_handoff()` grava a origem do repasse; pela API ninguém insere, troca ou anula. O
 * valor precisa ser um repasse aceito do mesmo negócio e da mesma empresa. Bônus do SDR
 * (`handoff.contrato_assinado`, `handoff.won`) seguem indo para o SDR de origem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string };

let sdr: Usuario, sdr2: Usuario, closer: Usuario, admin: Usuario, sdrB: Usuario, closerB: Usuario;
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

async function vincular(e: Empresa, vs: [Usuario, "admin" | "vendedor" | "sdr", "sdr" | "closer" | null][]) {
  const { data, error } = await servico
    .from("empresa_membros")
    .insert(vs.map(([u, papel, perfil]) => ({ empresa_id: e.id, user_id: u.id, papel, perfil_gamificacao: perfil })))
    .select("id, user_id");
  if (error) throw error;
  for (const v of data!) membro[`${e.id}:${v.user_id}`] = v.id;
}

const m = (e: Empresa, u: Usuario) => membro[`${e.id}:${u.id}`];

async function criarNegocio(e: Empresa, titulo: string, responsavel: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: e.id, titulo, contato_id: e.contato, funil_id: e.funil, etapa_id: e.etapa, responsavel_id: m(e, responsavel), valor: 10000 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/** Fluxo real: o SDR responsável envia, o closer aceita pela RPC. */
async function enviarEAceitar(e: Empresa, negocioId: string, de: Usuario, para: Usuario) {
  const { data: h, error } = await de.cliente
    .from("handoffs")
    .insert({ empresa_id: e.id, negocio_id: negocioId, contato_id: e.contato, de_membro_id: m(e, de), para_membro_id: m(e, para), status_qualificacao: "qualificado" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAceite } = await para.cliente.rpc("aceitar_handoff", { p_handoff_id: h!.id });
  if (erroAceite) throw erroAceite;
  return h!.id as string;
}

/** Negócio já repassado de `sdrDe` para `closerPara`, com a origem gravada pelo aceite. */
async function negocioRepassado(e: Empresa, titulo: string, sdrDe: Usuario, closerPara: Usuario) {
  const negocioId = await criarNegocio(e, titulo, sdrDe);
  const handoffId = await enviarEAceitar(e, negocioId, sdrDe, closerPara);
  return { negocioId, handoffId };
}

const origem = async (negocioId: string) =>
  (await servico.from("negocios").select("handoff_origem_id").eq("id", negocioId).single()).data!.handoff_origem_id as string | null;

const bonusSdr = async (negocioId: string) =>
  ((await servico.from("eventos").select("tipo, beneficiario_id").eq("entidade_id", negocioId).in("tipo", ["handoff.won", "handoff.contrato_assinado"]).order("id"))
    .data ?? []);

let outroDaMesmaEmpresa: { negocioId: string; handoffId: string };
let daOutraEmpresa: { negocioId: string; handoffId: string };

beforeAll(async () => {
  [sdr, sdr2, closer, admin, sdrB, closerB] = await Promise.all(["ho-sdr", "ho-sdr2", "ho-closer", "ho-admin", "ho-sdrb", "ho-closerb"].map(criarUsuario));
  A = await criarEmpresa("Origem repasse A");
  B = await criarEmpresa("Origem repasse B");
  await vincular(A, [[sdr, "sdr", "sdr"], [sdr2, "sdr", "sdr"], [closer, "vendedor", "closer"], [admin, "admin", null]]);
  await vincular(B, [[sdrB, "sdr", "sdr"], [closerB, "vendedor", "closer"]]);
  outroDaMesmaEmpresa = await negocioRepassado(A, "Outro negócio do sdr2", sdr2, closer);
  daOutraEmpresa = await negocioRepassado(B, "Negócio da outra empresa", sdrB, closerB);
});

describe("aceite continua gravando a origem", () => {
  it("aceitar_handoff grava o repasse aceito deste negócio", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Aceite grava", sdr, closer);
    expect(await origem(negocioId)).toBe(handoffId);
  });
});

describe("API não insere, troca nem anula a origem", () => {
  it("responsável não troca para repasse de outro negócio da mesma empresa, de outra empresa ou UUID qualquer", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Troca recusada", sdr, closer);
    for (const alvo of [outroDaMesmaEmpresa.handoffId, daOutraEmpresa.handoffId, crypto.randomUUID()]) {
      const r = await closer.cliente.from("negocios").update({ handoff_origem_id: alvo }).eq("id", negocioId).select("id");
      expect(r.error, alvo).not.toBeNull();
    }
    expect(await origem(negocioId)).toBe(handoffId);
  });

  it("responsável e admin não anulam a origem (tiraria o bônus do SDR)", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Anulação recusada", sdr, closer);
    for (const u of [closer, admin]) {
      expect((await u.cliente.from("negocios").update({ handoff_origem_id: null }).eq("id", negocioId).select("id")).error).not.toBeNull();
    }
    expect(await origem(negocioId)).toBe(handoffId);
  });

  it("negócio sem repasse não ganha origem pela API, nem com o repasse de outro negócio", async () => {
    const negocioId = await criarNegocio(A, "Sem repasse", closer);
    const r = await closer.cliente.from("negocios").update({ handoff_origem_id: outroDaMesmaEmpresa.handoffId }).eq("id", negocioId).select("id");
    expect(r.error).not.toBeNull();
    expect(await origem(negocioId)).toBeNull();
  });

  it("INSERT de negócio com origem informada é recusado", async () => {
    const r = await sdr.cliente
      .from("negocios")
      .insert({ empresa_id: A.id, titulo: "Insert com origem", contato_id: A.contato, funil_id: A.funil, etapa_id: A.etapa, responsavel_id: m(A, sdr), handoff_origem_id: outroDaMesmaEmpresa.handoffId })
      .select("id");
    expect(r.error).not.toBeNull();
  });

  it("edição normal do negócio segue funcionando e não mexe na origem", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Edição normal", sdr, closer);
    const r = await closer.cliente.from("negocios").update({ titulo: "Edição normal (renomeado)", valor: 12345 }).eq("id", negocioId).select("titulo, valor");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ titulo: "Edição normal (renomeado)", valor: 12345 }]);
    // Reenviar o mesmo valor (como um formulário que manda a linha inteira) também não é troca.
    expect((await closer.cliente.from("negocios").update({ handoff_origem_id: handoffId }).eq("id", negocioId)).error).toBeNull();
    expect(await origem(negocioId)).toBe(handoffId);
  });
});

describe("papel privilegiado (reparo) também respeita negócio, empresa e aceite", () => {
  it("service_role não aponta para repasse de outro negócio nem de outra empresa", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Reparo inconsistente", sdr, closer);
    for (const alvo of [outroDaMesmaEmpresa.handoffId, daOutraEmpresa.handoffId]) {
      expect((await servico.from("negocios").update({ handoff_origem_id: alvo }).eq("id", negocioId)).error, alvo).not.toBeNull();
    }
    expect(await origem(negocioId)).toBe(handoffId);
  });

  it("service_role anula e regrava o repasse aceito do próprio negócio", async () => {
    const { negocioId, handoffId } = await negocioRepassado(A, "Reparo válido", sdr, closer);
    expect((await servico.from("negocios").update({ handoff_origem_id: null }).eq("id", negocioId)).error).toBeNull();
    expect((await servico.from("negocios").update({ handoff_origem_id: handoffId }).eq("id", negocioId)).error).toBeNull();
    expect(await origem(negocioId)).toBe(handoffId);
  });
});

describe("bônus do SDR vai para o SDR de origem", () => {
  it("contrato assinado e negócio ganho creditam só o SDR de origem, mesmo após tentativas de troca", async () => {
    const { negocioId } = await negocioRepassado(A, "Bônus causal", sdr, closer);
    await closer.cliente.from("negocios").update({ handoff_origem_id: outroDaMesmaEmpresa.handoffId }).eq("id", negocioId);
    await closer.cliente.from("negocios").update({ handoff_origem_id: daOutraEmpresa.handoffId }).eq("id", negocioId);

    const { data: contrato, error } = await closer.cliente
      .from("contratos")
      .insert({ empresa_id: A.id, negocio_id: negocioId, conteudo: "Contrato de teste" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await closer.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id)).error).toBeNull();
    expect((await closer.cliente.from("negocios").update({ status: "ganho", valor: 15000 }).eq("id", negocioId)).error).toBeNull();

    const bonus = await bonusSdr(negocioId);
    expect(bonus.map((b) => b.tipo).sort()).toEqual(["handoff.contrato_assinado", "handoff.won"]);
    for (const b of bonus) expect(b.beneficiario_id).toBe(sdr.id);
  });
});
