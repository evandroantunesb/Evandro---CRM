import type { DadosSistemaProposta } from "./pdf-tipos";

/**
 * Dados fictícios usados só na pré-visualização de um modelo (Configurações →
 * Propostas comerciais), antes de o modelo estar ligado a um negócio real
 * (isso vem na próxima entrega). Nunca usar fora de uma pré-visualização.
 */
export function dadosDeAmostraProposta(): DadosSistemaProposta {
  return {
    clienteNome: "Maria Aparecida Souza (exemplo)",
    clienteEndereco: "Rua das Acácias, 120 · Cascavel · PR",
    kitNome: "Kit 5,4 kWp",
    kitPotenciaKwp: 5.4,
    tipoLigacao: "bifasico",
    consumoMedioKwh: 480,
    geracaoEstimadaKwhMes: 620,
    contaSemSolar: 480,
    contaComSolar: 95,
    economiaMensal: 385,
    paybackMeses: 42,
    modoPreco: "completo",
    kitPreco: 24900,
    componentes: [
      { tipo: "modulo", descricao: "Módulo fotovoltaico monocristalino 550 W", quantidade: 10, potenciaW: 550 },
      { tipo: "inversor", descricao: "Inversor string 5 kW", quantidade: 1, potenciaW: 5000 },
    ],
  };
}
