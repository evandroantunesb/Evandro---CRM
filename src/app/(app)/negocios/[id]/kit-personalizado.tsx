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
import { formatarMoeda, formatarNumeroBr, lerNumeroBr } from "@/lib/formatacao";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";
import { analisarLinhas, resumoProblemasKit } from "@/lib/kit-linhas";
import { MENSAGEM_REMOCAO_COM_CALCULO } from "@/lib/negocio-dados";
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
  economiaMensal: number;
  paybackMeses: number | null;
  observacoes: string | null;
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

/** Payback só existe com economia positiva e valor positivo: nunca "0 meses". */
function textoPayback(economiaMensal: number, paybackMeses: number | null) {
  if (!(economiaMensal > 0) || paybackMeses == null || !(paybackMeses > 0)) return "indisponível";
  return `${numeroBr(paybackMeses)} meses`;
}

const ROTULO_NAO_VERIFICAVEL: Record<EntradaNaoVerificavel, string> = {
  tarifa: "tarifa",
  tipo_ligacao: "tipo de ligação",
  fio_b: "Fio B",
  enquadramento: "enquadramento",
};

/** O que só a empresa configura e valida, na ordem em que aparece para o vendedor. */
const ITENS_EMPRESA = [
  { chave: "enquadramento", curto: "o enquadramento da unidade", longo: "O enquadramento da unidade (classe, modalidade, GD e ano)" },
  { chave: "fio_b", curto: "o Fio B da distribuidora", longo: "O Fio B da distribuidora, com origem e vigência" },
  { chave: "base", curto: "a base tributária", longo: "A base tributária (Fio B e tarifa na mesma base)" },
  { chave: "formula", curto: "a regra de cálculo da economia", longo: "A regra de cálculo da economia (fórmula ainda não validada)" },
] as const;

type ChaveEmpresa = (typeof ITENS_EMPRESA)[number]["chave"];

/** Código da pendência do motor -> quem resolve: o vendedor (dado que ele digita) ou a empresa (configuração/validação). */
function separarPendencias(pendencias: Pendencia[]) {
  const vendedor: string[] = [];
  const empresa = new Set<ChaveEmpresa>();
  for (const { codigo } of pendencias) {
    if (codigo === "consumo_ausente" || codigo === "consumo_estimado_pela_tarifa_base") {
      if (!vendedor.includes("o consumo médio em kWh/mês")) vendedor.push("o consumo médio em kWh/mês");
    } else if (codigo === "tarifa_base_ausente") {
      vendedor.push("a tarifa (R$/kWh)");
    } else if (codigo === "enquadramento_ausente" || codigo === "enquadramento_nao_suportado" || codigo === "percentual_legal_indisponivel") {
      empresa.add("enquadramento");
    } else if (
      codigo === "distribuidora_ausente" ||
      codigo === "fio_b_ausente" ||
      codigo === "fio_b_origem_ausente" ||
      codigo === "fio_b_manual_sem_justificativa" ||
      codigo === "fio_b_vigencia_ausente" ||
      codigo === "fio_b_vigencia_fora"
    ) {
      empresa.add("fio_b");
    } else if (codigo === "base_tributaria_divergente") {
      empresa.add("base");
    } else {
      empresa.add("formula");
    }
  }
  return { vendedor, empresa: ITENS_EMPRESA.filter((i) => empresa.has(i.chave)) };
}

/** "a, b e c" */
function juntar(itens: string[]) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Prévia da calculadora com a união do motor: potência e geração sempre; economia e payback só no estado `completa`
 * (hoje nunca). No estado `incompleta`, o quadro separa o que o vendedor pode informar do que depende da empresa.
 * O vendedor nunca escolhe fórmula, percentual legal nem valor de Fio B.
 */
export function PreviaEstimativa({
  previa,
  potenciaKwp,
  mostrarQuadro = true,
  precoDefinido,
  rodape,
}: {
  previa: ResultadoCalculo;
  potenciaKwp: number;
  /** Falso quando outra mensagem já diz o que falta (ex.: logo após salvar). */
  mostrarQuadro?: boolean;
  /** Há valor do negócio (para o payback do estado `completa`). */
  precoDefinido: boolean;
  rodape: string;
}) {
  const completa = previa.estado === "completa";
  const { vendedor, empresa } = previa.estado === "incompleta" ? separarPendencias(previa.pendencias) : { vendedor: [], empresa: [] };
  return (
    <div className="flex flex-col gap-3">
      <dl
        data-testid="previa-sistema"
        className={`grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm ${completa ? "md:grid-cols-4" : ""}`}
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
              <dt className="text-zinc-500">Economia estimada</dt>
              <dd className={previa.economiaMensal > 0 ? "font-medium text-green-700" : "font-medium text-zinc-700"}>
                {previa.economiaMensal > 0 ? `${formatarMoeda(previa.economiaMensal)}/mês` : TEXTO_SEM_ECONOMIA}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Payback estimado</dt>
              <dd className="font-medium text-zinc-900">
                {previa.economiaMensal > 0 && !precoDefinido ? "defina o valor do negócio" : textoPayback(previa.economiaMensal, previa.paybackMeses)}
              </dd>
            </div>
          </>
        )}
      </dl>
      {previa.estado === "incompleta" && mostrarQuadro && (
        <div
          role="status"
          data-testid="estimativa-incompleta"
          className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
        >
          <p className="font-medium text-zinc-900">Estimativa financeira incompleta</p>
          <p>Por enquanto não há economia nem payback calculados para este kit.</p>
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
          <div data-testid="pendencias-empresa">
            <p className="font-medium text-zinc-800">O que depende da empresa</p>
            <p>Isso não depende de você: a empresa ainda precisa configurar e validar:</p>
            <ul className="list-disc pl-5">
              {empresa.map((i) => (
                <li key={i.chave}>{i.longo}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-zinc-500">{rodape}</p>
        </div>
      )}
    </div>
  );
}

/** Mensagem persistente depois de salvar o kit: o que foi salvo e o que falta, em linguagem simples. */
function MensagemKitSalvo({ pendencias, calculoAnterior }: { pendencias: Pendencia[]; calculoAnterior: boolean }) {
  const { vendedor, empresa } = separarPendencias(pendencias);
  return (
    <p data-testid="kit-salvo" role="status" className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      Itens do kit salvos. A economia e o payback ainda não foram calculados.
      {vendedor.length > 0 && ` Falta você informar ${juntar(vendedor)}.`} Isso não depende de você: a empresa ainda precisa configurar e
      validar {juntar(empresa.map((i) => i.curto))}.
      {calculoAnterior &&
        " O cálculo anterior foi mantido só como histórico: foi feito por uma fórmula antiga, que não foi validada, e não vale como resultado atual."}
    </p>
  );
}

/** Fio B é calculado pelo motor, não digitado: aqui só leitura e recolhido, com as pendências técnicas. */
function DetalhesTecnicos() {
  return (
    <details data-testid="detalhes-tecnicos" className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-700">Detalhes técnicos</summary>
      <p className="mt-2 text-zinc-600">
        O Fio B é calculado automaticamente a partir da tarifa da distribuidora e da regra legal. Esse cálculo está pendente de configuração e
        validação.
      </p>
      <p className="mt-2 text-xs font-medium text-zinc-600">Pendências técnicas:</p>
      <ul className="list-disc pl-5 text-xs text-zinc-500">
        {ITENS_EMPRESA.map((i) => (
          <li key={i.chave}>{i.longo}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-500">Só leitura: o vendedor informa consumo, tarifa, kit e preço.</p>
    </details>
  );
}

/** Mesmo conversor do servidor ("450", "1.200", "1.200,50"); vazio, inválido ou ambíguo vira null. */
function numero(v: string): number | null {
  const n = lerNumeroBr(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
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

  // Sempre a partir do que está gravado: ao abrir e no Cancelar.
  const salvo = () =>
    estadoSalvoDoKit({ componentesSalvos, calculo, estruturaTelhado, consumoMedioKwhPadrao, valorFaturaMedioPadrao });
  const [linhas, setLinhas] = useState<LinhaComponente[]>(() => salvo().linhas);
  const [estrutura, setEstrutura] = useState(() => salvo().estrutura);
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>(() => salvo().tipoLigacao);
  const [consumoMedioKwh, setConsumoMedioKwh] = useState(() => salvo().consumoMedioKwh);
  // Ao reabrir, vem o valor da conta já salvo no cálculo (antes vinha vazio e se perdia ao salvar de novo).
  const [valorFaturaMedio, setValorFaturaMedio] = useState(() => salvo().valorFaturaMedio);
  const [tarifaKwh, setTarifaKwh] = useState(() => salvo().tarifaKwh);
  const [confirmaRemocao, setConfirmaRemocao] = useState(false);
  // Muda a cada Cancelar para recriar o campo de observações (não controlado) com o valor salvo.
  const [versaoObservacoes, setVersaoObservacoes] = useState(0);

  // Mensagem persistente do último salvamento: fica enquanto o formulário for o mesmo que foi salvo e some na próxima
  // edição (qualquer campo) ou ao clicar em "Editar kit / recalcular". Sem useEffect: ajusta durante a renderização.
  const assinatura = useMemo(
    () => JSON.stringify([linhas, estrutura, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh]),
    [linhas, estrutura, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh],
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
    setConfirmaRemocao(false);
    setMostrarProblemas(false);
    setVersaoObservacoes((v) => v + 1);
    if (calculo) setEditando(false);
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

  // Resultado do motor (união incompleta | completa). Consumo e tarifa ausentes entram como 0 só para o motor listar
  // as pendências; potência e geração não dependem deles.
  const previa = useMemo<ResultadoCalculo | null>(() => {
    if (!parametros) return null;
    return calcular({
      potenciaKwp,
      precoKit: negocioValor ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoEfetivo ?? 0,
      tarifaKwh: numero(tarifaKwh) ?? 0,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
    });
  }, [parametros, tarifaKwh, consumoEfetivo, potenciaKwp, negocioValor, tipoLigacao]);
  const pendenciasPrevia = previa?.estado === "incompleta" ? previa.pendencias : [];

  if (!parametros) {
    return <p className="text-sm text-zinc-600">Parâmetros da calculadora não configurados para a empresa.</p>;
  }

  // "Atualizar preço no cálculo" fica desabilitado quando o servidor recusa (cálculo legado ou desatualizado).
  const motivosPreco = motivosDaAcao(motivos, "preco");
  const bloqueioPreco = calculoDesatualizado && motivosPreco.length > 0 ? mensagemDeRecusa(motivosPreco, "preco") : null;
  const legado = motivos.includes("legado");
  const outrosMotivos = motivos.filter((m) => m !== "legado");

  if (calculo && !editando) {
    return (
      <div className="flex flex-col gap-3">
        {!padraoCliente && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Favor adicionar o padrão atual do cliente (em &quot;Dados do negócio&quot;) para conferir compatibilidade com o kit.
          </p>
        )}
        {avisoKitSalvo && <MensagemKitSalvo pendencias={pendenciasPrevia} calculoAnterior />}
        {precoDesatualizado && (
          <form action={acaoPreco} role="alert" className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <input type="hidden" name="negocioId" value={negocioId} />
            <p>
              O valor do negócio ({negocioValor != null ? formatarMoeda(negocioValor) : "sem valor"}) é diferente do preço usado{" "}
              {calculoDesatualizado ? "no cálculo anterior" : "neste cálculo"} ({formatarMoeda(calculo.kitPreco)}).
              {!calculoDesatualizado && " A proposta continua mostrando o preço e o payback antigos."}
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
            {/* Só o que vale hoje: potência e geração saem do kit atual; economia e payback não existem até a empresa validar. */}
            {potenciaKwp > 0 && previa && (
              <PreviaEstimativa
                previa={previa}
                potenciaKwp={potenciaKwp}
                mostrarQuadro={!avisoKitSalvo}
                precoDefinido={!!negocioValor}
                rodape="Quando a empresa validar o cálculo, a economia e o payback aparecem aqui."
              />
            )}
            {estruturaTelhado && (
              <p className="text-sm">
                <span className="text-zinc-500">Estrutura do telhado:</span> {estruturaTelhado}
              </p>
            )}
            {/* Histórico: valores do cálculo antigo, em visual secundário e recolhidos; não são o resultado atual. */}
            <details data-testid="calculo-anterior" className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-zinc-500">Cálculo anterior (fórmula antiga, não validada)</summary>
              <p className="mt-2 text-xs text-zinc-500">
                {legado
                  ? "Este cálculo foi feito por uma fórmula antiga, que não foi validada. Os valores abaixo são só histórico: não são a economia nem o payback atuais e não entram em proposta."
                  : "Os valores abaixo são só histórico: não são a economia nem o payback atuais."}
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
                  <dt>Economia (fórmula antiga)</dt>
                  <dd>{calculo.economiaMensal > 0 ? `${formatarMoeda(calculo.economiaMensal)}/mês` : TEXTO_SEM_ECONOMIA}</dd>
                </div>
                <div>
                  <dt>Payback (fórmula antiga)</dt>
                  <dd>{textoPayback(calculo.economiaMensal, calculo.paybackMeses)}</dd>
                </div>
              </dl>
              {vigencia && vigencia.naoVerificavel.length > 0 && (
                <p className="mt-2 text-xs text-zinc-400">
                  Conferido: kit, preço, consumo e parâmetros da empresa. Não conferido: {juntar(vigencia.naoVerificavel.map((n) => ROTULO_NAO_VERIFICAVEL[n]))}.
                </p>
              )}
            </details>
          </>
        ) : (
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
              <dd className={calculo.economiaMensal > 0 ? "font-medium text-green-700" : "text-zinc-700"}>
                {calculo.economiaMensal > 0 ? `${formatarMoeda(calculo.economiaMensal)}/mês` : TEXTO_SEM_ECONOMIA}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Payback estimado</dt>
              <dd>{textoPayback(calculo.economiaMensal, calculo.paybackMeses)}</dd>
            </div>
            {estruturaTelhado && (
              <div>
                <dt className="text-zinc-500">Estrutura do telhado</dt>
                <dd>{estruturaTelhado}</dd>
              </div>
            )}
          </dl>
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
        <DetalhesTecnicos />
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
          Itens do kit salvos, ainda sem cálculo de economia e payback.
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
        placeholder="ex.: 0,95"
        value={tarifaKwh}
        onChange={(e) => setTarifaKwh(e.target.value)}
      />
      {potenciaKwp > 0 && previa && (
        <PreviaEstimativa
          previa={previa}
          potenciaKwp={potenciaKwp}
          mostrarQuadro={!avisoKitSalvo}
          precoDefinido={!!negocioValor}
          rodape="Você pode salvar o kit assim mesmo; a economia e o payback aparecem quando a empresa validar o cálculo."
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
        avisoKitSalvo && <MensagemKitSalvo pendencias={pendenciasPrevia} calculoAnterior={!!calculo} />
      ) : (
        <Mensagem resultado={resultado} />
      )}
      <DetalhesTecnicos />
    </form>
  );
}
