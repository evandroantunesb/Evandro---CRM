"use client";

import { useState, useTransition } from "react";
import { Botao, Campo } from "@/components/ui";
import { buscarComponentesCatalogo } from "@/lib/acoes/opensolar";
import { formatarNumeroBr, lerNumeroBr } from "@/lib/formatacao";
import type { CampoLinha, LinhaComponente, ProblemaLinha } from "@/lib/kit-linhas";
import { ROTULO_TIPO_COMPONENTE_KIT, TIPOS_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

// A validação das linhas vive em `@/lib/kit-linhas` (pura, testável); o editor só a exibe.
export { linhasParaComponentes, type LinhaComponente } from "@/lib/kit-linhas";

export function novaLinhaComponente(tipo: TipoComponenteKit): LinhaComponente {
  return { tipo, descricao: "", potenciaW: "", quantidade: "1" };
}

/** Padrão brasileiro ("550", "550,5", "1.200"); vazio, inválido ou ambíguo vira null. Só para a sugestão de quantidade. */
function numero(v: string): number | null {
  const n = lerNumeroBr(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Campo "Modelo / descrição": pra módulo e inversor, busca no catálogo técnico
 * (OpenSolar) conforme digita e preenche a potência junto ao escolher um resultado.
 * Continua aceitando texto livre (a busca é só um atalho).
 */
function CampoModeloComBusca({
  tipo,
  valor,
  placeholder,
  invalido,
  onChangeTexto,
  onSelecionar,
}: {
  tipo: TipoComponenteKit;
  valor: string;
  placeholder: string;
  invalido?: boolean;
  onChangeTexto: (v: string) => void;
  onSelecionar: (descricao: string, potenciaW: string, precoEstimadoUnitario: string) => void;
}) {
  const [resultados, setResultados] = useState<
    { id: number; descricao: string; potenciaW: number | null; precoEstimadoBRL: number | null }[]
  >([]);
  const [, iniciar] = useTransition();
  const pesquisavel = tipo === "modulo" || tipo === "inversor";

  function pesquisar(termo: string) {
    onChangeTexto(termo);
    if (!pesquisavel) return;
    if (termo.trim().length < 2) return setResultados([]);
    iniciar(async () => setResultados(await buscarComponentesCatalogo(tipo, termo)));
  }

  return (
    <div className="relative">
      <Campo
        rotulo="Modelo / descrição"
        value={valor}
        onChange={(e) => pesquisar(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalido || undefined}
      />
      {resultados.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white text-sm shadow-md">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onSelecionar(
                    r.descricao,
                    r.potenciaW != null ? formatarNumeroBr(r.potenciaW) : "",
                    r.precoEstimadoBRL != null ? String(r.precoEstimadoBRL) : "",
                  );
                  setResultados([]);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-zinc-50"
              >
                {r.descricao}
                {r.potenciaW != null && <span className="text-zinc-400"> · {r.potenciaW} W</span>}
                {r.precoEstimadoBRL != null && (
                  <span className="text-zinc-400"> · ~R$ {r.precoEstimadoBRL.toLocaleString("pt-BR")} (estimado)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Editor do kit personalizado: módulos, inversor, baterias e outros itens (múltiplos de cada). */
export function EditorComponentesKit({
  linhas,
  onChange,
  sugerirQuantidadeModulo,
  problemas = [],
}: {
  linhas: LinhaComponente[];
  onChange: (linhas: LinhaComponente[]) => void;
  /** Dado o consumo já informado no formulário, sugere quantos módulos de uma potência cobririam ele. */
  sugerirQuantidadeModulo?: (potenciaW: number) => number | null;
  /** Problemas das linhas (de `analisarLinhas`) a exibir; o pai só os passa depois de uma tentativa de envio. */
  problemas?: ProblemaLinha[];
}) {
  const doCampo = (indice: number, campo: CampoLinha) => problemas.some((p) => p.indice === indice && p.campo === campo);
  function adicionar(tipo: TipoComponenteKit) {
    onChange([...linhas, novaLinhaComponente(tipo)]);
  }
  function atualizar(indice: number, patch: Partial<LinhaComponente>) {
    onChange(
      linhas.map((l, i) => {
        if (i !== indice) return l;
        const atualizada = { ...l, ...patch };
        // Ao (re)definir a potência de um módulo com quantidade ainda no padrão,
        // já sugere quantos módulos cobririam o consumo informado.
        if (atualizada.tipo === "modulo" && patch.potenciaW && sugerirQuantidadeModulo) {
          const quantidadeAtual = l.quantidade.trim();
          if (quantidadeAtual === "" || quantidadeAtual === "1") {
            const potenciaNum = numero(patch.potenciaW);
            const sugestao = potenciaNum != null ? sugerirQuantidadeModulo(potenciaNum) : null;
            if (sugestao) atualizada.quantidade = String(sugestao);
          }
        }
        return atualizada;
      }),
    );
  }
  function remover(indice: number) {
    onChange(linhas.filter((_, i) => i !== indice));
  }

  return (
    <div className="flex flex-col gap-4">
      {TIPOS_COMPONENTE_KIT.map((tipo) => {
        const doTipo = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.tipo === tipo);
        return (
          <div key={tipo} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">{ROTULO_TIPO_COMPONENTE_KIT[tipo]}</span>
              <button
                type="button"
                onClick={() => adicionar(tipo)}
                className="text-xs font-medium text-amber-700 hover:underline"
              >
                + Adicionar {ROTULO_TIPO_COMPONENTE_KIT[tipo].toLowerCase()}
              </button>
            </div>
            {tipo === "modulo" && sugerirQuantidadeModulo && (
              <p className="text-xs text-zinc-400">
                Ao escolher a potência do módulo, a quantidade é sugerida a partir do consumo informado — ajuste se precisar.
              </p>
            )}
            {doTipo.length === 0 && <p className="text-xs text-zinc-400">Nenhum item.</p>}
            {doTipo.map(({ l, i }) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-zinc-50 p-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                <CampoModeloComBusca
                  tipo={tipo}
                  valor={l.descricao}
                  placeholder={tipo === "modulo" ? "Ex.: Canadian 550 W" : "Ex.: Growatt 5 kW"}
                  invalido={doCampo(i, "descricao")}
                  onChangeTexto={(v) => atualizar(i, { descricao: v })}
                  onSelecionar={(descricao, potenciaW, precoEstimadoUnitario) =>
                    atualizar(i, { descricao, potenciaW, precoEstimadoUnitario })
                  }
                />
                <Campo
                  rotulo="Potência (W)"
                  inputMode="decimal"
                  value={l.potenciaW}
                  onChange={(e) => atualizar(i, { potenciaW: e.target.value })}
                  placeholder="Opcional"
                  aria-invalid={doCampo(i, "potenciaW") || undefined}
                />
                <Campo
                  rotulo="Qtd."
                  inputMode="numeric"
                  value={l.quantidade}
                  onChange={(e) => atualizar(i, { quantidade: e.target.value })}
                  aria-invalid={doCampo(i, "quantidade") || undefined}
                />
                <Botao type="button" variante="secundario" onClick={() => remover(i)}>
                  Remover
                </Botao>
                {problemas
                  .filter((p) => p.indice === i)
                  .map((p) => (
                    <p key={p.campo} role="alert" className="col-span-full text-xs text-red-700">
                      {p.mensagem}
                    </p>
                  ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
