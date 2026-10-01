"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { EditorComponentesKit, linhasParaComponentes, type LinhaComponente } from "@/components/kit-componentes";
import { PainelDimensionamento } from "@/components/dimensionamento/painel-dimensionamento";
import { useResolucaoDistribuidora } from "@/components/dimensionamento/usar-resolucao-distribuidora";
import { useTarifaAneel } from "@/components/dimensionamento/usar-tarifa-aneel";
import { useProdutividadeRegional } from "@/components/dimensionamento/usar-produtividade-regional";
import type { CamposFormularioDimensionamento } from "@/components/dimensionamento/usar-dimensionamento";
import { Botao, Campo, Mensagem, Selecao, Selo } from "@/components/ui";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import {
  calcular,
  custosInternosEstimados,
  DISPONIBILIDADE_PADRAO_CAMEL,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";
import type { EquipamentoAtivo, RedeEletricaConfirmada } from "@/lib/dimensionamento";
import { formatarCep, formatarMascaraMoeda, formatarMoeda, formatarTelefoneBr } from "@/lib/formatacao";
import { ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type TipoLigacao } from "@/lib/tipos";

type Opcao = { id: string; nome: string };
type ContatoEncontrado = { id: string; nome: string; telefone: string | null; email: string | null };
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
  margemDimensionamentoPct: number;
  overloadMaximoPct: number;
  overloadCriticoPct: number;
  temperaturaMinimaProjetoC: number;
  /** Sigla configurada em Configurações → Calculadora, usada só como sugestão pra preencher a
   * busca manual de distribuidora quando a resolução por município não encontra nada — nunca
   * aplicada sozinha sem confirmação do vendedor. */
  siglaDistribuidoraAneelFallback: string | null;
};

const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/** Opções comuns de tensão da rede — cobre a maioria dos casos; "outra" libera um campo numérico
 * livre pra tensões fora dessa lista (ex.: redes rurais, 440V trifásico). */
const TENSOES_REDE_COMUNS = ["127", "220", "380", "440"] as const;

const ETAPAS_WIZARD = [
  { numero: 1, titulo: "Cliente e consumo" },
  { numero: 2, titulo: "Sistema recomendado" },
  { numero: 3, titulo: "Dados técnicos" },
] as const;

/** Aceita "450", "450,5" e "1.234,56"; string vazia ou inválida vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MENSAGEM_CONSUMO_OBRIGATORIO = "Informe o consumo médio mensal em kWh para continuar.";

function IndicadorEtapas({ atual }: { atual: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {ETAPAS_WIZARD.map((e, i) => (
        <li key={e.numero} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
              e.numero === atual
                ? "bg-carvao text-offwhite"
                : e.numero < atual
                  ? "bg-dourado/15 text-carvao"
                  : "bg-zinc-100 text-zinc-500"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                e.numero === atual ? "bg-dourado text-carvao" : e.numero < atual ? "bg-dourado text-carvao" : "bg-zinc-300 text-white"
              }`}
            >
              {e.numero}
            </span>
            {e.titulo}
          </span>
          {i < ETAPAS_WIZARD.length - 1 && <span className="h-px w-4 bg-zinc-300" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Card de anexo de documento (CNH, conta de energia) — SEM OCR real (Evandro, 2026-10-01, ponto
 * 4 das correções: removido o mock de "Documento processado / Nome encontrado / CPF encontrado /
 * Data de nascimento encontrada" que aparecia pra qualquer arquivo selecionado, sem olhar o
 * conteúdo. Enquanto a extração automática não existir, o card só confirma o anexo — nunca
 * comunica um dado que não foi extraído de verdade. */
function CardDocumentoInteligente({
  titulo,
  legenda,
  name,
  accept,
}: {
  titulo: string;
  legenda: string;
  name: string;
  accept?: string;
}) {
  const id = useId();
  const [nomeArquivo, setNomeArquivo] = useState("");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3">
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-1">
        <span className="text-sm font-medium text-zinc-800">{titulo}</span>
        {!nomeArquivo && <span className="text-xs text-zinc-500">{legenda}</span>}
      </label>
      {nomeArquivo && (
        <div className="flex flex-col gap-1 rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-sm font-medium text-zinc-800">Arquivo anexado</p>
          <p className="truncate text-xs text-zinc-600">{nomeArquivo}</p>
          <p className="text-xs text-zinc-400">Extração automática ainda não executada</p>
          <button
            type="button"
            className="self-start text-xs font-medium text-amber-700 hover:underline"
            onClick={() => setNomeArquivo("")}
          >
            Trocar arquivo
          </button>
        </div>
      )}
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? "")}
      />
    </div>
  );
}

export function FormularioNegocio({
  funilId,
  etapaId,
  origens,
  responsaveis,
  meuMembroId,
  parametros,
  modulosAtivos,
  inversoresAtivos,
}: {
  funilId: string;
  /** Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban); senão usa a etapa inicial do funil. */
  etapaId?: string;
  origens: Opcao[];
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  parametros: Parametros | null;
  /** Catálogo ativo da empresa (Configurações → Calculadora), já convertido pro formato do motor
   * de dimensionamento — ver `src/lib/dimensionamento.ts`. */
  modulosAtivos: EquipamentoAtivo[];
  inversoresAtivos: EquipamentoAtivo[];
}) {
  const [resultado, acao, pendente] = useActionState(criarNegocio, null);
  const [etapaAtual, setEtapaAtual] = useState<1 | 2 | 3>(1);
  const [erroEtapa, setErroEtapa] = useState<string | null>(null);

  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [, iniciar] = useTransition();

  // Cliente (Etapa 1).
  const [contatoNome, setContatoNome] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");
  const emailValido = contatoEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contatoEmail);

  // Nome do negócio (Etapa 1) — gerado a partir do nome do cliente (novo ou existente), com
  // edição manual sempre possível. Mesmo padrão "tocado" já usado pro valor sugerido do kit
  // (`valorTocado`, abaixo): uma vez editado à mão, nunca mais sobrescrito por mudança no nome do
  // cliente (Evandro, 2026-10-01, ponto 5 das correções — "não precisamos criar nomes
  // sofisticados agora", só evitar que o vendedor tenha que digitar isso manualmente sempre).
  const nomeClienteAtual = modo === "existente" ? (contato?.nome ?? "") : contatoNome;
  const [tituloNegocio, setTituloNegocio] = useState("");
  const [tituloTocado, setTituloTocado] = useState(false);
  const [ultimoNomeClienteAplicado, setUltimoNomeClienteAplicado] = useState("");
  if (nomeClienteAtual !== ultimoNomeClienteAplicado) {
    setUltimoNomeClienteAplicado(nomeClienteAtual);
    if (nomeClienteAtual && !tituloTocado) setTituloNegocio(nomeClienteAtual);
  }

  // Localização (Etapa 1) — campos estruturados; concatenados no envio pro campo único que o backend já salva.
  // Cidade/UF também disparam, em segundo plano, a resolução Cidade/UF → município/IBGE →
  // distribuidora → tarifa ANEEL (useResolucaoDistribuidora/useTarifaAneel, abaixo) — a conferência
  // aparece só na Etapa 3, sem travar quem ainda está na Etapa 1 (pedido do Evandro, 2026-10-01).
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numeroEndereco, setNumeroEndereco] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  async function buscarEnderecoPorCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (!dados.erro) {
        setRua(dados.logradouro ?? "");
        setBairro(dados.bairro ?? "");
        setCidade(dados.localidade ?? "");
        setUf(dados.uf ?? "");
      }
    } catch {
      // Preenchimento automático é só conveniência — sem CEP, o vendedor preenche à mão.
    } finally {
      setBuscandoCep(false);
    }
  }

  const enderecoCompleto = useMemo(() => {
    const partes = [
      rua && numeroEndereco ? `${rua}, ${numeroEndereco}` : rua,
      complemento,
      bairro,
      cidade && uf ? `${cidade} - ${uf}` : cidade,
      cep ? `CEP ${cep}` : "",
    ].filter(Boolean);
    return partes.join(", ");
  }, [rua, numeroEndereco, complemento, bairro, cidade, uf, cep]);

  // Resolução de distribuidora por município (Fase 2/4): dispara assim que cidade/UF estão
  // preenchidas, independente da etapa atual — a conferência/ajuste mora na Etapa 3.
  const resolucaoDistribuidora = useResolucaoDistribuidora(cidade, uf);
  const siglaDistribuidora = resolucaoDistribuidora.camposDistribuidora.siglaDistribuidora;
  const [siglaManualRascunho, setSiglaManualRascunho] = useState("");

  // Tarifa ANEEL pra sigla já resolvida (automática ou escolhida manualmente na Etapa 3).
  const tarifaAneel = useTarifaAneel(siglaDistribuidora ?? undefined);

  // Produtividade solar real (PVGIS/NASA) pro endereço completo — sem fallback silencioso: quando
  // não há resultado, quem usa decide mostrar a produtividade padrão da empresa (ver abaixo).
  const produtividadeRegional = useProdutividadeRegional(enderecoCompleto);
  const produtividadeEngineKwhKwpMes = produtividadeRegional.produtividade ?? parametros?.produtividadeKwhKwpMes ?? null;
  const origemProdutividadeEngine: "padrao" | "pvgis" | "nasa" =
    produtividadeRegional.produtividade != null && produtividadeRegional.fonte ? produtividadeRegional.fonte : "padrao";

  // Consumo (Etapa 1): kWh direto ou valor da conta (com máscara), nunca os dois exigidos.
  const [consumoMedioKwh, setConsumoMedioKwh] = useState("");
  const [valorFaturaMedio, setValorFaturaMedio] = useState("");

  // Tarifa (conferida/ajustada na Etapa 3) — pré-preenchida pela ANEEL assim que a distribuidora é
  // resolvida; editar manualmente marca a origem como "ajustada manualmente" e o hook para de
  // sobrescrever até a sigla mudar de novo.
  const [tarifaKwh, setTarifaKwh] = useState("");
  const [tarifaTocada, setTarifaTocada] = useState(false);
  const [ultimaTarifaAuto, setUltimaTarifaAuto] = useState<number | null>(null);
  if (tarifaAneel.tarifa !== ultimaTarifaAuto) {
    setUltimaTarifaAuto(tarifaAneel.tarifa);
    if (tarifaAneel.tarifa != null && !tarifaTocada) setTarifaKwh(String(tarifaAneel.tarifa));
  }
  const tarifaNum = numero(tarifaKwh);
  const origemTarifaEfetiva: "manual" | "aneel" = tarifaTocada || tarifaAneel.origem !== "aneel" ? "manual" : "aneel";

  // Rede elétrica (entrada da Etapa 2): bloco obrigatório só até o vendedor confirmar o tipo de
  // ligação e a tensão — depois disso vira um campo normal preenchido (Evandro, 2026-10-01).
  const [redeConfirmada, setRedeConfirmada] = useState<RedeEletricaConfirmada | null>(null);
  const [tipoLigacaoRascunho, setTipoLigacaoRascunho] = useState<TipoLigacao>("trifasico");
  const [tensaoRascunho, setTensaoRascunho] = useState<string>("");
  const [tensaoOutraValor, setTensaoOutraValor] = useState("");
  const tensaoRascunhoValida = tensaoRascunho === "outra" ? numero(tensaoOutraValor) != null : tensaoRascunho !== "";

  function confirmarRedeEletrica() {
    const tensaoRedeV = tensaoRascunho === "outra" ? numero(tensaoOutraValor) : Number(tensaoRascunho);
    setRedeConfirmada({ tipoLigacao: tipoLigacaoRascunho, tensaoRedeV });
  }

  function alterarRedeEletrica() {
    if (redeConfirmada) {
      setTipoLigacaoRascunho(redeConfirmada.tipoLigacao);
      setTensaoRascunho(
        redeConfirmada.tensaoRedeV != null && (TENSOES_REDE_COMUNS as readonly string[]).includes(String(redeConfirmada.tensaoRedeV))
          ? String(redeConfirmada.tensaoRedeV)
          : "outra",
      );
      setTensaoOutraValor(redeConfirmada.tensaoRedeV != null ? String(redeConfirmada.tensaoRedeV) : "");
    }
    setRedeConfirmada(null);
  }

  // Kit personalizado (dentro da Etapa 2, escondido até o vendedor pedir) — fallback pra empresas
  // ainda sem equipamento cadastrado, ou pra overrides que o motor não cobre (Fase 5 decide a
  // coexistência com o motor; por enquanto os dois caminhos continuam separados, como já eram).
  const [mostrarKit, setMostrarKit] = useState(false);
  const [linhas, setLinhas] = useState<LinhaComponente[]>([]);
  const [estruturaTelhado, setEstruturaTelhado] = useState("");

  const componentesKitManual = useMemo(() => linhasParaComponentes(linhas), [linhas]);
  const potenciaKitManualKwp = potenciaKitPersonalizadoKwp(componentesKitManual);

  // Escolha atual do motor de dimensionamento (módulo/inversor/quantidade), repassada pelo
  // <PainelDimensionamento> via onAlteracao — os campos ocultos reais já são renderizados dentro
  // dele (ver CamposOcultosDimensionamento); isso aqui é só leitura, pra prévia de economia/payback.
  const [camposDimensionamento, setCamposDimensionamento] = useState<CamposFormularioDimensionamento | null>(null);
  const moduloEscolhidoMotor = useMemo(
    () => modulosAtivos.find((m) => m.id === camposDimensionamento?.moduloId) ?? null,
    [modulosAtivos, camposDimensionamento],
  );
  const potenciaDcKwpMotor =
    camposDimensionamento && moduloEscolhidoMotor
      ? Number(((camposDimensionamento.quantidadeModulos * moduloEscolhidoMotor.potenciaW) / 1000).toFixed(2))
      : null;

  // Componentes efetivos pro preço sugerido: o kit manual continua alimentando a sugestão de
  // preço como antes (o motor não tem preço de referência por equipamento nesta fase).
  const precoSugerido = useMemo(() => {
    const somaComponentes = linhas.reduce((acc, l) => {
      const precoUnitario = l.precoEstimadoUnitario ? Number(l.precoEstimadoUnitario) : NaN;
      const quantidade = Number(l.quantidade) || 0;
      return Number.isFinite(precoUnitario) ? acc + precoUnitario * quantidade : acc;
    }, 0);
    if (somaComponentes <= 0) return null;
    if (!parametros) return Math.round(somaComponentes);
    const quantidadeModulos = componentesKitManual.filter((c) => c.tipo === "modulo").reduce((acc, c) => acc + c.quantidade, 0);
    const custos = custosInternosEstimados(somaComponentes, quantidadeModulos, potenciaKitManualKwp, parametros);
    return Math.round(custos.total);
  }, [linhas, componentesKitManual, potenciaKitManualKwp, parametros]);

  const [valor, setValor] = useState("");
  const [valorTocado, setValorTocado] = useState(false);
  const [ultimoPrecoSugerido, setUltimoPrecoSugerido] = useState<number | null>(null);
  if (precoSugerido !== ultimoPrecoSugerido) {
    setUltimoPrecoSugerido(precoSugerido);
    if (precoSugerido != null && !valorTocado) setValor(String(precoSugerido));
  }

  // Consumo médio efetivo pro motor de dimensionamento: kWh direto tem prioridade; sem ele, só dá
  // pra estimar a partir do valor da conta quando a tarifa já foi resolvida (automática ou manual)
  // — nunca com uma tarifa fictícia (Evandro, 2026-10-01).
  const consumoDiretoNum = numero(consumoMedioKwh);
  const faturaNum = numero(valorFaturaMedio);
  const consumoParaMotor = useMemo(() => {
    if (consumoDiretoNum) return consumoDiretoNum;
    if (faturaNum && tarifaNum) return faturaNum / tarifaNum;
    return null;
  }, [consumoDiretoNum, faturaNum, tarifaNum]);
  const faltaConsumoParaMotor = !consumoDiretoNum && faturaNum != null && tarifaNum == null;

  const sugerirQuantidadeModulo = useMemo(() => {
    if (!parametros || !consumoParaMotor) return undefined;
    return (potenciaW: number) => sugerirQuantidadeModulos(consumoParaMotor, parametros.produtividadeKwhKwpMes, potenciaW);
  }, [parametros, consumoParaMotor]);

  const produtividadeEfetivaKwhKwpMes = produtividadeEngineKwhKwpMes ?? parametros?.produtividadeKwhKwpMes;

  // Geração estimada: depende só do sistema técnico (potência DC) e da rede elétrica confirmada
  // (o inversor recomendado só fecha depois da rede) — NUNCA da tarifa (Evandro, 2026-10-01:
  // "geração NÃO deve depender de tarifa"). `potenciaKwp * produtividade` não usa tarifa nem
  // tipo de ligação, mas só mostramos depois da rede confirmada porque até lá o inversor (e
  // portanto o sistema) ainda está pendente de confirmação.
  const geracaoEstimadaMotorKwhMes = useMemo(() => {
    if (!redeConfirmada || !potenciaDcKwpMotor || potenciaDcKwpMotor <= 0 || !produtividadeEfetivaKwhKwpMes) return null;
    return Math.round(potenciaDcKwpMotor * produtividadeEfetivaKwhKwpMes * 100) / 100;
  }, [redeConfirmada, potenciaDcKwpMotor, produtividadeEfetivaKwhKwpMes]);

  const geracaoEstimadaKitManualKwhMes = useMemo(() => {
    if (!redeConfirmada || potenciaKitManualKwp <= 0 || !produtividadeEfetivaKwhKwpMes) return null;
    return Math.round(potenciaKitManualKwp * produtividadeEfetivaKwhKwpMes * 100) / 100;
  }, [redeConfirmada, potenciaKitManualKwp, produtividadeEfetivaKwhKwpMes]);

  // Economia/payback do kit escolhido pelo motor — só calcula quando há tarifa (além da rede, já
  // exigida pra geração acima); até lá ficam marcados como pendentes em vez de inventar um número
  // (Evandro, 2026-10-01: "economia e payback ficam pendentes enquanto não houver tarifa válida").
  const previaMotor = useMemo(() => {
    if (!parametros || !potenciaDcKwpMotor || potenciaDcKwpMotor <= 0) return null;
    if (!tarifaNum || !redeConfirmada || !consumoParaMotor) return null;
    return calcular({
      potenciaKwp: potenciaDcKwpMotor,
      precoKit: numero(valor) ?? 0,
      tipoLigacao: redeConfirmada.tipoLigacao,
      consumoMedioKwh: consumoParaMotor,
      tarifaKwh: tarifaNum,
      produtividadeKwhKwpMes: produtividadeEfetivaKwhKwpMes ?? parametros.produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[redeConfirmada.tipoLigacao]],
    });
  }, [parametros, potenciaDcKwpMotor, tarifaNum, redeConfirmada, consumoParaMotor, valor, produtividadeEfetivaKwhKwpMes]);

  // Prévia do kit personalizado (fallback manual) — independente do motor, como já era.
  const previaKitManual = useMemo(() => {
    const precoKit = numero(valor);
    if (!parametros || potenciaKitManualKwp <= 0 || !tarifaNum || !consumoParaMotor || !redeConfirmada) return null;
    return calcular({
      potenciaKwp: potenciaKitManualKwp,
      precoKit: precoKit ?? 0,
      tipoLigacao: redeConfirmada.tipoLigacao,
      consumoMedioKwh: consumoParaMotor,
      tarifaKwh: tarifaNum,
      produtividadeKwhKwpMes: produtividadeEfetivaKwhKwpMes ?? parametros.produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[redeConfirmada.tipoLigacao]],
    });
  }, [parametros, redeConfirmada, consumoParaMotor, tarifaNum, potenciaKitManualKwp, valor, produtividadeEfetivaKwhKwpMes]);

  function pesquisar(termo: string) {
    setBusca(termo);
    iniciar(async () => setEncontrados(await buscarContatos(termo)));
  }

  function conferirDuplicado(tel: string, email: string) {
    if (tel.replace(/\D/g, "").length < 8 && !email.includes("@")) return setDuplicados([]);
    iniciar(async () => setDuplicados(await verificarDuplicado(tel, email)));
  }

  function avancar() {
    if (etapaAtual === 1) {
      if (modo === "existente" && !contato) return setErroEtapa("Selecione um contato existente pra continuar.");
      if (modo === "novo") {
        if (contatoNome.trim().length < 2) return setErroEtapa("Informe o nome do cliente.");
        if (contatoTelefone.replace(/\D/g, "").length < 10) return setErroEtapa("Informe um WhatsApp válido.");
        if (!emailValido) return setErroEtapa("Informe um e-mail válido ou deixe em branco.");
      }
      const cepDigitos = cep.replace(/\D/g, "");
      if (cepDigitos.length > 0 && cepDigitos.length !== 8) {
        return setErroEtapa("CEP inválido — informe os 8 dígitos ou deixe em branco.");
      }
      if (!cidade.trim() || !uf.trim()) {
        return setErroEtapa("Informe a cidade e o estado para identificarmos a distribuidora de energia.");
      }
      if (numero(consumoMedioKwh) == null && numero(valorFaturaMedio) == null) {
        return setErroEtapa("Informe o consumo médio mensal em kWh ou o valor médio da conta.");
      }
      setErroEtapa(null);
      return setEtapaAtual(2);
    }
    if (etapaAtual === 2) {
      if (!redeConfirmada) return setErroEtapa("Confirme o tipo de ligação e a tensão da rede elétrica pra continuar.");
      setErroEtapa(null);
      return setEtapaAtual(3);
    }
  }

  function voltar() {
    setErroEtapa(null);
    setEtapaAtual((e) => (e === 3 ? 2 : e === 2 ? 1 : e));
  }

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="funil_id" value={funilId} />
      {etapaId && <input type="hidden" name="etapa_id" value={etapaId} />}
      {redeConfirmada && <input type="hidden" name="tipo_ligacao" value={redeConfirmada.tipoLigacao} />}
      <input type="hidden" name="componentes" value={JSON.stringify(componentesKitManual)} />
      <input type="hidden" name="contato_endereco" value={enderecoCompleto} />
      <input type="hidden" name="contato_nome" value={contatoNome} />
      <input type="hidden" name="contato_telefone" value={contatoTelefone} />
      <input type="hidden" name="contato_email" value={contatoEmail} />
      <input type="hidden" name="valor" value={valor} />
      <input type="hidden" name="consumo_medio_kwh" value={consumoMedioKwh} />
      <input type="hidden" name="valor_fatura_medio" value={valorFaturaMedio} />
      <input type="hidden" name="tarifa_kwh" value={tarifaKwh} />
      <input type="hidden" name="origem_tarifa" value={origemTarifaEfetiva} />
      <input type="hidden" name="estrutura_telhado" value={estruturaTelhado} />
      {contato && <input type="hidden" name="contato_id" value={contato.id} />}

      <IndicadorEtapas atual={etapaAtual} />

      {/* Etapa 1 — Cliente e consumo */}
      <div className={etapaAtual === 1 ? "flex flex-col gap-5" : "hidden"}>
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Negócio</legend>
          <Campo
            rotulo="Nome do negócio"
            name="titulo"
            placeholder="Ex.: Residência 5 kWp"
            value={tituloNegocio}
            onChange={(e) => {
              setTituloNegocio(e.target.value);
              setTituloTocado(true);
            }}
            required
          />
          <Selecao rotulo="Origem" name="origem_id" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {origens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
          {responsaveis.length > 0 && (
            <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={meuMembroId}>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          )}
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Cliente</legend>
          <div className="flex gap-2 md:col-span-2">
            <Botao type="button" variante={modo === "novo" ? "primario" : "secundario"} onClick={() => setModo("novo")}>
              Novo cliente
            </Botao>
            <Botao
              type="button"
              variante={modo === "existente" ? "primario" : "secundario"}
              onClick={() => setModo("existente")}
            >
              Cliente existente
            </Botao>
          </div>

          {modo === "existente" ? (
            <div className="flex flex-col gap-2 md:col-span-2">
              {contato ? (
                <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                  <span>
                    <strong>{contato.nome}</strong> {contato.telefone ?? contato.email}
                  </span>
                  <button type="button" className="text-zinc-600 hover:underline" onClick={() => setContato(null)}>
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <Campo rotulo="Buscar por nome, telefone ou e-mail" value={busca} onChange={(e) => pesquisar(e.target.value)} />
                  <ul className="flex flex-col">
                    {encontrados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setContato(c)}
                          className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                        >
                          <strong>{c.nome}</strong> <span className="text-zinc-500">{c.telefone ?? c.email}</span>
                        </button>
                      </li>
                    ))}
                    {busca.length >= 2 && !encontrados.length && (
                      <li className="px-3 py-2 text-sm text-zinc-500">Nenhum contato encontrado.</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <>
              <Campo
                rotulo="Nome / Razão social*"
                value={contatoNome}
                onChange={(e) => setContatoNome(e.target.value)}
                required
              />
              <Campo
                rotulo="WhatsApp*"
                type="tel"
                inputMode="numeric"
                value={contatoTelefone}
                placeholder="(11) 91234-5678"
                onChange={(e) => setContatoTelefone(formatarTelefoneBr(e.target.value))}
                onBlur={() => conferirDuplicado(contatoTelefone, contatoEmail)}
                required
              />
              <Campo
                rotulo="E-mail"
                type="email"
                value={contatoEmail}
                onChange={(e) => setContatoEmail(e.target.value)}
                onBlur={() => conferirDuplicado(contatoTelefone, contatoEmail)}
              />
              {!emailValido && <p className="text-xs text-red-600 md:col-span-2">E-mail inválido.</p>}
              {duplicados.map((d) => (
                <div key={d.contatoId} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
                  {d.visivel ? (
                    <>
                      Já existe o contato <strong>{d.nome}</strong> com esses dados.{" "}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => {
                          setContato({ id: d.contatoId, nome: d.nome, telefone: null, email: null });
                          setModo("existente");
                        }}
                      >
                        Usar este contato
                      </button>
                    </>
                  ) : (
                    <>
                      Esse telefone ou e-mail já é de um cliente
                      {d.responsavel ? (
                        <>
                          {" "}
                          de <strong>{d.responsavel}</strong>
                        </>
                      ) : null}
                      . Fale com o seu gestor antes de seguir.
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Localização</legend>
          <Campo
            rotulo="CEP"
            inputMode="numeric"
            value={cep}
            placeholder="00000-000"
            onChange={(e) => setCep(formatarCep(e.target.value))}
            onBlur={(e) => buscarEnderecoPorCep(e.target.value)}
          />
          {buscandoCep && <p className="self-end text-xs text-zinc-400 md:col-span-2">Buscando endereço…</p>}
          <div className="md:col-span-2">
            <Campo rotulo="Rua" value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <Campo rotulo="Número" value={numeroEndereco} onChange={(e) => setNumeroEndereco(e.target.value)} />
          <Campo rotulo="Complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
          <Campo rotulo="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          <Campo rotulo="Cidade*" value={cidade} onChange={(e) => setCidade(e.target.value)} required />
          <Selecao rotulo="Estado*" value={uf} onChange={(e) => setUf(e.target.value)} required>
            <option value="">UF</option>
            {ESTADOS_BR.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Selecao>
          <p className="text-xs text-zinc-400 md:col-span-3">
            Cidade e estado identificam a distribuidora de energia e a tarifa aplicável — a conferência aparece na Etapa
            3. Preencha pelo CEP ou manualmente.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Dados de energia*</legend>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo
              rotulo="Consumo médio mensal (kWh)"
              inputMode="numeric"
              placeholder="ex.: 780"
              value={consumoMedioKwh}
              onChange={(e) => setConsumoMedioKwh(e.target.value.replace(/\D/g, ""))}
            />
            <Campo
              rotulo="Ou valor médio da conta (R$)"
              inputMode="numeric"
              placeholder="ex.: 650,00"
              value={valorFaturaMedio}
              onChange={(e) => setValorFaturaMedio(formatarMascaraMoeda(e.target.value))}
            />
          </div>
          <p className="text-xs text-zinc-400">Informe uma das duas opções — a outra pode ficar em branco.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Documentos inteligentes (opcional)</legend>
          <div className="grid gap-3 md:grid-cols-2">
            <CardDocumentoInteligente titulo="📄 Anexar CNH" legenda="Anexo do cliente" name="anexo_cnh_contato" accept="image/*,.pdf" />
            <CardDocumentoInteligente
              titulo="⚡ Anexar conta de energia"
              legenda="Anexo do cliente"
              name="anexo_fatura_gerador"
              accept="image/*,.pdf"
            />
          </div>
        </fieldset>

        {erroEtapa && <Mensagem resultado={{ ok: false, mensagem: erroEtapa }} />}
        <div className="flex justify-end">
          <Botao type="button" onClick={avancar} className="gap-1">
            Avançar <ChevronRight className="h-4 w-4" />
          </Botao>
        </div>
      </div>

      {/* Etapa 2 — Sistema recomendado */}
      <div className={etapaAtual === 2 ? "flex flex-col gap-5" : "hidden"}>
        {/* Rede elétrica — bloco obrigatório na entrada da Etapa 2 (movido da Etapa 3, Fase 4): o
            motor já calcula potência DC e quantidade de módulos sem isso, mas a escolha do
            inversor fica "a confirmar" até esse bloco ser preenchido. */}
        {!redeConfirmada ? (
          <fieldset className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <legend className="mb-1 text-sm font-semibold text-zinc-900">Rede elétrica</legend>
            <p className="-mt-2 text-xs text-zinc-500">
              Necessário pra confirmar o inversor certo pra esse cliente — até confirmar, o motor já calcula a potência
              e a quantidade de módulos, mas a escolha do inversor fica pendente.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao
                rotulo="Tipo de ligação*"
                value={tipoLigacaoRascunho}
                onChange={(e) => setTipoLigacaoRascunho(e.target.value as TipoLigacao)}
              >
                {TIPOS_LIGACAO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_LIGACAO[t]}
                  </option>
                ))}
              </Selecao>
              <div className="flex flex-col gap-1">
                <Selecao rotulo="Tensão*" value={tensaoRascunho} onChange={(e) => setTensaoRascunho(e.target.value)}>
                  <option value="">Selecione</option>
                  {TENSOES_REDE_COMUNS.map((t) => (
                    <option key={t} value={t}>
                      {t}V
                    </option>
                  ))}
                  <option value="outra">Outra</option>
                </Selecao>
                {tensaoRascunho === "outra" && (
                  <Campo
                    rotulo="Tensão informada (V)"
                    inputMode="decimal"
                    placeholder="ex.: 600"
                    value={tensaoOutraValor}
                    onChange={(e) => setTensaoOutraValor(e.target.value)}
                  />
                )}
              </div>
            </div>
            <Botao type="button" onClick={confirmarRedeEletrica} disabled={!tensaoRascunhoValida} className="self-start">
              Confirmar rede elétrica
            </Botao>
          </fieldset>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <span className="text-zinc-700">
              Rede elétrica: <strong className="text-zinc-900">{ROTULO_TIPO_LIGACAO[redeConfirmada.tipoLigacao]}</strong>
              {redeConfirmada.tensaoRedeV != null && ` · ${redeConfirmada.tensaoRedeV}V`}
            </span>
            <button type="button" className="text-xs font-medium text-amber-700 hover:underline" onClick={alterarRedeEletrica}>
              Alterar
            </button>
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Resumo do sistema</legend>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 px-4 py-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Consumo mensal</dt>
              <dd className="font-medium text-zinc-900">
                {consumoParaMotor ? `${consumoParaMotor.toLocaleString("pt-BR")} kWh` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Produtividade</dt>
              <dd className="font-medium text-zinc-900">
                {produtividadeEngineKwhKwpMes ? `${produtividadeEngineKwhKwpMes.toLocaleString("pt-BR")} kWh/kWp/mês` : "—"}{" "}
                <span className="font-normal text-zinc-400">
                  {produtividadeRegional.carregando
                    ? "(buscando…)"
                    : origemProdutividadeEngine === "padrao"
                      ? "(padrão da empresa)"
                      : `(${origemProdutividadeEngine.toUpperCase()})`}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Sistema recomendado</dt>
              <dd className="font-medium text-zinc-900">{potenciaDcKwpMotor ? `${potenciaDcKwpMotor.toLocaleString("pt-BR")} kWp` : "—"}</dd>
            </div>
          </dl>
          {produtividadeRegional.erro && (
            <p className="flex items-start gap-2 rounded-lg bg-cinza-claro/40 px-3 py-2 text-xs text-zinc-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cinza" />
              {produtividadeRegional.erro} Usando a produtividade padrão configurada da empresa.
            </p>
          )}

          {faltaConsumoParaMotor ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {MENSAGEM_CONSUMO_OBRIGATORIO} Enquanto a tarifa da distribuidora não é resolvida (Etapa 3), não dá pra
              estimar o consumo a partir só do valor da conta.
            </p>
          ) : (
            <PainelDimensionamento
              consumoMedioKwh={consumoParaMotor}
              produtividadeKwhKwpMes={produtividadeEngineKwhKwpMes}
              origemProdutividade={origemProdutividadeEngine}
              margemDimensionamentoPct={parametros?.margemDimensionamentoPct ?? 0.2}
              overloadMaximoPct={parametros?.overloadMaximoPct ?? 0.3}
              overloadCriticoPct={parametros?.overloadCriticoPct ?? 0.5}
              temperaturaMinimaProjetoC={parametros?.temperaturaMinimaProjetoC ?? 0}
              modulos={modulosAtivos}
              inversores={inversoresAtivos}
              redeEletrica={redeConfirmada}
              onAlteracao={setCamposDimensionamento}
            />
          )}

          {potenciaDcKwpMotor != null && (
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 px-4 py-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Geração estimada</dt>
                <dd className="font-medium text-zinc-900">
                  {geracaoEstimadaMotorKwhMes != null ? (
                    `${geracaoEstimadaMotorKwhMes.toLocaleString("pt-BR")} kWh/mês`
                  ) : (
                    <span className="text-zinc-400">pendente — falta confirmar a rede elétrica</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Economia estimada</dt>
                <dd className="font-medium text-zinc-900">
                  {previaMotor ? (
                    `${formatarMoeda(previaMotor.economiaMensal)}/mês`
                  ) : (
                    <span className="text-zinc-400">pendente de tarifa</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Payback estimado</dt>
                <dd className="font-medium text-zinc-900">
                  {previaMotor ? (
                    previaMotor.paybackMeses != null ? (
                      `${previaMotor.paybackMeses.toLocaleString("pt-BR")} meses`
                    ) : (
                      "—"
                    )
                  ) : (
                    <span className="text-zinc-400">pendente de tarifa</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </fieldset>

        <div className="flex flex-col gap-1">
          <Campo
            rotulo="Valor do negócio (R$)"
            inputMode="decimal"
            required
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setValorTocado(true);
            }}
          />
          {!valorTocado && precoSugerido != null && (
            <p className="text-xs text-zinc-400">
              Preenchido com preço de referência do catálogo + custos internos configurados (estimativa, não é cotação real)
              — ajuste se precisar.
            </p>
          )}
        </div>

        {!mostrarKit ? (
          <Botao type="button" variante="secundario" onClick={() => setMostrarKit(true)} className="self-start">
            Montar kit manualmente
          </Botao>
        ) : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold text-zinc-900">Kit personalizado</legend>
            <EditorComponentesKit
              linhas={linhas}
              onChange={setLinhas}
              sugerirQuantidadeModulo={sugerirQuantidadeModulo}
              catalogoPorTipo={{ modulo: modulosAtivos, inversor: inversoresAtivos }}
            />
            {potenciaKitManualKwp > 0 && (
              <>
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-zinc-500">Potência do kit</dt>
                    <dd className="font-medium text-zinc-900">{potenciaKitManualKwp.toLocaleString("pt-BR")} kWp</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Geração estimada</dt>
                    <dd className="font-medium text-zinc-900">
                      {geracaoEstimadaKitManualKwhMes != null ? (
                        `${geracaoEstimadaKitManualKwhMes.toLocaleString("pt-BR")} kWh/mês`
                      ) : (
                        <span className="text-zinc-400">pendente — falta confirmar a rede elétrica</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Economia estimada</dt>
                    <dd className="font-medium text-carvao">
                      {previaKitManual ? `${formatarMoeda(previaKitManual.economiaMensal)}/mês` : <span className="text-zinc-400">pendente de tarifa</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Payback estimado</dt>
                    <dd className="font-medium text-zinc-900">
                      {previaKitManual ? (
                        previaKitManual.paybackMeses != null ? (
                          `${previaKitManual.paybackMeses.toLocaleString("pt-BR")} meses`
                        ) : (
                          "—"
                        )
                      ) : (
                        <span className="text-zinc-400">pendente de tarifa</span>
                      )}
                    </dd>
                  </div>
                </dl>
                {geracaoEstimadaKitManualKwhMes != null && geracaoEstimadaKitManualKwhMes <= 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Confira a combinação de módulo e inversor — faltam dados pra validar o dimensionamento.</span>
                  </div>
                )}
              </>
            )}
          </fieldset>
        )}

        {erroEtapa && <Mensagem resultado={{ ok: false, mensagem: erroEtapa }} />}
        <div className="flex justify-between">
          <Botao type="button" variante="secundario" onClick={voltar} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Botao>
          <Botao type="button" onClick={avancar} className="gap-1">
            Avançar <ChevronRight className="h-4 w-4" />
          </Botao>
        </div>
      </div>

      {/* Etapa 3 — Dados técnicos e complementares */}
      <div className={etapaAtual === 3 ? "flex flex-col gap-5" : "hidden"}>
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Dados da unidade consumidora</legend>
          <Campo rotulo="Unidade consumidora" name="unidade_consumidora" placeholder="Opcional" />

          <div className="flex flex-col gap-1">
            {resolucaoDistribuidora.carregando ? (
              <Campo rotulo="Distribuidora" value="Buscando distribuidora…" disabled />
            ) : resolucaoDistribuidora.resolucao?.tipo === "unica" ? (
              <Campo rotulo="Distribuidora" value={resolucaoDistribuidora.resolucao.distribuidora.siglaDistribuidora} disabled />
            ) : resolucaoDistribuidora.resolucao?.tipo === "ambigua" ? (
              <Selecao
                rotulo="Distribuidora*"
                value={siglaDistribuidora ?? ""}
                onChange={(e) => resolucaoDistribuidora.registrarEscolha({ siglaDistribuidora: e.target.value })}
              >
                <option value="" disabled>
                  Selecione — o município tem mais de uma distribuidora
                </option>
                {resolucaoDistribuidora.resolucao.distribuidoras.map((d) => (
                  <option key={d.siglaDistribuidora} value={d.siglaDistribuidora}>
                    {d.siglaDistribuidora}
                  </option>
                ))}
              </Selecao>
            ) : (
              <div className="flex flex-col gap-1">
                <Campo
                  rotulo="Distribuidora (sigla)*"
                  value={siglaManualRascunho}
                  placeholder="Ex.: CPFL-PAULISTA"
                  onChange={(e) => setSiglaManualRascunho(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="self-start text-xs font-medium text-amber-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-300"
                  disabled={!siglaManualRascunho.trim()}
                  onClick={() => resolucaoDistribuidora.registrarEscolha({ siglaDistribuidora: siglaManualRascunho.trim() })}
                >
                  Confirmar distribuidora
                </button>
                <p className="text-xs text-zinc-400">
                  Não encontramos a distribuidora pelo município — selecione manualmente.
                  {parametros?.siglaDistribuidoraAneelFallback &&
                    ` Sugestão da empresa: ${parametros.siglaDistribuidoraAneelFallback}.`}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Campo
              rotulo="Tarifa ANEEL (R$/kWh)"
              inputMode="decimal"
              placeholder="ex.: 0,95"
              value={tarifaKwh}
              onChange={(e) => {
                setTarifaKwh(e.target.value);
                setTarifaTocada(true);
              }}
            />
            {tarifaAneel.carregando ? (
              <p className="text-xs text-zinc-400">Buscando tarifa homologada da ANEEL…</p>
            ) : tarifaKwh ? (
              <p className="text-xs text-zinc-400">
                Origem: {origemTarifaEfetiva === "aneel" ? "ANEEL" : "ajustada manualmente"}
                {origemTarifaEfetiva === "aneel" && tarifaAneel.resolucaoHomologatoria && ` (${tarifaAneel.resolucaoHomologatoria})`}
              </p>
            ) : tarifaAneel.erro ? (
              <p className="text-xs text-zinc-400">{tarifaAneel.erro} Informe a tarifa manualmente.</p>
            ) : (
              <p className="text-xs text-zinc-400">Resolvida automaticamente assim que a distribuidora for confirmada.</p>
            )}
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <span className="text-sm text-zinc-700">
              Rede elétrica: <strong>{ROTULO_TIPO_LIGACAO[redeConfirmada?.tipoLigacao ?? "trifasico"]}</strong>
              {redeConfirmada?.tensaoRedeV != null && ` · ${redeConfirmada.tensaoRedeV}V`}
            </span>
            <Selo tom="neutro">confirmada na Etapa 2</Selo>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Características técnicas</legend>
          <Campo rotulo="Tipo do telhado" name="tipo_telhado" placeholder="Ex.: cerâmico, metálico, laje, solo" />
          <Campo rotulo="Orientação" placeholder="Ex.: norte" />
          <Campo rotulo="Inclinação" placeholder="Ex.: 15°" />
          <Campo rotulo="Área disponível" placeholder="Ex.: 40 m²" />
          <Campo rotulo="Padrão do cliente" name="padrao_cliente" placeholder="Opcional" />
          <Campo
            rotulo="Estrutura do telhado"
            value={estruturaTelhado}
            onChange={(e) => setEstruturaTelhado(e.target.value)}
            placeholder="Ex.: perfil de alumínio, gancho"
          />
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-zinc-700">Observações técnicas</span>
            <textarea name="descricao" rows={2} className="rounded-md border border-zinc-300 px-3 py-2" />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Documentos</legend>
          <p className="text-xs text-zinc-400 md:col-span-2">
            CNH e conta de energia já enviados na Etapa 1 aparecem aqui como anexos do negócio.{" "}
            <Selo tom="neutro">opcional</Selo>
          </p>
          <CampoArquivo rotulo="Fotos" name="anexo_fatura_beneficiario" accept="image/*" multiple />
          <CampoArquivo rotulo="Outros documentos" name="anexo_fatura_beneficiario" multiple />
        </fieldset>

        <Mensagem resultado={resultado} />
        <div className="flex justify-between">
          <Botao type="button" variante="secundario" onClick={voltar} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Botao>
          <Botao type="submit" disabled={pendente || (modo === "existente" && !contato)}>
            {pendente ? "Salvando..." : "Salvar negócio"}
          </Botao>
        </div>
      </div>
    </form>
  );
}
