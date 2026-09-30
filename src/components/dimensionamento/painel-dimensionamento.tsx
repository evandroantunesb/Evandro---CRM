"use client";

import { useEffect, useMemo, useState } from "react";
import {
  avaliarCombinacaoEscolhida,
  dimensionarSistemaAutomatico,
  type EquipamentoAtivo,
  type OpcaoSistemaAutomatico,
} from "@/lib/dimensionamento";

export type EscolhaDimensionamento = {
  moduloId: string;
  inversorId: string;
  quantidadeModulos: number;
  opcao: OpcaoSistemaAutomatico;
};

/**
 * Painel único de dimensionamento (motor em `src/lib/dimensionamento.ts`):
 * mostra as opções automáticas a partir do consumo informado e deixa o
 * vendedor ajustar a quantidade de módulos da opção escolhida, sempre
 * validando a mesma combinação pelas regras elétricas do motor (nunca uma
 * fórmula própria). Usado hoje só na criação do negócio; a Etapa B da
 * unificação reaproveita este mesmo componente em "Editar sistema".
 *
 * Some se faltar consumo ou catálogo — quem chama decide o que mostrar no
 * lugar (ex.: o editor de kit manual, pra empresas sem equipamento cadastrado).
 */
export function PainelDimensionamento({
  consumoMedioKwh,
  produtividadeKwhKwpMes,
  origemProdutividade,
  margemDimensionamentoPct,
  overloadMaximoPct,
  temperaturaMinimaProjetoC,
  modulos,
  inversores,
  onEscolha,
}: {
  consumoMedioKwh: number | null;
  produtividadeKwhKwpMes: number | null;
  origemProdutividade: "padrao" | "pvgis" | "nasa";
  margemDimensionamentoPct: number;
  overloadMaximoPct: number;
  temperaturaMinimaProjetoC: number;
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
  onEscolha: (escolha: EscolhaDimensionamento | null) => void;
}) {
  const opcoes = useMemo((): OpcaoSistemaAutomatico[] => {
    if (!consumoMedioKwh || !produtividadeKwhKwpMes || !modulos.length || !inversores.length) return [];
    return dimensionarSistemaAutomatico({
      consumoMedioKwh,
      margemPct: margemDimensionamentoPct,
      produtividadeKwhKwpMes,
      modulos,
      inversores,
      overloadMaximoPct,
      temperaturaMinimaProjetoC,
    });
  }, [consumoMedioKwh, produtividadeKwhKwpMes, margemDimensionamentoPct, overloadMaximoPct, temperaturaMinimaProjetoC, modulos, inversores]);

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");

  const selecionada = opcoes.find((o) => `${o.modulo.id}-${o.inversor.id}` === selecionadaId) ?? null;

  // Recalcula a opção escolhida com a quantidade (possivelmente ajustada), sempre pelo motor —
  // nunca por uma conta própria do componente.
  const opcaoAtual = useMemo(() => {
    if (!selecionada) return null;
    const qtd = Number(quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) return null;
    return avaliarCombinacaoEscolhida(selecionada.modulo, selecionada.inversor, qtd, overloadMaximoPct, temperaturaMinimaProjetoC);
  }, [selecionada, quantidade, overloadMaximoPct, temperaturaMinimaProjetoC]);

  useEffect(() => {
    if (selecionada && opcaoAtual) {
      onEscolha({ moduloId: selecionada.modulo.id, inversorId: selecionada.inversor.id, quantidadeModulos: opcaoAtual.quantidadeModulos, opcao: opcaoAtual });
    } else {
      onEscolha(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada, opcaoAtual]);

  function escolher(opcao: OpcaoSistemaAutomatico) {
    setSelecionadaId(`${opcao.modulo.id}-${opcao.inversor.id}`);
    setQuantidade(String(opcao.quantidadeModulos));
  }

  if (!opcoes.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-zinc-700">Kit sugerido automaticamente</p>
      <p className="-mt-1 text-xs text-zinc-500">
        Calculado a partir do consumo informado e dos equipamentos ativos em Configurações → Calculadora. Escolha uma
        opção e ajuste a quantidade se precisar — a validação elétrica roda de novo a cada ajuste.
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {opcoes.map((opcao) => {
          const id = `${opcao.modulo.id}-${opcao.inversor.id}`;
          const ativa = id === selecionadaId;
          return (
            <button
              type="button"
              key={id}
              onClick={() => escolher(opcao)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left text-sm ${
                ativa ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <span className="font-medium text-zinc-900">
                {opcao.quantidadeModulos}x {opcao.modulo.fabricante} {opcao.modulo.modelo}
              </span>
              <span className="text-zinc-600">
                + {opcao.inversor.fabricante} {opcao.inversor.modelo}
              </span>
              <span className="text-zinc-500">
                {opcao.potenciaDcKwp.toLocaleString("pt-BR")} kWp · overload{" "}
                {(opcao.overloadPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
              </span>
              {opcao.validacao === "valido_com_alerta" && (
                <span className="text-xs text-amber-700">Overload acima do recomendado — confira</span>
              )}
              {opcao.validacaoEletrica === "nao_verificado" && (
                <span className="text-xs text-zinc-400">String/MPPT não verificados (sem datasheet completo)</span>
              )}
            </button>
          );
        })}
      </div>

      {selecionada && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-700">Quantidade de módulos</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-24 rounded-md border border-zinc-300 px-2 py-1"
            />
          </label>
          {opcaoAtual ? (
            <p className="text-sm text-zinc-700">
              {opcaoAtual.potenciaDcKwp.toLocaleString("pt-BR")} kWp ·{" "}
              overload {(opcaoAtual.overloadPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
              {opcaoAtual.validacao === "valido_com_alerta" && (
                <span className="ml-1 text-amber-700">(acima do recomendado)</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-red-700">Essa quantidade não forma um arranjo eletricamente seguro com esse inversor.</p>
          )}
        </div>
      )}

      {opcaoAtual && selecionada && (
        <>
          <input type="hidden" name="dimensionamento_modulo_id" value={selecionada.modulo.id} />
          <input type="hidden" name="dimensionamento_inversor_id" value={selecionada.inversor.id} />
          <input type="hidden" name="dimensionamento_quantidade_modulos" value={opcaoAtual.quantidadeModulos} />
          {origemProdutividade !== "padrao" && produtividadeKwhKwpMes != null && (
            <>
              <input type="hidden" name="dimensionamento_produtividade_kwh_kwp_mes" value={produtividadeKwhKwpMes} />
              <input type="hidden" name="dimensionamento_origem_produtividade" value={origemProdutividade} />
            </>
          )}
        </>
      )}
    </div>
  );
}
