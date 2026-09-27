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

export type DadosSistemaProposta = {
  clienteNome: string;
  clienteEndereco: string | null;
  kitNome: string;
  kitPotenciaKwp: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  geracaoEstimadaKwhMes: number;
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  paybackMeses: number | null;
  modoPreco: ModoPreco;
  kitPreco: number;
  componentes: ComponenteKitProposta[];
};
