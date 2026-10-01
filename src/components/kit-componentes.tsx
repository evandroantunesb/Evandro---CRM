"use client";

import { useState } from "react";
import { Botao, Campo, Selecao } from "@/components/ui";
import type { EquipamentoAtivo } from "@/lib/dimensionamento";
import { ROTULO_TIPO_COMPONENTE_KIT, TIPOS_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

export type LinhaComponente = {
  tipo: TipoComponenteKit;
  descricao: string;
  potenciaW: string;
  quantidade: string;
  /** Preço de referência (teste) vindo do catálogo ao selecionar — nunca é salvo, só usado pra sugerir o valor do negócio. */
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

const SENTINELA_TEXTO_LIVRE = "__texto_livre__";

/** Monta o rótulo "Fabricante Modelo (potência)" usado tanto na opção do catálogo quanto, depois
 * de selecionada, como descrição salva no componente — igual ao resto do catálogo (Fase 4). */
function rotuloEquipamento(e: EquipamentoAtivo) {
  return `${e.fabricante} ${e.modelo}`;
}

/**
 * Campo "Modelo / descrição": quando `catalogo` tem equipamentos (módulo/inversor ativos da
 * empresa em `equipamentos_empresa`), mostra uma seleção a partir dele; "Outro (digitar
 * manualmente)" volta pro texto livre, pra equipamento fora do catálogo ou tipo sem catálogo
 * (bateria, estrutura, outro). Catálogo próprio da empresa substituindo a busca livre/OpenSolar
 * (removida em 2026-09-30) — Fase 6 da reconciliação do motor de dimensionamento com o wizard novo.
 */
function CampoModeloComBusca({
  valor,
  placeholder,
  catalogo,
  onChangeTexto,
  onSelecionarEquipamento,
}: {
  tipo: TipoComponenteKit;
  valor: string;
  placeholder: string;
  catalogo?: EquipamentoAtivo[];
  onChangeTexto: (v: string) => void;
  onSelecionarEquipamento: (equipamento: EquipamentoAtivo) => void;
}) {
  const catalogoDisponivel = !!catalogo && catalogo.length > 0;
  // Começa em modo texto livre se o valor atual não bate com nenhum item do catálogo (ex.:
  // equipamento ainda não cadastrado, ou editor aberto com uma descrição já salva manualmente).
  const [modoTextoLivre, setModoTextoLivre] = useState(
    () => !catalogoDisponivel || !catalogo!.some((e) => rotuloEquipamento(e) === valor),
  );

  if (!catalogoDisponivel || modoTextoLivre) {
    return (
      <div className="flex flex-col gap-1">
        <Campo rotulo="Modelo / descrição" value={valor} onChange={(e) => onChangeTexto(e.target.value)} placeholder={placeholder} />
        {catalogoDisponivel && (
          <button type="button" className="self-start text-xs text-amber-700 hover:underline" onClick={() => setModoTextoLivre(false)}>
            Escolher do catálogo da empresa
          </button>
        )}
      </div>
    );
  }

  const selecionadoId = catalogo!.find((e) => rotuloEquipamento(e) === valor)?.id ?? "";

  return (
    <Selecao
      rotulo="Modelo / descrição"
      value={selecionadoId || (valor ? SENTINELA_TEXTO_LIVRE : "")}
      onChange={(e) => {
        if (e.target.value === SENTINELA_TEXTO_LIVRE) return setModoTextoLivre(true);
        const equipamento = catalogo!.find((eq) => eq.id === e.target.value);
        if (equipamento) onSelecionarEquipamento(equipamento);
      }}
    >
      <option value="">Selecione</option>
      {catalogo!.map((e) => (
        <option key={e.id} value={e.id}>
          {rotuloEquipamento(e)} ({e.potenciaW.toLocaleString("pt-BR")} W)
        </option>
      ))}
      <option value={SENTINELA_TEXTO_LIVRE}>Outro (digitar manualmente)</option>
    </Selecao>
  );
}

/** Editor do kit personalizado: módulos, inversor, baterias e outros itens (múltiplos de cada). */
export function EditorComponentesKit({
  linhas,
  onChange,
  sugerirQuantidadeModulo,
  catalogoPorTipo,
}: {
  linhas: LinhaComponente[];
  onChange: (linhas: LinhaComponente[]) => void;
  /** Dado o consumo já informado no formulário, sugere quantos módulos de uma potência cobririam ele. */
  sugerirQuantidadeModulo?: (potenciaW: number) => number | null;
  /** Catálogo ativo da empresa (`equipamentos_empresa`), por tipo — quando presente, troca o campo
   * "Modelo / descrição" de módulo/inversor por uma seleção a partir dele (com texto livre como
   * alternativa). Tipos sem catálogo aqui (bateria, outro) continuam só com texto livre. */
  catalogoPorTipo?: Partial<Record<TipoComponenteKit, EquipamentoAtivo[]>>;
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
                <CampoModeloComBusca
                  tipo={tipo}
                  valor={l.descricao}
                  placeholder={tipo === "modulo" ? "Ex.: Canadian 550 W" : "Ex.: Growatt 5 kW"}
                  catalogo={catalogoPorTipo?.[tipo]}
                  onChangeTexto={(v) => atualizar(i, { descricao: v })}
                  onSelecionarEquipamento={(equipamento) =>
                    atualizar(i, {
                      descricao: rotuloEquipamento(equipamento),
                      potenciaW: String(equipamento.potenciaW),
                    })
                  }
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
