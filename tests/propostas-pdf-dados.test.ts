import { describe, expect, it } from "vitest";
import { montarDadosSistemaProposta } from "@/lib/propostas/pdf-dados";

describe("montarDadosSistemaProposta", () => {
  it("junta endereço, cidade e uf num único texto, ignorando partes vazias", () => {
    const dados = montarDadosSistemaProposta({
      contato: { nome: "Cliente Teste", endereco: "Rua A, 1", cidade: "Cascavel", uf: null },
      calculo: {
        kit_nome: "Kit 5 kWp",
        kit_potencia_kwp: 5,
        tipo_ligacao: "bifasico",
        consumo_medio_kwh: 400,
        geracao_estimada_kwh_mes: 500,
        conta_sem_solar: 400,
        conta_com_solar: 100,
        economia_mensal: 300,
        payback_meses: 40,
        kit_preco: 20000,
      },
      modoPreco: "completo",
      componentes: [],
    });
    expect(dados.clienteEndereco).toBe("Rua A, 1 · Cascavel");
  });

  it("devolve null pro endereço quando não há nenhuma parte", () => {
    const dados = montarDadosSistemaProposta({
      contato: { nome: "Cliente Teste", endereco: null, cidade: null, uf: null },
      calculo: {
        kit_nome: "Kit 5 kWp",
        kit_potencia_kwp: 5,
        tipo_ligacao: "monofasico",
        consumo_medio_kwh: 400,
        geracao_estimada_kwh_mes: 500,
        conta_sem_solar: 400,
        conta_com_solar: 100,
        economia_mensal: 300,
        payback_meses: null,
        kit_preco: 20000,
      },
      modoPreco: "sem_preco",
      componentes: [{ tipo: "modulo", descricao: "Módulo X", quantidade: 8, potencia_w: 550 }],
    });
    expect(dados.clienteEndereco).toBeNull();
    expect(dados.componentes).toEqual([{ tipo: "modulo", descricao: "Módulo X", quantidade: 8, potenciaW: 550 }]);
  });
});

/** Entrada fictícia completa, para comparar com e sem a flag `desatualizado`. */
const ENTRADA = {
  contato: { nome: "Cliente Teste", endereco: "Rua A, 1", cidade: "Cascavel", uf: "PR" },
  calculo: {
    kit_nome: "Kit 5,5 kWp",
    kit_potencia_kwp: 5.5,
    tipo_ligacao: "bifasico" as const,
    consumo_medio_kwh: 500,
    geracao_estimada_kwh_mes: 660,
    conta_sem_solar: 450,
    conta_com_solar: 227.25,
    economia_mensal: 222.75,
    payback_meses: 112.2,
    kit_preco: 25000,
  },
  modoPreco: "completo" as const,
  componentes: [
    { tipo: "modulo" as const, descricao: "Módulo 550 W", quantidade: 10, potencia_w: 550 },
    { tipo: "inversor" as const, descricao: "Inversor 5 kW", quantidade: 1, potencia_w: 5000 },
  ],
};

describe("montarDadosSistemaProposta: cálculo desatualizado", () => {
  it("desatualizado: true zera potência, consumo, geração, contas, economia e payback e mantém o resto", () => {
    const dados = montarDadosSistemaProposta({ ...ENTRADA, desatualizado: true });
    expect(dados).toEqual({
      desatualizado: true,
      clienteNome: "Cliente Teste",
      clienteEndereco: "Rua A, 1 · Cascavel · PR",
      kitNome: "Kit 5,5 kWp",
      tipoLigacao: "bifasico",
      modoPreco: "completo",
      kitPreco: 25000,
      componentes: [
        { tipo: "modulo", descricao: "Módulo 550 W", quantidade: 10, potenciaW: 550 },
        { tipo: "inversor", descricao: "Inversor 5 kW", quantidade: 1, potenciaW: 5000 },
      ],
      kitPotenciaKwp: null,
      consumoMedioKwh: null,
      geracaoEstimadaKwhMes: null,
      contaSemSolar: null,
      contaComSolar: null,
      economiaMensal: null,
      paybackMeses: null,
    });
  });

  it("os valores do cálculo antigo não vazam para nenhum campo da saída desatualizada", () => {
    const texto = JSON.stringify(montarDadosSistemaProposta({ ...ENTRADA, desatualizado: true }));
    for (const antigo of ["5.5", "660", "227.25", "222.75", "112.2", '"consumoMedioKwh":500', '"contaSemSolar":450']) {
      expect(texto, antigo).not.toContain(antigo);
    }
  });

  it("sem a flag (ausente ou false) a saída é a de sempre, sem o campo desatualizado", () => {
    const esperado = {
      clienteNome: "Cliente Teste",
      clienteEndereco: "Rua A, 1 · Cascavel · PR",
      kitNome: "Kit 5,5 kWp",
      tipoLigacao: "bifasico",
      modoPreco: "completo",
      kitPreco: 25000,
      componentes: [
        { tipo: "modulo", descricao: "Módulo 550 W", quantidade: 10, potenciaW: 550 },
        { tipo: "inversor", descricao: "Inversor 5 kW", quantidade: 1, potenciaW: 5000 },
      ],
      kitPotenciaKwp: 5.5,
      consumoMedioKwh: 500,
      geracaoEstimadaKwhMes: 660,
      contaSemSolar: 450,
      contaComSolar: 227.25,
      economiaMensal: 222.75,
      paybackMeses: 112.2,
    };
    expect(montarDadosSistemaProposta(ENTRADA)).toEqual(esperado);
    expect(montarDadosSistemaProposta({ ...ENTRADA, desatualizado: false })).toEqual(esperado);
    expect(montarDadosSistemaProposta(ENTRADA)).not.toHaveProperty("desatualizado");
  });

  // M2-Q6: nulo = "sem dado" (nunca vira zero); zero verdadeiro continua zero.
  it("campos anuláveis: potência, consumo, geração, contas, economia, payback e preço nulos seguem nulos (nunca 0)", () => {
    const dados = montarDadosSistemaProposta({
      ...ENTRADA,
      calculo: {
        kit_nome: "Kit sem números",
        kit_potencia_kwp: null,
        tipo_ligacao: "bifasico",
        consumo_medio_kwh: null,
        geracao_estimada_kwh_mes: null,
        conta_sem_solar: null,
        conta_com_solar: null,
        economia_mensal: null,
        payback_meses: null,
        kit_preco: null,
      },
    });
    expect(dados).toMatchObject({
      kitPotenciaKwp: null,
      consumoMedioKwh: null,
      geracaoEstimadaKwhMes: null,
      contaSemSolar: null,
      contaComSolar: null,
      economiaMensal: null,
      paybackMeses: null,
      kitPreco: null,
    });
    for (const campo of ["kitPotenciaKwp", "consumoMedioKwh", "geracaoEstimadaKwhMes", "contaSemSolar", "contaComSolar", "economiaMensal", "paybackMeses", "kitPreco"] as const) {
      expect(dados[campo], campo).toBeNull();
    }
  });

  it("zero verdadeiro (economia 0) não é confundido com 'sem dado'", () => {
    const dados = montarDadosSistemaProposta({ ...ENTRADA, calculo: { ...ENTRADA.calculo, economia_mensal: 0, payback_meses: null } });
    expect(dados.economiaMensal).toBe(0);
    expect(dados.paybackMeses).toBeNull();
  });

  it("com a flag desatualizado e preço nulo, o preço continua nulo", () => {
    const dados = montarDadosSistemaProposta({ ...ENTRADA, calculo: { ...ENTRADA.calculo, kit_preco: null }, desatualizado: true });
    expect(dados.kitPreco).toBeNull();
    expect(dados.economiaMensal).toBeNull();
  });

  it("desatualizado não altera a entrada e mantém payback nulo do cálculo vigente como nulo", () => {
    const antes = structuredClone(ENTRADA);
    montarDadosSistemaProposta({ ...ENTRADA, desatualizado: true });
    expect(ENTRADA).toEqual(antes);
    const vigenteSemPayback = montarDadosSistemaProposta({ ...ENTRADA, calculo: { ...ENTRADA.calculo, payback_meses: null } });
    expect(vigenteSemPayback.paybackMeses).toBeNull();
    expect(vigenteSemPayback.economiaMensal).toBe(222.75);
  });
});
