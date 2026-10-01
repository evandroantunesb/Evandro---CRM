"use client";

import { useEffect, useMemo, useState } from "react";
import { Botao, Selecao } from "@/components/ui";
import {
  avaliarCombinacaoEscolhida,
  camposTecnicosFaltantes,
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
  overloadCriticoPct,
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
  overloadCriticoPct: number;
  temperaturaMinimaProjetoC: number;
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
  onEscolha: (escolha: EscolhaDimensionamento | null) => void;
}) {
  const prontoPraCalcular = !!consumoMedioKwh && !!produtividadeKwhKwpMes && modulos.length > 0 && inversores.length > 0;

  const opcoes = useMemo((): OpcaoSistemaAutomatico[] => {
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
    });
  }, [prontoPraCalcular, consumoMedioKwh, produtividadeKwhKwpMes, margemDimensionamentoPct, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC, modulos, inversores]);

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  // Seleção manual: fora das opções automáticas (que nunca incluem overload acima do limite —
  // ver `dimensionarSistemaAutomatico`), o vendedor pode escolher qualquer módulo+inversor do
  // catálogo ativo. Passa pelas mesmas regras elétricas do motor; se o overload ficar acima do
  // limite, fica registrado na linha do tempo do negócio (trigger em `dimensionamentos_solares`).
  const [manualAberto, setManualAberto] = useState(false);
  const [manualModuloId, setManualModuloId] = useState("");
  const [manualInversorId, setManualInversorId] = useState("");

  const selecionadaAuto = opcoes.find((o) => `${o.modulo.id}-${o.inversor.id}` === selecionadaId) ?? null;
  const moduloManual = modulos.find((m) => m.id === manualModuloId) ?? null;
  const inversorManual = inversores.find((i) => i.id === manualInversorId) ?? null;
  const par = selecionadaAuto
    ? { modulo: selecionadaAuto.modulo, inversor: selecionadaAuto.inversor }
    : moduloManual && inversorManual
      ? { modulo: moduloManual, inversor: inversorManual }
      : null;

  // Recalcula a opção escolhida com a quantidade (possivelmente ajustada), sempre pelo motor —
  // nunca por uma conta própria do componente.
  const opcaoAtual = useMemo(() => {
    if (!par) return null;
    const qtd = Number(quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) return null;
    return avaliarCombinacaoEscolhida(par.modulo, par.inversor, qtd, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [par?.modulo.id, par?.inversor.id, quantidade, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC]);

  useEffect(() => {
    if (par && opcaoAtual) {
      onEscolha({ moduloId: par.modulo.id, inversorId: par.inversor.id, quantidadeModulos: opcaoAtual.quantidadeModulos, opcao: opcaoAtual });
    } else {
      onEscolha(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [par?.modulo.id, par?.inversor.id, opcaoAtual]);

  function escolher(opcao: OpcaoSistemaAutomatico) {
    setSelecionadaId(`${opcao.modulo.id}-${opcao.inversor.id}`);
    setQuantidade(String(opcao.quantidadeModulos));
    setManualModuloId("");
    setManualInversorId("");
    setManualAberto(false);
  }

  function abrirSelecaoManual() {
    setSelecionadaId(null);
    setManualAberto(true);
  }

  if (!prontoPraCalcular) return null;

  const seletorManual = (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3">
      {!manualAberto ? (
        <Botao type="button" variante="secundario" onClick={abrirSelecaoManual} className="self-start">
          Selecionar manualmente (permite overload acima do limite)
        </Botao>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Escolha qualquer módulo e inversor do catálogo ativo. Overload acima do limite fica disponível aqui, mas é
            registrado na linha do tempo do negócio como override manual.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Selecao
              rotulo="Módulo"
              value={manualModuloId}
              onChange={(e) => setManualModuloId(e.target.value)}
            >
              <option value="">Selecione</option>
              {modulos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fabricante} {m.modelo}
                </option>
              ))}
            </Selecao>
            <Selecao
              rotulo="Inversor"
              value={manualInversorId}
              onChange={(e) => setManualInversorId(e.target.value)}
            >
              <option value="">Selecione</option>
              {inversores.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.fabricante} {i.modelo}
                </option>
              ))}
            </Selecao>
          </div>
        </>
      )}
    </div>
  );

  if (!opcoes.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Não há kit automático dentro do limite de overload ({(overloadMaximoPct * 100).toLocaleString("pt-BR")}%)
          pra esse consumo com os equipamentos ativos hoje.
        </p>
        {seletorManual}
        {par && <PainelResultado par={par} quantidade={quantidade} setQuantidade={setQuantidade} opcaoAtual={opcaoAtual} />}
        <CamposOcultos par={par} opcaoAtual={opcaoAtual} produtividadeKwhKwpMes={produtividadeKwhKwpMes} origemProdutividade={origemProdutividade} />
      </div>
    );
  }

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
              {opcao.validacaoEletrica === "nao_verificado" && (
                <span className="text-xs text-zinc-400">
                  Não verificado — falta no datasheet: {camposTecnicosFaltantes(opcao.modulo, opcao.inversor).join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {seletorManual}

      {par && <PainelResultado par={par} quantidade={quantidade} setQuantidade={setQuantidade} opcaoAtual={opcaoAtual} />}

      <CamposOcultos par={par} opcaoAtual={opcaoAtual} produtividadeKwhKwpMes={produtividadeKwhKwpMes} origemProdutividade={origemProdutividade} />
    </div>
  );
}

function PainelResultado({
  par,
  quantidade,
  setQuantidade,
  opcaoAtual,
}: {
  par: { modulo: EquipamentoAtivo; inversor: EquipamentoAtivo };
  quantidade: string;
  setQuantidade: (v: string) => void;
  opcaoAtual: OpcaoSistemaAutomatico | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
      <p className="text-sm text-zinc-700">
        {par.modulo.fabricante} {par.modulo.modelo} + {par.inversor.fabricante} {par.inversor.modelo}
      </p>
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
          {opcaoAtual.validacao === "alerta" && (
            <span className="ml-1 font-medium text-amber-700">
              ⚠ acima do limite automático — override manual, registrado na linha do tempo
            </span>
          )}
          {opcaoAtual.validacao === "critico" && (
            <span className="ml-1 font-medium text-red-700">
              ⚠ overload muito acima do recomendado — não deveria ser usado, mas a escolha fica registrada como override manual
            </span>
          )}
          {opcaoAtual.validacaoEletrica === "nao_verificado" && (
            <span className="ml-1 text-zinc-400">
              · não verificado — falta: {camposTecnicosFaltantes(opcaoAtual.modulo, opcaoAtual.inversor).join(", ")}
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-red-700">Essa quantidade não forma um arranjo eletricamente seguro com esse inversor.</p>
      )}
    </div>
  );
}

function CamposOcultos({
  par,
  opcaoAtual,
  produtividadeKwhKwpMes,
  origemProdutividade,
}: {
  par: { modulo: EquipamentoAtivo; inversor: EquipamentoAtivo } | null;
  opcaoAtual: OpcaoSistemaAutomatico | null;
  produtividadeKwhKwpMes: number | null;
  origemProdutividade: "padrao" | "pvgis" | "nasa";
}) {
  if (!par || !opcaoAtual) return null;
  return (
    <>
      <input type="hidden" name="dimensionamento_modulo_id" value={par.modulo.id} />
      <input type="hidden" name="dimensionamento_inversor_id" value={par.inversor.id} />
      <input type="hidden" name="dimensionamento_quantidade_modulos" value={opcaoAtual.quantidadeModulos} />
      {origemProdutividade !== "padrao" && produtividadeKwhKwpMes != null && (
        <>
          <input type="hidden" name="dimensionamento_produtividade_kwh_kwp_mes" value={produtividadeKwhKwpMes} />
          <input type="hidden" name="dimensionamento_origem_produtividade" value={origemProdutividade} />
        </>
      )}
    </>
  );
}
