"use client";

import { useMemo, useState } from "react";
import {
  avaliarCombinacaoEscolhida,
  dimensionarSistemaAutomatico,
  type EquipamentoAtivo,
  type OpcaoSistemaAutomatico,
  type RedeEletricaConfirmada,
} from "@/lib/dimensionamento";

export type OrigemEscolhaDimensionamento = "automatico" | "manual";

/** Dados já prontos pra virar campos ocultos do formulário — nomes centralizados em
 * `CAMPOS_DIMENSIONAMENTO` (`src/lib/dimensionamento-campos.ts`). Este hook não sabe renderizar
 * nada: quem consome decide como mandar isso pro formulário (ex.: `CamposOcultosDimensionamento`). */
export type CamposFormularioDimensionamento = {
  moduloId: string;
  inversorId: string;
  quantidadeModulos: number;
  /** `null` quando a produtividade usada é a padrão da empresa (não precisa virar campo oculto —
   * `salvarDimensionamento` já cai nela sozinho quando nada é enviado). */
  produtividadeKwhKwpMes: number | null;
  origemProdutividade: "pvgis" | "nasa" | null;
};

export type UsarDimensionamentoParams = {
  consumoMedioKwh: number | null;
  produtividadeKwhKwpMes: number | null;
  origemProdutividade: "padrao" | "pvgis" | "nasa";
  margemDimensionamentoPct: number;
  overloadMaximoPct: number;
  overloadCriticoPct: number;
  temperaturaMinimaProjetoC: number;
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
  /** `undefined`/`null` = tipo de ligação/tensão ainda não confirmados pelo vendedor — o motor
   * calcula DC/quantidade normalmente, mas nenhuma opção de inversor vem como "recomendada/
   * compatível" (`validacaoRede: "pendente_confirmacao_rede"`) até isso ser confirmado (Evandro,
   * 2026-10-01). Ver `src/lib/dimensionamento.ts`. */
  redeEletrica?: RedeEletricaConfirmada | null;
};

export type UsarDimensionamentoResultado = {
  /** Se há consumo, produtividade e catálogo suficientes pra tentar calcular. */
  prontoPraCalcular: boolean;
  /** Até 3 opções sugeridas automaticamente (nunca inclui overload acima do limite nem
   * combinação eletricamente/rede incompatível CONFIRMADA — ver `dimensionarSistemaAutomatico`). */
  opcoesAutomaticas: OpcaoSistemaAutomatico[];
  /** `null` até o vendedor escolher uma opção automática ou abrir a seleção manual. */
  origem: OrigemEscolhaDimensionamento | null;
  /** Módulo+inversor correntes (da opção automática escolhida ou da seleção manual). */
  par: { modulo: EquipamentoAtivo; inversor: EquipamentoAtivo } | null;
  /** Quantidade de módulos como string editável (o campo de input é number, mas raw value evita
   * problemas de digitação intermediária, ex.: campo vazio enquanto apaga pra redigitar). */
  quantidade: string;
  /** Resultado completo (motor) da combinação+quantidade atual — `null` enquanto não há par
   * escolhido ou a quantidade digitada é inválida (≤ 0 ou não numérica). */
  opcaoAtual: OpcaoSistemaAutomatico | null;
  /** Dados prontos pra virar campos ocultos do formulário; `null` enquanto não há opção válida. */
  camposFormulario: CamposFormularioDimensionamento | null;
  /** Escolhe uma das `opcoesAutomaticas` (origem vira "automatico"). */
  selecionarAutomatico: (opcao: OpcaoSistemaAutomatico) => void;
  /** Escolhe módulo+inversor manualmente, fora das opções automáticas — permite overload acima
   * do limite ou combinações que a sugestão automática descartaria (origem vira "manual"). */
  selecionarManual: (moduloId: string, inversorId: string) => void;
  /** Ajusta a quantidade de módulos da combinação atual (automática ou manual); o motor revalida
   * a cada ajuste, incluindo o gate de rede elétrica. */
  ajustarQuantidade: (quantidade: string) => void;
  /** Limpa a seleção (nem automática, nem manual). */
  limparSelecao: () => void;
};

/**
 * Lógica pura do painel de dimensionamento (motor em `src/lib/dimensionamento.ts`), extraída de
 * `painel-dimensionamento.tsx` (Fase 3 da reconciliação, Evandro, 2026-10-01) pra ficar
 * independente de qualquer JSX de formulário específico. Decide entre a opção automática
 * escolhida e o override manual, mantém a quantidade editável e devolve os dados já prontos pra
 * virar campos ocultos — nunca decide sozinha como isso chega ao formulário.
 */
export function useDimensionamento(params: UsarDimensionamentoParams): UsarDimensionamentoResultado {
  const {
    consumoMedioKwh,
    produtividadeKwhKwpMes,
    origemProdutividade,
    margemDimensionamentoPct,
    overloadMaximoPct,
    overloadCriticoPct,
    temperaturaMinimaProjetoC,
    modulos,
    inversores,
    redeEletrica,
  } = params;

  const prontoPraCalcular = !!consumoMedioKwh && !!produtividadeKwhKwpMes && modulos.length > 0 && inversores.length > 0;

  const opcoesAutomaticas = useMemo((): OpcaoSistemaAutomatico[] => {
    if (!prontoPraCalcular) return [];
    return dimensionarSistemaAutomatico({
      consumoMedioKwh: consumoMedioKwh!,
      margemPct: margemDimensionamentoPct,
      produtividadeKwhKwpMes: produtividadeKwhKwpMes!,
      modulos,
      inversores,
      overloadMaximoPct,
      overloadCriticoPct,
      temperaturaMinimaProjetoC,
      redeEletrica,
    });
  }, [
    prontoPraCalcular,
    consumoMedioKwh,
    produtividadeKwhKwpMes,
    margemDimensionamentoPct,
    overloadMaximoPct,
    overloadCriticoPct,
    temperaturaMinimaProjetoC,
    modulos,
    inversores,
    redeEletrica,
  ]);

  const [origem, setOrigem] = useState<OrigemEscolhaDimensionamento | null>(null);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [manualModuloId, setManualModuloId] = useState("");
  const [manualInversorId, setManualInversorId] = useState("");
  const [quantidade, setQuantidade] = useState("");

  const selecionadaAuto = origem === "automatico" ? (opcoesAutomaticas.find((o) => `${o.modulo.id}-${o.inversor.id}` === selecionadaId) ?? null) : null;
  const moduloManual = origem === "manual" ? (modulos.find((m) => m.id === manualModuloId) ?? null) : null;
  const inversorManual = origem === "manual" ? (inversores.find((i) => i.id === manualInversorId) ?? null) : null;

  const par = selecionadaAuto
    ? { modulo: selecionadaAuto.modulo, inversor: selecionadaAuto.inversor }
    : moduloManual && inversorManual
      ? { modulo: moduloManual, inversor: inversorManual }
      : null;

  // Recalcula a opção escolhida com a quantidade (possivelmente ajustada), sempre pelo motor —
  // nunca por uma conta própria do hook. O gate de rede elétrica roda aqui também: sem
  // `redeEletrica` confirmada, `opcaoAtual.validacaoRede` fica "pendente_confirmacao_rede".
  const opcaoAtual = useMemo(() => {
    if (!par) return null;
    const qtd = Number(quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) return null;
    return avaliarCombinacaoEscolhida(
      par.modulo,
      par.inversor,
      qtd,
      overloadMaximoPct,
      overloadCriticoPct,
      temperaturaMinimaProjetoC,
      redeEletrica,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [par?.modulo.id, par?.inversor.id, quantidade, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC, redeEletrica]);

  function selecionarAutomatico(opcao: OpcaoSistemaAutomatico) {
    setOrigem("automatico");
    setSelecionadaId(`${opcao.modulo.id}-${opcao.inversor.id}`);
    setQuantidade(String(opcao.quantidadeModulos));
    setManualModuloId("");
    setManualInversorId("");
  }

  function selecionarManual(moduloId: string, inversorId: string) {
    setOrigem("manual");
    setSelecionadaId(null);
    setManualModuloId(moduloId);
    setManualInversorId(inversorId);
  }

  function ajustarQuantidade(novaQuantidade: string) {
    setQuantidade(novaQuantidade);
  }

  function limparSelecao() {
    setOrigem(null);
    setSelecionadaId(null);
    setManualModuloId("");
    setManualInversorId("");
    setQuantidade("");
  }

  // Se o catálogo mudar (ex.: trocou de empresa/tela) e o módulo/inversor escolhido manualmente
  // não existir mais, `moduloManual`/`inversorManual` (acima) já voltam a `null` sozinhos — `par`
  // segue `null` sem precisar de um efeito só pra isso.

  const produtividadeValida = produtividadeKwhKwpMes != null && origemProdutividade !== "padrao";
  const camposFormulario: CamposFormularioDimensionamento | null =
    par && opcaoAtual
      ? {
          moduloId: par.modulo.id,
          inversorId: par.inversor.id,
          quantidadeModulos: opcaoAtual.quantidadeModulos,
          produtividadeKwhKwpMes: produtividadeValida ? produtividadeKwhKwpMes! : null,
          origemProdutividade: produtividadeValida ? (origemProdutividade as "pvgis" | "nasa") : null,
        }
      : null;

  return {
    prontoPraCalcular,
    opcoesAutomaticas,
    origem,
    par,
    quantidade,
    opcaoAtual,
    camposFormulario,
    selecionarAutomatico,
    selecionarManual,
    ajustarQuantidade,
    limparSelecao,
  };
}
