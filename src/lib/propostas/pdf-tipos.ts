import type { ModoPreco, TipoComponenteKit, TipoLigacao } from "@/lib/tipos";
import type { TipoBloco } from "./blocos";

export type BlocoRenderizavel = {
  tipo: TipoBloco;
  ordem: number;
  ativo: boolean;
  quebraPagina: "auto" | "nova_pagina" | "pagina_exclusiva";
  config: unknown;
};

export type IdentidadeProposta = {
  nomeExibicao: string;
  corPrimaria: string;
  corDestaque: string;
  whatsapp: string;
  rodapeTexto: string;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
  fotoCapaUrl: string | null;
};

export type ComponenteKitProposta = {
  tipo: TipoComponenteKit;
  descricao: string;
  quantidade: number;
  potenciaW: number | null;
};

/**
 * Campos de resultado nulos = sem dado confiável (estimativa incompleta, cálculo legado ou emissão sem dados
 * preservados). Nunca preencher com zero: o renderer omite o que é nulo.
 */
export type DadosSistemaProposta = {
  clienteNome: string;
  clienteEndereco: string | null;
  kitNome: string;
  kitPotenciaKwp: number | null;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number | null;
  geracaoEstimadaKwhMes: number | null;
  contaSemSolar: number | null;
  contaComSolar: number | null;
  economiaMensal: number | null;
  paybackMeses: number | null;
  modoPreco: ModoPreco;
  kitPreco: number | null;
  componentes: ComponenteKitProposta[];
};
