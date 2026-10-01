/**
 * Fase 5 da reconciliação do motor de dimensionamento (Evandro, 2026-10-01): motor automático e
 * kit manual precisam coexistir. `salvarDimensionamento` (src/lib/acoes/dimensionamento.ts) não
 * pode mais apagar o kit inteiro — só substitui o SLOT do núcleo (módulo/inversor principal,
 * `eh_nucleo_motor = true`); itens manuais (bateria, outros) nunca são tocados por ela.
 *
 * Fase 6 (Evandro, 2026-10-01): o risco identificado na Fase 5 — alternar automático → manual →
 * automático em saves sucessivos duplicava módulo/inversor — é corrigido com um esquema de
 * status ativo/substituído: trocar o módulo/inversor principal marca a linha anterior como
 * `ativo = false` em vez de apagá-la (preserva histórico pra auditoria); no máximo 1 linha
 * `eh_nucleo_motor = true` e `ativo = true` por `(negocio_id, tipo)` — garantido pelo índice único
 * parcial `kit_componentes_nucleo_ativo_unico` (ver migration 20261001040000).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { salvarDimensionamento } from "@/lib/acoes/dimensionamento";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor1: Usuario;
let empresa: string;
let membroId: string;
let contatoId: string;
let funilId: string;
let etapaId: string;
let negocio: string;
let moduloX: string;
let moduloW: string;
let inversorY: string;
let inversorZ: string;

/** Componentes ATIVOS (o que a tela do negócio/proposta mostra) do negócio, na ordem salva. */
async function componentesAtivos(negocioId: string) {
  const { data } = await vendedor1.cliente
    .from("kit_componentes")
    .select("tipo, descricao, quantidade, origem, eh_nucleo_motor, ativo")
    .eq("negocio_id", negocioId)
    .eq("ativo", true)
    .order("ordem");
  return data!;
}

async function novoNegocio(titulo: string) {
  const { data: n } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contatoId, funil_id: funilId, etapa_id: etapaId, valor: 30000 })
    .select("id")
    .single();
  return n!.id as string;
}

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
  funilId = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  etapaId = et!.id;
  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Dimensionamento", telefone: "44 90000-0004" })
    .select("id")
    .single();
  contatoId = c!.id;
  negocio = await novoNegocio("Usina motor + kit manual");

  const { data: equipamentos } = await servico
    .from("equipamentos_empresa")
    .insert([
      { empresa_id: empresa, tipo: "modulo", fabricante: "Canadian", modelo: "620W X", potencia_w: 620 },
      { empresa_id: empresa, tipo: "modulo", fabricante: "Jinko", modelo: "610W W", potencia_w: 610 },
      { empresa_id: empresa, tipo: "inversor", fabricante: "Growatt", modelo: "6,5kW Y", potencia_w: 6500 },
      { empresa_id: empresa, tipo: "inversor", fabricante: "Growatt", modelo: "6kW Z", potencia_w: 6000 },
    ])
    .select("id, modelo");
  moduloX = equipamentos!.find((e) => e.modelo === "620W X")!.id;
  moduloW = equipamentos!.find((e) => e.modelo === "610W W")!.id;
  inversorY = equipamentos!.find((e) => e.modelo === "6,5kW Y")!.id;
  inversorZ = equipamentos!.find((e) => e.modelo === "6kW Z")!.id;
});

describe("salvarDimensionamento + kit manual (Fase 5) + slot ativo/substituído (Fase 6)", () => {
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

    const antes = await componentesAtivos(negocio);
    expect(antes).toHaveLength(3);
    expect(antes.find((c) => c.tipo === "modulo")).toMatchObject({ descricao: "Canadian 620W X", origem: "automatico" });
    expect(antes.find((c) => c.tipo === "inversor")).toMatchObject({ descricao: "Growatt 6,5kW Y", origem: "automatico" });
    expect(antes.find((c) => c.tipo === "bateria")).toMatchObject({ descricao: "Bateria 5kWh", origem: "manual" });

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

    const depois = await componentesAtivos(negocio);
    expect(depois).toHaveLength(3);
    expect(depois.find((c) => c.tipo === "modulo")).toMatchObject({ quantidade: 14, origem: "automatico" });
    expect(depois.find((c) => c.tipo === "bateria")).toMatchObject({ descricao: "Bateria 5kWh", origem: "manual" });
  });

  it("override manual do inversor recomendado vira origem 'manual' e fica auditado na linha do tempo", async () => {
    const negocioOverride = await novoNegocio("Usina override");

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

    const componentes = await componentesAtivos(negocioOverride);
    expect(componentes.find((c) => c.tipo === "inversor")).toMatchObject({ descricao: "Growatt 6kW Z", origem: "manual" });
    expect(componentes.find((c) => c.tipo === "modulo")).toMatchObject({ origem: "automatico" });

    const { data: atividades } = await servico
      .from("atividades")
      .select("tipo, dados")
      .eq("negocio_id", negocioOverride)
      .eq("tipo", "kit_componente_override_manual");
    expect(atividades!.length).toBeGreaterThan(0);
    const ultima = atividades![atividades!.length - 1];
    expect((ultima.dados as Record<string, unknown>).origem).toBe("manual");
    expect((ultima.dados as Record<string, unknown>).inversor_equipamento_id).toBe(inversorZ);
    // Fase 6: a auditoria passa a registrar também o valor anterior.
    expect((ultima.dados as Record<string, unknown>).inversor_equipamento_id_anterior).toBe(inversorY);
    expect((ultima.dados as Record<string, unknown>).origem_anterior).toBe("automatico");
  });

  it("alternar automático → manual → automático não duplica módulo/inversor — linha anterior fica inativa, não apagada (risco da Fase 5, corrigido na Fase 6: cenários A/B/C)", async () => {
    const negocioAlternancia = await novoNegocio("Usina alternância");

    const base = {
      negocioId: negocioAlternancia,
      moduloEquipamentoId: moduloX,
      quantidadeModulos: 13,
      tipoLigacao: "trifasico" as const,
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual" as const,
      precoNegocio: 30000,
    };

    // A) escolha automática do inversor Y.
    const r1 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      ...base,
      inversorEquipamentoId: inversorY,
      origemEscolha: "automatico",
    });
    expect(r1.ok).toBe(true);
    expect(await componentesAtivos(negocioAlternancia)).toHaveLength(2);

    // B) vendedor troca manualmente pro inversor Z.
    const r2 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      ...base,
      inversorEquipamentoId: inversorZ,
      origemEscolha: "manual",
    });
    expect(r2.ok).toBe(true);

    const aposManual = await componentesAtivos(negocioAlternancia);
    // Só módulo + inversor ativos — nenhuma linha órfã do passo automático anterior.
    expect(aposManual).toHaveLength(2);
    expect(aposManual.find((c) => c.tipo === "inversor")).toMatchObject({
      descricao: "Growatt 6kW Z",
      origem: "manual",
      eh_nucleo_motor: true,
      ativo: true,
    });

    // A linha anterior (inversor Y, automático) não foi apagada — só ficou inativa.
    const { data: todosInversores } = await vendedor1.cliente
      .from("kit_componentes")
      .select("descricao, origem, ativo")
      .eq("negocio_id", negocioAlternancia)
      .eq("tipo", "inversor")
      .order("created_at");
    expect(todosInversores).toHaveLength(2);
    expect(todosInversores!.find((c) => c.descricao === "Growatt 6,5kW Y")).toMatchObject({ origem: "automatico", ativo: false });
    expect(todosInversores!.find((c) => c.descricao === "Growatt 6kW Z")).toMatchObject({ origem: "manual", ativo: true });

    // C) vendedor aceita a recomendação automática de novo (volta pro inversor Y).
    const r3 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      ...base,
      inversorEquipamentoId: inversorY,
      origemEscolha: "automatico",
    });
    expect(r3.ok).toBe(true);

    const aposAutomaticoNovamente = await componentesAtivos(negocioAlternancia);
    // Continua só módulo + inversor ativos — a linha 'manual' órfã (risco da Fase 5) não sobra.
    expect(aposAutomaticoNovamente).toHaveLength(2);
    expect(aposAutomaticoNovamente.filter((c) => c.tipo === "inversor")).toHaveLength(1);
    expect(aposAutomaticoNovamente.find((c) => c.tipo === "inversor")).toMatchObject({
      descricao: "Growatt 6,5kW Y",
      origem: "automatico",
      eh_nucleo_motor: true,
      ativo: true,
    });

    // Histórico completo do inversor: 3 linhas no total (Y automático → Z manual → Y automático de
    // novo), só a última ativa — nada foi apagado.
    const { data: historicoInversor } = await vendedor1.cliente
      .from("kit_componentes")
      .select("descricao, ativo")
      .eq("negocio_id", negocioAlternancia)
      .eq("tipo", "inversor")
      .order("created_at");
    expect(historicoInversor).toHaveLength(3);
    expect(historicoInversor!.filter((c) => c.ativo)).toHaveLength(1);
  });

  it("adicionar bateria e recalcular o sistema preserva a bateria e não duplica o núcleo (cenário D)", async () => {
    const negocioD = await novoNegocio("Usina cenário D");

    const r1 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocioD,
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
    expect(r1.ok).toBe(true);

    await vendedor1.cliente
      .from("kit_componentes")
      .insert({ empresa_id: empresa, negocio_id: negocioD, tipo: "bateria", descricao: "Bateria 10kWh", quantidade: 2, ordem: 100, origem: "manual" });

    // Motor roda de novo (ex.: vendedor ajustou a quantidade de módulos) — a bateria não pode
    // sumir nem duplicar, e o núcleo continua só 1 módulo + 1 inversor ativos.
    const r2 = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
      negocioId: negocioD,
      moduloEquipamentoId: moduloX,
      inversorEquipamentoId: inversorY,
      quantidadeModulos: 15,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 780,
      valorFaturaMedio: null,
      tarifaKwh: 0.95,
      origemTarifa: "manual",
      precoNegocio: 30000,
      origemEscolha: "automatico",
    });
    expect(r2.ok).toBe(true);

    const ativos = await componentesAtivos(negocioD);
    expect(ativos.filter((c) => c.tipo === "bateria")).toHaveLength(1);
    expect(ativos.find((c) => c.tipo === "bateria")).toMatchObject({ descricao: "Bateria 10kWh", quantidade: 2 });
    expect(ativos.filter((c) => c.tipo === "modulo")).toHaveLength(1);
    expect(ativos.find((c) => c.tipo === "modulo")).toMatchObject({ quantidade: 15 });
    expect(ativos.filter((c) => c.tipo === "inversor")).toHaveLength(1);
  });

  it("trocar o módulo várias vezes seguidas (edição repetida do negócio) mantém só 1 módulo ativo (cenário E)", async () => {
    const negocioE = await novoNegocio("Usina cenário E");
    const sequenciaModulos = [moduloX, moduloW, moduloX, moduloW];

    for (const moduloEscolhido of sequenciaModulos) {
      const resultado = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
        negocioId: negocioE,
        moduloEquipamentoId: moduloEscolhido,
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
      expect(resultado.ok).toBe(true);

      const ativos = await componentesAtivos(negocioE);
      const modulosAtivos = ativos.filter((c) => c.tipo === "modulo");
      expect(modulosAtivos).toHaveLength(1);
      expect(modulosAtivos[0].descricao).toBe(moduloEscolhido === moduloX ? "Canadian 620W X" : "Jinko 610W W");
    }

    // Histórico: 4 linhas de módulo no total (uma por troca), só a última ativa.
    const { data: historicoModulo } = await vendedor1.cliente
      .from("kit_componentes")
      .select("ativo")
      .eq("negocio_id", negocioE)
      .eq("tipo", "modulo")
      .order("created_at");
    expect(historicoModulo).toHaveLength(sequenciaModulos.length);
    expect(historicoModulo!.filter((c) => c.ativo)).toHaveLength(1);
  });

  it("trocar o inversor várias vezes seguidas (edição repetida do negócio) mantém só 1 inversor ativo (cenário F)", async () => {
    const negocioF = await novoNegocio("Usina cenário F");
    const sequenciaInversores = [inversorY, inversorZ, inversorY];

    for (const inversorEscolhido of sequenciaInversores) {
      const resultado = await salvarDimensionamento(vendedor1.cliente as unknown as SupabaseServidor, empresa, membroId, {
        negocioId: negocioF,
        moduloEquipamentoId: moduloX,
        inversorEquipamentoId: inversorEscolhido,
        quantidadeModulos: 13,
        tipoLigacao: "trifasico",
        consumoMedioKwh: 780,
        valorFaturaMedio: null,
        tarifaKwh: 0.95,
        origemTarifa: "manual",
        precoNegocio: 30000,
        origemEscolha: inversorEscolhido === inversorY ? "automatico" : "manual",
      });
      expect(resultado.ok).toBe(true);

      const ativos = await componentesAtivos(negocioF);
      const inversoresAtivos = ativos.filter((c) => c.tipo === "inversor");
      expect(inversoresAtivos).toHaveLength(1);
      expect(inversoresAtivos[0].descricao).toBe(inversorEscolhido === inversorY ? "Growatt 6,5kW Y" : "Growatt 6kW Z");
    }

    const { data: historicoInversor } = await vendedor1.cliente
      .from("kit_componentes")
      .select("ativo")
      .eq("negocio_id", negocioF)
      .eq("tipo", "inversor")
      .order("created_at");
    expect(historicoInversor).toHaveLength(sequenciaInversores.length);
    expect(historicoInversor!.filter((c) => c.ativo)).toHaveLength(1);
  });
});
