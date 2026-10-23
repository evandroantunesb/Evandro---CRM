/**
 * M2-Q1/Q2 (B), reescrito na M2-Q6 (mudança de requisito, escopo congelado): o motor `calcular` devolve SEMPRE a
 * estimativa incompleta, então `linhaDeCalculo` NUNCA gera linha FINANCEIRA de `calculos_solares`: devolve
 * `{ ok:false, incompleta:true, mensagem, pendencias, potenciaKwp, geracaoEstimadaKwhMes, linha }`, em que `linha` é o
 * resultado técnico com `estado_financeiro = 'incompleto'` (financeiros e payback nulos; migration 20261023200000) ou
 * `null` para conta em R$ sem kWh. Entrada inválida continua sendo erro comum (sem `incompleta`). O dimensionamento
 * (decisão D1) continua intacto.
 *
 * As escalas das colunas de `calculos_solares` (tarifa 5 casas desde 20261023210000, potência/preço/fatura/consumo 2 casas) continuam
 * conferidas nos limites de validação abaixo (o que a normalização transforma em 0 é recusado) e, para linhas
 * legadas gravadas, em tests/calculadora-persistencia-db.test.ts. A reprodução "calcular(entradaDaLinha(linha)) ==
 * linha" deixou de existir: a linha existente é da fórmula antiga e não é reproduzível pelo motor.
 */
import { describe, expect, it } from "vitest";
import { calcular, dimensionarSistema, sugerirQuantidadeModulos } from "@/lib/calculadora";
import {
  consumoComoPersistido,
  entradaDaLinha,
  linhaDeCalculo,
  mensagemEstimativaIncompleta,
  pendenciasDaEntrada,
  type ResultadoLinha,
} from "@/lib/calculo-reproduzivel";

const EMPRESA = "00000000-0000-0000-0000-0000000000aa";

const PARAMETROS = {
  produtividade_kwh_kwp_mes: 120,
  percentual_fio_b: 0.45,
  disponibilidade_mono_kwh: 30,
  disponibilidade_bi_kwh: 50,
  disponibilidade_tri_kwh: 100,
};

const ENTRADA_BASE = {
  kitNome: "Kit 10 kWp",
  potenciaKwp: 10,
  precoKit: 30000,
  tipoLigacao: "bifasico" as "monofasico" | "bifasico" | "trifasico",
  consumoMedioKwh: 1200 as number | null,
  valorFaturaMedio: null as number | null,
  tarifaKwh: 0.9,
};

type SobrescreverEntrada = Partial<typeof ENTRADA_BASE>;

function resultado(sobrescrever: SobrescreverEntrada = {}, parametros: typeof PARAMETROS | null = PARAMETROS): ResultadoLinha {
  return linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, ...sobrescrever }, parametros);
}

type Incompleta = Extract<ResultadoLinha, { incompleta: true }>;

/** Exige a estimativa incompleta (nunca linha, nunca erro comum). */
function incompleta(sobrescrever: SobrescreverEntrada = {}, parametros: typeof PARAMETROS | null = PARAMETROS): Incompleta {
  const r = resultado(sobrescrever, parametros);
  if (r.ok) throw new Error("linhaDeCalculo gerou uma linha: o motor nunca deveria produzir cálculo completo");
  if (r.incompleta !== true) throw new Error(`esperava estimativa incompleta, veio o erro comum: ${r.mensagem}`);
  return r;
}

const codigosDe = (r: Incompleta) => r.pendencias.map((p) => p.codigo);

// Sem contexto regulatório (enquadramento/distribuidora da qualificação) nem base declarada: incompleta.
const CODIGOS_DA_EMPRESA = ["enquadramento_ausente", "distribuidora_ausente", "base_tributaria_ausente"];

const MENSAGEM_BASE =
  "Estimativa financeira incompleta: Informe o tipo de cliente na Qualificação SDR (a estimativa cobre cliente residencial); " +
  "Informe a distribuidora de energia na Qualificação SDR; Declare se a tarifa informada inclui tributos.";

describe("consumoComoPersistido (numeric(10,2), half away from zero, semântica decimal)", () => {
  it.each([
    [1200.555, 1200.56],
    [1200.554, 1200.55],
    [1200.5, 1200.5],
    [0.005, 0.01],
    [1.005, 1.01], // Math.round(1.005 * 100) / 100 daria 1,00: detecta erro de ponto flutuante
    [2.675, 2.68],
    [1111.111111, 1111.11],
  ])("%s -> %s", (entrada, esperado) => {
    expect(consumoComoPersistido(entrada)).toBe(esperado);
  });

  it.each([0, 1, 1200, 99999999])("inteiro %s fica inalterado", (n) => {
    expect(consumoComoPersistido(n)).toBe(n);
  });

  it("é idempotente", () => {
    for (const v of [1200.555, 1.005, 0.005, 2.675, 1111.111111, 1200, 0.1 + 0.2, 123.456789]) {
      const uma = consumoComoPersistido(v);
      expect(consumoComoPersistido(uma)).toBe(uma);
    }
  });
});

/** Resultado sem a linha técnica (o que o motor decide; a linha só registra as entradas). */
const semLinha = ({ linha, ...resto }: Incompleta) => (void linha, resto);

describe("linhaDeCalculo: estimativa incompleta, só o resultado técnico", () => {
  it("entrada completa do vendedor (consumo em kWh e tarifa): incompleta, linha técnica, com a mensagem exata", () => {
    const r = incompleta();
    expect(r.ok).toBe(false);
    expect(codigosDe(r)).toEqual(CODIGOS_DA_EMPRESA);
    expect(r.mensagem).toBe(MENSAGEM_BASE);
    expect(r.mensagem).toBe(mensagemEstimativaIncompleta(r.pendencias));
    expect(r.potenciaKwp).toBe(10);
    expect(r.geracaoEstimadaKwhMes).toBe(1200); // 10 kWp × 120 kWh/kWp/mês
    expect(r.linha).toEqual({
      empresa_id: EMPRESA,
      kit_id: null,
      kit_nome: "Kit 10 kWp",
      kit_potencia_kwp: 10,
      kit_preco: 30000,
      tipo_ligacao: "bifasico",
      consumo_medio_kwh: 1200,
      valor_fatura_medio: null,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.45,
      disponibilidade_kwh: 50,
      geracao_estimada_kwh_mes: 1200,
      estado_financeiro: "incompleto",
      pendencias: r.pendencias,
      metodo_calculo: null,
      kwh_faturado: null,
      kwh_compensado: null,
      kwh_nao_compensado: null,
      custo_fio_b: null,
      conta_sem_solar: null,
      conta_com_solar: null,
      economia_mensal: null,
      payback_meses: null,
      autoconsumo_kwh: null,
      ressalvas: null,
      // Novas entradas registradas mesmo incompleta (sem contexto: só tarifa e origem; base não declarada).
      data_referencia: null,
      tarifa_base_tributaria: null,
      tarifa_origem: "informada_vendedor",
      percentual_legal_fio_b: null,
      tarifa_gd_id: null,
      distribuidora: null,
      enquadramento: null,
      fio_b_rs_mwh: null,
      fio_b_base_tributaria: null,
      fio_b_vigencia_inicio: null,
      fio_b_vigencia_fim: null,
      financeiro_desatualizado_em: null,
      financeiro_desatualizado_motivo: null,
    });
  });

  it("nenhum campo financeiro vaza no resultado: na linha, todos nulos (ausência nunca vira zero)", () => {
    const r = incompleta();
    expect(Object.keys(r).sort()).toEqual(["geracaoEstimadaKwhMes", "incompleta", "linha", "mensagem", "ok", "pendencias", "potenciaKwp"]);
    const l = r.linha!;
    for (const campo of ["kwh_faturado", "kwh_compensado", "custo_fio_b", "conta_sem_solar", "conta_com_solar", "economia_mensal", "payback_meses"] as const) {
      expect(l[campo], campo).toBeNull();
    }
    expect(l.metodo_calculo).toBeNull();
  });

  // ANTES (conta em R$ sem kWh): `{ok:false, incompleta:true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA}` sem pendências.
  // AGORA: mesma ideia (nunca deriva consumo da fatura ÷ tarifa base), mas com a lista de pendências.
  it("conta em R$ sem consumo em kWh: incompleta, nunca deriva consumo da fatura ÷ tarifa base", () => {
    const r = incompleta({ consumoMedioKwh: null, valorFaturaMedio: 1000 });
    expect(codigosDe(r)).toEqual([
      "enquadramento_ausente",
      "distribuidora_ausente",
      "consumo_ausente",
      "consumo_estimado_pela_tarifa_base",
      "base_tributaria_ausente",
    ]);
    expect(r.mensagem).toContain("Informe o consumo médio em kWh");
    expect(r.mensagem).toContain("O consumo veio do valor da conta em R$");
    expect(r.geracaoEstimadaKwhMes).toBe(1200);
  });

  it("consumo em kWh informado não gera as pendências de consumo, mesmo com fatura (informado vence a fatura)", () => {
    const r = incompleta({ consumoMedioKwh: 500, valorFaturaMedio: 1000 });
    expect(codigosDe(r)).toEqual(CODIGOS_DA_EMPRESA);
  });

  it("consumo informado com casas excedentes (1200,555) é aceito: incompleta, não erro", () => {
    expect(codigosDe(incompleta({ consumoMedioKwh: 1200.555 }))).toEqual(CODIGOS_DA_EMPRESA);
  });

  it("sem parâmetros e sem consumo em kWh: incompleta com geração indisponível (null), não o erro de parâmetros", () => {
    const r = incompleta({ consumoMedioKwh: null, valorFaturaMedio: 1000 }, null);
    expect(r.geracaoEstimadaKwhMes).toBeNull();
    expect(r.potenciaKwp).toBe(10);
  });

  it("potência é normalizada para 2 casas no resultado (5,505 -> 5,51) e a geração usa a potência normalizada", () => {
    const r = incompleta({ potenciaKwp: 5.505 });
    expect(r.potenciaKwp).toBe(5.51);
    expect(r.geracaoEstimadaKwhMes).toBe(661.2); // 5,51 × 120
  });

  it("potência 5,504 -> 5,5 e geração 660", () => {
    const r = incompleta({ potenciaKwp: 5.504 });
    expect(r.potenciaKwp).toBe(5.5);
    expect(r.geracaoEstimadaKwhMes).toBe(660);
  });

  it.each(["monofasico", "bifasico", "trifasico"] as const)(
    "tipo de ligação %s e preço não mudam o resultado (percentual e disponibilidade não têm efeito)",
    (tipoLigacao) => {
      const ref = semLinha(incompleta());
      const r = incompleta({ tipoLigacao, precoKit: 1 });
      expect(semLinha(r)).toEqual(ref);
      expect(semLinha(r)).toEqual(
        semLinha(
          incompleta(
            { tipoLigacao },
            { ...PARAMETROS, percentual_fio_b: 0.99, disponibilidade_mono_kwh: 1, disponibilidade_bi_kwh: 2, disponibilidade_tri_kwh: 3 },
          ),
        ),
      );
      // A linha técnica registra o que foi informado (ligação e preço), sem efeito no resultado.
      expect(r.linha).toMatchObject({ tipo_ligacao: tipoLigacao, kit_preco: 1, economia_mensal: null });
    },
  );

  it("preço 0 e preço com casas excedentes são aceitos (incompleta), como antes aceitavam", () => {
    expect(codigosDe(incompleta({ precoKit: 0 }))).toEqual(CODIGOS_DA_EMPRESA);
    expect(codigosDe(incompleta({ precoKit: 19999.995 }))).toEqual(CODIGOS_DA_EMPRESA);
  });

  it("é determinístico e o motor concorda: calcular(entradaDaLinha-equivalente) também é incompleta", () => {
    expect(incompleta()).toEqual(incompleta());
    const motor = calcular({
      potenciaKwp: 10,
      precoKit: 30000,
      tipoLigacao: "bifasico",
      consumoMedioKwh: 1200,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
    });
    expect(motor.estado).toBe("incompleta");
  });
});

describe("pendenciasDaEntrada e entradaDaLinha", () => {
  it("sem consumo nem fatura: consumo ausente, sem a pendência de conta em R$", () => {
    const c = pendenciasDaEntrada({ consumoMedioKwh: null, valorFaturaMedio: null, tarifaKwh: 0.9 }).map((p) => p.codigo);
    expect(c).toContain("consumo_ausente");
    expect(c).not.toContain("consumo_estimado_pela_tarifa_base");
    expect(c).toContain("base_tributaria_ausente");
  });

  it("sem tarifa: tarifa_base_ausente", () => {
    const c = pendenciasDaEntrada({ consumoMedioKwh: 300, valorFaturaMedio: null, tarifaKwh: null }).map((p) => p.codigo);
    expect(c).toContain("tarifa_base_ausente");
    expect(c).not.toContain("consumo_ausente");
  });

  it("entradaDaLinha só repassa os valores gravados da linha (uso restante: linha legada)", () => {
    expect(
      entradaDaLinha({
        kit_potencia_kwp: 5.5,
        kit_preco: 20000,
        tipo_ligacao: "trifasico",
        consumo_medio_kwh: 400,
        tarifa_kwh: 0.9,
        produtividade_kwh_kwp_mes: 120,
        percentual_fio_b: 0.6,
        disponibilidade_kwh: 100,
      }),
    ).toEqual({
      potenciaKwp: 5.5,
      precoKit: 20000,
      tipoLigacao: "trifasico",
      consumoMedioKwh: 400,
      tarifaKwh: 0.9,
      produtividadeKwhKwpMes: 120,
      percentualFioB: 0.6,
      disponibilidadeKwh: 100,
    });
  });
});

/**
 * D2 (decidido por Nora, autorizada pelo Evandro): `linhaDeCalculo` normaliza tarifa (5 casas), potência, preço e
 * fatura (2 casas) ANTES de calcular. Os valores esperados abaixo são a regra de escala do banco (half away from
 * zero decimal) calculada à mão.
 */
describe("D2: linhaDeCalculo normaliza as entradas persistidas (sem gravar linha nova)", () => {
  // ANTES: estes testes conferiam o que era GRAVADO na linha (tarifa 0,1235; 0,9523; fatura 1000,01; consumo derivado
  // da fatura etc.) e a reprodução pelo motor. AGORA não há linha nova: o que resta da normalização é (a) o que ela
  // transforma em 0 continua recusado (ver "validações" abaixo) e (b) a potência normalizada devolvida. A escala das
  // colunas gravadas segue testada em tests/calculadora-persistencia-db.test.ts com linhas legadas de fixture.

  it("potência 6,1 e 7,775 (-> 7,78): potência normalizada e geração sobre a potência normalizada", () => {
    expect(incompleta({ potenciaKwp: 6.1 }).potenciaKwp).toBe(6.1);
    const r = incompleta({ potenciaKwp: 7.775 });
    expect(r.potenciaKwp).toBe(7.78);
    expect(r.geracaoEstimadaKwhMes).toBe(933.6); // 7,78 × 120
  });

  it.each([
    [1000, 0.95231],
    [1000.005, 0.5],
    [999.995, 0.7],
  ])("fatura %s e tarifa %s sem consumo em kWh: estimativa incompleta (nunca consumo derivado)", (fatura, tarifa) => {
    const r = incompleta({ consumoMedioKwh: null, valorFaturaMedio: fatura, tarifaKwh: tarifa });
    expect(codigosDe(r)).toContain("consumo_ausente");
    expect(codigosDe(r)).toContain("consumo_estimado_pela_tarifa_base");
    // Sem kWh não há linha técnica (a coluna de consumo exige kWh): nada é gravado.
    expect(r.linha).toBeNull();
  });

  it("todas as entradas com excesso de casas ao mesmo tempo continuam aceitas (incompleta, sem erro)", () => {
    const r = incompleta({ potenciaKwp: 7.775, precoKit: 25999.995, tarifaKwh: 0.95231, consumoMedioKwh: 987.655 });
    expect(codigosDe(r)).toEqual(CODIGOS_DA_EMPRESA);
    expect(r.potenciaKwp).toBe(7.78);
  });
});

describe("linhaDeCalculo: validações e ordem dos erros", () => {
  const ERRO_ENTRADA = "Informe o consumo médio ou o valor médio da fatura.";
  const ERRO_POTENCIA = "Informe ao menos um módulo com potência para calcular.";
  const ERRO_TARIFA = "Informe uma tarifa maior que zero (o banco guarda 5 casas).";
  const ERRO_PRECO = "Informe um preço do kit válido (maior ou igual a zero).";
  const ERRO_CONSUMO = "Informe um consumo maior que zero (o banco guarda 2 casas).";
  const ERRO_PARAMETROS = "Parâmetros da calculadora não configurados.";

  function mensagem(sobrescrever: Partial<typeof ENTRADA_BASE>, parametros: typeof PARAMETROS | null = PARAMETROS) {
    const r = linhaDeCalculo(EMPRESA, { ...ENTRADA_BASE, ...sobrescrever }, parametros);
    expect(r.ok).toBe(false);
    return r.ok ? null : r.mensagem;
  }

  it("sem consumo nem fatura", () => {
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: null })).toBe(ERRO_ENTRADA);
  });

  it.each([0, -1])("potência %s", (potenciaKwp) => {
    expect(mensagem({ potenciaKwp })).toBe(ERRO_POTENCIA);
  });

  it("potência 0,004 (normaliza para 0) devolve o erro de potência", () => {
    expect(mensagem({ potenciaKwp: 0.004 })).toBe(ERRO_POTENCIA);
  });

  it("potência 0,005 (normaliza para 0,01) é aceita", () => {
    expect(incompleta({ potenciaKwp: 0.005 }).potenciaKwp).toBe(0.01);
  });

  it("tarifa 0,000004 (normaliza para 0) devolve o erro de tarifa; 0 e negativa também", () => {
    expect(mensagem({ tarifaKwh: 0.000004 })).toBe(ERRO_TARIFA);
    expect(mensagem({ tarifaKwh: 0 })).toBe(ERRO_TARIFA);
    expect(mensagem({ tarifaKwh: -0.5 })).toBe(ERRO_TARIFA);
  });

  it("tarifa 0,000005 (normaliza para 0,00001) é aceita", () => {
    // Aceita (não é o erro de tarifa): estimativa incompleta.
    expect(codigosDe(incompleta({ tarifaKwh: 0.000005 }))).toEqual(CODIGOS_DA_EMPRESA);
  });

  it("preço -1 devolve o erro de preço", () => {
    expect(mensagem({ precoKit: -1 })).toBe(ERRO_PRECO);
  });

  it("consumo informado 0,004 (normaliza para 0) devolve o erro de consumo", () => {
    expect(mensagem({ consumoMedioKwh: 0.004 })).toBe(ERRO_CONSUMO);
  });

  it("consumo informado 0 devolve o erro de consumo", () => {
    expect(mensagem({ consumoMedioKwh: 0 })).toBe(ERRO_CONSUMO);
  });

  // ALTERADO: antes devolvia ERRO_CONSUMO (consumo derivado = 0). Sem derivacao, conta em R$ sem kWh e
  // estimativa incompleta, mesmo com fatura que normaliza para 0.
  it("fatura 0,004 com tarifa 1 sem consumo em kWh devolve estimativa incompleta (não mais o erro de consumo)", () => {
    const r = incompleta({ consumoMedioKwh: null, valorFaturaMedio: 0.004, tarifaKwh: 1 });
    expect(codigosDe(r)).toContain("consumo_estimado_pela_tarifa_base");
    expect(r.mensagem).not.toBe(ERRO_CONSUMO);
  });

  it("estimativa incompleta não é erro de entrada: só aparece com entrada válida (potência, tarifa e preço ok)", () => {
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, potenciaKwp: 0 })).toBe(ERRO_POTENCIA);
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, tarifaKwh: 0 })).toBe(ERRO_TARIFA);
    expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: 1000, precoKit: -1 })).toBe(ERRO_PRECO);
  });

  it("parâmetros nulos com entrada válida devolvem o erro de parâmetros", () => {
    expect(mensagem({}, null)).toBe(ERRO_PARAMETROS);
  });

  describe("ordem: (1) entrada, (2) potência, (3) tarifa, (4) preço, (5) consumo, (6) parâmetros", () => {
    it("potência inválida e parâmetros nulos: erro de potência, não o de parâmetros", () => {
      expect(mensagem({ potenciaKwp: 0 }, null)).toBe(ERRO_POTENCIA);
      expect(mensagem({ potenciaKwp: 0.004 }, null)).toBe(ERRO_POTENCIA);
    });

    it("sem consumo/fatura e potência inválida: erro de entrada vem primeiro", () => {
      expect(mensagem({ consumoMedioKwh: null, valorFaturaMedio: null, potenciaKwp: 0 })).toBe(ERRO_ENTRADA);
    });

    it("potência e tarifa inválidas: potência primeiro", () => {
      expect(mensagem({ potenciaKwp: 0.004, tarifaKwh: 0 })).toBe(ERRO_POTENCIA);
    });

    it("tarifa e preço inválidos: tarifa primeiro", () => {
      expect(mensagem({ tarifaKwh: 0.000004, precoKit: -1 })).toBe(ERRO_TARIFA);
    });

    it("preço e consumo inválidos: preço primeiro", () => {
      expect(mensagem({ precoKit: -1, consumoMedioKwh: 0.004 })).toBe(ERRO_PRECO);
    });

    it("consumo inválido e parâmetros nulos: erro de consumo", () => {
      expect(mensagem({ consumoMedioKwh: 0.004 }, null)).toBe(ERRO_CONSUMO);
    });

    it("tarifa inválida e parâmetros nulos: erro de tarifa", () => {
      expect(mensagem({ tarifaKwh: 0 }, null)).toBe(ERRO_TARIFA);
    });
  });
});

/**
 * ACHADO A1 — DECIDIDO (D1, Nora autorizada pelo Evandro): `dimensionarSistema` normaliza o consumo com
 * `consumoComoPersistido` na entrada, ou seja, dimensiona com o consumo COMO SERÁ GRAVADO. Antes da decisão, o
 * dimensionamento usava o consumo digitado e divergia do dimensionamento refeito do dado salvo (1190,404 -> 17 x 16).
 *
 * Com produtividade 120 kWh/kWp/mês e módulo de 620 W, 16 módulos cobrem exatamente 120 x 0,62 x 16 = 1190,4 kWh:
 * 1190,396 -> 16; 1190,40 -> 16; 1190,404 -> 16 (antes 17); 1190,405 -> 17 (vira 1190,41); 1190,41 -> 17;
 * consumo 0,004 normaliza para 0 e devolve null (antes dava 1 módulo). Entrada inválida continua null.
 */
describe("A1 (decidido em D1): dimensionamento usa o consumo como persistido", () => {
  const PRODUTIVIDADE = 120;
  const MODULO_W = 620;
  const modulos = (consumo: number) => sugerirQuantidadeModulos(consumo, PRODUTIVIDADE, MODULO_W);

  it.each([
    [1190.396, 16],
    [1190.4, 16],
    [1190.404, 16],
    [1190.405, 17],
    [1190.41, 17],
  ])("consumo %s -> %s módulos", (consumo, esperado) => {
    expect(modulos(consumo)).toBe(esperado);
  });

  it("1190,404 digitado e o gravado (1190,40) dão o mesmo número de módulos (a divergência acabou)", () => {
    const gravado = consumoComoPersistido(1190.404);
    expect(gravado).toBe(1190.4);
    expect(modulos(1190.404)).toBe(modulos(gravado));
  });

  it("consumo 0,004 normaliza para 0 e devolve null (antes dava 1 módulo)", () => {
    expect(consumoComoPersistido(0.004)).toBe(0);
    expect(modulos(0.004)).toBeNull();
    expect(dimensionarSistema(0.004, PRODUTIVIDADE, MODULO_W)).toBeNull();
  });

  it("consumo 0,005 normaliza para 0,01 e dá 1 módulo", () => {
    expect(modulos(0.005)).toBe(1);
  });

  it.each([
    [0, 120, 620],
    [-5, 120, 620],
    [Number.NaN, 120, 620],
    [1000, 0, 620],
    [1000, -1, 620],
    [1000, 120, 0],
    [1000, 120, -620],
    [1000, Number.NaN, 620],
    [1000, 120, Number.NaN],
  ])("entrada inválida (consumo %s, produtividade %s, módulo %s) continua null", (c, p, m) => {
    expect(sugerirQuantidadeModulos(c, p, m)).toBeNull();
    expect(dimensionarSistema(c, p, m)).toBeNull();
  });

  // Achado resolvido (M2-Q2): consumo não finito devolvia quantidade Infinity; agora devolve null.
  it("consumo +Infinity devolve null (entrada não finita)", () => {
    expect(sugerirQuantidadeModulos(Number.POSITIVE_INFINITY, 120, 620)).toBeNull();
  });

  // D1/Nora: entrada inválida ou não finita -> null, direto em dimensionarSistema.
  it.each([
    ["consumo +Infinity", Number.POSITIVE_INFINITY, 120, 620],
    ["consumo -Infinity", Number.NEGATIVE_INFINITY, 120, 620],
    ["consumo NaN", Number.NaN, 120, 620],
    ["produtividade +Infinity", 1200, Number.POSITIVE_INFINITY, 620],
    ["produtividade NaN", 1200, Number.NaN, 620],
    ["potência do módulo +Infinity", 1200, 120, Number.POSITIVE_INFINITY],
    ["potência do módulo NaN", 1200, 120, Number.NaN],
  ])("dimensionarSistema: %s devolve null", (_rotulo, c, p, m) => {
    expect(dimensionarSistema(c, p, m)).toBeNull();
  });

  it("contraste: dimensionarSistema com entradas finitas e positivas (1200, 120, 620) não devolve null (17 módulos)", () => {
    const r = dimensionarSistema(1200, 120, 620);
    expect(r).not.toBeNull();
    expect(r?.quantidadeModulos).toBe(17);
  });

  it("varredura densa ao redor de TODOS os limites 74,4 x k (k = 1..40): digitado === persistido e confere com oráculo inteiro", () => {
    // Consumos em milésimos inteiros (n / 1000 é o decimal exato de 3 casas): evita artefato de ponto flutuante em 74,4 x k.
    // Oráculo independente, só com inteiros: centésimos persistidos = floor((n + 5) / 10) (half up, n > 0);
    // um módulo cobre 120 x 0,62 = 74,4 kWh = 7440 centésimos, então módulos = max(1, ceil(centésimos / 7440)) e 0 centésimo = null.
    const deltas = [-10, -6, -5, -4, -1, 0, 1, 3, 4, 5, 6, 9, 10];
    const problemas: string[] = [];
    let verificados = 0;
    for (let k = 1; k <= 40; k++) {
      const limiteMilesimos = 74400 * k; // L = 74,4 x k
      for (const d of deltas) {
        const n = limiteMilesimos + d;
        const x = n / 1000;
        const centesimos = Math.floor((n + 5) / 10);
        const esperado = centesimos === 0 ? null : Math.max(1, Math.ceil(centesimos / 7440));
        const direto = modulos(x);
        const viaPersistido = modulos(consumoComoPersistido(x));
        verificados++;
        if (direto !== viaPersistido || direto !== esperado) {
          problemas.push(`k=${k} x=${x}: direto=${direto} persistido=${viaPersistido} esperado=${esperado}`);
        }
      }
    }
    expect(verificados).toBe(40 * deltas.length);
    expect({ total: problemas.length, amostra: problemas.slice(0, 10) }).toEqual({ total: 0, amostra: [] });
  });

  // ANTES: a linha gravada de 1190,404 trazia consumo 1190,40 e potência 10,54. AGORA não há linha: o consumo
  // 1190,404 é aceito (incompleta) e o resultado traz a potência normalizada do kit de 17 módulos.
  it("o consumo 1190,404 é aceito e o kit de 17 módulos devolve a potência normalizada 10,54 e a geração 1264,8", () => {
    const r = incompleta({ potenciaKwp: 17 * 0.62, consumoMedioKwh: 1190.404, tarifaKwh: 0.9 });
    expect(r.potenciaKwp).toBe(10.54);
    expect(r.geracaoEstimadaKwhMes).toBe(1264.8);
    expect(codigosDe(r)).not.toContain("consumo_ausente");
  });
});
