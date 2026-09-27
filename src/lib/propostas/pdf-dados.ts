import type { ModoPreco, TipoComponenteKit, TipoLigacao } from "@/lib/tipos";
import type { DadosSistemaProposta } from "./pdf-tipos";

/** Monta os dados de um sistema real (cálculo + componentes + contato) no formato que o renderer de PDF espera. */
export function montarDadosSistemaProposta(input: {
  contato: { nome: string; endereco: string | null; cidade: string | null; uf: string | null };
  calculo: {
    kit_nome: string;
    kit_potencia_kwp: number;
    tipo_ligacao: TipoLigacao;
    consumo_medio_kwh: number;
    geracao_estimada_kwh_mes: number;
    conta_sem_solar: number;
    conta_com_solar: number;
    economia_mensal: number;
    payback_meses: number | null;
    kit_preco: number;
  };
  modoPreco: ModoPreco;
  componentes: { tipo: TipoComponenteKit; descricao: string; quantidade: number; potencia_w: number | null }[];
}): DadosSistemaProposta {
  return {
    clienteNome: input.contato.nome,
    clienteEndereco: [input.contato.endereco, input.contato.cidade, input.contato.uf].filter(Boolean).join(" · ") || null,
    kitNome: input.calculo.kit_nome,
    kitPotenciaKwp: input.calculo.kit_potencia_kwp,
    tipoLigacao: input.calculo.tipo_ligacao,
    consumoMedioKwh: input.calculo.consumo_medio_kwh,
    geracaoEstimadaKwhMes: input.calculo.geracao_estimada_kwh_mes,
    contaSemSolar: input.calculo.conta_sem_solar,
    contaComSolar: input.calculo.conta_com_solar,
    economiaMensal: input.calculo.economia_mensal,
    paybackMeses: input.calculo.payback_meses,
    modoPreco: input.modoPreco,
    kitPreco: input.calculo.kit_preco,
    componentes: input.componentes.map((c) => ({ tipo: c.tipo, descricao: c.descricao, quantidade: c.quantidade, potenciaW: c.potencia_w })),
  };
}
