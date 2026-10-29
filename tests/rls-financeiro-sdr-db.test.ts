/**
 * Leitura de dados financeiros fora do alcance do SDR (20261014140000_rls_financeiro_sdr.sql).
 * `registros_pagamento` e as atividades `pagamento_*` (com todo o `dados`) só para admin, gestor e
 * vendedor que vejam o negócio. O SDR continua vendo o negócio e o resto da linha do tempo.
 * Só autorização de leitura: os fluxos de escrita são cobertos pelas suítes de pagamento.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string };

let admin: Usuario, gestor: Usuario, vendedor: Usuario, sdr: Usuario;
let proAdmin: Usuario, proGestor: Usuario, proVendedor: Usuario, proSdr: Usuario;
let solo: Empresa, pro: Empresa;
const membro: Record<string, string> = {};

// Textos financeiros que o SDR não pode receber por nenhum caminho.
const OBS = "Observação sigilosa do Pix";
const MOTIVO_SOLO = "Motivo sigiloso da correção";
const MOTIVO_ESTORNO_SOLO = "Motivo sigiloso do estorno";
const MOTIVO_PRO = "Motivo sigiloso do estorno Pro";

let negocioSdr: string; // Solo, com registro corrigido e estornado; responsável final: SDR
let negocioVendedor: string; // Solo, com registro ativo; responsável final: vendedor
let negocioProSdr: string; // Pro, confirmado/estornado/confirmado; responsável final: SDR

async function criarEmpresa(nome: string, produto: "solo" | null): Promise<Empresa> {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  if (produto) await servico.from("planos_empresa").insert({ empresa_id: emp!.id, produto });
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp!.id, nome: `Cliente ${nome}` }).select("id").single();
  return { id: emp!.id, funil: f!.id, etapa: et!.id, contato: c!.id };
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

async function equipe(e: Empresa, gestorU: Usuario, membros: Usuario[]) {
  const { data: eq } = await servico.from("equipes").insert({ empresa_id: e.id, nome: `Equipe ${sufixo}` }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: e.id, equipe_id: eq!.id, membro_id: m(e, gestorU), e_gestor: true },
    ...membros.map((u) => ({ empresa_id: e.id, equipe_id: eq!.id, membro_id: m(e, u), e_gestor: false })),
  ]);
}

async function criarNegocio(e: Empresa, titulo: string, responsavel: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: e.id, titulo, contato_id: e.contato, funil_id: e.funil, etapa_id: e.etapa, responsavel_id: m(e, responsavel), valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

const passarPara = async (e: Empresa, negocioId: string, u: Usuario) => {
  const { error } = await servico.from("negocios").update({ responsavel_id: m(e, u) }).eq("id", negocioId);
  if (error) throw error;
};

const sem = <T>(r: { data: T | null; error: unknown }) => {
  expect(r.error).toBeNull();
  return r.data!;
};

async function registrosVistos(u: Usuario, negocioId: string) {
  return sem(await u.cliente.from("registros_pagamento").select("*").eq("negocio_id", negocioId));
}

async function atividadesVistas(u: Usuario, negocioId: string) {
  return sem(await u.cliente.from("atividades").select("tipo, dados").eq("negocio_id", negocioId));
}

const financeiras = (as: { tipo: string }[]) => as.filter((a) => a.tipo.startsWith("pagamento_"));

beforeAll(async () => {
  [admin, gestor, vendedor, sdr, proAdmin, proGestor, proVendedor, proSdr] = await Promise.all(
    ["fin-admin", "fin-gestor", "fin-vend", "fin-sdr", "finpro-admin", "finpro-gestor", "finpro-vend", "finpro-sdr"].map(criarUsuario),
  );

  // Solo: o admin único registra, corrige e estorna; depois a empresa ganha equipe com SDR.
  solo = await criarEmpresa("Financeiro Solo", "solo");
  await vincular(solo, [{ u: admin, papel: "admin" }]);
  negocioSdr = await criarNegocio(solo, "Venda que vai para o SDR", admin);
  negocioVendedor = await criarNegocio(solo, "Venda que vai para o vendedor", admin);
  sem(await admin.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioSdr, p_data_recebimento: "2026-10-01", p_observacao: OBS }));
  sem(
    await admin.cliente.rpc("corrigir_registro_pagamento", {
      p_negocio_id: negocioSdr, p_data_recebimento: "2026-10-02", p_observacao: OBS, p_motivo: MOTIVO_SOLO,
    }),
  );
  sem(await admin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioSdr, p_motivo: MOTIVO_ESTORNO_SOLO }));
  sem(await admin.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioVendedor, p_observacao: OBS }));

  await vincular(solo, [{ u: gestor, papel: "gestor" }, { u: vendedor, papel: "vendedor" }, { u: sdr, papel: "sdr" }]);
  await equipe(solo, gestor, [vendedor, sdr]);
  await passarPara(solo, negocioSdr, sdr);
  await passarPara(solo, negocioVendedor, vendedor);

  // Pro: vendedor assina, gestor confirma, estorna com motivo e confirma de novo; depois o SDR vira responsável.
  pro = await criarEmpresa("Financeiro Pro", null);
  await vincular(pro, [
    { u: proAdmin, papel: "admin" }, { u: proGestor, papel: "gestor" }, { u: proVendedor, papel: "vendedor" }, { u: proSdr, papel: "sdr" },
  ]);
  await equipe(pro, proGestor, [proVendedor, proSdr]);
  negocioProSdr = await criarNegocio(pro, "Venda Pro que vai para o SDR", proVendedor);
  const { data: contrato } = await proVendedor.cliente
    .from("contratos")
    .insert({ empresa_id: pro.id, negocio_id: negocioProSdr, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  sem(await proVendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id).select("id"));
  sem(await proGestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }));
  sem(await proGestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contrato!.id, p_motivo: MOTIVO_PRO }));
  sem(await proGestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }));
  await passarPara(pro, negocioProSdr, proSdr);
});

describe("SDR não lê dados financeiros", () => {
  it("vê o negócio (a restrição é de papel, não de visibilidade)", async () => {
    expect(sem(await sdr.cliente.from("negocios").select("id").eq("id", negocioSdr))).toHaveLength(1);
    expect(sem(await proSdr.cliente.from("negocios").select("id").eq("id", negocioProSdr))).toHaveLength(1);
  });

  it("registros_pagamento: nenhuma linha, nem observação nem motivo, por filtro ou por varredura", async () => {
    expect(await registrosVistos(sdr, negocioSdr)).toEqual([]);
    expect(sem(await sdr.cliente.from("registros_pagamento").select("observacao, motivo_estorno"))).toEqual([]);
    expect(sem(await sdr.cliente.from("registros_pagamento").select("id").ilike("motivo_estorno", "%sigiloso%"))).toEqual([]);
    // Conferência: as linhas existem (original estornado pela correção + corrigido estornado depois).
    expect(sem(await servico.from("registros_pagamento").select("id").eq("negocio_id", negocioSdr))).toHaveLength(2);
  });

  it("atividades: nenhuma de pagamento (Solo e Pro), nem o JSON `dados`", async () => {
    for (const [u, negocioId] of [[sdr, negocioSdr], [proSdr, negocioProSdr]] as const) {
      const vistas = await atividadesVistas(u, negocioId);
      expect(financeiras(vistas)).toEqual([]);
      const texto = JSON.stringify(vistas);
      for (const sigilo of [OBS, MOTIVO_SOLO, MOTIVO_ESTORNO_SOLO, MOTIVO_PRO, "data_recebimento", "registro_id", "confirmacao_id"]) {
        expect(texto).not.toContain(sigilo);
      }
      expect(sem(await u.cliente.from("atividades").select("id").like("tipo", "pagamento%"))).toEqual([]);
      expect(sem(await u.cliente.from("atividades").select("id").filter("dados->>motivo", "ilike", "%sigiloso%"))).toEqual([]);
    }
  });

  it("linha do tempo continua com os demais eventos", async () => {
    expect((await atividadesVistas(sdr, negocioSdr)).map((a) => a.tipo)).toContain("negocio_criado");
    expect((await atividadesVistas(proSdr, negocioProSdr)).map((a) => a.tipo)).toContain("negocio_criado");
  });
});

describe("papéis autorizados mantêm a leitura", () => {
  it("admin lê registros e atividades de pagamento", async () => {
    expect(await registrosVistos(admin, negocioSdr)).toHaveLength(2);
    const tipos = financeiras(await atividadesVistas(admin, negocioSdr)).map((a) => a.tipo).sort();
    expect(tipos).toEqual(["pagamento_registrado", "pagamento_registrado", "pagamento_registro_corrigido", "pagamento_registro_estornado"]);
    expect(financeiras(await atividadesVistas(proAdmin, negocioProSdr)).map((a) => a.tipo).sort()).toEqual([
      "pagamento_confirmado", "pagamento_confirmado", "pagamento_estornado",
    ]);
  });

  it("gestor da equipe lê os do negócio do SDR da equipe, com motivo", async () => {
    const regs = await registrosVistos(gestor, negocioSdr);
    expect(regs.map((r) => r.motivo_estorno)).toContain(MOTIVO_SOLO);
    const pro_ = financeiras(await atividadesVistas(proGestor, negocioProSdr));
    expect(JSON.stringify(pro_)).toContain(MOTIVO_PRO);
  });

  it("vendedor lê os do próprio negócio, com observação", async () => {
    const regs = await registrosVistos(vendedor, negocioVendedor);
    expect(regs).toHaveLength(1);
    expect(regs[0].observacao).toBe(OBS);
    expect(financeiras(await atividadesVistas(vendedor, negocioVendedor)).map((a) => a.tipo)).toEqual(["pagamento_registrado"]);
  });

  it("vendedor continua sem ver negócio de outro responsável (visibilidade não mudou)", async () => {
    expect(await registrosVistos(vendedor, negocioSdr)).toEqual([]);
    expect(await atividadesVistas(vendedor, negocioSdr)).toEqual([]);
  });
});

describe("isolamento entre empresas", () => {
  it("admin e gestor de outra empresa não leem registros nem atividades", async () => {
    for (const u of [proAdmin, proGestor]) {
      expect(await registrosVistos(u, negocioSdr)).toEqual([]);
      expect(await atividadesVistas(u, negocioSdr)).toEqual([]);
    }
    expect(await atividadesVistas(admin, negocioProSdr)).toEqual([]);
  });
});

describe("tem_acesso_financeiro", () => {
  it("admin, gestor e vendedor sim; SDR não; outra empresa não", async () => {
    const r = async (u: Usuario, e: Empresa) => sem(await u.cliente.rpc("tem_acesso_financeiro", { p_empresa_id: e.id }));
    expect(await r(admin, solo)).toBe(true);
    expect(await r(gestor, solo)).toBe(true);
    expect(await r(vendedor, solo)).toBe(true);
    expect(await r(sdr, solo)).toBe(false);
    expect(await r(proAdmin, solo)).toBe(false);
  });
});
