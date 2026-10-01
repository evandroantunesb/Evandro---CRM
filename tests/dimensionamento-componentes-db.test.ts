/**
 * Fase 5 da reconciliação do motor de dimensionamento (Evandro, 2026-10-01): motor automático e
 * kit manual precisam coexistir. `salvarDimensionamento` (src/lib/acoes/dimensionamento.ts) não
 * pode mais apagar o kit inteiro — só substitui as linhas de `kit_componentes` com
 * `origem: "automatico"` (módulo/inversor escolhidos pelo motor); itens manuais (bateria,
 * override de módulo/inversor) nunca são tocados por ela.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { salvarDimensionamento } from "@/lib/acoes/dimensionamento";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor1: Usuario;
let empresa: string;
let membroId: string;
let negocio: string;
let moduloX: string;
let inversorY: string;
let inversorZ: string;

beforeAll(async () => {
  [vendedor1] = await Promise.all(["dimc-v1"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Dimensionamento componentes ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: membro } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" })
    .select("id")
    .single();
  membroId = membro!.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Dimensionamento", telefone: "44 90000-0004" })
    .select("id")
    .single();
  const { data: n } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina motor + kit manual", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, valor: 30000 })
    .select("id")
    .single();
  negocio = n!.id;

  const { data: equipamentos } = await servico
    .from("equipamentos_empresa")
    .insert([
      { empresa_id: empresa, tipo: "modulo", fabricante: "Canadian", modelo: "620W X", potencia_w: 620 },
      { empresa_id: empresa, tipo: "inversor", fabricante: "Growatt", modelo: "6,5kW Y", potencia_w: 6500 },
      { empresa_id: empresa, tipo: "inversor", fabricante: "Growatt", modelo: "6kW Z", potencia_w: 6000 },
    ])
    .select("id, modelo");
  moduloX = equipamentos!.find((e) => e.modelo === "620W X")!.id;
  inversorY = equipamentos!.find((e) => e.modelo === "6,5kW Y")!.id;
  inversorZ = equipamentos!.find((e) => e.modelo === "6kW Z")!.id;
});

describe("salvarDimensionamento + kit manual (Fase 5)", () => {
  it("motor automático + bateria manual: nenhum é apagado, cada um com a origem certa", async () => {
    const resultado = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocio,
      moduloEquipamentoId: moduloX,
      inversorEquipamentoId: inversorY,
      quantidadeModulos: 13,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual",
      precoNegocio: 30000,
    });
    expect(resultado.ok).toBe(true);

    // Bateria adicionada manualmente (equivalente ao "Montar kit manualmente" do wizard) — não
    // passa por `salvarDimensionamento`, é a própria inserção manual do vendedor.
    const { error: erroBateria } = await vendedor1.cliente
      .from("kit_componentes")
      .insert({ empresa_id: empresa, negocio_id: negocio, tipo: "bateria", descricao: "Bateria 5kWh", quantidade: 1, ordem: 100, origem: "manual" });
    expect(erroBateria).toBeNull();

    const { data: antes } = await vendedor1.cliente.from("kit_componentes").select("tipo, descricao, origem").eq("negocio_id", negocio).order("ordem");
    expect(antes).toHaveLength(3);
    expect(antes!.find((c) => c.tipo === "modulo")).toMatchObject({ descricao: "Canadian 620W X", origem: "automatico" });
    expect(antes!.find((c) => c.tipo === "inversor")).toMatchObject({ descricao: "Growatt 6,5kW Y", origem: "automatico" });
    expect(antes!.find((c) => c.tipo === "bateria")).toMatchObject({ descricao: "Bateria 5kWh", origem: "manual" });

    // Recalcula o motor (ex.: vendedor ajustou a quantidade) — a bateria manual continua lá.
    const resultado2 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocio,
      moduloEquipamentoId: moduloX,
      inversorEquipamentoId: inversorY,
      quantidadeModulos: 14,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual",
      precoNegocio: 30000,
    });
    expect(resultado2.ok).toBe(true);

    const { data: depois } = await vendedor1.cliente.from("kit_componentes").select("tipo, descricao, quantidade, origem").eq("negocio_id", negocio).order("ordem");
    expect(depois).toHaveLength(3);
    expect(depois!.find((c) => c.tipo === "modulo")).toMatchObject({ quantidade: 14, origem: "automatico" });
    expect(depois!.find((c) => c.tipo === "bateria")).toMatchObject({ descricao: "Bateria 5kWh", origem: "manual" });
  });

  it("override manual do inversor recomendado vira origem 'manual' e fica auditado na linha do tempo", async () => {
    const { data: n } = await vendedor1.cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: "Usina override", contato_id: (await vendedor1.cliente.from("contatos").select("id").eq("empresa_id", empresa).limit(1).single()).data!.id, funil_id: (await servico.from("funis").select("id").eq("empresa_id", empresa).single()).data!.id, etapa_id: (await servico.from("etapas").select("id").eq("empresa_id", empresa).order("ordem").limit(1).single()).data!.id, valor: 30000 })
      .select("id")
      .single();
    const negocioOverride = n!.id;

    const automatico = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocioOverride,
      moduloEquipamentoId: moduloX,
      inversorEquipamentoId: inversorY,
      quantidadeModulos: 13,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual",
      precoNegocio: 30000,
      origemEscolha: "automatico",
    });
    expect(automatico.ok).toBe(true);

    const manual = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocioOverride,
      moduloEquipamentoId: moduloX,
      inversorEquipamentoId: inversorZ,
      quantidadeModulos: 13,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual",
      precoNegocio: 30000,
      origemEscolha: "manual",
    });
    expect(manual.ok).toBe(true);

    const { data: componentes } = await vendedor1.cliente
      .from("kit_componentes")
      .select("tipo, descricao, origem")
      .eq("negocio_id", negocioOverride)
      .order("ordem");
    expect(componentes!.find((c) => c.tipo === "inversor")).toMatchObject({ descricao: "Growatt 6kW Z", origem: "manual" });
    expect(componentes!.find((c) => c.tipo === "modulo")).toMatchObject({ origem: "automatico" });

    const { data: atividades } = await servico
      .from("atividades")
      .select("tipo, dados")
      .eq("negocio_id", negocioOverride)
      .eq("tipo", "kit_componente_override_manual");
    expect(atividades!.length).toBeGreaterThan(0);
    const ultima = atividades![atividades!.length - 1];
    expect((ultima.dados as Record<string, unknown>).origem).toBe("manual");
    expect((ultima.dados as Record<string, unknown>).inversor_equipamento_id).toBe(inversorZ);
  });
});
