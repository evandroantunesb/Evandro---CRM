import type { ModoPreco, TipoComponenteKit, TipoLigacao } from "@/lib/tipos";
import type { DadosSistemaProposta } from "./pdf-tipos";

/**
 * ATENÇÃO (M2-B8): hoje o PDF/página pública NÃO devem usar números de nenhuma proposta (ver
 * `emissao-preservada.ts`: sem dados da emissão preservados = indisponível). Esta montagem só pode alimentar um
 * renderer quando `situacaoDaEmissao(...).disponivel` for verdadeiro.
 *
 * Dados de um cálculo DESATUALIZADO (o kit mudou depois dele): o que vem do cálculo antigo e vale como
 * resultado atual (potência, consumo, geração, contas, economia, payback) é nulo. Fica o que não depende dele:
 * cliente, nome/tipo do kit, preço, modo de preço e a lista atual de componentes.
 */
export type DadosSistemaPropostaDesatualizado = Omit<
  DadosSistemaProposta,
  "kitPotenciaKwp" | "consumoMedioKwh" | "geracaoEstimadaKwhMes" | "contaSemSolar" | "contaComSolar" | "economiaMensal" | "paybackMeses"
> & {
  desatualizado: true;
  kitPotenciaKwp: null;
  consumoMedioKwh: null;
  geracaoEstimadaKwhMes: null;
  contaSemSolar: null;
  contaComSolar: null;
  economiaMensal: null;
  paybackMeses: null;
};

type EntradaDadosSistema = {
  contato: { nome: string; endereco: string | null; cidade: string | null; uf: string | null };
  calculo: {
    kit_nome: string;
    kit_potencia_kwp: number | null;
    tipo_ligacao: TipoLigacao;
    consumo_medio_kwh: number | null;
    geracao_estimada_kwh_mes: number | null;
    conta_sem_solar: number | null;
    conta_com_solar: number | null;
    economia_mensal: number | null;
    payback_meses: number | null;
    kit_preco: number | null;
  };
  modoPreco: ModoPreco;
  componentes: { tipo: TipoComponenteKit; descricao: string; quantidade: number; potencia_w: number | null }[];
  /** Resultado de `calculoDesatualizado` (`@/lib/calculo-vigencia`). Verdadeiro = não devolve economia/conta/payback. */
  desatualizado?: boolean;
};

/**
 * Monta os dados de um sistema real (cálculo + componentes + contato) no formato que o renderer de PDF espera.
 * Sem `desatualizado` (ou falso) o resultado é o mesmo de sempre. Com `desatualizado: true`, devolve
 * `DadosSistemaPropostaDesatualizado` (campos de resultado nulos) e o renderer precisa tratar esse caso.
 */
export function montarDadosSistemaProposta(input: EntradaDadosSistema & { desatualizado: true }): DadosSistemaPropostaDesatualizado;
export function montarDadosSistemaProposta(input: EntradaDadosSistema & { desatualizado?: false }): DadosSistemaProposta;
export function montarDadosSistemaProposta(input: EntradaDadosSistema): DadosSistemaProposta | DadosSistemaPropostaDesatualizado;
export function montarDadosSistemaProposta(input: EntradaDadosSistema): DadosSistemaProposta | DadosSistemaPropostaDesatualizado {
  const base = {
    clienteNome: input.contato.nome,
    clienteEndereco: [input.contato.endereco, input.contato.cidade, input.contato.uf].filter(Boolean).join(" · ") || null,
    kitNome: input.calculo.kit_nome,
    tipoLigacao: input.calculo.tipo_ligacao,
    modoPreco: input.modoPreco,
    kitPreco: input.calculo.kit_preco,
    componentes: input.componentes.map((c) => ({ tipo: c.tipo, descricao: c.descricao, quantidade: c.quantidade, potenciaW: c.potencia_w })),
  };
  if (input.desatualizado) {
    return {
      ...base,
      desatualizado: true,
      kitPotenciaKwp: null,
      consumoMedioKwh: null,
      geracaoEstimadaKwhMes: null,
      contaSemSolar: null,
      contaComSolar: null,
      economiaMensal: null,
      paybackMeses: null,
    };
  }
  return {
    ...base,
    kitPotenciaKwp: input.calculo.kit_potencia_kwp,
    consumoMedioKwh: input.calculo.consumo_medio_kwh,
    geracaoEstimadaKwhMes: input.calculo.geracao_estimada_kwh_mes,
    contaSemSolar: input.calculo.conta_sem_solar,
    contaComSolar: input.calculo.conta_com_solar,
    economiaMensal: input.calculo.economia_mensal,
    paybackMeses: input.calculo.payback_meses,
  };
}
