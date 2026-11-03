"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { confirmarProdutividade, criarKit, editarKit, editarParametros } from "@/lib/acoes/calculadora";
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
      <Botao type="submit" disabled={pendente} className="self-start">
        Salvar parâmetros
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
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
