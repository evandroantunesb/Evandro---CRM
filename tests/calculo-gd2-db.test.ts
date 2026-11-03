/**
 * Estimativa GD II pela regra aceita, contra o banco local descartável (migration 20261023210000), pelo MESMO núcleo
 * das ações (`salvarKitComCliente`, `atualizarPrecoCalculoComCliente`, `carregarVigencia`) e com o cliente autenticado
 * do vendedor (RLS real). Cobre: completo → reabrir (vigente) → entradas mudam com resultado incompleto (histórico
 * desatualizado, novas entradas gravadas) → recálculo; R6.2/R6.3 sem linha nova; virada 2026/2027 e fim da vigência;
 * mistura de bases; preço; CHECKs do estado `completo`; histórico imutável; isolamento entre empresas.
 * Datas: o motor usa a data de hoje em São Paulo; cada cenário fixa só o `Date` (vi.setSystemTime): 22/10/2026 por
 * padrão (vigência da REH 3.592, 60%), e os de 2027 trocam a data. Nada depende da data real da execução.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { atualizarPrecoCalculoComCliente, editarNegocioComCliente, salvarKitComCliente, type Atual } from "@/lib/negocios-gravacao";
import { carregarVigencia, avaliarVigencia, mensagemDeRecusa, motivosDaAcao } from "@/lib/calculo-vigencia";
import { carregarContextoEstimativa } from "@/lib/contexto-estimativa";
import { recalcularDaLinha } from "@/lib/calculo-reproduzivel";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario, fora: Usuario;
let empresa: string, outraEmpresa: string, funil: string, etapa: string;
let atualVendedor: Atual, atualFora: Atual;
const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;

// 5 × 600 W = 3 kWp; produtividade 100 => G = 300 kWh/mês (caso 3 do contrato com C = 500).
const KIT_3 = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 5 }]);
const KIT_4 = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 4 }]);

function fd(campos: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  return f;
}

beforeAll(async () => {
  [vendedor, fora] = await Promise.all(["gd2-vendedor", "gd2-fora"].map(criarUsuario));
  const [{ data: e1 }, { data: e2 }] = await Promise.all([
    servico.from("empresas").insert({ nome: `GD2 ${sufixo}` }).select("id").single(),
    servico.from("empresas").insert({ nome: `GD2 outra ${sufixo}` }).select("id").single(),
  ]);
  empresa = e1!.id;
  outraEmpresa = e2!.id;
  const { data: m1 } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" }).select("id").single();
  const { data: m2 } = await servico.from("empresa_membros").insert({ empresa_id: outraEmpresa, user_id: fora.id, papel: "admin" }).select("id").single();
  atualVendedor = { empresaId: empresa, membroId: m1!.id, papel: "vendedor" };
  atualFora = { empresaId: outraEmpresa, membroId: m2!.id, papel: "admin" };
  await servico.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 100 }).eq("empresa_id", empresa);
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T12:00:00-03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Negócio com qualificação residencial/Copel (contexto da estimativa) e responsável = vendedor. */
async function novoNegocio(qualif: { tipo?: string | null; distribuidora?: string | null } = {}) {
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente ${Math.random()}`, telefone: "44 90000-0000" }).select("id").single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: empresa,
      titulo: "GD2",
      contato_id: c!.id,
      funil_id: funil,
      etapa_id: etapa,
      valor: 20000,
      responsavel_id: atualVendedor.membroId,
      qualif_tipo_cliente: qualif.tipo === undefined ? "residencial" : qualif.tipo,
      qualif_distribuidora: qualif.distribuidora === undefined ? "Copel" : qualif.distribuidora,
    })
    .select("id")
    .single();
  if (error) throw error;
  return n!.id;
}

const salvar = (negocioId: string, extra: Record<string, string | undefined> = {}) =>
  salvarKitComCliente(
    cliente(vendedor),
    atualVendedor,
    fd({ negocioId, tipoLigacao: "bifasico", consumoMedioKwh: "500", tarifaKwh: "0,76802", tarifaBaseTributaria: "sem_tributos", componentes: KIT_3, ...extra }),
  );

const linha = async (negocioId: string) => (await servico.from("calculos_solares").select("*").eq("negocio_id", negocioId).single()).data!;
const historico = async (negocioId: string) =>
  (await servico.from("calculos_solares_historico").select("*").eq("negocio_id", negocioId).order("arquivado_em")).data ?? [];

describe("prévia → salvar → reabrir: resultado completo pela regra aceita", () => {
  it("caso 3 (C 500, G 300, bifásico): completo com o retrato; reabrir = vigente; reproduzível do retrato", async () => {
    const negocioId = await novoNegocio();
    const r = await salvar(negocioId);
    expect(r).toMatchObject({ ok: true, mensagem: "Kit e cálculo salvos." });
    const l = await linha(negocioId);
    expect(l).toMatchObject({
      estado_financeiro: "completo",
      metodo_calculo: "gd2_piso_655i_v1",
      tarifa_kwh: 0.76802,
      tarifa_base_tributaria: "sem_tributos",
      tarifa_origem: "oficial_aneel",
      distribuidora: "COPEL-DIS",
      enquadramento: "B1/residencial/convencional/GD_II",
      fio_b_rs_mwh: 214.535600374,
      fio_b_base_tributaria: "sem_tributos",
      percentual_legal_fio_b: 0.6,
      fio_b_vigencia_inicio: "2026-06-24",
      fio_b_vigencia_fim: "2027-06-23",
      disponibilidade_kwh: 50,
      geracao_estimada_kwh_mes: 300,
      kwh_compensado: 300,
      kwh_faturado: 200,
      kwh_nao_compensado: 0,
      custo_fio_b: 38.62,
      conta_sem_solar: 384.01,
      conta_com_solar: 192.22,
      economia_mensal: 191.79,
      payback_meses: null,
      autoconsumo_kwh: 0,
      pendencias: null,
      financeiro_desatualizado_em: null,
    });
    expect(l.ressalvas).toEqual(expect.arrayContaining(["autoconsumo_zero", "tabela4_nao_conferida", "payback_indisponivel", "bifasico_tres_condutores"]));
    expect(recalcularDaLinha(l)).toMatchObject({ contaSemSolar: 384.01, contaComSolar: 192.22, economiaMensal: 191.79 });

    const lido = await carregarVigencia(vendedor.cliente, negocioId);
    if (!lido.ok || !lido.calculo) throw new Error("leitura");
    expect(lido.vigencia).toEqual({ vigente: true, motivos: [], naoVerificavel: ["tarifa", "tipo_ligacao"] });
    expect(await historico(negocioId)).toEqual([]);
  });

  it("ligação muda o piso gravado: monofásico 30, trifásico 100 (nunca 50 fixo)", async () => {
    for (const [tipo, d] of [["monofasico", 30], ["trifasico", 100]] as const) {
      const negocioId = await novoNegocio();
      await salvar(negocioId, { tipoLigacao: tipo, consumoMedioKwh: "20" });
      expect(await linha(negocioId)).toMatchObject({ estado_financeiro: "completo", disponibilidade_kwh: d, conta_com_solar: Math.round(d * 0.76802 * 100) / 100 });
    }
  });
});

describe("entradas mudam e o resultado novo fica incompleto (R6.1, R6.2, R6.4)", () => {
  it("base com tributos: nova linha incompleta COM as novas entradas; a completa vai para o histórico como desatualizada", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    const antes = await linha(negocioId);

    const r = await salvar(negocioId, { tarifaKwh: "0,98", tarifaBaseTributaria: "com_tributos" });
    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain("Kit e resultado técnico salvos.");
    expect(r.mensagem).toContain("A tarifa informada inclui tributos e o Fio B oficial não");
    expect(r.mensagem).toContain("O cálculo anterior foi guardado no histórico como desatualizado");

    const agora = await linha(negocioId);
    expect(agora).toMatchObject({
      estado_financeiro: "incompleto",
      tarifa_kwh: 0.98,
      tarifa_base_tributaria: "com_tributos",
      tarifa_origem: "informada_vendedor",
      economia_mensal: null,
      conta_com_solar: null,
      payback_meses: null,
      metodo_calculo: null,
    });
    expect((agora.pendencias as { codigo: string }[]).map((p) => p.codigo)).toEqual(["base_tributaria_divergente"]);

    const h = await historico(negocioId);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ motivo: "desatualizado_por_entradas", calculo_id: antes.id, empresa_id: empresa });
    expect(h[0].linha).toMatchObject({ estado_financeiro: "completo", economia_mensal: 191.79, tarifa_kwh: 0.76802, tarifa_base_tributaria: "sem_tributos" });

    // Nenhuma economia antiga na proposta atual: a vigência recusa (incompleta).
    const lido = await carregarVigencia(vendedor.cliente, negocioId);
    if (!lido.ok || !lido.calculo) throw new Error("leitura");
    expect(lido.vigencia.motivos[0]).toBe("incompleta");
    expect(mensagemDeRecusa(motivosDaAcao(lido.vigencia.motivos, "proposta"), "proposta")).toContain("incompleta");

    // R6.4: outra incompleta substitui a incompleta, sem novo histórico.
    await salvar(negocioId, { tarifaKwh: "0,99", tarifaBaseTributaria: "com_tributos" });
    expect((await linha(negocioId)).tarifa_kwh).toBe(0.99);
    expect(await historico(negocioId)).toHaveLength(1);

    // Recalcular completo: linha nova completa; o histórico fica como está.
    const ok = await salvar(negocioId);
    expect(ok.mensagem).toBe("Kit e cálculo salvos.");
    expect(await linha(negocioId)).toMatchObject({ estado_financeiro: "completo", economia_mensal: 191.79 });
    expect(await historico(negocioId)).toHaveLength(1);
  });

  it("linha LEGADA substituída por incompleta também vai inteira para o histórico (nunca apagada)", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    // Simula uma linha legada (fórmula antiga) no lugar da completa.
    const legado = {
      estado_financeiro: "legado", metodo_calculo: null, pendencias: null, payback_meses: 80, kwh_faturado: 0, kwh_compensado: 500,
      custo_fio_b: 60, conta_sem_solar: 475, conta_com_solar: 60, economia_mensal: 415, data_referencia: null, tarifa_origem: null,
      tarifa_gd_id: null, tarifa_base_tributaria: null, ressalvas: null,
    };
    expect((await servico.from("calculos_solares").update(legado).eq("negocio_id", negocioId)).error).toBeNull();
    const historicoAntes = (await historico(negocioId)).length;

    const r = await salvar(negocioId, { tarifaBaseTributaria: "" });
    expect(r.mensagem).toContain("Declare se a tarifa informada inclui tributos");
    expect((await linha(negocioId)).estado_financeiro).toBe("incompleto");
    const h = await historico(negocioId);
    expect(h).toHaveLength(historicoAntes + 1);
    expect(h.at(-1)).toMatchObject({ motivo: "desatualizado_por_entradas" });
    expect(h.at(-1)!.linha).toMatchObject({ estado_financeiro: "legado", economia_mensal: 415 });
  });

  it("R6.2 sem linha nova (kit muda, tarifa vazia): a linha completa recebe a marca; R6.3: recalcular limpa", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    const r = await salvar(negocioId, { tarifaKwh: "", tarifaBaseTributaria: "", componentes: KIT_4 });
    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain("O cálculo anterior foi marcado como desatualizado");
    const marcado = await linha(negocioId);
    expect(marcado).toMatchObject({ estado_financeiro: "completo", economia_mensal: 191.79, financeiro_desatualizado_motivo: "entradas_alteradas_sem_resultado_novo" });
    expect(marcado.financeiro_desatualizado_em).not.toBeNull();
    expect(await historico(negocioId)).toEqual([]); // a marca não muda o resultado: não arquiva

    const lido = await carregarVigencia(vendedor.cliente, negocioId);
    if (!lido.ok || !lido.calculo) throw new Error("leitura");
    expect(lido.vigencia.motivos).toEqual(expect.arrayContaining(["desatualizado_por_entradas", "kit"]));
    expect(motivosDaAcao(lido.vigencia.motivos, "proposta")).toContain("desatualizado_por_entradas");

    await salvar(negocioId, { componentes: KIT_4 });
    const limpo = await linha(negocioId);
    expect(limpo).toMatchObject({ estado_financeiro: "completo", financeiro_desatualizado_em: null, financeiro_desatualizado_motivo: null, kit_potencia_kwp: 2.4 });
    expect(await historico(negocioId)).toHaveLength(1); // a completa anterior (3 kWp) foi substituída por recálculo
    expect((await historico(negocioId))[0].motivo).toBe("substituido_por_recalculo");
  });
});

describe("datas: percentual pelo ano e componente pela vigência", () => {
  it("cálculo de 2026 deixa de valer em 01/01/2027 (60% → 75%): regra_tarifaria", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    const l = await linha(negocioId);
    const n = { tipoCliente: "residencial", distribuidoraInformada: "Copel" };
    const base = { componentes: [{ tipo: "modulo", descricao: "Módulo 600 W", potencia_w: 600, quantidade: 5, ordem: 0 }], valorNegocio: 20000, consumoMedioKwhNegocio: 500, valorContaEnergiaNegocio: null, parametros: { produtividade_kwh_kwp_mes: 100, percentual_fio_b: l.percentual_fio_b, disponibilidade_mono_kwh: 30, disponibilidade_bi_kwh: 50, disponibilidade_tri_kwh: 100 } };
    const dez = await carregarContextoEstimativa(vendedor.cliente, n, "2026-12-31");
    const jan = await carregarContextoEstimativa(vendedor.cliente, n, "2027-01-01");
    expect(avaliarVigencia(l, { ...base, contexto: dez }).vigente).toBe(true);
    expect(avaliarVigencia(l, { ...base, contexto: jan }).motivos).toEqual(["regra_tarifaria"]);
  });

  it("salvar em 01/01/2027 usa 75% com a mesma REH; salvar em 24/06/2027 fica incompleto (sem tarifa vigente)", async () => {
    const negocioId = await novoNegocio();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-01T12:00:00-03:00"));
    await salvar(negocioId);
    expect(await linha(negocioId)).toMatchObject({ estado_financeiro: "completo", data_referencia: "2027-01-01", percentual_legal_fio_b: 0.75, conta_com_solar: 201.87, economia_mensal: 182.14 });

    vi.setSystemTime(new Date("2027-06-24T12:00:00-03:00"));
    const r = await salvar(negocioId);
    expect(r.mensagem).toContain("Sem tarifa vigente da COPEL-DIS para 24/06/2027");
    expect(await linha(negocioId)).toMatchObject({ estado_financeiro: "incompleto", data_referencia: "2027-06-24", economia_mensal: null, tarifa_gd_id: null });
    expect((await historico(negocioId)).at(-1)).toMatchObject({ motivo: "desatualizado_por_entradas" });
  });
});

describe("preço e valor comercial", () => {
  it("editar o valor do negócio nunca é bloqueado; 'Atualizar preço no cálculo' só leva o valor ao kit_preco (payback segue nulo)", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId, { tarifaBaseTributaria: "com_tributos" }); // incompleto
    const editar = await editarNegocioComCliente(cliente(vendedor), atualVendedor, fd({ negocioId, titulo: "GD2 editado", valor: "21.000,00", consumo_medio_kwh: "500" }));
    expect(editar.ok).toBe(true);
    const recusado = await atualizarPrecoCalculoComCliente(cliente(vendedor), atualVendedor, negocioId);
    expect(recusado.ok).toBe(false); // resultado incompleto: nada a sincronizar

    await salvar(negocioId); // completo, com kit_preco 21000 (valor atual)
    await editarNegocioComCliente(cliente(vendedor), atualVendedor, fd({ negocioId, titulo: "GD2 editado", valor: "22.000,00", consumo_medio_kwh: "500" }));
    const lido = await carregarVigencia(vendedor.cliente, negocioId);
    if (!lido.ok || !lido.calculo) throw new Error("leitura");
    expect(lido.vigencia.motivos).toEqual(["preco"]);
    const ok = await atualizarPrecoCalculoComCliente(cliente(vendedor), atualVendedor, negocioId);
    expect(ok).toMatchObject({ ok: true, mensagem: "Preço do cálculo atualizado." });
    expect(await linha(negocioId)).toMatchObject({ kit_preco: 22000, payback_meses: null, economia_mensal: 191.79 });
    expect(await historico(negocioId)).toEqual([]); // preço não muda o resultado: não arquiva
  });
});

describe("banco: CHECK do estado completo, referência só de leitura, histórico imutável e isolamento", () => {
  it("completo exige o retrato, payback nulo, data na vigência e a MESMA base da tarifa e do Fio B", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    const tentar = async (patch: TablesUpdate<"calculos_solares">) => (await servico.from("calculos_solares").update(patch).eq("negocio_id", negocioId)).error?.code;
    expect(await tentar({ tarifa_base_tributaria: "com_tributos" })).toBe("23514");
    expect(await tentar({ payback_meses: 104.3 })).toBe("23514");
    expect(await tentar({ data_referencia: "2027-06-24" })).toBe("23514");
    expect(await tentar({ fio_b_rs_mwh: null })).toBe("23514");
    expect(await tentar({ enquadramento: null })).toBe("23514");
    expect(await tentar({ tarifa_gd_id: null })).toBe("23514");
    expect(await tentar({ financeiro_desatualizado_em: new Date().toISOString() })).toBe("23514"); // sem motivo
    expect((await linha(negocioId)).estado_financeiro).toBe("completo");
  });

  it("tarifas_gd_aneel: qualquer usuário lê; ninguém grava pelo app", async () => {
    const { data } = await fora.cliente.from("tarifas_gd_aneel").select("distribuidora, tusd_fio_b_rs_mwh, pendencias_fonte");
    expect(data).toEqual([{ distribuidora: "COPEL-DIS", tusd_fio_b_rs_mwh: 214.535600374, pendencias_fonte: ["tabela4_nao_conferida"] }]);
    const ins = await fora.cliente.from("tarifas_gd_aneel").update({ tusd_fio_b_rs_mwh: 1 }).eq("distribuidora", "COPEL-DIS").select("id");
    expect(ins.error ?? ins.data).toBeTruthy();
    expect(ins.data ?? []).toEqual([]);
    const { data: depois } = await servico.from("tarifas_gd_aneel").select("tusd_fio_b_rs_mwh").single();
    expect(depois!.tusd_fio_b_rs_mwh).toBe(214.535600374);
  });

  it("histórico: outra empresa não lê; ninguém altera, apaga ou insere pelo app", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    await salvar(negocioId, { tarifaBaseTributaria: "com_tributos" });
    expect(await historico(negocioId)).toHaveLength(1);

    const visto = await vendedor.cliente.from("calculos_solares_historico").select("id").eq("negocio_id", negocioId);
    expect(visto.data).toHaveLength(1);
    const deFora = await fora.cliente.from("calculos_solares_historico").select("id").eq("negocio_id", negocioId);
    expect(deFora.data).toEqual([]);
    const calculoDeFora = await fora.cliente.from("calculos_solares").select("id").eq("negocio_id", negocioId);
    expect(calculoDeFora.data).toEqual([]);

    const upd = await vendedor.cliente.from("calculos_solares_historico").update({ motivo: "substituido_por_recalculo" }).eq("negocio_id", negocioId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await vendedor.cliente.from("calculos_solares_historico").delete().eq("negocio_id", negocioId).select("id");
    expect(del.data ?? []).toEqual([]);
    const ins = await vendedor.cliente
      .from("calculos_solares_historico")
      .insert({ calculo_id: negocioId, empresa_id: empresa, negocio_id: negocioId, motivo: "substituido_por_recalculo", linha: {} });
    expect(ins.error).not.toBeNull();
    expect(await historico(negocioId)).toHaveLength(1);
  });

  it("outra empresa não salva kit nem calcula no negócio alheio", async () => {
    const negocioId = await novoNegocio();
    await salvar(negocioId);
    const r = await salvarKitComCliente(
      cliente(fora),
      atualFora,
      fd({ negocioId, tipoLigacao: "bifasico", consumoMedioKwh: "999", tarifaKwh: "0,76802", tarifaBaseTributaria: "com_tributos", componentes: KIT_4 }),
    );
    expect(r.ok).toBe(false);
    expect(await linha(negocioId)).toMatchObject({ estado_financeiro: "completo", consumo_medio_kwh: 500 });
    expect(await historico(negocioId)).toEqual([]);
  });

  it("qualificação sem regra validada (comercial, outra distribuidora): resultado incompleto, nunca número presumido", async () => {
    const comercial = await novoNegocio({ tipo: "comercial" });
    expect((await salvar(comercial)).mensagem).toContain("Enquadramento sem regra validada");
    expect((await linha(comercial)).estado_financeiro).toBe("incompleto");
    const cemig = await novoNegocio({ distribuidora: "Cemig" });
    expect((await salvar(cemig)).mensagem).toContain("Não há tarifa oficial cadastrada para a distribuidora informada");
    expect((await linha(cemig)).estado_financeiro).toBe("incompleto");
  });
});
