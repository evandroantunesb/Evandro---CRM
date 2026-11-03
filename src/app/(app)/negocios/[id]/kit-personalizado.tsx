"use client";

import { useActionState, useMemo, useState } from "react";
import { EditorComponentesKit, type LinhaComponente } from "@/components/kit-componentes";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { atualizarPrecoCalculo, salvarKitPersonalizado } from "@/lib/acoes/calculadora";
import { calcular, custosInternosEstimados, potenciaKitPersonalizadoKwp, sugerirQuantidadeModulos, type ResultadoCalculo } from "@/lib/calculadora";
import {
  mensagemDeRecusa,
  motivosDaAcao,
  textoDoMotivo,
  type EntradaNaoVerificavel,
  type MotivoDesatualizacao,
} from "@/lib/calculo-vigencia";
import type { Pendencia } from "@/lib/estimativa-financeira";
import { formatarDataIso, formatarMoeda, formatarNumeroBr, lerNumeroBr } from "@/lib/formatacao";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";
import { analisarLinhas, resumoProblemasKit } from "@/lib/kit-linhas";
import { MENSAGEM_REMOCAO_COM_CALCULO } from "@/lib/negocio-dados";
import {
  enquadramentoDoTipoCliente,
  resolverTarifa,
  tarifaOficialRsKwh,
  textoRessalva,
  textoVigencia,
  type BaseTributaria,
  type ContextoEstimativa,
  type TarifaGd,
} from "@/lib/tarifa-gd";
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
  kitPreco: number;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  valorFaturaMedio: number | null;
  tarifaKwh: number;
  geracaoEstimadaKwhMes: number;
  /** Nula no resultado técnico incompleto (sem parte financeira). */
  economiaMensal: number | null;
  paybackMeses: number | null;
  observacoes: string | null;
  /** `legado`, `incompleto` ou `completo` (coluna `estado_financeiro`). */
  estadoFinanceiro: string;
  /** Retrato (linhas novas; nulos na legada). */
  contaSemSolar?: number | null;
  contaComSolar?: number | null;
  kwhCompensado?: number | null;
  kwhNaoCompensado?: number | null;
  custoFioB?: number | null;
  tarifaBaseTributaria?: BaseTributaria | null;
  tarifaOrigem?: string | null;
  distribuidora?: string | null;
  fioBRsMwh?: number | null;
  percentualLegalFioB?: number | null;
  vigenciaInicio?: string | null;
  vigenciaFim?: string | null;
  disponibilidadeKwh?: number | null;
  dataReferencia?: string | null;
  ressalvas?: string[] | null;
};

/** Linha mais recente de `calculos_solares_historico` (cálculo anterior substituído). */
export type CalculoHistorico = {
  arquivadoEm: string;
  motivo: string;
  estadoFinanceiro: string;
  kitNome: string;
  consumoMedioKwh: number;
  tarifaKwh: number;
  economiaMensal: number | null;
};

/** Resultado de `carregarVigencia` que a tela usa: por que o cálculo salvo não vale como atual e o que não foi conferido. */
export type VigenciaDaTela = { motivos: MotivoDesatualizacao[]; naoVerificavel: EntradaNaoVerificavel[] };

type Parametros = {
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

function numeroBr(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const TEXTO_SEM_ECONOMIA = "Sem economia estimada neste cenário";
const MOTIVO_PAYBACK = "depende de projeção de tarifas e da transição da Lei 14.300";

/** Payback só existe com economia positiva e valor positivo: nunca "0 meses". No P0 é sempre nulo (indisponível). */
function textoPayback(economiaMensal: number | null, paybackMeses: number | null) {
  if (economiaMensal == null || !(economiaMensal > 0) || paybackMeses == null || !(paybackMeses > 0)) return "indisponível";
  return `${numeroBr(paybackMeses)} meses`;
}

/** Economia ausente (nula) nunca vira zero nem "sem economia": é "indisponível". */
function textoEconomia(economiaMensal: number | null) {
  if (economiaMensal == null) return "indisponível";
  return economiaMensal > 0 ? `${formatarMoeda(economiaMensal)}/mês` : TEXTO_SEM_ECONOMIA;
}

function percentual(v: number) {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

const ROTULO_NAO_VERIFICAVEL: Record<EntradaNaoVerificavel, string> = {
  tarifa: "tarifa",
  tipo_ligacao: "tipo de ligação",
  fio_b: "Fio B",
  enquadramento: "enquadramento",
};

const ROTULO_BASE: Record<BaseTributaria, string> = {
  sem_tributos: "sem tributos",
  com_tributos: "com tributos",
};

/** O que o vendedor resolve (dado que ele digita ou preenche na qualificação), pelo código da pendência. */
const VENDEDOR: Partial<Record<Pendencia["codigo"], string>> = {
  consumo_ausente: "o consumo médio em kWh/mês",
  consumo_estimado_pela_tarifa_base: "o consumo médio em kWh/mês",
  tarifa_base_ausente: "a tarifa (R$/kWh)",
  base_tributaria_ausente: "se a tarifa inclui tributos (base tributária)",
  base_tributaria_divergente: "a tarifa sem tributos (a informada inclui tributos)",
  tarifa_abaixo_do_fio_b: "uma tarifa maior que o custo da energia compensada",
  enquadramento_ausente: "o tipo de cliente na Qualificação SDR",
  distribuidora_ausente: "a distribuidora na Qualificação SDR",
};

/** Separa as pendências do motor: o que o vendedor informa x o que depende da empresa/regra (mensagem do motor). */
function separarPendencias(pendencias: Pendencia[]) {
  const vendedor: string[] = [];
  const empresa: string[] = [];
  for (const p of pendencias) {
    const texto = VENDEDOR[p.codigo];
    if (texto) {
      if (!vendedor.includes(texto)) vendedor.push(texto);
    } else if (!empresa.includes(p.mensagem)) {
      empresa.push(p.mensagem);
    }
  }
  return { vendedor, empresa };
}

/** "a, b e c" */
function juntar(itens: string[]) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Dados que o detalhe técnico mostra (Fio B automático, nunca digitado). */
type DadosTecnicos = {
  distribuidora: string;
  ato?: string | null;
  vigenciaInicio: string;
  vigenciaFim: string;
  fioBRsMwh: number;
  percentualLegal: number;
  dataReferencia: string;
  disponibilidadeKwh: number;
  tipoLigacao: TipoLigacao;
  tarifaKwh: number;
  tarifaOrigem: string | null;
  tarifaBaseTributaria: BaseTributaria | null;
  kwhCompensado?: number | null;
  kwhNaoCompensado?: number | null;
  custoFioB?: number | null;
};

function dadosTecnicosDaPrevia(previa: ResultadoCalculo, tipoLigacao: TipoLigacao, tarifaKwh: number): DadosTecnicos | null {
  if (previa.estado !== "completa") return null;
  const r = previa.retrato;
  return {
    distribuidora: r.distribuidora,
    ato: r.ato,
    vigenciaInicio: r.vigenciaInicio,
    vigenciaFim: r.vigenciaFim,
    fioBRsMwh: r.fioBRsMwh,
    percentualLegal: r.percentualLegalFioB,
    dataReferencia: r.dataReferencia,
    disponibilidadeKwh: r.disponibilidadeKwh,
    tipoLigacao,
    tarifaKwh,
    tarifaOrigem: r.tarifaOrigem,
    tarifaBaseTributaria: r.tarifaBaseTributaria,
    kwhCompensado: previa.kwhCompensado,
    kwhNaoCompensado: previa.kwhNaoCompensado,
    custoFioB: previa.custoFioB,
  };
}

function dadosTecnicosDoSalvo(c: CalculoSalvo): DadosTecnicos | null {
  if (
    c.estadoFinanceiro !== "completo" ||
    c.distribuidora == null ||
    c.vigenciaInicio == null ||
    c.vigenciaFim == null ||
    c.fioBRsMwh == null ||
    c.percentualLegalFioB == null ||
    c.dataReferencia == null ||
    c.disponibilidadeKwh == null
  ) {
    return null;
  }
  return {
    distribuidora: c.distribuidora,
    vigenciaInicio: c.vigenciaInicio,
    vigenciaFim: c.vigenciaFim,
    fioBRsMwh: c.fioBRsMwh,
    percentualLegal: c.percentualLegalFioB,
    dataReferencia: c.dataReferencia,
    disponibilidadeKwh: c.disponibilidadeKwh,
    tipoLigacao: c.tipoLigacao,
    tarifaKwh: c.tarifaKwh,
    tarifaOrigem: c.tarifaOrigem ?? null,
    tarifaBaseTributaria: c.tarifaBaseTributaria ?? null,
    kwhCompensado: c.kwhCompensado,
    kwhNaoCompensado: c.kwhNaoCompensado,
    custoFioB: c.custoFioB,
  };
}

/** Premissas PRESUMIDAS (não informadas pelo vendedor): sempre visíveis, fora do bloco recolhido. */
const RESSALVAS_PRESUMIDAS = ["modalidade_convencional", "bifasico_tres_condutores"];

/** Hipótese, premissas presumidas e limitações declaradas da estimativa completa (contrato, seções 2 e 4). */
function HipotesesELimitacoes({
  ressalvas,
  kwhNaoCompensado,
  tarifaOrigem,
}: {
  ressalvas: string[];
  kwhNaoCompensado: number | null;
  tarifaOrigem: string | null;
}) {
  const presumidas = ressalvas.filter((r) => RESSALVAS_PRESUMIDAS.includes(r));
  return (
    <div className="flex flex-col gap-2">
      <p data-testid="hipotese-autoconsumo" className="text-xs text-zinc-600">
        Hipótese: autoconsumo simultâneo considerado zero (toda a geração é tratada como injetada na rede e compensada).
      </p>
      {presumidas.length > 0 && (
        <p data-testid="premissas-presumidas" className="text-xs text-amber-800">
          Presumido (confira na conta do cliente): {presumidas.map((r) => textoRessalva(r).replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join("; ")}.
        </p>
      )}
      {tarifaOrigem === "informada_vendedor" && (
        <p data-testid="tarifa-informada" className="text-xs text-amber-800">
          Tarifa informada pelo vendedor: não é a tarifa oficial (TE + TUSD) da distribuidora.
        </p>
      )}
      <details data-testid="limitacoes-estimativa" className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600">
        <summary className="cursor-pointer font-medium text-zinc-700">Limitações da estimativa</summary>
        <ul className="mt-1 list-disc pl-5">
          {ressalvas
            .filter((r) => !RESSALVAS_PRESUMIDAS.includes(r))
            .map((r) => (
              <li key={r}>{textoRessalva(r, { kwhNaoCompensado })}</li>
            ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * Prévia da calculadora com a união do motor: potência e geração sempre; contas e economia só no estado `completa`,
 * com payback indisponível (P0), a hipótese de autoconsumo e as limitações. No estado `incompleta`, o quadro separa o
 * que o vendedor pode informar do que depende da empresa ou da regra.
 * O vendedor nunca escolhe fórmula, percentual legal nem valor de Fio B.
 */
export function PreviaEstimativa({
  previa,
  potenciaKwp,
  mostrarQuadro = true,
  rodape,
}: {
  previa: ResultadoCalculo;
  potenciaKwp: number;
  /** Falso quando outra mensagem já diz o que falta (ex.: logo após salvar). */
  mostrarQuadro?: boolean;
  /** Mantido por compatibilidade (o payback é indisponível no P0). */
  precoDefinido?: boolean;
  rodape: string;
}) {
  const completa = previa.estado === "completa";
  const { vendedor, empresa } = previa.estado === "incompleta" ? separarPendencias(previa.pendencias) : { vendedor: [], empresa: [] };
  return (
    <div className="flex flex-col gap-3">
      <dl
        data-testid="previa-sistema"
        className={`grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm ${completa ? "md:grid-cols-3" : ""}`}
      >
        <div>
          <dt className="text-zinc-500">Potência do kit</dt>
          <dd className="font-medium text-zinc-900">{numeroBr(potenciaKwp)} kWp</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Geração estimada</dt>
          <dd className="font-medium text-zinc-900">{previa.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês</dd>
        </div>
        {previa.estado === "completa" && (
          <>
            <div>
              <dt className="text-zinc-500">Conta hoje (energia)</dt>
              <dd className="font-medium text-zinc-900">{formatarMoeda(previa.contaSemSolar)}/mês</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Conta com o sistema</dt>
              <dd className="font-medium text-zinc-900">{formatarMoeda(previa.contaComSolar)}/mês</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Economia estimada</dt>
              <dd data-testid="previa-economia" className={previa.economiaMensal > 0 ? "font-medium text-green-700" : "font-medium text-zinc-700"}>
                {previa.economiaMensal > 0 ? `${formatarMoeda(previa.economiaMensal)}/mês` : TEXTO_SEM_ECONOMIA}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Payback estimado</dt>
              <dd data-testid="previa-payback" className="font-medium text-zinc-900" title={MOTIVO_PAYBACK}>
                indisponível
              </dd>
            </div>
          </>
        )}
      </dl>
      {previa.estado === "completa" && (
        <>
          <p className="-mt-2 text-xs text-zinc-500">Payback indisponível: {MOTIVO_PAYBACK}.</p>
          <HipotesesELimitacoes ressalvas={previa.retrato.ressalvas} kwhNaoCompensado={previa.kwhNaoCompensado} tarifaOrigem={previa.retrato.tarifaOrigem} />
        </>
      )}
      {previa.estado === "incompleta" && mostrarQuadro && (
        <div
          role="status"
          data-testid="estimativa-incompleta"
          className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
        >
          <p className="font-medium text-zinc-900">Estimativa financeira incompleta</p>
          <p>Por enquanto não há conta nem economia calculadas para este kit.</p>
          {vendedor.length > 0 && (
            <div data-testid="pendencias-vendedor">
              <p className="font-medium text-zinc-800">O que você pode informar</p>
              <ul className="list-disc pl-5">
                {vendedor.map((v) => (
                  <li key={v}>Informe {v}.</li>
                ))}
              </ul>
            </div>
          )}
          {empresa.length > 0 && (
            <div data-testid="pendencias-empresa">
              <p className="font-medium text-zinc-800">O que não depende de você</p>
              <ul className="list-disc pl-5">
                {empresa.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">{rodape}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Mensagem persistente depois de salvar o kit: o que foi salvo e o que falta, em linguagem simples.
 * `tecnicoSalvo`: o servidor gravou o resultado técnico (sem parte financeira). `calculoAnterior`: o que aconteceu com a
 * linha anterior (`historico` = guardada no histórico como desatualizada; `legado`/`incompleto` = mantida, não atual).
 */
function MensagemKitSalvo({
  pendencias,
  tecnicoSalvo,
  calculoAnterior,
}: {
  pendencias: Pendencia[];
  tecnicoSalvo: boolean;
  calculoAnterior: "historico" | "legado" | "incompleto" | null;
}) {
  const { vendedor, empresa } = separarPendencias(pendencias);
  return (
    <p data-testid="kit-salvo" role="status" className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      {tecnicoSalvo ? "Kit e resultado técnico salvos." : "Itens do kit salvos."} A conta e a economia ainda não foram calculadas.
      {vendedor.length > 0 && ` Falta você informar ${juntar(vendedor)}.`}
      {empresa.length > 0 && ` Não depende de você: ${juntar(empresa.map((m) => m.replace(/\.\s*$/, "").replace(/^./, (c) => c.toLowerCase())))}.`}
      {calculoAnterior === "historico" && " O cálculo anterior foi guardado no histórico como desatualizado e não vale como resultado atual."}
      {!tecnicoSalvo &&
        calculoAnterior === "legado" &&
        " O cálculo anterior foi mantido só como histórico: foi feito por uma fórmula antiga, que não foi validada, e não vale como resultado atual."}
      {!tecnicoSalvo && calculoAnterior === "incompleto" && " O resultado técnico anterior foi mantido, mas não vale como resultado atual."}
    </p>
  );
}

/** Fio B é calculado pelo motor, não digitado: aqui só leitura e recolhido. */
function DetalhesTecnicos({ dados }: { dados: DadosTecnicos | null }) {
  return (
    <details data-testid="detalhes-tecnicos" className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-700">Detalhes técnicos</summary>
      {dados ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
          <li>
            Tarifa (T): R$ {formatarNumeroBr(dados.tarifaKwh)}/kWh,{" "}
            {dados.tarifaBaseTributaria ? ROTULO_BASE[dados.tarifaBaseTributaria] : "base não declarada"} —{" "}
            {dados.tarifaOrigem === "oficial_aneel" ? "tarifa oficial ANEEL (TE + TUSD)" : "informada pelo vendedor"}.
          </li>
          <li>
            Fio B (TUSD_FioB, sem tributos): R$ {formatarNumeroBr(Math.round(dados.fioBRsMwh * 10000) / 10000)}/MWh — {dados.distribuidora}
            {dados.ato ? `, ${dados.ato}` : ""}, vigência {textoVigencia(dados.vigenciaInicio, dados.vigenciaFim)}.
          </li>
          <li>
            Percentual legal (Lei 14.300, art. 27) em {dados.dataReferencia.slice(0, 4)}: {percentual(dados.percentualLegal)} — energia
            compensada a R$ {formatarNumeroBr(Math.round(((dados.percentualLegal * dados.fioBRsMwh) / 1000) * 100000) / 100000)}/kWh.
          </li>
          <li>
            Custo de disponibilidade (REN 1.000, art. 291): {numeroBr(dados.disponibilidadeKwh)} kWh ({ROTULO_TIPO_LIGACAO[dados.tipoLigacao]}).
          </li>
          {dados.kwhCompensado != null && (
            <li>
              Energia compensada: {numeroBr(dados.kwhCompensado)} kWh
              {dados.custoFioB != null ? ` (custo de ${formatarMoeda(dados.custoFioB)})` : ""}; injetada e não compensada no mês:{" "}
              {numeroBr(dados.kwhNaoCompensado ?? 0)} kWh.
            </li>
          )}
          <li>Data de referência: {formatarDataIso(dados.dataReferencia)}.</li>
        </ul>
      ) : (
        <p className="mt-2 text-zinc-600">
          O Fio B é calculado automaticamente a partir da tarifa oficial da distribuidora vigente na data do cálculo e do percentual
          legal do ano. Aparece aqui quando a estimativa estiver completa.
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">Só leitura: o vendedor informa consumo, tarifa (com a base tributária), kit e preço.</p>
    </details>
  );
}

/** Mesmo conversor do servidor ("450", "1.200", "1.200,50"); vazio, inválido ou ambíguo vira null. */
function numero(v: string): number | null {
  const n = lerNumeroBr(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** Linha oficial vigente para o negócio (para sugerir a tarifa); nula sem enquadramento/distribuidora/vigência. */
function tarifaOficialDoContexto(contexto: ContextoEstimativa | null): TarifaGd | null {
  if (!contexto) return null;
  const enq = enquadramentoDoTipoCliente(contexto.tipoCliente);
  if (enq.situacao !== "ok") return null;
  const t = resolverTarifa(contexto.tarifas, contexto.distribuidoraInformada, enq.enquadramento, contexto.dataReferencia);
  return t.situacao === "ok" ? t.tarifa : null;
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
  contexto = null,
  historico = null,
  precoDesatualizado = false,
  vigencia = null,
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
  /** Contexto regulatório do servidor (data de referência, qualificação, tarifas oficiais): a prévia usa o mesmo. */
  contexto?: ContextoEstimativa | null;
  /** Último cálculo substituído (`calculos_solares_historico`). */
  historico?: CalculoHistorico | null;
  /** O valor do negócio mudou depois do cálculo salvo (ver `precoDoCalculoDesatualizado`). */
  precoDesatualizado?: boolean;
  /** Vigência do cálculo salvo (`carregarVigencia`). Com motivos, o cálculo é histórico: nunca resultado atual. */
  vigencia?: VigenciaDaTela | null;
}) {
  const motivos = vigencia?.motivos ?? [];
  const calculoDesatualizado = !!calculo && motivos.length > 0;
  const [resultado, acao, pendente] = useActionState(salvarKitPersonalizado, null);
  const [resultadoPreco, acaoPreco, atualizandoPreco] = useActionState(atualizarPrecoCalculo, null);
  const enviarBase = useEnvioSemReset(acao);
  // Só depois de uma tentativa de envio os problemas das linhas aparecem (linha recém-adicionada não "grita").
  const [mostrarProblemas, setMostrarProblemas] = useState(false);
  const [editando, setEditando] = useState(!calculo);
  const [ultimoResultado, setUltimoResultado] = useState(resultado);

  const tarifaOficial = tarifaOficialDoContexto(contexto);
  const tarifaOficialKwh = tarifaOficial ? tarifaOficialRsKwh(tarifaOficial) : null;

  // Sempre a partir do que está gravado: ao abrir e no Cancelar.
  const salvo = () =>
    estadoSalvoDoKit({
      componentesSalvos,
      calculo,
      estruturaTelhado,
      consumoMedioKwhPadrao,
      valorFaturaMedioPadrao,
      tarifaOficialRsKwh: tarifaOficialKwh,
    });
  const [linhas, setLinhas] = useState<LinhaComponente[]>(() => salvo().linhas);
  const [estrutura, setEstrutura] = useState(() => salvo().estrutura);
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>(() => salvo().tipoLigacao);
  const [consumoMedioKwh, setConsumoMedioKwh] = useState(() => salvo().consumoMedioKwh);
  // Ao reabrir, vem o valor da conta já salvo no cálculo (antes vinha vazio e se perdia ao salvar de novo).
  const [valorFaturaMedio, setValorFaturaMedio] = useState(() => salvo().valorFaturaMedio);
  const [tarifaKwh, setTarifaKwh] = useState(() => salvo().tarifaKwh);
  const [tarifaBase, setTarifaBase] = useState<BaseTributaria | "">(() => salvo().tarifaBaseTributaria);
  const [confirmaRemocao, setConfirmaRemocao] = useState(false);
  // Muda a cada Cancelar para recriar o campo de observações (não controlado) com o valor salvo.
  const [versaoObservacoes, setVersaoObservacoes] = useState(0);

  // Mensagem persistente do último salvamento: fica enquanto o formulário for o mesmo que foi salvo e some na próxima
  // edição (qualquer campo) ou ao clicar em "Editar kit / recalcular". Sem useEffect: ajusta durante a renderização.
  const assinatura = useMemo(
    () => JSON.stringify([linhas, estrutura, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh, tarifaBase]),
    [linhas, estrutura, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh, tarifaBase],
  );
  const [assinaturaSalva, setAssinaturaSalva] = useState<string | null>(null);
  if (resultado !== ultimoResultado) {
    setUltimoResultado(resultado);
    if (resultado?.ok) {
      setEditando(false);
      setAssinaturaSalva(assinatura);
    }
  }
  const avisoKitSalvo = !!resultado?.ok && assinaturaSalva === assinatura;
  // O servidor diz o que gravou ("Kit e resultado técnico salvos." x "Itens do kit salvos.") e o que fez com o anterior.
  const tecnicoSalvo = avisoKitSalvo && !!resultado?.mensagem?.startsWith("Kit e resultado técnico salvos");
  // "Kit e cálculo salvos.": resultado completo gravado; a mensagem de estimativa incompleta não se aplica.
  const calculoSalvo = avisoKitSalvo && !!resultado?.mensagem?.startsWith("Kit e cálculo salvos");
  const anterior = resultado?.mensagem?.includes("guardado no histórico")
    ? "historico"
    : calculo?.estadoFinanceiro === "legado"
      ? "legado"
      : calculo?.estadoFinanceiro === "incompleto"
        ? "incompleto"
        : null;

  /**
   * Cancelar: não grava nem apaga nada no banco; só descarta o que foi mexido na tela e volta ao
   * que está salvo. Na primeira montagem (nada salvo), limpa os itens não gravados.
   */
  function cancelarEdicao() {
    const s = salvo();
    setLinhas(s.linhas);
    setEstrutura(s.estrutura);
    setTipoLigacao(s.tipoLigacao);
    setConsumoMedioKwh(s.consumoMedioKwh);
    setValorFaturaMedio(s.valorFaturaMedio);
    setTarifaKwh(s.tarifaKwh);
    setTarifaBase(s.tarifaBaseTributaria);
    setConfirmaRemocao(false);
    setMostrarProblemas(false);
    setVersaoObservacoes((v) => v + 1);
    if (calculo) setEditando(false);
  }

  /** Tarifa digitada: igual à oficial = base sem tributos; outro valor = a base precisa ser declarada de novo. */
  function mudarTarifa(valor: string) {
    setTarifaKwh(valor);
    const n = numero(valor);
    setTarifaBase(n != null && tarifaOficialKwh != null && Math.round(n * 1e5) / 1e5 === tarifaOficialKwh ? "sem_tributos" : "");
  }

  function usarTarifaOficial() {
    if (tarifaOficialKwh == null) return;
    setTarifaKwh(formatarNumeroBr(tarifaOficialKwh));
    setTarifaBase("sem_tributos");
  }

  // Mesma análise para a potência, o preço sugerido e o envio: a quantidade vista é a quantidade usada.
  const { componentes, itens, problemas } = useMemo(() => analisarLinhas(linhas), [linhas]);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);
  // Remover o kit é uma ação explícita: tirar TODAS as linhas de um kit salvo (com cálculo, o servidor recusa).
  // Linha sem descrição não conta: ela exige preenchimento ou remoção, nunca vira remoção do kit.
  const removendoKitSalvo = componentesSalvos.length > 0 && linhas.length === 0;
  const problemaKit = mostrarProblemas ? resumoProblemasKit(problemas, linhas) : null;

  /** Bloqueia o envio enquanto houver linha inválida ou incompleta; o que foi digitado continua na tela. */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    if (problemas.length > 0) {
      evento.preventDefault();
      setMostrarProblemas(true);
      return;
    }
    enviarBase(evento);
  }

  // Valor efetivo = o do campo; vazio, vale o já salvo no negócio (mesma regra do servidor ao salvar o kit).
  const consumoCampoVazio = lerNumeroBr(consumoMedioKwh) == null;
  const faturaCampoVazia = lerNumeroBr(valorFaturaMedio) == null;
  const consumoEfetivo = numero(consumoMedioKwh) ?? consumoMedioKwhPadrao;
  const faturaEfetiva = numero(valorFaturaMedio) ?? valorFaturaMedioPadrao;

  // Consumo médio em kWh, vindo do campo direto (ou do salvo) ou calculado a partir da fatura + tarifa.
  const consumoMedioEstimado = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    if (consumoEfetivo) return consumoEfetivo;
    if (faturaEfetiva && tarifa) return faturaEfetiva / tarifa;
    return null;
  }, [consumoEfetivo, faturaEfetiva, tarifaKwh]);

  // Sugere a quantidade de módulos pro consumo já informado, assim que o
  // vendedor escolhe (ou digita) a potência de um módulo.
  const sugerirQuantidadeModulo = useMemo(() => {
    if (!parametros || !consumoMedioEstimado) return undefined;
    return (potenciaW: number) =>
      sugerirQuantidadeModulos(consumoMedioEstimado, parametros.produtividadeKwhKwpMes, potenciaW);
  }, [parametros, consumoMedioEstimado]);

  // Preço de referência (teste) do catálogo + custos internos configurados —
  // só informativo aqui, já que o valor do negócio é editado em "Dados do negócio".
  const precoSugerido = useMemo(() => {
    if (!parametros) return null;
    // Só linhas válidas, com a mesma quantidade que vai para o servidor ("1.200" = 1200 aqui também).
    const somaComponentes = itens.reduce((acc, { indice, componente }) => {
      const textoPreco = linhas[indice].precoEstimadoUnitario;
      const precoUnitario = textoPreco ? Number(textoPreco) : NaN;
      return Number.isFinite(precoUnitario) ? acc + precoUnitario * componente.quantidade : acc;
    }, 0);
    if (somaComponentes <= 0) return null;
    const quantidadeModulos = componentes.filter((c) => c.tipo === "modulo").reduce((acc, c) => acc + c.quantidade, 0);
    return custosInternosEstimados(somaComponentes, quantidadeModulos, potenciaKwp, parametros).total;
  }, [linhas, itens, componentes, potenciaKwp, parametros]);

  // Resultado do motor (união incompleta | completa), com o MESMO contexto que o servidor usa ao salvar. Consumo e
  // tarifa ausentes entram como 0 só para o motor listar as pendências; potência e geração não dependem deles.
  // A tarifa é normalizada às 5 casas gravadas (o servidor faz o mesmo antes de calcular).
  const previa = useMemo<ResultadoCalculo | null>(() => {
    if (!parametros) return null;
    const tarifa = numero(tarifaKwh);
    return calcular({
      potenciaKwp,
      precoKit: negocioValor ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoEfetivo != null ? Math.round(consumoEfetivo * 100) / 100 : 0,
      tarifaKwh: tarifa != null ? Math.round(tarifa * 1e5) / 1e5 : 0,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
      dadosEstimativa: { contexto, tarifaBaseTributaria: tarifaBase || null },
    });
  }, [parametros, tarifaKwh, tarifaBase, consumoEfetivo, potenciaKwp, negocioValor, tipoLigacao, contexto]);
  const pendenciasPrevia = previa?.estado === "incompleta" ? previa.pendencias : [];
  const avisoSalvo =
    avisoKitSalvo &&
    (calculoSalvo ? (
      <p data-testid="kit-salvo" role="status" className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        {resultado?.mensagem}
      </p>
    ) : (
      <MensagemKitSalvo pendencias={pendenciasPrevia} tecnicoSalvo={tecnicoSalvo} calculoAnterior={anterior} />
    ));

  if (!parametros) {
    return <p className="text-sm text-zinc-600">Parâmetros da calculadora não configurados para a empresa.</p>;
  }

  // "Atualizar preço no cálculo" fica desabilitado quando o servidor recusa (cálculo legado, incompleto ou desatualizado).
  const motivosPreco = motivosDaAcao(motivos, "preco");
  const bloqueioPreco = calculoDesatualizado && motivosPreco.length > 0 ? mensagemDeRecusa(motivosPreco, "preco") : null;
  const legado = motivos.includes("legado");
  const outrosMotivos = motivos.filter((m) => m !== "legado");

  /** Último cálculo substituído, guardado no histórico (nunca é o resultado atual). */
  const blocoHistorico = historico && (
    <details data-testid="calculo-historico" className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-zinc-500">
        Cálculo anterior — desatualizado (guardado no histórico em {new Date(historico.arquivadoEm).toLocaleDateString("pt-BR")})
      </summary>
      <p className="mt-2 text-xs text-zinc-500">
        {historico.motivo === "desatualizado_por_entradas"
          ? "As entradas mudaram e o resultado novo ficou incompleto. Os valores abaixo são só histórico: não correspondem às entradas atuais e não entram em proposta."
          : "Substituído por um recálculo. Os valores abaixo são só histórico."}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm text-zinc-500">
        <div>
          <dt>Kit</dt>
          <dd>{historico.kitNome}</dd>
        </div>
        <div>
          <dt>Consumo médio</dt>
          <dd>{numeroBr(historico.consumoMedioKwh)} kWh/mês</dd>
        </div>
        <div>
          <dt>Tarifa</dt>
          <dd>R$ {formatarNumeroBr(historico.tarifaKwh)}/kWh</dd>
        </div>
        <div>
          <dt>{historico.estadoFinanceiro === "legado" ? "Economia (fórmula antiga)" : "Economia (desatualizada)"}</dt>
          <dd>{textoEconomia(historico.economiaMensal)}</dd>
        </div>
      </dl>
    </details>
  );

  if (calculo && !editando) {
    const tecnicosSalvos = dadosTecnicosDoSalvo(calculo);
    return (
      <div className="flex flex-col gap-3">
        {!padraoCliente && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Favor adicionar o padrão atual do cliente (em &quot;Dados do negócio&quot;) para conferir compatibilidade com o kit.
          </p>
        )}
        {avisoSalvo}
        {precoDesatualizado && (
          <form action={acaoPreco} role="alert" className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <input type="hidden" name="negocioId" value={negocioId} />
            <p>
              O valor do negócio ({negocioValor != null ? formatarMoeda(negocioValor) : "sem valor"}) é diferente do preço usado{" "}
              {calculoDesatualizado ? "no cálculo anterior" : "neste cálculo"} ({formatarMoeda(calculo.kitPreco)}).
              {!calculoDesatualizado && " O cálculo continua com o preço antigo até você atualizar."}
            </p>
            {bloqueioPreco && <p data-testid="preco-bloqueado">{bloqueioPreco}</p>}
            <Botao type="submit" variante="secundario" disabled={atualizandoPreco || !!bloqueioPreco} className="self-start">
              {atualizandoPreco ? "Atualizando..." : "Atualizar preço no cálculo"}
            </Botao>
          </form>
        )}
        <Mensagem resultado={resultadoPreco} />
        {calculoDesatualizado ? (
          <>
            {/* Só o que vale hoje: potência e geração saem do kit atual; a conta e a economia só com os dados completos. */}
            {potenciaKwp > 0 && previa && (
              <PreviaEstimativa
                previa={previa}
                potenciaKwp={potenciaKwp}
                mostrarQuadro={!avisoKitSalvo}
                rodape="Complete o que falta e recalcule o kit para ver a conta e a economia."
              />
            )}
            {estruturaTelhado && (
              <p className="text-sm">
                <span className="text-zinc-500">Estrutura do telhado:</span> {estruturaTelhado}
              </p>
            )}
            {calculo.estadoFinanceiro === "incompleto" ? (
              // Resultado técnico salvo (sem parte financeira): recolhido; a prévia acima é o estado atual.
              <details data-testid="resultado-tecnico-salvo" className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm">
                <summary className="cursor-pointer text-zinc-500">Resultado técnico salvo (sem economia)</summary>
                {outrosMotivos.filter((m) => m !== "incompleta").length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-500">
                    {outrosMotivos
                      .filter((m) => m !== "incompleta")
                      .map((m) => (
                        <li key={m}>{textoDoMotivo(m).replace(/^./, (c) => c.toUpperCase())}.</li>
                      ))}
                  </ul>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm text-zinc-500">
                  <div>
                    <dt>Kit</dt>
                    <dd>{calculo.kitNome}</dd>
                  </div>
                  <div>
                    <dt>Ligação</dt>
                    <dd>{ROTULO_TIPO_LIGACAO[calculo.tipoLigacao]}</dd>
                  </div>
                  <div>
                    <dt>Geração estimada</dt>
                    <dd>{numeroBr(calculo.geracaoEstimadaKwhMes)} kWh/mês</dd>
                  </div>
                  <div>
                    <dt>Consumo médio</dt>
                    <dd>{numeroBr(calculo.consumoMedioKwh)} kWh/mês</dd>
                  </div>
                  <div>
                    <dt>Tarifa informada</dt>
                    <dd>
                      R$ {formatarNumeroBr(calculo.tarifaKwh)}/kWh
                      {calculo.tarifaBaseTributaria ? ` (${ROTULO_BASE[calculo.tarifaBaseTributaria]})` : " (base não declarada)"}
                    </dd>
                  </div>
                </dl>
              </details>
            ) : (
              /* Histórico: valores do cálculo antigo, em visual secundário e recolhidos; não são o resultado atual. */
              <details data-testid="calculo-anterior" className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm">
                <summary className="cursor-pointer text-zinc-500">
                  {legado ? "Cálculo anterior (fórmula antiga, não validada)" : "Cálculo anterior (desatualizado)"}
                </summary>
                <p className="mt-2 text-xs text-zinc-500">
                  {legado
                    ? "Este cálculo foi feito por uma fórmula antiga, que não foi validada. Os valores abaixo são só histórico: não são a economia nem o payback atuais e não entram em proposta."
                    : "Os valores abaixo são só histórico: não correspondem às entradas atuais e não entram em proposta."}
                </p>
                {outrosMotivos.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-500">
                    {outrosMotivos.map((m) => (
                      <li key={m}>{textoDoMotivo(m).replace(/^./, (c) => c.toUpperCase())}.</li>
                    ))}
                  </ul>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm text-zinc-500">
                  <div>
                    <dt>Kit</dt>
                    <dd>{calculo.kitNome}</dd>
                  </div>
                  <div>
                    <dt>Ligação</dt>
                    <dd>{ROTULO_TIPO_LIGACAO[calculo.tipoLigacao]}</dd>
                  </div>
                  <div>
                    <dt>Geração (cálculo anterior)</dt>
                    <dd>{numeroBr(calculo.geracaoEstimadaKwhMes)} kWh/mês</dd>
                  </div>
                  <div>
                    <dt>Consumo médio</dt>
                    <dd>{numeroBr(calculo.consumoMedioKwh)} kWh/mês</dd>
                  </div>
                  <div>
                    <dt>{legado ? "Economia (fórmula antiga)" : "Economia (desatualizada)"}</dt>
                    <dd>{textoEconomia(calculo.economiaMensal)}</dd>
                  </div>
                  <div>
                    <dt>{legado ? "Payback (fórmula antiga)" : "Payback"}</dt>
                    <dd>{textoPayback(calculo.economiaMensal, calculo.paybackMeses)}</dd>
                  </div>
                </dl>
                {vigencia && vigencia.naoVerificavel.length > 0 && (
                  <p className="mt-2 text-xs text-zinc-400">
                    Conferido: kit, preço, consumo e parâmetros. Não conferido: {juntar(vigencia.naoVerificavel.map((n) => ROTULO_NAO_VERIFICAVEL[n]))}.
                  </p>
                )}
              </details>
            )}
            {calculo.estadoFinanceiro === "incompleto" && blocoHistorico}
          </>
        ) : (
          <>
            <dl data-testid="resultado-atual" className="grid grid-cols-2 gap-3 text-sm">
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
              {calculo.contaSemSolar != null && (
                <div>
                  <dt className="text-zinc-500">Conta hoje (energia)</dt>
                  <dd>{formatarMoeda(calculo.contaSemSolar)}/mês</dd>
                </div>
              )}
              {calculo.contaComSolar != null && (
                <div>
                  <dt className="text-zinc-500">Conta com o sistema</dt>
                  <dd>{formatarMoeda(calculo.contaComSolar)}/mês</dd>
                </div>
              )}
              <div>
                <dt className="text-zinc-500">Economia estimada</dt>
                <dd data-testid="economia-salva" className={(calculo.economiaMensal ?? 0) > 0 ? "font-medium text-green-700" : "text-zinc-700"}>
                  {textoEconomia(calculo.economiaMensal)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Payback estimado</dt>
                <dd data-testid="payback-salvo" title={MOTIVO_PAYBACK}>
                  {textoPayback(calculo.economiaMensal, calculo.paybackMeses)}
                </dd>
              </div>
              {estruturaTelhado && (
                <div>
                  <dt className="text-zinc-500">Estrutura do telhado</dt>
                  <dd>{estruturaTelhado}</dd>
                </div>
              )}
            </dl>
            <p className="-mt-1 text-xs text-zinc-500">Payback indisponível: {MOTIVO_PAYBACK}.</p>
            <HipotesesELimitacoes
              ressalvas={calculo.ressalvas ?? []}
              kwhNaoCompensado={calculo.kwhNaoCompensado ?? null}
              tarifaOrigem={calculo.tarifaOrigem ?? null}
            />
          </>
        )}
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
        <DetalhesTecnicos dados={calculoDesatualizado ? null : tecnicosSalvos} />
        <p className="text-xs text-zinc-400">
          Estimativa do modo comercial (sem simulação de engenharia) — confirme com o time técnico antes de fechar.
        </p>
        <Botao type="button" variante="secundario" onClick={() => {
            setAssinaturaSalva(null);
            setEditando(true);
          }}
          className="self-start">
          Editar kit / recalcular
        </Botao>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />
      {!calculo && componentesSalvos.length > 0 && !avisoKitSalvo && (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Itens do kit salvos, ainda sem cálculo de conta e economia.
        </p>
      )}
      {!padraoCliente && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Favor adicionar o padrão atual do cliente (em &quot;Dados do negócio&quot;) para conferir compatibilidade com o kit.
        </p>
      )}
      <EditorComponentesKit
        linhas={linhas}
        onChange={setLinhas}
        sugerirQuantidadeModulo={sugerirQuantidadeModulo}
        problemas={mostrarProblemas ? problemas : undefined}
      />
      {problemaKit && <Mensagem resultado={{ ok: false, mensagem: problemaKit }} />}
      {precoSugerido != null && (
        <p className="-mt-1 text-xs text-zinc-400">
          Preço sugerido (catálogo + custos internos, estimativa de teste): {formatarMoeda(precoSugerido)} — ajuste em
          &ldquo;Dados do negócio&rdquo; se quiser usar.
        </p>
      )}
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
      {consumoCampoVazio && consumoMedioKwhPadrao != null ? (
        <p data-testid="kit-consumo-salvo" className="-mt-2 text-xs text-zinc-400">
          Campo vazio: ao salvar, vale o consumo já salvo no negócio ({formatarNumeroBr(consumoMedioKwhPadrao)} kWh/mês). Para apagar, use
          “Dados do negócio”.
        </p>
      ) : (
        <p className="-mt-2 text-xs text-zinc-400">
          O kit é salvo mesmo sem o consumo em kWh. Só o valor da conta em R$ não é usado como consumo.
        </p>
      )}
      <Campo
        rotulo="Valor médio da fatura (R$, opcional)"
        name="valorFaturaMedio"
        inputMode="decimal"
        placeholder="ex.: 450,00"
        value={valorFaturaMedio}
        onChange={(e) => setValorFaturaMedio(e.target.value)}
      />
      {faturaCampoVazia && valorFaturaMedioPadrao != null && (
        <p data-testid="kit-fatura-salva" className="-mt-2 text-xs text-zinc-400">
          Campo vazio: ao salvar, vale a fatura já salva no negócio ({formatarMoeda(valorFaturaMedioPadrao)}). Para apagar, use “Dados do
          negócio”.
        </p>
      )}
      <Campo
        rotulo="Tarifa (R$/kWh)"
        name="tarifaKwh"
        inputMode="decimal"
        placeholder="ex.: 0,76802"
        value={tarifaKwh}
        onChange={(e) => mudarTarifa(e.target.value)}
      />
      <Selecao
        rotulo="Base tributária da tarifa"
        name="tarifaBaseTributaria"
        value={tarifaBase}
        onChange={(e) => setTarifaBase(e.target.value as BaseTributaria | "")}
      >
        <option value="">Não declarada</option>
        <option value="sem_tributos">Sem tributos (como a ANEEL publica)</option>
        <option value="com_tributos">Com tributos (ICMS, PIS/Cofins)</option>
      </Selecao>
      <p data-testid="tarifa-origem" className="-mt-2 text-xs text-zinc-400">
        {tarifaOficial && tarifaOficialKwh != null ? (
          <>
            Tarifa oficial {tarifaOficial.distribuidora} ({tarifaOficial.ato}, TE + TUSD, sem tributos): R${" "}
            {formatarNumeroBr(tarifaOficialKwh)}/kWh.{" "}
            {numero(tarifaKwh) != null && Math.round(numero(tarifaKwh)! * 1e5) / 1e5 === tarifaOficialKwh ? (
              "Em uso."
            ) : (
              <button type="button" onClick={usarTarifaOficial} className="underline">
                Usar a tarifa oficial
              </button>
            )}{" "}
            O Fio B oficial é sem tributos: a tarifa precisa estar na mesma base.
          </>
        ) : (
          "Sem tarifa oficial para este negócio (confira o tipo de cliente e a distribuidora na Qualificação SDR). Informe a tarifa e a base."
        )}
      </p>
      {potenciaKwp > 0 && previa && (
        <PreviaEstimativa
          previa={previa}
          potenciaKwp={potenciaKwp}
          mostrarQuadro={!avisoKitSalvo}
          rodape="Você pode salvar o kit assim mesmo; a conta e a economia aparecem quando os dados estiverem completos."
        />
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Observações (opcional)</span>
        <textarea
          key={versaoObservacoes}
          name="observacoes"
          rows={2}
          defaultValue={calculo?.observacoes ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
        />
      </label>
      {removendoKitSalvo &&
        (calculo ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{MENSAGEM_REMOCAO_COM_CALCULO}</p>
        ) : (
          <label className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <input
              type="checkbox"
              name="confirmarRemocao"
              value="sim"
              checked={confirmaRemocao}
              onChange={(e) => setConfirmaRemocao(e.target.checked)}
              className="mt-1"
            />
            <span>
              Confirmo a remoção do kit salvo ({componentesSalvos.length} {componentesSalvos.length === 1 ? "item" : "itens"}). Para
              manter o kit, use Cancelar.
            </span>
          </label>
        ))}
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente || (removendoKitSalvo && (!!calculo || !confirmaRemocao))}>
          {pendente ? "Salvando..." : removendoKitSalvo ? "Remover kit salvo" : "Salvar kit"}
        </Botao>
        {/* Sempre disponível, inclusive na primeira montagem. */}
        <Botao type="button" variante="secundario" onClick={cancelarEdicao}>
          Cancelar
        </Botao>
      </div>
      {resultado?.ok ? (
        avisoSalvo
      ) : (
        <Mensagem resultado={resultado} />
      )}
      {historico && blocoHistorico}
      <DetalhesTecnicos dados={previa ? dadosTecnicosDaPrevia(previa, tipoLigacao, numero(tarifaKwh) ?? 0) : null} />
    </form>
  );
}
