"use client";

import { Botao, Campo } from "@/components/ui";
import { ROTULO_TIPO_COMPONENTE_KIT, TIPOS_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

export type LinhaComponente = {
  tipo: TipoComponenteKit;
  descricao: string;
  potenciaW: string;
  quantidade: string;
  /** Não preenchido mais — a busca no catálogo externo (OpenSolar) foi removida em 2026-09-30 (não funcionava de forma confiável). */
  precoEstimadoUnitario?: string;
};

export function novaLinhaComponente(tipo: TipoComponenteKit): LinhaComponente {
  return { tipo, descricao: "", potenciaW: "", quantidade: "1" };
}

/** Aceita "550", "550,5"; vazio ou inválido vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converte as linhas do editor para o formato salvo (só as com descrição preenchida). */
export function linhasParaComponentes(linhas: LinhaComponente[]) {
  return linhas
    .filter((l) => l.descricao.trim())
    .map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao.trim(),
      potenciaW: numero(l.potenciaW),
      quantidade: Math.max(1, Math.round(numero(l.quantidade) ?? 1)),
    }));
}

/** Editor do kit personalizado: módulos, inversor, baterias e outros itens (múltiplos de cada). */
export function EditorComponentesKit({
  linhas,
  onChange,
  sugerirQuantidadeModulo,
}: {
  linhas: LinhaComponente[];
  onChange: (linhas: LinhaComponente[]) => void;
  /** Dado o consumo já informado no formulário, sugere quantos módulos de uma potência cobririam ele. */
  sugerirQuantidadeModulo?: (potenciaW: number) => number | null;
}) {
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
                <Campo
                  rotulo="Modelo / descrição"
                  value={l.descricao}
                  onChange={(e) => atualizar(i, { descricao: e.target.value })}
                  placeholder={tipo === "modulo" ? "Ex.: Canadian 550 W" : "Ex.: Growatt 5 kW"}
                />
                <Campo
                  rotulo="Potência (W)"
                  inputMode="decimal"
                  value={l.potenciaW}
                  onChange={(e) => atualizar(i, { potenciaW: e.target.value })}
                  placeholder="Opcional"
                />
                <Campo
                  rotulo="Qtd."
                  inputMode="numeric"
                  value={l.quantidade}
                  onChange={(e) => atualizar(i, { quantidade: e.target.value })}
                />
                <Botao type="button" variante="secundario" onClick={() => remover(i)}>
                  Remover
                </Botao>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
