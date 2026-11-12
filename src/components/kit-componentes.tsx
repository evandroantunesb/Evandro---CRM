"use client";

import { Botao, CLASSE_ENTRADA, Campo } from "@/components/ui";
import { categoriasDoTipo, materialServeAoTipo, type MaterialKitVM } from "@/lib/compras/precificacao-kit";
import { DIAS_PRECO_ANTIGO, diasDesde } from "@/lib/compras/precos";
import { formatarNumeroBr, lerNumeroBr } from "@/lib/formatacao";
import type { CampoLinha, LinhaComponente, ProblemaLinha } from "@/lib/kit-linhas";
import { ROTULO_TIPO_COMPONENTE_KIT, TIPOS_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

// A validação das linhas vive em `@/lib/kit-linhas` (pura, testável); o editor só a exibe.
export { linhasParaComponentes, type LinhaComponente } from "@/lib/kit-linhas";

export function novaLinhaComponente(tipo: TipoComponenteKit): LinhaComponente {
  return { tipo, descricao: "", potenciaW: "", quantidade: "1", materialId: null, precoVendaManual: "" };
}

/** Padrão brasileiro ("550", "550,5", "1.200"); vazio, inválido ou ambíguo vira null. Só para a sugestão de quantidade. */
function numero(v: string): number | null {
  const n = lerNumeroBr(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

const FORA_DA_TABELA = "";

/**
 * Editor do kit (P4b, prévia aprovada "Compras P4 · Kit pela tabela de preços"): cada item vem dos materiais cadastrados
 * por Compras, com a potência do cadastro. Item fora da tabela (ou material sem preço) pede o preço de venda à mão. O
 * vendedor não vê custo nem margem: o preço do kit sai pronto do servidor.
 */
export function EditorComponentesKit({
  linhas,
  onChange,
  sugerirQuantidadeModulo,
  problemas = [],
  materiais = [],
  hoje,
}: {
  linhas: LinhaComponente[];
  onChange: (linhas: LinhaComponente[]) => void;
  /** Dado o consumo já informado no formulário, sugere quantos módulos de uma potência cobririam ele. */
  sugerirQuantidadeModulo?: (potenciaW: number) => number | null;
  /** Problemas das linhas (de `analisarLinhas`) a exibir; o pai só os passa depois de uma tentativa de envio. */
  problemas?: ProblemaLinha[];
  /** Materiais da tabela de preços (sem custo). Vazio: a empresa ainda não tem tabela; todo item vai à mão. */
  materiais?: MaterialKitVM[];
  /** Data de hoje (AAAA-MM-DD), para o aviso de preço velho. */
  hoje: string;
}) {
  const doCampo = (indice: number, campo: CampoLinha) => problemas.some((p) => p.indice === indice && p.campo === campo);
  const porId = new Map(materiais.map((m) => [m.id, m]));

  function adicionar(tipo: TipoComponenteKit) {
    onChange([...linhas, novaLinhaComponente(tipo)]);
  }
  function atualizar(indice: number, patch: Partial<LinhaComponente>) {
    onChange(
      linhas.map((l, i) => {
        if (i !== indice) return l;
        const atualizada = { ...l, ...patch };
        // Ao (re)definir a potência de um módulo com quantidade ainda no padrão, já sugere quantos módulos cobririam o consumo.
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
  function escolherMaterial(indice: number, id: string) {
    const m = porId.get(id);
    if (!m) return atualizar(indice, { materialId: null, descricao: "", potenciaW: "" });
    atualizar(indice, {
      materialId: m.id,
      descricao: m.nome,
      potenciaW: m.potenciaW != null ? formatarNumeroBr(m.potenciaW) : "",
      ...(m.temPreco ? { precoVendaManual: "" } : {}),
    });
  }
  function remover(indice: number) {
    onChange(linhas.filter((_, i) => i !== indice));
  }

  return (
    <div className="flex flex-col gap-4">
      {materiais.length === 0 && (
        <p className="rounded-lg bg-dourado/10 px-3 py-2 text-xs leading-relaxed text-texto">
          A empresa ainda não tem tabela de preços (Compras › Tabela de preços). Descreva cada item e informe o preço de venda dele.
        </p>
      )}
      {TIPOS_COMPONENTE_KIT.map((tipo) => {
        const doTipo = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.tipo === tipo);
        const opcoes = materiais.filter((m) => materialServeAoTipo(m, tipo));
        const semPotencia =
          (tipo === "modulo" || tipo === "inversor") && materiais.some((m) => categoriasDoTipo(tipo).includes(m.categoria) && m.potenciaW == null);
        return (
          <div key={tipo} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-texto">{ROTULO_TIPO_COMPONENTE_KIT[tipo]}</span>
              <button type="button" onClick={() => adicionar(tipo)} className="text-xs font-medium text-dourado-texto hover:underline">
                + Adicionar {ROTULO_TIPO_COMPONENTE_KIT[tipo].toLowerCase()}
              </button>
            </div>
            {tipo === "modulo" && sugerirQuantidadeModulo && (
              <p className="text-xs text-texto-2">Ao escolher o módulo, a quantidade é sugerida a partir do consumo informado. Ajuste se precisar.</p>
            )}
            {semPotencia && doTipo.length > 0 && (
              <p className="text-xs text-texto-2">Materiais sem potência cadastrada não aparecem aqui: peça a Compras para completar o cadastro.</p>
            )}
            {doTipo.length === 0 && <p className="text-xs text-texto-2">Nenhum item.</p>}
            {doTipo.map(({ l, i }) => {
              const material = l.materialId ? porId.get(l.materialId) : undefined;
              const foraDaTabela = !material;
              const pedePreco = !material || !material.temPreco;
              const dias = material?.dataPreco ? diasDesde(material.dataPreco, hoje) : null;
              return (
                <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-superficie-2 p-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                  {(opcoes.length > 0 || l.materialId) && (
                    <label className="col-span-2 flex flex-col gap-1 text-sm md:col-span-1">
                      <span className="font-medium text-texto-2">Material</span>
                      <select
                        value={l.materialId ?? FORA_DA_TABELA}
                        onChange={(e) => escolherMaterial(i, e.target.value)}
                        aria-invalid={doCampo(i, "descricao") || undefined}
                        className={`${CLASSE_ENTRADA} text-sm`}
                      >
                        <option value={FORA_DA_TABELA}>Fora da tabela (descrever)</option>
                        {l.materialId && !opcoes.some((m) => m.id === l.materialId) && <option value={l.materialId}>{l.descricao}</option>}
                        {opcoes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                            {m.potenciaW != null ? ` · ${formatarNumeroBr(m.potenciaW)} W` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {foraDaTabela && (
                    <Campo
                      rotulo="Modelo / descrição"
                      value={l.descricao}
                      onChange={(e) => atualizar(i, { descricao: e.target.value })}
                      placeholder={tipo === "modulo" ? "Ex.: Módulo 550 W" : "Ex.: Inversor 5 kW"}
                      aria-invalid={doCampo(i, "descricao") || undefined}
                    />
                  )}
                  <Campo
                    rotulo="Potência (W)"
                    inputMode="decimal"
                    value={l.potenciaW}
                    readOnly={!foraDaTabela}
                    onChange={(e) => atualizar(i, { potenciaW: e.target.value })}
                    placeholder={foraDaTabela ? "Opcional" : "—"}
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
                  {pedePreco && (
                    <div className="col-span-full flex flex-col gap-2 sm:flex-row sm:items-end">
                      <p className="flex-1 rounded-lg bg-dourado/10 px-3 py-2 text-xs leading-relaxed text-texto">
                        {foraDaTabela ? "Item fora da tabela de preços." : "Sem preço na tabela de preços."} Informe o preço de venda deste item por unidade.
                      </p>
                      <Campo
                        rotulo="Preço de venda (R$)"
                        inputMode="decimal"
                        value={l.precoVendaManual ?? ""}
                        onChange={(e) => atualizar(i, { precoVendaManual: e.target.value })}
                        placeholder="0,00"
                        aria-invalid={doCampo(i, "precoVendaManual") || undefined}
                      />
                    </div>
                  )}
                  {dias != null && dias > DIAS_PRECO_ANTIGO && (
                    <p className="col-span-full text-xs text-texto-2">Preço de {dias} dias na tabela: Compras pode pedir tabela nova ao fornecedor.</p>
                  )}
                  {problemas
                    .filter((p) => p.indice === i)
                    .map((p) => (
                      <p key={p.campo} role="alert" className="col-span-full text-xs text-erro">
                        {p.mensagem}
                      </p>
                    ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
