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
