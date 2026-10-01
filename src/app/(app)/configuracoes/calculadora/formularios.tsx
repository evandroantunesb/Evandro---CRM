"use client";

import { useActionState, useEffect, useRef } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { criarKit, editarKit, editarParametros } from "@/lib/acoes/calculadora";
import { PADROES_DIMENSIONAMENTO } from "@/lib/calculadora";
import { numeroParaCampo } from "@/lib/formatacao";

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
        defaultValue={numeroParaCampo(item.potenciaKwp)}
        aria-label="Potência (kWp)"
        inputMode="decimal"
        className={`${inputClasse} max-w-28`}
        required
      />
      <input
        name="preco"
        defaultValue={numeroParaCampo(item.preco)}
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

/** Valor como veio do banco — pode faltar (coluna ainda não migrada, registro antigo). */
type ValorBanco = number | null | undefined;

export function FormularioParametros({
  parametros,
}: {
  parametros: {
    produtividadeKwhKwpMes: ValorBanco;
    percentualFioB: ValorBanco;
    disponibilidadeMonoKwh: ValorBanco;
    disponibilidadeBiKwh: ValorBanco;
    disponibilidadeTriKwh: ValorBanco;
    custoInstalacaoPorModulo: ValorBanco;
    custoMaterialCaPorKwp: ValorBanco;
    custoEngenharia: ValorBanco;
    comissaoPercentual: ValorBanco;
    margemDimensionamentoPct: ValorBanco;
    overloadMaximoPct: ValorBanco;
    overloadCriticoPct: ValorBanco;
    temperaturaMinimaProjetoC: ValorBanco;
    siglaDistribuidoraAneel: string | null | undefined;
  };
}) {
  const [resultado, acao, pendente] = useActionState(editarParametros, null);
  const p = parametros;
  // Campos sem padrão do sistema ficam vazios com este aviso, em vez de "NaN"/"undefined".
  const naoConfigurado = "Não configurado";
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo
        rotulo="Produtividade média (kWh por kWp por mês)"
        name="produtividade_kwh_kwp_mes"
        inputMode="decimal"
        defaultValue={numeroParaCampo(p.produtividadeKwhKwpMes)}
        placeholder={naoConfigurado}
        required
      />
      <Campo
        rotulo="Percentual do Fio B cobrado sobre a energia compensada (%)"
        name="percentual_fio_b"
        inputMode="decimal"
        defaultValue={numeroParaCampo(p.percentualFioB, { escala: 100 })}
        placeholder={naoConfigurado}
        required
      />
      <Campo
        rotulo="Sigla da distribuidora na ANEEL (opcional)"
        name="sigla_distribuidora_aneel"
        defaultValue={p.siglaDistribuidoraAneel ?? ""}
        placeholder="Ex.: CPFL-PAULISTA"
      />
      <p className="-mt-2 text-xs text-zinc-500">
        Preenchendo, o &quot;Valor da tarifa&quot; em &quot;Adicionar negócio&quot; é sugerido a partir da tarifa
        homologada real da ANEEL (subgrupo B1, atualizada semanalmente); sem isso, continua só digitado à mão. A
        sigla é a mesma usada nos processos da ANEEL para a distribuidora (SigAgente) — confira no site da agência.
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-700">Dimensionamento automático</p>
      <p className="-mt-2 text-xs text-zinc-500">
        Usados pra montar o kit sozinho a partir do consumo, em &quot;Adicionar negócio&quot; — os módulos e inversores
        que entram na combinação ficam na aba Catálogo.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Campo
          rotulo="Margem de dimensionamento (%)"
          name="margem_dimensionamento_pct"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.margemDimensionamentoPct, {
            padrao: PADROES_DIMENSIONAMENTO.margemDimensionamentoPct,
            escala: 100,
          })}
          required
        />
        <Campo
          rotulo="Overload automático máximo (%)"
          name="overload_maximo_pct"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.overloadMaximoPct, { padrao: PADROES_DIMENSIONAMENTO.overloadMaximoPct, escala: 100 })}
          required
        />
        <Campo
          rotulo="Overload crítico (%)"
          name="overload_critico_pct"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.overloadCriticoPct, {
            padrao: PADROES_DIMENSIONAMENTO.overloadCriticoPct,
            escala: 100,
          })}
          required
        />
      </div>
      <p className="-mt-2 text-xs text-zinc-500">
        Até o overload automático máximo, o kit é sugerido direto. Entre esse limite e o crítico, aparece um aviso
        leve. Acima do crítico, um alerta forte — mas a escolha manual nunca é bloqueada em nenhuma faixa.
      </p>
      <div className="sm:w-56">
        <Campo
          rotulo="Temperatura mínima de projeto (°C)"
          name="temperatura_minima_projeto_c"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.temperaturaMinimaProjetoC, {
            padrao: PADROES_DIMENSIONAMENTO.temperaturaMinimaProjetoC,
          })}
          required
        />
      </div>
      <p className="-mt-2 text-xs text-zinc-500">
        Usada pra calcular o Voc (tensão em circuito aberto) no frio, o pior caso pra não estourar a tensão máxima do
        inversor. Ajuste pela região/telhado mais frio que a empresa atende.
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-700">Disponibilidade (custo mínimo da distribuidora)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Campo
          rotulo="Monofásico (kWh)"
          name="disponibilidade_mono_kwh"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.disponibilidadeMonoKwh)}
          placeholder={naoConfigurado}
          required
        />
        <Campo
          rotulo="Bifásico (kWh)"
          name="disponibilidade_bi_kwh"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.disponibilidadeBiKwh)}
          placeholder={naoConfigurado}
          required
        />
        <Campo
          rotulo="Trifásico (kWh)"
          name="disponibilidade_tri_kwh"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.disponibilidadeTriKwh)}
          placeholder={naoConfigurado}
          required
        />
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-700">Custos internos (opcional)</p>
      <p className="-mt-2 text-xs text-zinc-500">
        Somados automaticamente ao preço sugerido do negócio junto com o preço estimado dos componentes do catálogo —
        o vendedor continua livre pra editar o valor final.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Campo
          rotulo="Instalação por módulo (R$)"
          name="custo_instalacao_por_modulo"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.custoInstalacaoPorModulo)}
          placeholder="0"
        />
        <Campo
          rotulo="Material CA por kWp (R$)"
          name="custo_material_ca_por_kwp"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.custoMaterialCaPorKwp)}
          placeholder="0"
        />
        <Campo
          rotulo="Engenharia (R$, fixo por projeto)"
          name="custo_engenharia"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.custoEngenharia)}
          placeholder="0"
        />
        <Campo
          rotulo="Comissão (% sobre o subtotal)"
          name="comissao_percentual"
          inputMode="decimal"
          defaultValue={numeroParaCampo(p.comissaoPercentual, { escala: 100 })}
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

