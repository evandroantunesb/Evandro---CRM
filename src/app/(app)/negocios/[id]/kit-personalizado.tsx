"use client";

import { useActionState, useMemo, useState } from "react";
import { EditorComponentesKit, linhasParaComponentes, type LinhaComponente } from "@/components/kit-componentes";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { salvarKitPersonalizado } from "@/lib/acoes/calculadora";
import {
  calcular,
  DISPONIBILIDADE_PADRAO_CAMEL,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_COMPONENTE_KIT, ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type TipoComponenteKit, type TipoLigacao } from "@/lib/tipos";

export type ComponenteSalvo = {
  tipo: TipoComponenteKit;
  descricao: string;
  potenciaW: number | null;
  quantidade: number;
};

export type CalculoSalvo = {
  id: string;
  kitNome: string;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  tarifaKwh: number;
  geracaoEstimadaKwhMes: number;
  economiaMensal: number;
  paybackMeses: number | null;
  observacoes: string | null;
};

type Parametros = {
  produtividadeKwhKwpMes: number;
  percentualFioB: number;
  disponibilidadeMonoKwh: number;
  disponibilidadeBiKwh: number;
  disponibilidadeTriKwh: number;
};

function numeroBr(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Aceita "450", "450,5"; vazio ou inválido vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function KitPersonalizado({
  negocioId,
  negocioValor,
  estruturaTelhado,
  padraoCliente,
  consumoMedioKwhPadrao,
  valorFaturaMedioPadrao,
  componentesSalvos,
  calculo,
  parametros,
}: {
  negocioId: string;
  negocioValor: number | null;
  estruturaTelhado: string | null;
  padraoCliente: string | null;
  consumoMedioKwhPadrao: number | null;
  valorFaturaMedioPadrao: number | null;
  componentesSalvos: ComponenteSalvo[];
  calculo: CalculoSalvo | null;
  parametros: Parametros | null;
}) {
  const [resultado, acao, pendente] = useActionState(salvarKitPersonalizado, null);
  const [editando, setEditando] = useState(!calculo);
  // Fecha o formulário assim que salva (sem useEffect, ajustando durante a renderização).
  const [ultimoResultado, setUltimoResultado] = useState(resultado);
  if (resultado !== ultimoResultado) {
    setUltimoResultado(resultado);
    if (resultado?.ok) setEditando(false);
  }

  const [linhas, setLinhas] = useState<LinhaComponente[]>(() =>
    componentesSalvos.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      potenciaW: c.potenciaW != null ? numeroBr(c.potenciaW) : "",
      quantidade: String(c.quantidade),
    })),
  );
  const [estrutura, setEstrutura] = useState(estruturaTelhado ?? "");
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>(calculo?.tipoLigacao ?? "trifasico");
  const [consumoMedioKwh, setConsumoMedioKwh] = useState(() => {
    if (calculo) return numeroBr(calculo.consumoMedioKwh);
    return consumoMedioKwhPadrao != null ? numeroBr(consumoMedioKwhPadrao) : "";
  });
  const [valorFaturaMedio, setValorFaturaMedio] = useState(() =>
    !calculo && valorFaturaMedioPadrao != null ? numeroBr(valorFaturaMedioPadrao) : "",
  );
  const [tarifaKwh, setTarifaKwh] = useState(calculo ? numeroBr(calculo.tarifaKwh) : "");

  const componentes = useMemo(() => linhasParaComponentes(linhas), [linhas]);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);

  // Consumo médio em kWh, vindo do campo direto ou calculado a partir da fatura + tarifa.
  const consumoMedioEstimado = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    if (consumo) return consumo;
    if (fatura && tarifa) return fatura / tarifa;
    return null;
  }, [consumoMedioKwh, valorFaturaMedio, tarifaKwh]);

  // Sugere a quantidade de módulos pro consumo já informado, assim que o
  // vendedor escolhe (ou digita) a potência de um módulo.
  const sugerirQuantidadeModulo = useMemo(() => {
    if (!parametros || !consumoMedioEstimado) return undefined;
    return (potenciaW: number) =>
      sugerirQuantidadeModulos(consumoMedioEstimado, parametros.produtividadeKwhKwpMes, potenciaW);
  }, [parametros, consumoMedioEstimado]);

  const previa = useMemo(() => {
    if (!parametros) return null;
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    if (potenciaKwp <= 0 || !tarifa || (!consumo && !fatura)) return null;
    const consumoMedioFinal = consumo ?? fatura! / tarifa;
    return calcular({
      potenciaKwp,
      precoKit: negocioValor ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoMedioFinal,
      tarifaKwh: tarifa,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[tipoLigacao]],
    });
  }, [parametros, tarifaKwh, consumoMedioKwh, valorFaturaMedio, potenciaKwp, negocioValor, tipoLigacao]);

  if (!parametros) {
    return <p className="text-sm text-zinc-600">Parâmetros da calculadora não configurados para a empresa.</p>;
  }

  if (calculo && !editando) {
    return (
      <div className="flex flex-col gap-3">
        {!padraoCliente && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Favor adicionar o padrão atual do cliente (em &quot;Dados do negócio&quot;) para conferir compatibilidade com o kit.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Kit</dt>
            <dd className="font-medium text-zinc-900">{calculo.kitNome}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Ligação</dt>
            <dd>{ROTULO_TIPO_LIGACAO[calculo.tipoLigacao]}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Geração estimada</dt>
            <dd>{numeroBr(calculo.geracaoEstimadaKwhMes)} kWh/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Consumo médio</dt>
            <dd>{numeroBr(calculo.consumoMedioKwh)} kWh/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Economia estimada</dt>
            <dd className="font-medium text-green-700">{formatarMoeda(calculo.economiaMensal)}/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Payback estimado</dt>
            <dd>{calculo.paybackMeses != null ? `${numeroBr(calculo.paybackMeses)} meses` : "—"}</dd>
          </div>
          {estruturaTelhado && (
            <div>
              <dt className="text-zinc-500">Estrutura do telhado</dt>
              <dd>{estruturaTelhado}</dd>
            </div>
          )}
        </dl>
        {componentesSalvos.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-3 text-sm">
            {componentesSalvos.map((c, i) => (
              <li key={i}>
                <span className="text-zinc-500">{ROTULO_TIPO_COMPONENTE_KIT[c.tipo]}:</span> {c.descricao}
                {c.potenciaW ? ` · ${numeroBr(c.potenciaW)} W` : ""} × {c.quantidade}
              </li>
            ))}
          </ul>
        )}
        {calculo.observacoes && <p className="text-sm text-zinc-600">{calculo.observacoes}</p>}
        <p className="text-xs text-zinc-400">
          Estimativa do modo comercial (sem simulação de engenharia) — confirme com o time técnico antes de fechar.
        </p>
        <Botao type="button" variante="secundario" onClick={() => setEditando(true)} className="self-start">
          Editar kit / recalcular
        </Botao>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />
      {!padraoCliente && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Favor adicionar o padrão atual do cliente (em &quot;Dados do negócio&quot;) para conferir compatibilidade com o kit.
        </p>
      )}
      <EditorComponentesKit linhas={linhas} onChange={setLinhas} sugerirQuantidadeModulo={sugerirQuantidadeModulo} />
      <Campo
        rotulo="Estrutura do telhado"
        name="estruturaTelhado"
        value={estrutura}
        onChange={(e) => setEstrutura(e.target.value)}
        placeholder="Ex.: perfil de alumínio, gancho"
      />
      <Selecao
        rotulo="Tipo de ligação"
        name="tipoLigacao"
        required
        value={tipoLigacao}
        onChange={(e) => setTipoLigacao(e.target.value as TipoLigacao)}
      >
        {TIPOS_LIGACAO.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_LIGACAO[t]}
          </option>
        ))}
      </Selecao>
      <Campo
        rotulo="Consumo médio (kWh/mês)"
        name="consumoMedioKwh"
        inputMode="decimal"
        placeholder="ex.: 450"
        value={consumoMedioKwh}
        onChange={(e) => setConsumoMedioKwh(e.target.value)}
      />
      <p className="-mt-2 text-xs text-zinc-400">Sem o consumo em kWh? Preencha o valor médio da fatura abaixo em vez disso.</p>
      <Campo
        rotulo="Valor médio da fatura (R$, opcional)"
        name="valorFaturaMedio"
        inputMode="decimal"
        placeholder="ex.: 450,00"
        value={valorFaturaMedio}
        onChange={(e) => setValorFaturaMedio(e.target.value)}
      />
      <Campo
        rotulo="Tarifa (R$/kWh)"
        name="tarifaKwh"
        inputMode="decimal"
        required
        placeholder="ex.: 0,95"
        value={tarifaKwh}
        onChange={(e) => setTarifaKwh(e.target.value)}
      />
      {previa && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Potência do kit</dt>
            <dd className="font-medium text-zinc-900">{numeroBr(potenciaKwp)} kWp</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Geração estimada</dt>
            <dd className="font-medium text-zinc-900">{previa.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Economia estimada</dt>
            <dd className="font-medium text-green-700">{formatarMoeda(previa.economiaMensal)}/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Payback estimado</dt>
            <dd className="font-medium text-zinc-900">
              {negocioValor ? (previa.paybackMeses != null ? `${previa.paybackMeses.toLocaleString("pt-BR")} meses` : "—") : "defina o valor do negócio"}
            </dd>
          </div>
        </dl>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Observações (opcional)</span>
        <textarea
          name="observacoes"
          rows={2}
          defaultValue={calculo?.observacoes ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
        />
      </label>
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Calculando..." : "Salvar kit e calcular"}
        </Botao>
        {calculo && (
          <Botao type="button" variante="secundario" onClick={() => setEditando(false)}>
            Cancelar
          </Botao>
        )}
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
