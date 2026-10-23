/**
 * M2-Q1 (fase 2): persistência da calculadora contra o Postgres REAL (banco descartável).
 *
 * 1) Percentuais (parametros_calculadora.percentual_fio_b numeric(4,3), comissao_percentual numeric(5,4)):
 *    grava `lerNumeroBr(texto)/100` (mesma regra de editarParametros), lê, formata com `percentualParaCampo`,
 *    reenvia o texto SEM editar e exige valor persistido idêntico e texto exibido idêntico, sem resíduo.
 * 2) Consumo: `consumoComoPersistido` bate com o que o banco grava (negocios e calculos_solares, numeric(10,2));
 *    a linha de `linhaDeCalculo` gravada e relida é reproduzida exatamente por `calcular(entradaDaLinha(...))`;
 *    refazer a linha a partir da linha lida devolve a mesma linha.
 *
 * Cada teste cria o próprio cenário (empresa com sufixo único); nada depende de dados prévios.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { calcular } from "@/lib/calculadora";
import { consumoComoPersistido, entradaDaLinha, linhaDeCalculo, type ParametrosCalculo } from "@/lib/calculo-reproduzivel";
import { valorComoPersistido } from "@/lib/consumo-persistido";
import { lerNumeroBr } from "@/lib/formatacao";
import { percentualParaCampo } from "@/lib/percentual-exibicao";
import type { Database } from "@/lib/supabase/database.types";
import { servico, sufixo } from "./ajuda";

type ColunaPercentual = "percentual_fio_b" | "comissao_percentual";

let empresa: string;
let contato: string;
let funil: string;
let etapa: string;

beforeAll(async () => {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Persistência calculadora ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { data: c, error: erroContato } = await servico
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Persistência", telefone: "44 90000-0002" })
    .select("id")
    .single();
  if (erroContato) throw erroContato;
  contato = c!.id;
});

// ---------------------------------------------------------------------------
// 1) Percentuais
// ---------------------------------------------------------------------------

/** Mesma regra do servidor (editarParametros): texto -> lerNumeroBr(texto)/100, vazio = 0. */
const fracaoDoTexto = (texto: string) => (lerNumeroBr(texto) ?? 0) / 100;

async function gravarPercentual(coluna: ColunaPercentual, fracao: number) {
  const atualizacao: Database["public"]["Tables"]["parametros_calculadora"]["Update"] =
    coluna === "percentual_fio_b" ? { percentual_fio_b: fracao } : { comissao_percentual: fracao };
  const { error } = await servico.from("parametros_calculadora").update(atualizacao).eq("empresa_id", empresa);
  return error;
}

async function lerPercentual(coluna: ColunaPercentual): Promise<number> {
  const { data, error } = await servico.from("parametros_calculadora").select(coluna).eq("empresa_id", empresa).single();
  if (error) throw error;
  return (data as Record<ColunaPercentual, number>)[coluna];
}

/** Salvar -> reabrir -> salvar sem editar. Devolve o que foi persistido e exibido em cada etapa. */
async function ciclo(coluna: ColunaPercentual, texto: string) {
  const erro1 = await gravarPercentual(coluna, fracaoDoTexto(texto));
  expect(erro1, `1º salvamento de "${texto}" em ${coluna}`).toBeNull();
  const persistido1 = await lerPercentual(coluna);
  const exibido1 = percentualParaCampo(persistido1);

  const erro2 = await gravarPercentual(coluna, fracaoDoTexto(exibido1));
  expect(erro2, `2º salvamento (sem editar) de "${exibido1}" em ${coluna}`).toBeNull();
  const persistido2 = await lerPercentual(coluna);
  const exibido2 = percentualParaCampo(persistido2);
  return { persistido1, exibido1, persistido2, exibido2 };
}

describe("percentuais: salvar, reabrir e salvar sem editar (parametros_calculadora)", () => {
  // [texto digitado, fração que o BANCO deve gravar, texto exibido ao reabrir]
  // Linhas marcadas "arredondado pelo banco": o formulário aceita casas além da escala da coluna e o POSTGRES
  // arredonda (half away from zero). Isso não é do helper, que só formata o valor já gravado.
  const FIO_B: [string, number, string][] = [
    ["0", 0, "0"],
    ["0,1", 0.001, "0,1"],
    ["7", 0.07, "7"],
    ["12,3", 0.123, "12,3"],
    ["29", 0.29, "29"],
    ["45", 0.45, "45"],
    ["57", 0.57, "57"],
    ["57,5", 0.575, "57,5"],
    ["99,9", 0.999, "99,9"],
    ["100", 1, "100"],
    ["0,05", 0.001, "0,1"], // arredondado pelo banco: 0,0005 -> 0,001
    ["0,04", 0, "0"], // arredondado pelo banco: 0,0004 -> 0
    ["0,15", 0.002, "0,2"], // arredondado pelo banco: 0,0015 -> 0,002
    ["57,55", 0.576, "57,6"], // arredondado pelo banco: 0,5755 -> 0,576
  ];
  const COMISSAO: [string, number, string][] = [
    ["0", 0, "0"],
    ["0,01", 0.0001, "0,01"],
    ["7", 0.07, "7"],
    ["12,34", 0.1234, "12,34"],
    ["29", 0.29, "29"],
    ["57", 0.57, "57"],
    ["57,5", 0.575, "57,5"],
    ["99,99", 0.9999, "99,99"],
    ["100", 1, "100"],
    ["0,005", 0.0001, "0,01"], // arredondado pelo banco: 0,00005 -> 0,0001
    ["0,004", 0, "0"], // arredondado pelo banco: 0,00004 -> 0
    ["12,345", 0.1235, "12,35"], // arredondado pelo banco: 0,12345 -> 0,1235
  ];

  describe.each([
    ["percentual_fio_b" as const, FIO_B, /^\d{1,3}(,\d)?$/],
    ["comissao_percentual" as const, COMISSAO, /^\d{1,3}(,\d{1,2})?$/],
  ])("%s", (coluna, tabela, formato) => {
    it.each(tabela)("texto %s -> banco %s -> campo %s e fica estável sem editar", async (texto, persistidoEsperado, exibidoEsperado) => {
      const r = await ciclo(coluna, texto);
      expect(r.persistido1).toBe(persistidoEsperado);
      expect(r.exibido1).toBe(exibidoEsperado);
      // Sem editar: valor persistido idêntico e texto idêntico.
      expect(r.persistido2).toBe(r.persistido1);
      expect(r.exibido2).toBe(r.exibido1);
      // Nunca resíduo de ponto flutuante (56,99999999999999) nem notação estranha.
      expect(r.exibido1).toMatch(formato);
      expect(r.exibido1).not.toMatch(/\d{5,}|[.eE]/);
    });

    it("varredura de valores da escala da coluna: salvar -> reabrir -> salvar sem editar não muda nada", async () => {
      const escala = coluna === "percentual_fio_b" ? 1000 : 10000;
      const passo = coluna === "percentual_fio_b" ? 3 : 101;
      const ks = new Set<number>([0, 1, escala - 1, escala]);
      for (let k = 0; k <= escala; k += passo) ks.add(k);
      const problemas: string[] = [];
      for (const k of ks) {
        const fracao = k / escala;
        // Valor enviado já na escala: o banco deve gravar exatamente k/escala.
        const erro = await gravarPercentual(coluna, fracao);
        if (erro) {
          problemas.push(`k=${k}: erro ${erro.message}`);
          continue;
        }
        const p1 = await lerPercentual(coluna);
        const t1 = percentualParaCampo(p1);
        await gravarPercentual(coluna, fracaoDoTexto(t1));
        const p2 = await lerPercentual(coluna);
        const t2 = percentualParaCampo(p2);
        if (p1 !== fracao || p2 !== p1 || t2 !== t1 || !formato.test(t1)) problemas.push(`k=${k}: ${fracao} -> ${p1} "${t1}" -> ${p2} "${t2}"`);
      }
      expect({ total: problemas.length, amostra: problemas.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
    }, 180_000);

    it("o banco recusa fora de 0..1 (check): 100,1% e negativo", async () => {
      const acima = await gravarPercentual(coluna, fracaoDoTexto("100,1"));
      expect(acima?.code).toBe("23514");
      const abaixo = await gravarPercentual(coluna, -0.001);
      expect(abaixo?.code).toBe("23514");
    });
  });
});

// ---------------------------------------------------------------------------
// 2) Consumo e cálculo reproduzível
// ---------------------------------------------------------------------------

async function novoNegocio(consumo: number | null = null): Promise<string> {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio ${Math.random().toString(36).slice(2, 8)}`, contato_id: contato, funil_id: funil, etapa_id: etapa, consumo_medio_kwh: consumo })
    .select("id")
    .single();
  if (error) throw new Error(`negocio: ${error.message}`);
  return data!.id;
}

async function montarKit(negocioId: string) {
  // calculos_solares exige kit montado (trigger calculos_solares_exige_kit).
  const { error } = await servico
    .from("kit_componentes")
    .insert({ empresa_id: empresa, negocio_id: negocioId, tipo: "modulo", descricao: "Módulo 500 W", potencia_w: 500, quantidade: 20, ordem: 0 });
  if (error) throw new Error(`kit: ${error.message}`);
}

const BATERIA = [1200.555, 1200.554, 1.005, 0.005, 2.675, 1111.111111, 1500.005, 800.125, 1200, 1500, 1, 1234.56, 0.01, 99.99, 1234.5, 12.345, 100.995, 99999999.99];

describe("consumo: consumoComoPersistido bate com o Postgres real", () => {
  it.each(BATERIA)("calculos_solares.consumo_medio_kwh: bruto %s", async (bruto) => {
    const negocio = await novoNegocio();
    await montarKit(negocio);
    const { error } = await servico.from("calculos_solares").insert({
      empresa_id: empresa,
      negocio_id: negocio,
      kit_nome: "Kit 10 kWp",
      kit_potencia_kwp: 10,
      kit_preco: 30000,
      tipo_ligacao: "bifasico",
      consumo_medio_kwh: bruto,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.45,
      disponibilidade_kwh: 50,
      geracao_estimada_kwh_mes: 1200,
      kwh_faturado: 50,
      kwh_compensado: 0,
      custo_fio_b: 0,
      conta_sem_solar: 1,
      conta_com_solar: 1,
      economia_mensal: 0,
    });
    expect(error).toBeNull();
    const { data } = await servico.from("calculos_solares").select("consumo_medio_kwh").eq("negocio_id", negocio).single();
    expect(consumoComoPersistido(bruto)).toBe(data!.consumo_medio_kwh);
    // Idempotente também contra o banco: reenviar o lido não muda.
    expect(consumoComoPersistido(data!.consumo_medio_kwh)).toBe(data!.consumo_medio_kwh);
  });

  it.each([...BATERIA, 0.004, 0.0049, 1e-7, 0])("negocios.consumo_medio_kwh: bruto %s", async (bruto) => {
    const negocio = await novoNegocio(bruto);
    const { data } = await servico.from("negocios").select("consumo_medio_kwh").eq("id", negocio).single();
    expect(consumoComoPersistido(bruto)).toBe(data!.consumo_medio_kwh);
  });
});

// ---------------------------------------------------------------------------
// 3) M2-Q2: novas colunas normalizadas (tarifa, potência, preço, fatura)
// ---------------------------------------------------------------------------

type InsertCalculo = Database["public"]["Tables"]["calculos_solares"]["Insert"];

/** Insere em calculos_solares com valores BRUTOS nas colunas escolhidas (resto fixo e válido). */
async function inserirCalculoBruto(sobrescrever: Partial<InsertCalculo>) {
  const negocio = await novoNegocio();
  await montarKit(negocio);
  const linha: InsertCalculo = {
    empresa_id: empresa,
    negocio_id: negocio,
    kit_nome: "Kit 10 kWp",
    kit_potencia_kwp: 10,
    kit_preco: 30000,
    tipo_ligacao: "bifasico",
    consumo_medio_kwh: 1200,
    tarifa_kwh: 0.9,
    produtividade_kwh_kwp_mes: 120,
    percentual_fio_b: 0.45,
    disponibilidade_kwh: 50,
    geracao_estimada_kwh_mes: 1200,
    kwh_faturado: 50,
    kwh_compensado: 0,
    custo_fio_b: 0,
    conta_sem_solar: 1,
    conta_com_solar: 1,
    economia_mensal: 0,
    ...sobrescrever,
  };
  const { error } = await servico.from("calculos_solares").insert(linha);
  return { negocio, error };
}

describe("M2-Q2: valorComoPersistido bate com o Postgres real nas colunas de calculos_solares", () => {
  it.each([0.123456, 0.95231, 0.00005, 1.23455])("tarifa_kwh numeric(8,4): bruto %s", async (bruto) => {
    const { negocio, error } = await inserirCalculoBruto({ tarifa_kwh: bruto });
    expect(error).toBeNull();
    const { data } = await servico.from("calculos_solares").select("tarifa_kwh").eq("negocio_id", negocio).single();
    expect(data!.tarifa_kwh).toBe(valorComoPersistido(bruto, 4));
  });

  it.each([5.505, 6.1, 0.005])("kit_potencia_kwp numeric(6,2): bruto %s", async (bruto) => {
    const { negocio, error } = await inserirCalculoBruto({ kit_potencia_kwp: bruto });
    expect(error).toBeNull();
    const { data } = await servico.from("calculos_solares").select("kit_potencia_kwp").eq("negocio_id", negocio).single();
    expect(data!.kit_potencia_kwp).toBe(valorComoPersistido(bruto, 2));
  });

  it.each([20000.005, 19999.995])("kit_preco numeric(12,2): bruto %s", async (bruto) => {
    const { negocio, error } = await inserirCalculoBruto({ kit_preco: bruto });
    expect(error).toBeNull();
    const { data } = await servico.from("calculos_solares").select("kit_preco").eq("negocio_id", negocio).single();
    expect(data!.kit_preco).toBe(valorComoPersistido(bruto, 2));
  });

  it.each([1000.005, 999.995])("valor_fatura_medio numeric(12,2): bruto %s", async (bruto) => {
    const { negocio, error } = await inserirCalculoBruto({ valor_fatura_medio: bruto });
    expect(error).toBeNull();
    const { data } = await servico.from("calculos_solares").select("valor_fatura_medio").eq("negocio_id", negocio).single();
    expect(data!.valor_fatura_medio).toBe(valorComoPersistido(bruto, 2));
  });

  it("o banco rejeita (23514) tarifa bruta 0,00004 (normaliza para 0) e o helper também prevê 0", async () => {
    expect(valorComoPersistido(0.00004, 4)).toBe(0);
    const { error } = await inserirCalculoBruto({ tarifa_kwh: 0.00004 });
    expect(error?.code).toBe("23514");
  });

  it("o banco rejeita (23514) potência bruta 0,004 (normaliza para 0) e o helper também prevê 0", async () => {
    expect(valorComoPersistido(0.004, 2)).toBe(0);
    const { error } = await inserirCalculoBruto({ kit_potencia_kwp: 0.004 });
    expect(error?.code).toBe("23514");
  });
});

describe("cálculo reproduzível a partir dos dados salvos", () => {
  let parametros: ParametrosCalculo;

  beforeAll(async () => {
    // Parâmetros reais da empresa (linha criada no nascimento da empresa), com valores controlados pelo teste.
    const { error } = await servico
      .from("parametros_calculadora")
      .update({ produtividade_kwh_kwp_mes: 120, percentual_fio_b: 0.45, disponibilidade_mono_kwh: 30, disponibilidade_bi_kwh: 50, disponibilidade_tri_kwh: 100 })
      .eq("empresa_id", empresa);
    if (error) throw error;
    const { data } = await servico
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_mono_kwh, disponibilidade_bi_kwh, disponibilidade_tri_kwh")
      .eq("empresa_id", empresa)
      .single();
    parametros = data!;
  });

  type Caso = {
    nome: string;
    consumo: number | null;
    fatura: number | null;
    tarifa: number;
    potencia: number;
    tipo: "monofasico" | "bifasico" | "trifasico";
    consumoGravado: number;
    contaSemSolarGravada?: number;
    precoKit?: number;
    tarifaGravada?: number;
    faturaGravada?: number;
    potenciaGravada?: number;
    precoGravado?: number;
  };
  const CASOS: Caso[] = [
    { nome: "tarifa 0,90 e consumo 1500,005", consumo: 1500.005, fatura: null, tarifa: 0.9, potencia: 10, tipo: "bifasico", consumoGravado: 1500.01, contaSemSolarGravada: 1350.01 },
    { nome: "tarifa 0,90 e consumo 800,125", consumo: 800.125, fatura: null, tarifa: 0.9, potencia: 5, tipo: "monofasico", consumoGravado: 800.13, contaSemSolarGravada: 720.12 },
    { nome: "tarifa 0,95 e fatura 1055,55 (consumo 1111,11)", consumo: null, fatura: 1055.55, tarifa: 0.95, potencia: 8, tipo: "trifasico", consumoGravado: 1111.11, contaSemSolarGravada: 1055.55 },
    { nome: "consumo 1200,555", consumo: 1200.555, fatura: null, tarifa: 0.9, potencia: 10, tipo: "bifasico", consumoGravado: 1200.56 },
    { nome: "consumo 1200,554", consumo: 1200.554, fatura: null, tarifa: 0.9, potencia: 10, tipo: "bifasico", consumoGravado: 1200.55 },
    { nome: "consumo 2 casas já exato", consumo: 1234.56, fatura: null, tarifa: 1.0123, potencia: 7.5, tipo: "bifasico", consumoGravado: 1234.56 },
    { nome: "fatura 1000 e tarifa 0,90 (consumo 1111,11)", consumo: null, fatura: 1000, tarifa: 0.9, potencia: 10, tipo: "trifasico", consumoGravado: 1111.11 },
    { nome: "sistema cobre todo o consumo (consumo 300,005)", consumo: 300.005, fatura: null, tarifa: 0.9, potencia: 10, tipo: "monofasico", consumoGravado: 300.01 },
    // M2-Q2: tarifa/potência/preço/fatura com casas excedentes (preço 20000,005 -> 20000,01; potência 5,505 -> 5,51)
    { nome: "tarifa 0,123456 e consumo 800 (tarifa gravada 0,1235)", consumo: 800, fatura: null, tarifa: 0.123456, potencia: 10, tipo: "bifasico", consumoGravado: 800, tarifaGravada: 0.1235 },
    { nome: "tarifa 0,95231 e consumo 800 (tarifa gravada 0,9523)", consumo: 800, fatura: null, tarifa: 0.95231, potencia: 10, tipo: "bifasico", consumoGravado: 800, tarifaGravada: 0.9523 },
    { nome: "fatura 1000 e tarifa 0,95231 (consumo 1050,09)", consumo: null, fatura: 1000, tarifa: 0.95231, potencia: 10, tipo: "bifasico", consumoGravado: 1050.09, tarifaGravada: 0.9523, faturaGravada: 1000 },
    { nome: "potência 5,505, preço 20000,005 e fatura 1000,005 com tarifa 0,5", consumo: null, fatura: 1000.005, tarifa: 0.5, potencia: 5.505, precoKit: 20000.005, tipo: "bifasico", consumoGravado: 2000.02, tarifaGravada: 0.5, faturaGravada: 1000.01, potenciaGravada: 5.51, precoGravado: 20000.01 },
  ];

  function pegarResultados(l: {
    geracao_estimada_kwh_mes: number;
    kwh_faturado: number;
    kwh_compensado: number;
    custo_fio_b: number;
    conta_sem_solar: number;
    conta_com_solar: number;
    economia_mensal: number;
    payback_meses: number | null;
  }) {
    return {
      geracaoEstimadaKwhMes: l.geracao_estimada_kwh_mes,
      kwhFaturado: l.kwh_faturado,
      kwhCompensado: l.kwh_compensado,
      custoFioB: l.custo_fio_b,
      contaSemSolar: l.conta_sem_solar,
      contaComSolar: l.conta_com_solar,
      economiaMensal: l.economia_mensal,
      paybackMeses: l.payback_meses,
    };
  }

  it.each(CASOS)("$nome: calcular(entradaDaLinha(lida)) reproduz EXATAMENTE os resultados lidos; salvar de novo sem editar mantém a linha", async (caso) => {
    const negocio = await novoNegocio();
    await montarKit(negocio);
    const entrada = {
      kitNome: "Kit teste",
      potenciaKwp: caso.potencia,
      precoKit: caso.precoKit ?? 30000,
      tipoLigacao: caso.tipo,
      consumoMedioKwh: caso.consumo,
      valorFaturaMedio: caso.fatura,
      tarifaKwh: caso.tarifa,
    };
    const r = linhaDeCalculo(empresa, entrada, parametros);
    if (!r.ok) throw new Error(r.mensagem);

    const { error } = await servico.from("calculos_solares").insert({ ...r.linha, negocio_id: negocio });
    expect(error).toBeNull();
    const { data: lida } = await servico.from("calculos_solares").select("*").eq("negocio_id", negocio).single();

    // O que a linha prometia gravar é o que o banco guardou (nenhum campo foi re-arredondado pelo banco).
    expect(lida!.consumo_medio_kwh).toBe(caso.consumoGravado);
    expect(lida!.consumo_medio_kwh).toBe(r.linha.consumo_medio_kwh);
    if (caso.contaSemSolarGravada !== undefined) expect(lida!.conta_sem_solar).toBe(caso.contaSemSolarGravada);
    if (caso.tarifaGravada !== undefined) expect(lida!.tarifa_kwh).toBe(caso.tarifaGravada);
    if (caso.faturaGravada !== undefined) expect(lida!.valor_fatura_medio).toBe(caso.faturaGravada);
    if (caso.potenciaGravada !== undefined) expect(lida!.kit_potencia_kwp).toBe(caso.potenciaGravada);
    if (caso.precoGravado !== undefined) expect(lida!.kit_preco).toBe(caso.precoGravado);
    for (const [campo, valor] of Object.entries(r.linha)) {
      expect(lida![campo as keyof typeof lida], campo).toEqual(valor);
    }

    // Reprodução só com os dados salvos: resultado EXATO.
    expect(calcular(entradaDaLinha(lida!))).toEqual(pegarResultados(lida!));

    // (c) Salvar de novo sem editar: consumo gravado vira o consumo informado; mesma linha.
    const r2 = linhaDeCalculo(
      empresa,
      {
        kitNome: lida!.kit_nome,
        potenciaKwp: lida!.kit_potencia_kwp,
        precoKit: lida!.kit_preco,
        tipoLigacao: lida!.tipo_ligacao,
        consumoMedioKwh: lida!.consumo_medio_kwh,
        valorFaturaMedio: lida!.valor_fatura_medio,
        tarifaKwh: lida!.tarifa_kwh,
      },
      parametros,
    );
    if (!r2.ok) throw new Error(r2.mensagem);
    expect(r2.linha).toEqual(r.linha);

    const { error: erroUpdate } = await servico.from("calculos_solares").update(r2.linha).eq("negocio_id", negocio);
    expect(erroUpdate).toBeNull();
    const { data: relida } = await servico.from("calculos_solares").select("*").eq("negocio_id", negocio).single();
    for (const [campo, valor] of Object.entries(r2.linha)) {
      expect(relida![campo as keyof typeof relida], campo).toEqual(valor);
    }
    expect(calcular(entradaDaLinha(relida!))).toEqual(pegarResultados(relida!));
  });
});
