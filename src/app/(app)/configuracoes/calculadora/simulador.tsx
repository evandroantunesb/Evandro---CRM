"use client";

import { useState } from "react";
import { PainelDimensionamento } from "@/components/dimensionamento/painel-dimensionamento";
import { Campo, Selecao } from "@/components/ui";
import type { EquipamentoAtivo } from "@/lib/dimensionamento";
import { ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type TipoLigacao } from "@/lib/tipos";

/**
 * Simulação administrativa do motor de dimensionamento: o admin digita um consumo hipotético e
 * vê o que o motor recomendaria com o catálogo e os parâmetros atuais — mesmo
 * `<PainelDimensionamento>` de "Adicionar negócio", mas sem formulário em volta, então nada é
 * gravado e nenhum negócio é criado. Serve pra conferir o efeito de uma mudança no Catálogo ou
 * nos Parâmetros antes de o vendedor usar.
 */
export function SimuladorDimensionamento({
  parametros,
  modulos,
  inversores,
}: {
  parametros: {
    produtividadeKwhKwpMes: number | null;
    margemDimensionamentoPct: number;
    overloadMaximoPct: number;
    overloadCriticoPct: number;
    temperaturaMinimaProjetoC: number;
  };
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
}) {
  const [consumo, setConsumo] = useState("");
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao | "">("");
  const consumoKwh = Number(consumo.replace(/\./g, "").replace(",", "."));
  const consumoValido = Number.isFinite(consumoKwh) && consumoKwh > 0 ? consumoKwh : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Campo
          rotulo="Consumo médio (kWh/mês)"
          inputMode="decimal"
          placeholder="Ex.: 500"
          value={consumo}
          onChange={(e) => setConsumo(e.target.value)}
        />
        <Selecao
          rotulo="Tipo de ligação"
          value={tipoLigacao}
          onChange={(e) => setTipoLigacao(e.target.value as TipoLigacao | "")}
        >
          <option value="">Não confirmado</option>
          {TIPOS_LIGACAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_LIGACAO[t]}
            </option>
          ))}
        </Selecao>
      </div>
      {!parametros.produtividadeKwhKwpMes ? (
        <p className="text-sm text-zinc-500">
          Produtividade média não configurada — preencha na aba Parâmetros pra simular.
        </p>
      ) : modulos.length === 0 || inversores.length === 0 ? (
        <p className="text-sm text-zinc-500">
          O motor precisa de pelo menos um módulo e um inversor ativos e com dados técnicos completos — cadastre na aba
          Catálogo.
        </p>
      ) : consumoValido == null ? (
        <p className="text-sm text-zinc-500">Informe um consumo pra ver o kit que o motor recomendaria.</p>
      ) : (
        <PainelDimensionamento
          consumoMedioKwh={consumoValido}
          produtividadeKwhKwpMes={parametros.produtividadeKwhKwpMes}
          origemProdutividade="padrao"
          margemDimensionamentoPct={parametros.margemDimensionamentoPct}
          overloadMaximoPct={parametros.overloadMaximoPct}
          overloadCriticoPct={parametros.overloadCriticoPct}
          temperaturaMinimaProjetoC={parametros.temperaturaMinimaProjetoC}
          modulos={modulos}
          inversores={inversores}
          redeEletrica={tipoLigacao ? { tipoLigacao } : null}
        />
      )}
    </div>
  );
}
