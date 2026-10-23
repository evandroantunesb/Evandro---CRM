/**
 * Financeiro forjado (M2 P0, revisão da calculadora GD II): `calculos_solares` só é gravado pelo caminho do servidor
 * (motor compartilhado + referência tarifária lida no servidor), depois da autorização real do usuário no negócio.
 * Contra o banco local descartável, com os clientes AUTENTICADOS (RLS e privilégios reais):
 *  - vendedor autenticado não consegue INSERT, UPDATE nem UPSERT direto (nem para forjar valores, método, percentual,
 *    fonte, autoria ou o estado `completo`, nem para criar linha "legado" com economia);
 *  - a RPC de autorização não grava nada e recusa outra empresa e o papel `operacao`;
 *  - o caminho legítimo continua gravando, com a autoria do usuário da sessão (nunca a informada);
 *  - mesmo o caminho privilegiado não grava `completo` com referência tarifária divergente da tabela oficial;
 *  - sem a chave do servidor, nada é gravado (nem o kit) e a recusa é clara;
 *  - apagar deixa a linha inteira no histórico com a autoria (migration 20261023230000), e só quem pode apaga;
 *  - trigger e motor concordam no percentual legal e no piso do art. 291 para todo ano e ligação suportados;
 *  - privilégios efetivos: `anon`/`authenticated` só com SELECT e DELETE (sem INSERT, UPDATE, TRUNCATE, REFERENCES nem
 *    TRIGGER), PUBLIC sem nada e `service_role` mantém a gravação do servidor.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAGEM_GRAVACAO_INDISPONIVEL } from "@/lib/calculo-gravacao";
import { atualizarPrecoCalculoComCliente, salvarKitComCliente, type Atual } from "@/lib/negocios-gravacao";
import { DISPONIBILIDADE_ART_291, PERCENTUAL_LEGAL_FIO_B_GD2 } from "@/lib/tarifa-gd";
import { TIPOS_LIGACAO } from "@/lib/tipos";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { novoClienteBanco } from "./banco-local";

let vendedor: Usuario, colega: Usuario, operacao: Usuario, fora: Usuario, admin: Usuario;
let empresa: string, outraEmpresa: string, funil: string, etapa: string;
let atualVendedor: Atual, atualColega: Atual, atualOperacao: Atual, atualFora: Atual, membroAdmin: string;
const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;
const KIT = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 5 }]);

function fd(campos: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  return f;
}

beforeAll(async () => {
  [vendedor, colega, operacao, fora, admin] = await Promise.all(
    ["forja-vendedor", "forja-colega", "forja-operacao", "forja-fora", "forja-admin"].map(criarUsuario),
  );
  const [{ data: e1 }, { data: e2 }] = await Promise.all([
    servico.from("empresas").insert({ nome: `Forja ${sufixo}` }).select("id").single(),
    servico.from("empresas").insert({ nome: `Forja outra ${sufixo}` }).select("id").single(),
  ]);
  empresa = e1!.id;
  outraEmpresa = e2!.id;
  const membro = async (empresaId: string, u: Usuario, papel: "admin" | "vendedor" | "operacao") =>
    (await servico.from("empresa_membros").insert({ empresa_id: empresaId, user_id: u.id, papel }).select("id").single()).data!.id;
  const [m1, m2, m3, m4, m5] = await Promise.all([
    membro(empresa, vendedor, "vendedor"),
    membro(empresa, colega, "vendedor"),
    membro(empresa, operacao, "operacao"),
    membro(outraEmpresa, fora, "admin"),
    membro(empresa, admin, "admin"),
  ]);
  membroAdmin = m5;
  atualVendedor = { empresaId: empresa, membroId: m1, papel: "vendedor" };
  atualColega = { empresaId: empresa, membroId: m2, papel: "vendedor" };
  atualOperacao = { empresaId: empresa, membroId: m3, papel: "operacao" } as unknown as Atual;
  atualFora = { empresaId: outraEmpresa, membroId: m4, papel: "admin" };
  await servico.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 100 }).eq("empresa_id", empresa);
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
});

// Data fixa (22/10/2026: vigência da REH 3.592, 60%); nada depende da data real da execução.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T12:00:00-03:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function novoNegocio() {
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente ${Math.random()}`, telefone: "44 90000-0000" }).select("id").single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: empresa,
      titulo: "Forja",
      contato_id: c!.id,
      funil_id: funil,
      etapa_id: etapa,
      valor: 20000,
      responsavel_id: atualVendedor.membroId,
      qualif_tipo_cliente: "residencial",
      qualif_distribuidora: "Copel",
    })
    .select("id")
    .single();
  if (error) throw error;
  return n!.id;
}

const salvarComo = (u: Usuario, atual: Atual, negocioId: string, extra: Record<string, string> = {}) =>
  salvarKitComCliente(
    cliente(u),
    atual,
    fd({ negocioId, tipoLigacao: "bifasico", consumoMedioKwh: "500", tarifaKwh: "0,76802", tarifaBaseTributaria: "sem_tributos", componentes: KIT, ...extra }),
  );
const linha = async (negocioId: string) => (await servico.from("calculos_solares").select("*").eq("negocio_id", negocioId).maybeSingle()).data;

/** Linha "completa" plausível (copiada de uma legítima) com a economia e a fonte adulteradas. */
async function payloadForjado(negocioId: string): Promise<TablesInsert<"calculos_solares">> {
  const modelo = await novoNegocio();
  await salvarComo(vendedor, atualVendedor, modelo);
  const resto = Object.fromEntries(Object.entries((await linha(modelo))!).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)));
  return { ...(resto as TablesInsert<"calculos_solares">), negocio_id: negocioId, economia_mensal: 9999.99, conta_com_solar: 0.01, percentual_legal_fio_b: 0.1 };
}

describe("vendedor autenticado não grava financeiro direto (PostgREST)", () => {
  it("INSERT de linha `completo` forjada: recusado, nada gravado", async () => {
    const negocioId = await novoNegocio();
    await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: negocioId, tipo: "modulo", descricao: "Módulo 600 W", potencia_w: 600, quantidade: 5, ordem: 0 });
    const { error } = await vendedor.cliente.from("calculos_solares").insert(await payloadForjado(negocioId));
    expect(error?.code).toBe("42501");
    expect(await linha(negocioId)).toBeNull();
  });

  it("INSERT de linha `legado` com economia (fórmula antiga forjada): recusado", async () => {
    const negocioId = await novoNegocio();
    await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: negocioId, tipo: "modulo", descricao: "Módulo 600 W", potencia_w: 600, quantidade: 5, ordem: 0 });
    const { error } = await vendedor.cliente.from("calculos_solares").insert({
      empresa_id: empresa,
      negocio_id: negocioId,
      kit_nome: "Forjado",
      kit_potencia_kwp: 3,
      kit_preco: 20000,
      tipo_ligacao: "bifasico",
      consumo_medio_kwh: 500,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 100,
      percentual_fio_b: 0.45,
      disponibilidade_kwh: 50,
      geracao_estimada_kwh_mes: 300,
      kwh_faturado: 200,
      kwh_compensado: 300,
      custo_fio_b: 1,
      conta_sem_solar: 450,
      conta_com_solar: 1,
      economia_mensal: 449,
      payback_meses: 1,
    });
    expect(error?.code).toBe("42501");
    expect(await linha(negocioId)).toBeNull();
  });

  it("UPDATE de valores, método, percentual, fonte, estado e autoria numa linha legítima: recusado, linha intacta", async () => {
    const negocioId = await novoNegocio();
    expect(await salvarComo(vendedor, atualVendedor, negocioId)).toMatchObject({ ok: true, mensagem: "Kit e cálculo salvos." });
    const antes = await linha(negocioId);
    const ataques: TablesUpdate<"calculos_solares">[] = [
      { economia_mensal: 9999.99 },
      { conta_sem_solar: 5000, conta_com_solar: 0.01 },
      { metodo_calculo: "metodo_inventado" },
      { percentual_legal_fio_b: 0.1 },
      { fio_b_rs_mwh: 1, tarifa_origem: "oficial_aneel" },
      { tarifa_gd_id: null },
      { payback_meses: 3 },
      { criado_por: atualColega.membroId, atualizado_por: atualColega.membroId },
      { financeiro_desatualizado_em: null, financeiro_desatualizado_motivo: null, kit_preco: 1 },
    ];
    for (const patch of ataques) {
      const { data, error } = await vendedor.cliente.from("calculos_solares").update(patch).eq("negocio_id", negocioId).select("id");
      // Sem privilégio de UPDATE: erro 42501 (nunca "0 linhas" silencioso que pareça sucesso).
      expect({ patch, codigo: error?.code, data }).toEqual({ patch, codigo: "42501", data: null });
    }
    expect(await linha(negocioId)).toEqual(antes);
  });

  it("UPDATE de linha `incompleto` para `completo` com números: recusado", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId, { tarifaBaseTributaria: "com_tributos" });
    const antes = await linha(negocioId);
    expect(antes).toMatchObject({ estado_financeiro: "incompleto" });
    const { error } = await vendedor.cliente
      .from("calculos_solares")
      .update({ estado_financeiro: "completo", economia_mensal: 191.79, metodo_calculo: "gd2_piso_655i_v1", pendencias: null })
      .eq("negocio_id", negocioId);
    expect(error?.code).toBe("42501");
    expect(await linha(negocioId)).toEqual(antes);
  });

  it("UPSERT por cima da linha legítima: recusado, linha intacta", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    const antes = await linha(negocioId);
    const { error } = await vendedor.cliente.from("calculos_solares").upsert(await payloadForjado(negocioId), { onConflict: "negocio_id" });
    expect(error?.code).toBe("42501");
    expect(await linha(negocioId)).toEqual(antes);
  });

  it("o trigger de histórico não é RPC exposta", async () => {
    const { error } = await vendedor.cliente.rpc("calculos_solares_arquivar_historico" as never);
    expect(error).not.toBeNull();
  });
});

describe("privilégios efetivos em calculos_solares (inclui herança; PUBLIC à parte)", () => {
  const PRIVILEGIOS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

  it("anon e authenticated só leem e apagam; service_role grava; PUBLIC não tem nada", async () => {
    const banco = novoClienteBanco();
    await banco.connect();
    try {
      const efetivos: Record<string, Record<string, boolean>> = {};
      for (const papel of ["anon", "authenticated", "service_role"]) {
        efetivos[papel] = {};
        for (const p of PRIVILEGIOS) {
          const { rows } = await banco.query("select has_table_privilege($1, 'public.calculos_solares', $2) as tem", [papel, p]);
          efetivos[papel][p] = rows[0].tem;
        }
      }
      const soLerEApagar = { SELECT: true, INSERT: false, UPDATE: false, DELETE: true, TRUNCATE: false, REFERENCES: false, TRIGGER: false };
      expect(efetivos.anon).toEqual(soLerEApagar);
      expect(efetivos.authenticated).toEqual(soLerEApagar);
      expect(efetivos.service_role).toMatchObject({ SELECT: true, INSERT: true, UPDATE: true, DELETE: true });

      const { rows: publico } = await banco.query(
        "select count(*)::int as n from (select (aclexplode(relacl)).grantee from pg_class where oid = 'public.calculos_solares'::regclass) a where a.grantee = 0",
      );
      expect(publico[0].n).toBe(0);
    } finally {
      await banco.end();
    }
  });
});

describe("autorização real (empresa, negócio, papel) e autoria da sessão", () => {
  it("RPC de autorização: vendedor responsável recebe a própria autoria; ela não grava nada", async () => {
    const negocioId = await novoNegocio();
    const { data, error } = await vendedor.cliente.rpc("autorizar_gravacao_calculo", { p_negocio_id: negocioId });
    expect(error).toBeNull();
    expect(data).toEqual([{ empresa_id: empresa, membro_id: atualVendedor.membroId }]);
    expect(await linha(negocioId)).toBeNull();
  });

  it("outra empresa: RPC recusa, salvar pelo servidor recusa e nada é gravado", async () => {
    const negocioId = await novoNegocio();
    const rpc = await fora.cliente.rpc("autorizar_gravacao_calculo", { p_negocio_id: negocioId });
    expect(rpc.error?.code).toBe("42501");
    const r = await salvarComo(fora, atualFora, negocioId);
    expect(r.ok).toBe(false);
    expect(await linha(negocioId)).toBeNull();
    const { data: kit } = await servico.from("kit_componentes").select("id").eq("negocio_id", negocioId);
    expect(kit).toEqual([]);
  });

  it("papel `operacao` (acesso operacional, sem acesso comercial): RPC recusa e salvar não grava cálculo", async () => {
    const negocioId = await novoNegocio();
    expect((await operacao.cliente.rpc("autorizar_gravacao_calculo", { p_negocio_id: negocioId })).error?.code).toBe("42501");
    const r = await salvarComo(operacao, atualOperacao, negocioId);
    expect(r.ok).toBe(false);
    expect(await linha(negocioId)).toBeNull();
  });

  it("colega da mesma empresa que não vê o negócio: RPC recusa e salvar não grava", async () => {
    const negocioId = await novoNegocio();
    expect((await colega.cliente.rpc("autorizar_gravacao_calculo", { p_negocio_id: negocioId })).error?.code).toBe("42501");
    expect((await salvarComo(colega, atualColega, negocioId)).ok).toBe(false);
    expect(await linha(negocioId)).toBeNull();
  });

  it("salvar legítimo grava `completo` com a autoria da SESSÃO, mesmo com membroId adulterado no `atual`", async () => {
    const negocioId = await novoNegocio();
    const adulterado: Atual = { ...atualVendedor, membroId: atualColega.membroId };
    expect(await salvarComo(vendedor, adulterado, negocioId)).toMatchObject({ ok: true, mensagem: "Kit e cálculo salvos." });
    expect(await linha(negocioId)).toMatchObject({
      estado_financeiro: "completo",
      economia_mensal: 191.79,
      empresa_id: empresa,
      criado_por: atualVendedor.membroId,
      atualizado_por: atualVendedor.membroId,
    });
    // Preço também passa pelo servidor (e com a autoria da sessão).
    await servico.from("negocios").update({ valor: 22000 }).eq("id", negocioId);
    expect(await atualizarPrecoCalculoComCliente(cliente(vendedor), adulterado, negocioId)).toMatchObject({ ok: true });
    expect(await linha(negocioId)).toMatchObject({ kit_preco: 22000, atualizado_por: atualVendedor.membroId, economia_mensal: 191.79 });
  });
});

describe("defesa no banco: `completo` só com a referência tarifária oficial (inclusive pelo caminho privilegiado)", () => {
  it("fonte, percentual, vigência ou método divergentes da tabela oficial: recusado mesmo com a service role", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    const antes = await linha(negocioId);
    const ataques: TablesUpdate<"calculos_solares">[] = [
      { fio_b_rs_mwh: 1 },
      { percentual_legal_fio_b: 0.75 },
      { fio_b_vigencia_fim: "2030-01-01" },
      { distribuidora: "OUTRA" },
      { metodo_calculo: "metodo_inventado" },
      { enquadramento: "B3/comercial/convencional/GD_II" },
    ];
    for (const patch of ataques) {
      const { error } = await servico.from("calculos_solares").update(patch).eq("negocio_id", negocioId);
      expect({ patch, codigo: error?.code }).toEqual({ patch, codigo: "23514" });
    }
    expect(await linha(negocioId)).toEqual(antes);
  });
});

describe("sem a chave do servidor (SUPABASE_SERVICE_ROLE_KEY ausente)", () => {
  it("salvar e atualizar preço recusam ANTES de mexer em kit, negócio ou cálculo, com mensagem clara", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    await servico.from("negocios").update({ valor: 22000 }).eq("id", negocioId);
    const antes = {
      calculo: await linha(negocioId),
      kit: (await servico.from("kit_componentes").select("*").eq("negocio_id", negocioId).order("ordem")).data,
      negocio: (await servico.from("negocios").select("*").eq("id", negocioId).single()).data,
    };
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 4 }]);
      expect(await salvarComo(vendedor, atualVendedor, negocioId, { componentes: outroKit, consumoMedioKwh: "450" })).toEqual({
        ok: false,
        mensagem: `${MENSAGEM_GRAVACAO_INDISPONIVEL} Nada foi alterado.`,
      });
      expect(await atualizarPrecoCalculoComCliente(cliente(vendedor), atualVendedor, negocioId)).toEqual({
        ok: false,
        mensagem: `${MENSAGEM_GRAVACAO_INDISPONIVEL} Nada foi alterado.`,
      });
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = chave;
    }
    expect({
      calculo: await linha(negocioId),
      kit: (await servico.from("kit_componentes").select("*").eq("negocio_id", negocioId).order("ordem")).data,
      negocio: (await servico.from("negocios").select("*").eq("id", negocioId).single()).data,
    }).toEqual(antes);
  });
});

describe("exclusão: só quem pode, sempre com a linha inteira e a autoria no histórico (mesma transação)", () => {
  const historico = async (negocioId: string) =>
    (await servico.from("calculos_solares_historico").select("motivo, linha, arquivado_por, arquivado_por_papel").eq("negocio_id", negocioId)).data ?? [];
  const apagarComo = async (u: Usuario, negocioId: string) =>
    u.cliente.from("calculos_solares").delete().eq("negocio_id", negocioId).select("id");

  it("quem criou apaga direto pelo PostgREST: a linha vai inteira ao histórico (motivo `apagado`, autor = sessão)", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    const antes = (await linha(negocioId))!;
    const { data, error } = await apagarComo(vendedor, negocioId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: antes.id }]);
    expect(await linha(negocioId)).toBeNull();
    const h = await historico(negocioId);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ motivo: "apagado", arquivado_por: atualVendedor.membroId, arquivado_por_papel: "authenticated" });
    expect(h[0]!.linha).toMatchObject({
      id: antes.id,
      estado_financeiro: "completo",
      economia_mensal: 191.79,
      criado_por: atualVendedor.membroId,
      tarifa_gd_id: antes.tarifa_gd_id,
    });
  });

  it("admin da empresa apaga (autor = admin); outra empresa, `operacao` e colega sem acesso não apagam nada", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    const antes = await linha(negocioId);
    for (const u of [fora, operacao, colega]) {
      const { data, error } = await apagarComo(u, negocioId);
      expect({ error, data }).toEqual({ error: null, data: [] }); // RLS: a linha nem é visível para apagar
    }
    expect(await linha(negocioId)).toEqual(antes);
    expect(await historico(negocioId)).toEqual([]);

    const { data } = await apagarComo(admin, negocioId);
    expect(data).toHaveLength(1);
    expect(await historico(negocioId)).toEqual([
      expect.objectContaining({ motivo: "apagado", arquivado_por: membroAdmin, arquivado_por_papel: "authenticated" }),
    ]);
  });

  it("anônimo não apaga; o serviço apaga, mas também deixa a linha no histórico (papel `service_role`)", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    const { createClient } = await import("@supabase/supabase-js");
    const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anonimo.from("calculos_solares").delete().eq("negocio_id", negocioId).select("id")).data ?? []).toEqual([]);
    expect(await linha(negocioId)).not.toBeNull();
    await servico.from("calculos_solares").delete().eq("negocio_id", negocioId);
    expect(await historico(negocioId)).toEqual([
      expect.objectContaining({ motivo: "apagado", arquivado_por: null, arquivado_por_papel: "service_role" }),
    ]);
  });

  it("substituição pelo servidor registra a autoria da autorização; excluir o negócio continua possível (cascata)", async () => {
    const negocioId = await novoNegocio();
    await salvarComo(vendedor, atualVendedor, negocioId);
    await salvarComo(vendedor, atualVendedor, negocioId, { tarifaBaseTributaria: "com_tributos" });
    expect(await historico(negocioId)).toEqual([
      expect.objectContaining({ motivo: "desatualizado_por_entradas", arquivado_por: atualVendedor.membroId, arquivado_por_papel: "service_role" }),
    ]);
    const { error } = await servico.from("negocios").delete().eq("id", negocioId);
    expect(error).toBeNull();
    expect(await linha(negocioId)).toBeNull();
    expect(await historico(negocioId)).toEqual([]);
  });
});

describe("concordância trigger × motor (percentual legal e piso do art. 291)", () => {
  it("para todo ano do motor e toda ligação, a linha completa do motor passa no trigger com os mesmos valores", async () => {
    const { data: copel } = await servico.from("tarifas_gd_aneel").select("vigencia_inicio, vigencia_fim").eq("distribuidora", "COPEL-DIS").single();
    const anos = Object.keys(PERCENTUAL_LEGAL_FIO_B_GD2).map(Number);
    expect(anos.length).toBeGreaterThan(0);
    for (const ano of anos) {
      // Um dia do ano dentro da vigência da linha oficial (sem ele não há resultado completo a conferir).
      const inicio = [copel!.vigencia_inicio, `${ano}-01-01`].sort()[1]!;
      const fim = [copel!.vigencia_fim, `${ano}-12-31`].sort()[0]!;
      expect(inicio <= fim, `ano ${ano} sem dia na vigência da tarifa oficial: inclua uma linha vigente no teste`).toBe(true);
      for (const tipo of TIPOS_LIGACAO) {
        vi.setSystemTime(new Date(`${inicio}T12:00:00-03:00`));
        const negocioId = await novoNegocio();
        const r = await salvarComo(vendedor, atualVendedor, negocioId, { tipoLigacao: tipo });
        expect({ ano, tipo, r }).toMatchObject({ ano, tipo, r: { ok: true, mensagem: "Kit e cálculo salvos." } });
        expect(await linha(negocioId)).toMatchObject({
          estado_financeiro: "completo",
          data_referencia: inicio,
          tipo_ligacao: tipo,
          percentual_legal_fio_b: PERCENTUAL_LEGAL_FIO_B_GD2[ano],
          disponibilidade_kwh: DISPONIBILIDADE_ART_291[tipo],
        });
        // E o trigger recusa qualquer outro valor de percentual ou de piso para essa linha.
        const outrosPercentuais = Object.values(PERCENTUAL_LEGAL_FIO_B_GD2).filter((v) => v !== PERCENTUAL_LEGAL_FIO_B_GD2[ano]);
        for (const percentual_legal_fio_b of [...outrosPercentuais, 0.9]) {
          expect((await servico.from("calculos_solares").update({ percentual_legal_fio_b }).eq("negocio_id", negocioId)).error?.code).toBe("23514");
        }
        for (const outro of TIPOS_LIGACAO.filter((t) => t !== tipo)) {
          const patch = { disponibilidade_kwh: DISPONIBILIDADE_ART_291[outro] };
          expect((await servico.from("calculos_solares").update(patch).eq("negocio_id", negocioId)).error?.code).toBe("23514");
        }
      }
    }
  });
});
