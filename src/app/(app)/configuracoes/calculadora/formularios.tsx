"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { criarKit, editarKit, editarParametros } from "@/lib/acoes/calculadora";

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
      <Campo
        rotulo="Percentual do Fio B cobrado sobre a energia compensada (%)"
        name="percentual_fio_b"
        inputMode="decimal"
        defaultValue={String(parametros.percentualFioB * 100).replace(".", ",")}
        required
      />
      <div className="grid grid-cols-3 gap-2">
        <Campo
          rotulo="Disponibilidade monofásico (kWh)"
          name="disponibilidade_mono_kwh"
          inputMode="decimal"
          defaultValue={String(parametros.disponibilidadeMonoKwh).replace(".", ",")}
          required
        />
        <Campo
          rotulo="Disponibilidade bifásico (kWh)"
          name="disponibilidade_bi_kwh"
          inputMode="decimal"
          defaultValue={String(parametros.disponibilidadeBiKwh).replace(".", ",")}
          required
        />
        <Campo
          rotulo="Disponibilidade trifásico (kWh)"
          name="disponibilidade_tri_kwh"
          inputMode="decimal"
          defaultValue={String(parametros.disponibilidadeTriKwh).replace(".", ",")}
          required
        />
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
          defaultValue={String(parametros.comissaoPercentual * 100).replace(".", ",")}
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
