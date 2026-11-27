"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { confirmarProdutividade, criarKit, editarKit, editarParametros } from "@/lib/acoes/calculadora";
import { lerNumeroBr } from "@/lib/formatacao";
import { MESES_ABREV, MESES_NOMES } from "@/lib/geracao-mensal";
import { percentualParaCampo } from "@/lib/percentual-exibicao";

const inputClasse = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovoKit() {
  const [resultado, acao, pendente] = useActionState(criarKit, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);
  return (
    <form ref={form} action={acao} className="flex flex-wrap items-end gap-2">
      <input name="nome" placeholder="Nome do kit, ex.: Kit 5 kWp monofásico" className={inputClasse} required />
      <input name="potencia_kwp" placeholder="Potência (kWp)" inputMode="decimal" className={`${inputClasse} max-w-32`} required />
      <input name="preco" placeholder="Preço (R$)" inputMode="decimal" className={`${inputClasse} max-w-32`} required />
      <Botao type="submit" disabled={pendente}>
        Criar kit
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaKit({
  item,
}: {
  item: { id: string; nome: string; potenciaKwp: number; preco: number; descricao: string | null; ativo: boolean };
}) {
  const [resultado, acao, pendente] = useActionState(editarKit, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 first:border-t-0">
      <input type="hidden" name="id" value={item.id} />
      <input name="nome" defaultValue={item.nome} aria-label="Nome" className={inputClasse} required />
      <input
        name="potencia_kwp"
        defaultValue={String(item.potenciaKwp).replace(".", ",")}
        aria-label="Potência (kWp)"
        inputMode="decimal"
        className={`${inputClasse} max-w-28`}
        required
      />
      <input
        name="preco"
        defaultValue={String(item.preco).replace(".", ",")}
        aria-label="Preço (R$)"
        inputMode="decimal"
        className={`${inputClasse} max-w-28`}
        required
      />
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativo" defaultChecked={item.ativo} /> Ativo
      </label>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

export function FormularioParametros({
  parametros,
}: {
  parametros: {
    produtividadeKwhKwpMes: number;
    percentualFioB: number;
    disponibilidadeMonoKwh: number;
    disponibilidadeBiKwh: number;
    disponibilidadeTriKwh: number;
    custoInstalacaoPorModulo: number;
    custoMaterialCaPorKwp: number;
    custoEngenharia: number;
    comissaoPercentual: number;
    custoFrete: number;
    icms: number;
    pisCofins: number;
    curvaGeracaoMensal: number[] | null;
  };
}) {
  const [resultado, acao, pendente] = useActionState(editarParametros, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo
        rotulo="Produtividade média (kWh por kWp por mês)"
        name="produtividade_kwh_kwp_mes"
        inputMode="decimal"
        defaultValue={String(parametros.produtividadeKwhKwpMes).replace(".", ",")}
        required
      />
      <CurvaGeracaoMensal inicial={parametros.curvaGeracaoMensal} />
      {/* Fio B e disponibilidade saíram da edição: a estimativa usa a regra legal, não estes valores da empresa. */}
      <div data-testid="parametros-regulatorios" className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        <p className="font-medium text-zinc-700">Fio B e custo de disponibilidade: definidos pela regra, não configuráveis</p>
        <p>
          A estimativa usa o Fio B oficial da distribuidora (ANEEL, vigente na data do cálculo), o percentual legal do ano
          (Lei 14.300, art. 27: 60% em 2026, 75% em 2027) e o custo de disponibilidade da ligação (REN 1.000, art. 291:
          monofásico 30 kWh, bifásico 50 kWh, trifásico 100 kWh).
        </p>
        <p className="mt-1 text-zinc-500">
          Valores antigos da empresa, sem efeito na estimativa (guardados só para conferir cálculos feitos pela fórmula
          antiga): Fio B {percentualParaCampo(parametros.percentualFioB)}%; disponibilidade{" "}
          {[parametros.disponibilidadeMonoKwh, parametros.disponibilidadeBiKwh, parametros.disponibilidadeTriKwh]
            .map((v) => String(v).replace(".", ","))
            .join(" / ")}{" "}
          kWh.
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-700">Tributos da conta de luz</p>
      <div className="grid grid-cols-2 gap-2">
        <Campo
          rotulo="ICMS (%)"
          name="icms"
          inputMode="decimal"
          defaultValue={percentualParaCampo(parametros.icms)}
          required
        />
        <Campo
          rotulo="PIS/Cofins (%)"
          name="pis_cofins"
          inputMode="decimal"
          defaultValue={percentualParaCampo(parametros.pisCofins)}
          required
        />
      </div>
      <p data-testid="tributos-ajuda" className="-mt-1 text-xs text-zinc-500">
        Entram &quot;por dentro&quot; na tarifa e no Fio B pago, como na fatura. A energia compensada pelo sistema é isenta
        (Lei PR 19.595/2018 e Lei 13.169/2015). O PIS/Cofins muda todo mês: use o da última fatura da distribuidora. Ao
        mudar, os cálculos já feitos ficam desatualizados até o vendedor recalcular o kit.
      </p>
      <p className="mt-2 text-sm font-medium text-zinc-700">Custos internos (opcional)</p>
      <p className="-mt-2 text-xs text-zinc-500">
        Somados automaticamente ao preço sugerido do negócio junto com o preço estimado dos componentes do catálogo —
        o vendedor continua livre pra editar o valor final.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Campo
          rotulo="Instalação por módulo (R$)"
          name="custo_instalacao_por_modulo"
          inputMode="decimal"
          defaultValue={String(parametros.custoInstalacaoPorModulo).replace(".", ",")}
          placeholder="0"
        />
        <Campo
          rotulo="Material CA por kWp (R$)"
          name="custo_material_ca_por_kwp"
          inputMode="decimal"
          defaultValue={String(parametros.custoMaterialCaPorKwp).replace(".", ",")}
          placeholder="0"
        />
        <Campo
          rotulo="Engenharia (R$, fixo por projeto)"
          name="custo_engenharia"
          inputMode="decimal"
          defaultValue={String(parametros.custoEngenharia).replace(".", ",")}
          placeholder="0"
        />
        <Campo
          rotulo="Comissão (% sobre o subtotal)"
          name="comissao_percentual"
          inputMode="decimal"
          defaultValue={percentualParaCampo(parametros.comissaoPercentual)}
          placeholder="0"
        />
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-700">Orçamento da obra</p>
      <p className="-mt-2 text-xs text-zinc-500">
        Só entra no custo planejado da obra (categoria Frete), não no preço sugerido: normalmente o frete já vem embutido no preço.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Frete (R$, fixo por obra)" name="custo_frete" inputMode="decimal" defaultValue={String(parametros.custoFrete).replace(".", ",")} placeholder="0" />
      </div>
      <Botao type="submit" disabled={pendente} className="self-start">
        Salvar parâmetros
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

/**
 * Curva de geração por mês (proposta completa, PR 4; prévia aprovada em 25/11/2026). 12 valores da região em qualquer
 * unidade: só a proporção entre os meses reparte a geração do ano no gráfico da proposta. Campos `curva_mes_01`…`12`.
 */
function CurvaGeracaoMensal({ inicial }: { inicial: number[] | null }) {
  const [valores, setValores] = useState<string[]>(() => MESES_NOMES.map((_, i) => (inicial?.[i] != null ? String(inicial[i]).replace(".", ",") : "")));
  const numeros = valores.map((v) => lerNumeroBr(v));
  const completa = numeros.every((n) => n != null && n > 0);
  const soma = completa ? numeros.reduce<number>((a, b) => a + (b ?? 0), 0) : 0;
  const maior = completa ? Math.max(...numeros.map((n) => n ?? 0)) : 0;
  return (
    <fieldset data-testid="curva-geracao" className="flex flex-col gap-3 rounded-xl border border-dourado bg-dourado/10 p-4">
      <legend className="sr-only">Curva de geração por mês</legend>
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <p className="text-sm font-semibold text-zinc-800">Curva de geração por mês</p>
        <span className="rounded-full bg-dourado/25 px-2.5 py-0.5 text-xs font-medium text-zinc-800">Novo</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">opcional</span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-700">
        Digite os 12 valores da sua região na mesma unidade (por exemplo, a irradiação média de cada mês do SunData/CRESESB,
        em kWh/m² por dia). O sistema usa só a proporção entre os meses: a geração do ano continua sendo a produtividade
        acima × 12. Sem a curva, a proposta sai sem o gráfico mês a mês.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MESES_NOMES.map((nome, i) => (
          <label key={nome} className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
            {nome}
            <input
              name={`curva_mes_${String(i + 1).padStart(2, "0")}`}
              inputMode="decimal"
              value={valores[i]}
              onChange={(ev) => setValores((v) => v.map((x, j) => (j === i ? ev.target.value : x)))}
              className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-base tabular-nums text-zinc-900"
            />
          </label>
        ))}
      </div>
      {completa && (
        <div className="rounded-lg bg-white p-3 shadow-[0_0_0_1px_#ece8de]">
          <p className="mb-2 text-xs font-semibold text-zinc-700">Como fica a geração do ano (parte de cada mês)</p>
          <div className="grid h-24 grid-cols-12 items-end gap-1" aria-hidden>
            {numeros.map((n, i) => (
              <div key={MESES_ABREV[i]} className="flex h-full flex-col items-center justify-end gap-0.5">
                <span className="text-[10px] font-semibold tabular-nums text-zinc-700">{(((n ?? 0) / soma) * 100).toFixed(1).replace(".", ",")}%</span>
                <span className="block w-full rounded-t bg-dourado" style={{ height: `${Math.round(((n ?? 0) / maior) * 70)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[10px] text-zinc-500" aria-hidden>
            {MESES_ABREV.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** Confirmação da produtividade: sem ela, a proposta emitida não mostra a geração estimada. */
export function ConfirmarProdutividade({
  valor,
  confirmadaEm,
  confirmadaFonte,
  confirmadaResponsavel,
}: {
  valor: number;
  confirmadaEm: string | null;
  confirmadaFonte: string | null;
  confirmadaResponsavel: string | null;
}) {
  const [resultado, acao, pendente] = useActionState(confirmarProdutividade, null);
  return (
    <form action={acao} className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-200 p-3" data-testid="confirmar-produtividade">
      <p className="text-sm font-medium text-zinc-800">Confirmação da produtividade ({valor.toLocaleString("pt-BR")} kWh/kWp/mês)</p>
      {confirmadaEm ? (
        <p className="text-xs text-green-800" data-testid="produtividade-confirmada">
          Confirmada em {new Date(confirmadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Fonte: {confirmadaFonte}. Responsável pela validação:{" "}
          {confirmadaResponsavel}.
        </p>
      ) : (
        <p className="text-xs text-amber-900" data-testid="produtividade-nao-confirmada">
          Não confirmada: as propostas emitidas saem sem o número de geração estimada. O padrão de fábrica (120) é uma simplificação que precisa ser
          calibrada pelo responsável técnico.
        </p>
      )}
      <input type="hidden" name="valor" value={valor} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Fonte do valor (de onde ele vem; fica registrada)</span>
        <input name="fonte" maxLength={120} required minLength={10} placeholder="Ex.: estudo de irradiação da região, relatório de geração real" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Responsável pela validação (quem calibrou este valor)</span>
        <input name="responsavel" maxLength={60} required minLength={3} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </label>
      <Botao type="submit" disabled={pendente} className="self-start">
        Confirmar este valor
      </Botao>
      <p className="text-xs text-zinc-500">Alterar a produtividade depois apaga a confirmação.</p>
      <Mensagem resultado={resultado} />
    </form>
  );
}
