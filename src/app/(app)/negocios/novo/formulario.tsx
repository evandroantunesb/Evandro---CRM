"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { EditorComponentesKit, type LinhaComponente } from "@/components/kit-componentes";
import { analisarLinhas, resumoProblemasKit } from "@/lib/kit-linhas";
import { Botao, Campo, GrupoOpcoes, Mensagem, Passador, Selecao } from "@/components/ui";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import { registrarAnexo } from "@/lib/acoes/anexos";
import { enviarArquivos } from "@/lib/anexos-navegador";
import { ANEXOS_CRIACAO, prepararEnvioCriacao } from "@/lib/anexos-regras";
import {
  calcular,
  custosInternosEstimados,
  dimensionarSistema,
  POTENCIA_MODULO_REFERENCIA_W,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";
import { resolverConsumo } from "@/lib/consumo-estimado";
import { formatarCep, formatarMascaraMoeda, formatarNumeroBr, formatarTelefoneBr, lerNumeroBr } from "@/lib/formatacao";
import {
  DESCRICAO_MODULO_REFERENCIA,
  descricaoInversorReferencia,
  inversorSugeridoKw,
  linhasKitSugerido,
  opcoesInversorKw,
  relacaoCcCa,
} from "@/lib/kit-sugerido";
import { montarEndereco } from "@/lib/negocio-dados";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import {
  enquadramentoDoTipoCliente,
  resolverTarifa,
  tarifaOficialRsKwh,
  type BaseTributaria,
  type ContextoEstimativa,
} from "@/lib/tarifa-gd";
import {
  ROTULO_TIPO_CLIENTE_QUALIF,
  ROTULO_TIPO_LIGACAO,
  TIPOS_CLIENTE_QUALIF,
  TIPOS_LIGACAO,
  type ResultadoAcao,
  type TipoClienteQualif,
  type TipoLigacao,
} from "@/lib/tipos";
import { PainelResultado } from "./painel-resultado";

type Opcao = { id: string; nome: string };
type ContatoEncontrado = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
};
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
type Etapa = 1 | 2 | 3;

const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const ETAPAS: { numero: Etapa; titulo: string; descricao: string }[] = [
  { numero: 1, titulo: "Cliente", descricao: "Quem é e onde fica." },
  { numero: 2, titulo: "Conta de luz", descricao: "Consumo, tipo de cliente, distribuidora e ligação." },
  { numero: 3, titulo: "Sistema", descricao: "Sugerido pelo consumo. Ajuste se o cliente pedir." },
];

const OUTRA = "__outra__";

/** Mesmo conversor do servidor ("450", "1.200", "1.234,56"); vazio, inválido ou ambíguo vira null. */
function numero(v: string): number | null {
  const n = lerNumeroBr(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** "COPEL-DIS" → "Copel" (só rótulo; o valor enviado é o nome oficial, aceito pela tabela de tarifas). */
function rotuloDistribuidora(nome: string) {
  const base = nome.split(/[-\s]/)[0];
  return base.charAt(0) + base.slice(1).toLowerCase();
}

/** Kit no formato simples do cadastro (um módulo de referência + um inversor de referência), ou null se foi editado. */
function kitSimples(linhas: LinhaComponente[]) {
  const [modulo, inversor, ...resto] = linhas;
  if (resto.length || modulo?.tipo !== "modulo" || modulo.descricao !== DESCRICAO_MODULO_REFERENCIA) return null;
  if (inversor && (inversor.tipo !== "inversor" || !inversor.descricao.startsWith("Inversor de referência"))) return null;
  const quantidade = lerNumeroBr(modulo.quantidade);
  if (quantidade == null || !Number.isInteger(quantidade) || quantidade < 1) return null;
  return { quantidade, inversorKw: inversor ? Number(inversor.potenciaW) / 1000 : null };
}

/** Seção numerada sem caixa (01/02/03). No celular só a do passo atual aparece; no computador, todas. */
function Secao({
  etapa,
  atual,
  refSecao,
  children,
}: {
  etapa: (typeof ETAPAS)[number];
  atual: Etapa;
  refSecao: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={refSecao}
      aria-labelledby={`secao-${etapa.numero}`}
      className={`${atual === etapa.numero ? "grid" : "hidden"} animate-entrar gap-x-5 border-linha pb-7 md:grid-cols-[56px_minmax(0,1fr)] lg:grid lg:border-t lg:py-8`}
    >
      <span aria-hidden className="font-titulo text-[34px] leading-none font-light text-dourado-texto">
        {String(etapa.numero).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h2 id={`secao-${etapa.numero}`} className="mt-2 text-xl font-semibold tracking-tight text-texto md:mt-0.5">
          {etapa.titulo}
        </h2>
        <p className="mt-1 mb-5 text-sm text-texto-2">{etapa.descricao}</p>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </section>
  );
}

/** Rótulo de um grupo de botões (o grupo em si anuncia o nome via aria-label). */
function RotuloGrupo({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-sm font-medium text-texto-2">{children}</p>;
}

function LinkAcao(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 self-start px-0.5 text-sm font-semibold text-dourado-texto underline decoration-1 underline-offset-4 hover:decoration-2 disabled:text-texto-2 disabled:no-underline md:min-h-0 ${props.className ?? ""}`}
    />
  );
}

export function FormularioNegocio({
  funilId,
  etapaId,
  origens,
  origemSugerida,
  responsaveis,
  meuMembroId,
  contexto,
  parametros,
}: {
  funilId: string;
  /** Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban); senão usa a etapa inicial do funil. */
  etapaId?: string;
  origens: Opcao[];
  /** Última origem usada por quem cria (já marcada). */
  origemSugerida: string | null;
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  /** Referência oficial (tarifas) sem qualificação; a tela aplica o tipo de cliente e a distribuidora escolhidos. */
  contexto: ContextoEstimativa | null;
  parametros: Parametros | null;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciarEnvio] = useTransition();
  const [enviandoArquivos, setEnviandoArquivos] = useState(false);
  const [etapaAtual, setEtapaAtual] = useState<Etapa>(1);
  const etapasRef = useRef<Record<Etapa, HTMLElement | null>>({ 1: null, 2: null, 3: null });
  const [erroEtapa, setErroEtapa] = useState<string | null>(null);

  // ── 01 Cliente ──
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [, iniciar] = useTransition();
  const [contatoNome, setContatoNome] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");
  const emailValido = contatoEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contatoEmail);
  const [origemId, setOrigemId] = useState<string | null>(origemSugerida);
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [titulo, setTitulo] = useState("");

  // Localização: rua/número/complemento/bairro/CEP vão juntos em `contatos.endereco`; cidade e UF em colunas próprias.
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numeroEndereco, setNumeroEndereco] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepEncontrado, setCepEncontrado] = useState<boolean | null>(null);

  async function buscarEnderecoPorCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      setCepEncontrado(!dados.erro);
      if (!dados.erro) {
        setRua(dados.logradouro ?? "");
        setBairro(dados.bairro ?? "");
        setCidade(dados.localidade ?? "");
        setUf(dados.uf ?? "");
      }
    } catch {
      // Preenchimento automático é só conveniência — sem CEP, o vendedor preenche à mão.
      setCepEncontrado(null);
    } finally {
      setBuscandoCep(false);
    }
  }

  const enderecoCompleto = montarEndereco({ rua, numero: numeroEndereco, complemento, bairro, cep });

  /** Contato existente: traz a cidade e a UF já cadastradas (o servidor só completa o que estiver vazio). */
  function escolherContato(c: ContatoEncontrado) {
    setContato(c);
    if (c.cidade) setCidade(c.cidade);
    const ufContato = c.uf?.trim().toUpperCase();
    if (ufContato && ESTADOS_BR.includes(ufContato)) setUf(ufContato);
  }

  // ── 02 Conta de luz ──
  const [formaConsumo, setFormaConsumo] = useState<"kwh" | "conta">("kwh");
  const [consumoMedioKwh, setConsumoMedioKwh] = useState("");
  const [valorFaturaMedio, setValorFaturaMedio] = useState("");
  const [tarifaEfetivaKwh, setTarifaEfetivaKwh] = useState("");
  const [tipoCliente, setTipoCliente] = useState<TipoClienteQualif | null>(null);
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao | null>(null);
  const distribuidorasConhecidas = useMemo(
    () => [...new Set((contexto?.tarifas ?? []).map((t) => t.distribuidora))].sort(),
    [contexto],
  );
  const [distribuidoraEscolha, setDistribuidoraEscolha] = useState<string | null>(null);
  const [distribuidoraOutra, setDistribuidoraOutra] = useState("");
  const distribuidora = distribuidoraEscolha === OUTRA ? distribuidoraOutra.trim() : (distribuidoraEscolha ?? "");
  const [faturaSelecionada, setFaturaSelecionada] = useState<File | null>(null);
  const inputFatura = useRef<HTMLInputElement>(null);

  // Tarifa: a oficial (ANEEL, sem tributos) entra sozinha quando tipo de cliente e distribuidora casam com a tabela;
  // o vendedor pode digitar outra, e então declara a base tributária (sem ela o cálculo fica incompleto, nunca presumido).
  const tarifaOficial = useMemo(() => {
    if (!contexto) return null;
    const enq = enquadramentoDoTipoCliente(tipoCliente);
    if (enq.situacao !== "ok") return null;
    const r = resolverTarifa(contexto.tarifas, distribuidora, enq.enquadramento, contexto.dataReferencia);
    return r.situacao === "ok" ? r.tarifa : null;
  }, [contexto, tipoCliente, distribuidora]);
  const [usarOutraTarifa, setUsarOutraTarifa] = useState(false);
  const [tarifaManual, setTarifaManual] = useState("");
  const [baseManual, setBaseManual] = useState<BaseTributaria | null>(null);
  const usandoOficial = tarifaOficial != null && !usarOutraTarifa;
  const tarifaKwh = usandoOficial ? formatarNumeroBr(tarifaOficialRsKwh(tarifaOficial)) : tarifaManual;
  const tarifaBase: BaseTributaria | null = usandoOficial ? tarifaOficial.baseTributaria : baseManual;

  const consumoResolvido = useMemo(
    () =>
      resolverConsumo(
        formaConsumo === "kwh" ? numero(consumoMedioKwh) : null,
        formaConsumo === "conta" ? numero(valorFaturaMedio) : null,
        formaConsumo === "conta" ? numero(tarifaEfetivaKwh) : null,
      ),
    [formaConsumo, consumoMedioKwh, valorFaturaMedio, tarifaEfetivaKwh],
  );
  const consumoMedioEstimado = consumoResolvido.kwh;

  // ── 03 Sistema ──
  // Mesma conta do kit da ficha (`dimensionarSistema`), com o módulo de referência.
  const sistemaRecomendado = useMemo(
    () =>
      consumoMedioEstimado
        ? dimensionarSistema(consumoMedioEstimado, parametros?.produtividadeKwhKwpMes ?? 120, POTENCIA_MODULO_REFERENCIA_W)
        : null,
    [consumoMedioEstimado, parametros],
  );
  const inversorSugerido = sistemaRecomendado ? inversorSugeridoKw(sistemaRecomendado.potenciaInstaladaKwp) : null;
  const kitRecomendado = useMemo(
    () => (sistemaRecomendado ? linhasKitSugerido(sistemaRecomendado.quantidadeModulos, inversorSugerido) : []),
    [sistemaRecomendado, inversorSugerido],
  );

  // O kit segue a sugestão até o vendedor mexer nele; "sem kit" é uma escolha explícita.
  const [kitTocado, setKitTocado] = useState(false);
  const [semKit, setSemKit] = useState(false);
  const [editorAberto, setEditorAberto] = useState(false);
  const [linhasEditadas, setLinhasEditadas] = useState<LinhaComponente[]>([]);
  const linhas = useMemo(() => (semKit ? [] : kitTocado ? linhasEditadas : kitRecomendado), [semKit, kitTocado, linhasEditadas, kitRecomendado]);
  function mudarLinhas(novas: LinhaComponente[]) {
    setKitTocado(true);
    setLinhasEditadas(novas);
  }
  function voltarAoSugerido() {
    setKitTocado(false);
    setInversorEscolhido(false);
    setSemKit(false);
    setEditorAberto(false);
    setMostrarProblemasKit(false);
  }
  const simples = kitSimples(linhas);
  const modoSimples = !editorAberto && (linhas.length === 0 || simples != null);

  // O inversor acompanha os módulos (menor potência sugerida) até o vendedor escolher um.
  const [inversorEscolhido, setInversorEscolhido] = useState(false);
  function mudarQuantidadeModulos(quantidade: number) {
    if (!simples) return;
    const kwp = (quantidade * POTENCIA_MODULO_REFERENCIA_W) / 1000;
    mudarLinhas(linhasKitSugerido(quantidade, inversorEscolhido ? simples.inversorKw : (inversorSugeridoKw(kwp) ?? simples.inversorKw)));
  }
  function mudarInversor(kw: number) {
    if (!simples) return;
    setInversorEscolhido(true);
    mudarLinhas(linhasKitSugerido(simples.quantidade, kw));
  }
  const opcoesInversor = simples
    ? [
        ...new Set([
          ...opcoesInversorKw(inversorSugeridoKw((simples.quantidade * POTENCIA_MODULO_REFERENCIA_W) / 1000)),
          ...(simples.inversorKw != null ? [simples.inversorKw] : []),
        ]),
      ].sort((a, b) => a - b)
    : [];

  // Mesma análise para a potência, o preço sugerido e o envio: a quantidade vista é a quantidade usada.
  const { componentes, itens, problemas: problemasKit } = useMemo(() => analisarLinhas(linhas), [linhas]);
  // Só depois de uma tentativa de seguir/enviar os problemas das linhas aparecem.
  const [mostrarProblemasKit, setMostrarProblemasKit] = useState(false);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);

  const precoSugerido = useMemo(() => {
    // Só linhas válidas, com a mesma quantidade que vai para o servidor ("1.200" = 1200 aqui também).
    const somaComponentes = itens.reduce((acc, { indice, componente }) => {
      const textoPreco = linhas[indice].precoEstimadoUnitario;
      const precoUnitario = textoPreco ? Number(textoPreco) : NaN;
      return Number.isFinite(precoUnitario) ? acc + precoUnitario * componente.quantidade : acc;
    }, 0);
    if (somaComponentes <= 0) return null;
    if (!parametros) return Math.round(somaComponentes);
    const quantidadeModulos = componentes.filter((c) => c.tipo === "modulo").reduce((acc, c) => acc + c.quantidade, 0);
    const custos = custosInternosEstimados(somaComponentes, quantidadeModulos, potenciaKwp, parametros);
    return Math.round(custos.total);
  }, [linhas, itens, componentes, potenciaKwp, parametros]);

  const [valor, setValor] = useState("");
  const [valorTocado, setValorTocado] = useState(false);
  const [ultimoPrecoSugerido, setUltimoPrecoSugerido] = useState<number | null>(null);
  if (precoSugerido !== ultimoPrecoSugerido) {
    setUltimoPrecoSugerido(precoSugerido);
    // A sugestão já entra com centavos; o mesmo texto é lido pelo servidor sem o prefixo visual R$.
    if (precoSugerido != null && !valorTocado) setValor(precoSugerido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  const sugerirQuantidadeModulo = useMemo(() => {
    if (!parametros || !consumoMedioEstimado) return undefined;
    return (potenciaW: number) => sugerirQuantidadeModulos(consumoMedioEstimado, parametros.produtividadeKwhKwpMes, potenciaW);
  }, [parametros, consumoMedioEstimado]);

  // Resultado do motor com o contexto do servidor + a qualificação escolhida aqui: o mesmo cálculo que a criação grava.
  // Consumo e tarifa ausentes entram como 0 só para o motor listar as pendências; a geração não depende deles.
  const previa = useMemo(() => {
    if (!parametros || potenciaKwp <= 0) return null;
    return calcular({
      potenciaKwp,
      precoKit: numero(valor) ?? 0,
      tipoLigacao: tipoLigacao ?? "trifasico",
      consumoMedioKwh: consumoMedioEstimado ?? 0,
      tarifaKwh: numero(tarifaKwh) ?? 0,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
      dadosEstimativa: {
        contexto: contexto ? { ...contexto, tipoCliente, distribuidoraInformada: distribuidora || null } : null,
        tarifaBaseTributaria: tarifaBase,
      },
    });
  }, [parametros, potenciaKwp, valor, tipoLigacao, consumoMedioEstimado, tarifaKwh, contexto, tipoCliente, distribuidora, tarifaBase]);
  // Sem ligação o motor não fecha a conta: a prévia nunca mostra resultado completo com ligação presumida.
  const completo = previa?.estado === "completa" && tipoLigacao ? previa : null;
  const pendencias = [
    ...(tipoLigacao ? [] : ["Escolha a ligação (mono, bi ou trifásica)."]),
    ...(previa?.estado === "incompleta" ? previa.pendencias.map((p) => p.mensagem) : []),
  ];

  const nomeCliente = modo === "existente" ? (contato?.nome ?? "") : contatoNome;
  const tituloSugerido = `${tipoCliente ? ROTULO_TIPO_CLIENTE_QUALIF[tipoCliente] : "Negócio"} — ${nomeCliente.trim() || "Nome do cliente"}`;
  const faltaBasico = !consumoMedioEstimado
    ? "Informe a conta de luz para ver o resultado."
    : !componentes.length
      ? "Sem kit, o negócio é criado sem cálculo."
      : null;
  const fonte = completo
    ? `${rotuloDistribuidora(completo.retrato.distribuidora)} B1 · tarifa ${completo.retrato.tarifaOrigem === "oficial_aneel" ? "oficial ANEEL" : "informada"} · GD II ${completo.retrato.dataReferencia.slice(0, 4)}`
    : null;

  /**
   * Envio sem o reset automático (nada do que foi digitado se perde se o servidor recusar).
   * Os arquivos não vão para a ação (limite de 1 MB): depois de criar o negócio, cada um vai
   * direto ao Storage e só então é registrado; o que falhar vira aviso na ficha.
   */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // O formulário tem `noValidate`: cada passo é conferido e o problema aparece no passo dele.
    for (const etapa of [1, 2, 3] as const) {
      const problemaEtapa = problemaDaEtapa(etapa);
      if (problemaEtapa) return mostrarProblema(etapa, problemaEtapa);
    }
    setErroEtapa(null);
    const { dados, arquivos, problema } = prepararEnvioCriacao(new FormData(evento.currentTarget));
    if (problema) return setResultado({ ok: false, mensagem: `${problema} Escolha outro arquivo.` });
    setResultado(null);
    iniciarEnvio(async () => {
      let r: Awaited<ReturnType<typeof criarNegocio>>;
      try {
        r = await criarNegocio(dados);
      } catch {
        setResultado({
          ok: false,
          mensagem: "Não foi possível salvar agora (falha de conexão ou do servidor). Seus dados continuam na tela; tente de novo.",
        });
        return;
      }
      if (!r.ok) {
        setResultado({ ok: false, mensagem: r.mensagem });
        // O contato novo foi gravado mas o negócio não: segue com ele como "existente" (o reenvio não duplica).
        if (r.contatoId) {
          setContato({ id: r.contatoId, nome: contatoNome, telefone: contatoTelefone, email: contatoEmail || null });
          setModo("existente");
        }
        return;
      }
      const avisos = [...r.avisos];
      if (arquivos.length) {
        setEnviandoArquivos(true);
        try {
          const falhas = await enviarArquivos(
            criarClienteNavegador(),
            registrarAnexo,
            { empresaId: r.empresaId, negocioId: r.negocioId },
            arquivos.map((a) => ({ arquivo: a.arquivo, categoria: ANEXOS_CRIACAO.find((c) => c.campo === a.campo)!.categoria })),
          );
          if (falhas.length) avisos.push("anexos");
        } catch {
          // O negócio já existe: segue para a ficha avisando dos arquivos.
          avisos.push("anexos");
        }
      }
      router.push(`/negocios/${r.negocioId}${avisos.length ? `?avisos=${avisos.join(",")}` : ""}`);
    });
  }

  function pesquisar(termo: string) {
    setBusca(termo);
    iniciar(async () => setEncontrados(await buscarContatos(termo)));
  }

  function conferirDuplicado(tel: string, email: string) {
    if (tel.replace(/\D/g, "").length < 8 && !email.includes("@")) return setDuplicados([]);
    iniciar(async () => setDuplicados(await verificarDuplicado(tel, email)));
  }

  /** Primeiro campo inválido (regras do próprio campo: obrigatório, e-mail...) do passo, ignorando desativados. */
  function campoInvalido(etapa: Etapa) {
    const raiz = etapasRef.current[etapa];
    if (!raiz) return null;
    for (const campo of raiz.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
      if (!campo.disabled && !campo.checkValidity()) return campo;
    }
    return null;
  }

  /** O que falta no passo: só os campos e conferências daquele passo. */
  function problemaDaEtapa(etapa: Etapa): { mensagem: string; campo?: HTMLElement } | null {
    if (etapa === 1 && modo === "existente" && !contato) return { mensagem: "Selecione um contato existente pra continuar." };
    const invalido = campoInvalido(etapa);
    if (invalido) {
      const rotulo = invalido.closest("label")?.querySelector("span")?.textContent?.replace(/\*$/, "").trim();
      return { mensagem: `Preencha corretamente: ${rotulo || "campo obrigatório"}.`, campo: invalido };
    }
    if (etapa === 1) {
      if (modo === "novo") {
        if (contatoNome.trim().length < 2) return { mensagem: "Informe o nome do cliente." };
        if (contatoTelefone.replace(/\D/g, "").length < 10) return { mensagem: "Informe um WhatsApp válido." };
        if (!emailValido) return { mensagem: "Informe um e-mail válido ou deixe em branco." };
      }
      const cepDigitos = cep.replace(/\D/g, "");
      if (cepDigitos.length > 0 && cepDigitos.length !== 8) return { mensagem: "CEP inválido — informe os 8 dígitos ou deixe em branco." };
      if (!cidade.trim() || !uf.trim()) return { mensagem: "Informe a cidade e o estado (o CEP preenche os dois)." };
      if (!origemId) return { mensagem: "Escolha a origem do cliente." };
      if (editandoTitulo && titulo.trim().length < 2) return { mensagem: "Informe o nome do negócio ou use o título gerado." };
    }
    if (etapa === 2) {
      if (formaConsumo === "kwh" && numero(consumoMedioKwh) == null) return { mensagem: "Informe o consumo médio mensal em kWh." };
      if (formaConsumo === "conta" && numero(valorFaturaMedio) == null) return { mensagem: "Informe o valor médio da conta." };
      if (!tipoCliente) return { mensagem: "Escolha o tipo de cliente." };
      if (!distribuidora) return { mensagem: "Escolha a distribuidora (ou informe outra)." };
      if (!tipoLigacao) return { mensagem: "Escolha a ligação: ela muda o cálculo." };
      if (!usandoOficial && numero(tarifaManual) != null && !baseManual) return { mensagem: "Diga se a tarifa digitada tem ou não tributos." };
    }
    // Kit: quantidade inválida ou linha incompleta bloqueia (nada é arredondado, trocado ou descartado).
    if (etapa === 3) {
      const problemaKit = resumoProblemasKit(problemasKit, linhas);
      if (problemaKit) return { mensagem: problemaKit };
      if (numero(valor) == null) return { mensagem: "Informe o valor do negócio." };
    }
    return null;
  }

  /** Leva ao passo do problema, mostra a mensagem e põe o cursor no campo. */
  function mostrarProblema(etapa: Etapa, problema: { mensagem: string; campo?: HTMLElement }) {
    setEtapaAtual(etapa);
    if (etapa === 3) setMostrarProblemasKit(true);
    setErroEtapa(problema.mensagem);
    setTimeout(() => {
      if (problema.campo) problema.campo.focus();
      else etapasRef.current[etapa]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function avancar() {
    const problema = problemaDaEtapa(etapaAtual);
    if (problema) return mostrarProblema(etapaAtual, problema);
    setErroEtapa(null);
    setEtapaAtual(etapaAtual === 1 ? 2 : 3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function voltar() {
    setErroEtapa(null);
    setEtapaAtual((e) => (e === 3 ? 2 : e === 2 ? 1 : e));
  }

  const painel = (
    <PainelResultado
      nomeCliente={nomeCliente}
      consumoKwh={consumoMedioEstimado}
      geracao={componentes.length && previa ? previa.geracaoEstimadaKwhMes : null}
      completo={completo}
      pendencias={pendencias}
      faltaBasico={faltaBasico}
      fonte={fonte}
    />
  );
  const rotuloCriar = enviandoArquivos ? "Enviando arquivos..." : pendente ? "Criando..." : "Criar negócio";

  return (
    <form onSubmit={enviar} noValidate className="grid gap-10 pb-28 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:pb-0">
      <input type="hidden" name="funil_id" value={funilId} />
      {etapaId && <input type="hidden" name="etapa_id" value={etapaId} />}
      <input type="hidden" name="titulo" value={editandoTitulo ? titulo : ""} />
      <input type="hidden" name="origem_id" value={origemId ?? ""} />
      <input type="hidden" name="tipo_ligacao" value={tipoLigacao ?? ""} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />
      <input type="hidden" name="contato_endereco" value={enderecoCompleto} />
      <input type="hidden" name="contato_cidade" value={cidade} />
      <input type="hidden" name="contato_uf" value={uf} />
      <input type="hidden" name="contato_nome" value={contatoNome} />
      <input type="hidden" name="contato_telefone" value={contatoTelefone} />
      <input type="hidden" name="contato_email" value={contatoEmail} />
      <input type="hidden" name="valor" value={valor} />
      <input type="hidden" name="consumo_medio_kwh" value={formaConsumo === "kwh" ? consumoMedioKwh : ""} />
      <input type="hidden" name="valor_fatura_medio" value={formaConsumo === "conta" ? valorFaturaMedio : ""} />
      <input type="hidden" name="tarifa_efetiva_kwh" value={formaConsumo === "conta" ? tarifaEfetivaKwh : ""} />
      <input type="hidden" name="tarifa_kwh" value={tarifaKwh} />
      <input type="hidden" name="tarifa_base_tributaria" value={tarifaBase ?? ""} />
      <input type="hidden" name="qualif_tipo_cliente" value={tipoCliente ?? ""} />
      <input type="hidden" name="qualif_distribuidora" value={distribuidora} />
      {contato && <input type="hidden" name="contato_id" value={contato.id} />}

      <div className="min-w-0">
        {/* Progresso do celular: três traços, o atual em dourado. */}
        <ol aria-label="Passos" className="mb-6 grid grid-cols-3 gap-2 lg:hidden">
          {ETAPAS.map((e) => (
            <li key={e.numero} aria-current={e.numero === etapaAtual ? "step" : undefined} className="flex flex-col gap-1.5">
              <span className={`h-1 rounded-full transition-colors duration-500 ease-raion ${e.numero <= etapaAtual ? "bg-dourado" : "bg-linha"}`} />
              <span className={`text-xs ${e.numero === etapaAtual ? "font-semibold text-texto" : "text-texto-2"}`}>{e.titulo}</span>
            </li>
          ))}
        </ol>

        {/* ── 01 Cliente ── */}
        <Secao etapa={ETAPAS[0]} atual={etapaAtual} refSecao={(el) => void (etapasRef.current[1] = el)}>
          <GrupoOpcoes
            rotulo="Cliente"
            opcoes={[
              { valor: "novo", rotulo: "Novo cliente" },
              { valor: "existente", rotulo: "Cliente existente" },
            ]}
            valor={modo}
            aoEscolher={setModo}
          />

          {modo === "existente" ? (
            contato ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-dourado/10 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  <strong>{contato.nome}</strong> <span className="text-texto-2">{contato.telefone ?? contato.email}</span>
                </span>
                <LinkAcao onClick={() => setContato(null)}>Trocar</LinkAcao>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Campo rotulo="Buscar por nome, telefone ou e-mail" value={busca} onChange={(e) => pesquisar(e.target.value)} />
                <ul className="flex flex-col">
                  {encontrados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => escolherContato(c)}
                        className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-superficie-2"
                      >
                        <strong>{c.nome}</strong> <span className="text-texto-2">{c.telefone ?? c.email}</span>
                      </button>
                    </li>
                  ))}
                  {busca.length >= 2 && !encontrados.length && <li className="px-3 py-2 text-sm text-texto-2">Nenhum contato encontrado.</li>}
                </ul>
              </div>
            )
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Campo rotulo="Nome" autoComplete="name" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} required />
                <Campo
                  rotulo="WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={contatoTelefone}
                  placeholder="(45) 99999-0000"
                  onChange={(e) => setContatoTelefone(formatarTelefoneBr(e.target.value))}
                  onBlur={() => conferirDuplicado(contatoTelefone, contatoEmail)}
                  required
                />
                <Campo
                  rotulo="E-mail (opcional)"
                  type="email"
                  autoComplete="email"
                  value={contatoEmail}
                  onChange={(e) => setContatoEmail(e.target.value)}
                  onBlur={() => conferirDuplicado(contatoTelefone, contatoEmail)}
                  erro={emailValido ? null : "E-mail inválido."}
                />
              </div>
              {duplicados.map((d) => (
                <div key={d.contatoId} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
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

          {modo === "existente" && contato?.endereco && (
            <p className="text-xs text-texto-2">
              Endereço já cadastrado: <strong>{contato.endereco}</strong>. Ele é mantido; o que for digitado aqui só completa campos vazios.
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-4 md:grid-cols-[160px_minmax(0,1fr)_96px]">
            <div className="col-span-2 md:col-span-1">
              <Campo
                rotulo="CEP"
                inputMode="numeric"
                autoComplete="postal-code"
                value={cep}
                placeholder="00000-000"
                onChange={(e) => setCep(formatarCep(e.target.value))}
                onBlur={(e) => buscarEnderecoPorCep(e.target.value)}
              />
              <p aria-live="polite" className={`mt-1 min-h-4 text-xs ${cepEncontrado === false ? "text-erro" : "text-energia"}`}>
                {buscandoCep ? "Buscando…" : cepEncontrado === false ? "CEP não encontrado; preencha a cidade." : cepEncontrado ? `${cidade} · ${uf}` : ""}
              </p>
            </div>
            <Campo rotulo="Cidade" autoComplete="address-level2" value={cidade} onChange={(e) => setCidade(e.target.value)} required />
            <Selecao rotulo="UF" value={uf} onChange={(e) => setUf(e.target.value)} required>
              <option value="">UF</option>
              {ESTADOS_BR.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Selecao>
          </div>
          <details className="group -mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer list-none py-2 font-semibold text-dourado-texto md:min-h-0">
              Endereço completo (opcional)
            </summary>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Campo rotulo="Rua" autoComplete="address-line1" value={rua} onChange={(e) => setRua(e.target.value)} />
              </div>
              <Campo rotulo="Número" value={numeroEndereco} onChange={(e) => setNumeroEndereco(e.target.value)} />
              <Campo rotulo="Complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
              <Campo rotulo="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </div>
          </details>

          <div>
            <RotuloGrupo>Origem{origemSugerida && origemId === origemSugerida ? " (a última que você usou)" : ""}</RotuloGrupo>
            {origens.length <= 6 ? (
              <GrupoOpcoes rotulo="Origem" opcoes={origens.map((o) => ({ valor: o.id, rotulo: o.nome }))} valor={origemId} aoEscolher={setOrigemId} />
            ) : (
              <Selecao aria-label="Origem" value={origemId ?? ""} onChange={(e) => setOrigemId(e.target.value || null)}>
                <option value="">Selecione</option>
                {origens.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </div>

          {responsaveis.length > 0 && (
            <div className="md:max-w-sm">
              <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={meuMembroId}>
                {responsaveis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Selecao>
            </div>
          )}

          {editandoTitulo ? (
            <div className="md:max-w-md">
              <Campo rotulo="Nome do negócio" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            </div>
          ) : (
            <p className="text-sm text-texto-2">
              Título: <span className="text-texto">“{tituloSugerido}”</span>{" "}
              <LinkAcao
                className="ml-1 inline"
                onClick={() => {
                  setTitulo(tituloSugerido);
                  setEditandoTitulo(true);
                }}
              >
                editar
              </LinkAcao>
            </p>
          )}
        </Secao>

        {/* ── 02 Conta de luz ── */}
        <Secao etapa={ETAPAS[1]} atual={etapaAtual} refSecao={(el) => void (etapasRef.current[2] = el)}>
          <div>
            <GrupoOpcoes
              rotulo="Como informar o consumo"
              opcoes={[
                { valor: "kwh", rotulo: "Consumo em kWh" },
                { valor: "conta", rotulo: "Valor da conta" },
              ]}
              valor={formaConsumo}
              aoEscolher={setFormaConsumo}
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {formaConsumo === "kwh" ? (
                <Campo
                  rotulo="Consumo médio mensal (kWh)"
                  inputMode="decimal"
                  placeholder="ex.: 500"
                  value={consumoMedioKwh}
                  // Mantém ponto e vírgula: apagá-los transformava "1.200,5" em 12005 sem aviso.
                  onChange={(e) => setConsumoMedioKwh(e.target.value.replace(/[^\d.,]/g, ""))}
                />
              ) : (
                <>
                  <Campo
                    rotulo="Valor médio da conta (R$)"
                    inputMode="numeric"
                    placeholder="ex.: 650,00"
                    value={valorFaturaMedio}
                    onChange={(e) => setValorFaturaMedio(formatarMascaraMoeda(e.target.value))}
                  />
                  <Campo
                    rotulo="Tarifa efetiva da conta (R$/kWh)"
                    inputMode="decimal"
                    placeholder="ex.: 0,9500"
                    value={tarifaEfetivaKwh}
                    onChange={(e) => setTarifaEfetivaKwh(e.target.value)}
                  />
                </>
              )}
            </div>
            {formaConsumo === "conta" && (
              <p className="mt-2 text-xs text-texto-2">
                {consumoResolvido.origem === "estimado"
                  ? `≈ ${consumoResolvido.kwh.toLocaleString("pt-BR")} kWh/mês (conta ÷ tarifa efetiva).`
                  : "Sem a tarifa efetiva (com tributos, da conta), não há consumo para dimensionar."}
              </p>
            )}
          </div>

          <div>
            <RotuloGrupo>Tipo de cliente</RotuloGrupo>
            <GrupoOpcoes
              rotulo="Tipo de cliente"
              opcoes={TIPOS_CLIENTE_QUALIF.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CLIENTE_QUALIF[t] }))}
              valor={tipoCliente}
              aoEscolher={setTipoCliente}
            />
          </div>

          <div>
            <RotuloGrupo>Distribuidora</RotuloGrupo>
            <GrupoOpcoes
              rotulo="Distribuidora"
              opcoes={[...distribuidorasConhecidas.map((d) => ({ valor: d, rotulo: rotuloDistribuidora(d) })), { valor: OUTRA, rotulo: "Outra" }]}
              valor={distribuidoraEscolha}
              aoEscolher={setDistribuidoraEscolha}
            />
            {distribuidoraEscolha === OUTRA && (
              <div className="mt-3 md:max-w-sm">
                <Campo rotulo="Nome da distribuidora" value={distribuidoraOutra} onChange={(e) => setDistribuidoraOutra(e.target.value)} maxLength={80} />
              </div>
            )}
          </div>

          <div>
            <RotuloGrupo>Ligação (polos do disjuntor)</RotuloGrupo>
            <GrupoOpcoes
              rotulo="Ligação"
              opcoes={TIPOS_LIGACAO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_LIGACAO[t] }))}
              valor={tipoLigacao}
              aoEscolher={setTipoLigacao}
            />
          </div>

          {usandoOficial ? (
            <p className="text-sm text-texto-2">
              <span className="font-medium text-energia">Tarifa oficial aplicada:</span> R$ {tarifaKwh}/kWh (TE + TUSD, sem tributos) ·{" "}
              {tarifaOficial.ato}.{" "}
              <LinkAcao className="inline" onClick={() => setUsarOutraTarifa(true)}>
                usar outra
              </LinkAcao>
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Campo
                rotulo="Tarifa base TE + TUSD (R$/kWh, opcional)"
                inputMode="decimal"
                placeholder="ex.: 0,81"
                value={tarifaManual}
                onChange={(e) => setTarifaManual(e.target.value)}
              />
              {numero(tarifaManual) != null && (
                <div>
                  <RotuloGrupo>Essa tarifa tem tributos?</RotuloGrupo>
                  <GrupoOpcoes
                    rotulo="Base tributária da tarifa"
                    opcoes={[
                      { valor: "sem_tributos", rotulo: "Sem tributos" },
                      { valor: "com_tributos", rotulo: "Com tributos" },
                    ]}
                    valor={baseManual}
                    aoEscolher={setBaseManual}
                  />
                </div>
              )}
              {tarifaOficial && (
                <LinkAcao onClick={() => setUsarOutraTarifa(false)}>Voltar à tarifa oficial</LinkAcao>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              ref={inputFatura}
              type="file"
              name="anexo_fatura_gerador"
              accept="image/*,.pdf"
              className="sr-only"
              id="fatura"
              onChange={(e) => setFaturaSelecionada(e.target.files?.[0] ?? null)}
            />
            {faturaSelecionada ? (
              <>
                <FileText className="h-4 w-4 text-dourado-texto" aria-hidden />
                <span className="max-w-full break-all text-texto">{faturaSelecionada.name}</span>
                <button
                  type="button"
                  aria-label="Remover conta de luz"
                  className="grid h-9 w-9 place-items-center rounded-full text-texto-2 hover:bg-superficie-2"
                  onClick={() => {
                    if (inputFatura.current) inputFatura.current.value = "";
                    setFaturaSelecionada(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <label htmlFor="fatura" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-dashed border-dourado/70 bg-dourado/10 px-4 font-medium text-texto transition-colors hover:bg-dourado/15">
                <FileText className="h-4 w-4 text-dourado-texto" aria-hidden />
                Anexar a conta de luz (opcional)
              </label>
            )}
          </div>
        </Secao>

        {/* ── 03 Sistema ── */}
        <Secao etapa={ETAPAS[2]} atual={etapaAtual} refSecao={(el) => void (etapasRef.current[3] = el)}>
          <div className="lg:hidden">{painel}</div>

          {!consumoMedioEstimado && !kitTocado ? (
            <p className="text-sm text-texto-2">Informe o consumo no passo 2 para o Raion sugerir o kit.</p>
          ) : semKit ? (
            <p className="text-sm text-texto-2">
              O negócio será criado sem kit e sem cálculo. <LinkAcao className="inline" onClick={voltarAoSugerido}>Usar o kit sugerido</LinkAcao>
            </p>
          ) : modoSimples && simples ? (
            <div className="divide-y divide-linha">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-texto-2">Módulos</p>
                  <p className="font-medium text-texto">
                    {POTENCIA_MODULO_REFERENCIA_W} W de referência
                    {sistemaRecomendado && simples.quantidade !== sistemaRecomendado.quantidadeModulos && (
                      <span className="ml-2 text-[11px] tracking-wider text-dourado-texto uppercase">ajustado</span>
                    )}
                  </p>
                  <p className="text-xs text-texto-2">{potenciaKwp.toLocaleString("pt-BR")} kWp</p>
                </div>
                <Passador valor={simples.quantidade} aoMudar={mudarQuantidadeModulos} rotulo="módulos" maximo={500} />
              </div>
              <div className="pt-4">
                <p className="mb-2 text-xs text-texto-2">
                  Inversor
                  {simples.inversorKw != null && relacaoCcCa(potenciaKwp, simples.inversorKw) != null && (
                    <> · relação módulos/inversor {relacaoCcCa(potenciaKwp, simples.inversorKw)!.toLocaleString("pt-BR")}</>
                  )}
                </p>
                <GrupoOpcoes
                  rotulo="Inversor"
                  opcoes={opcoesInversor.map((kw) => ({
                    valor: String(kw),
                    rotulo: `${kw.toLocaleString("pt-BR")} kW`,
                  }))}
                  valor={simples.inversorKw != null ? String(simples.inversorKw) : null}
                  aoEscolher={(v) => mudarInversor(Number(v))}
                />
                <p className="mt-2 text-xs text-texto-2">
                  {simples.inversorKw != null ? descricaoInversorReferencia(simples.inversorKw) : ""}. Inversor maior muda o preço, não a geração.
                </p>
              </div>
            </div>
          ) : (
            <EditorComponentesKit
              linhas={linhas}
              onChange={mudarLinhas}
              sugerirQuantidadeModulo={sugerirQuantidadeModulo}
              problemas={mostrarProblemasKit ? problemasKit : undefined}
            />
          )}

          {(consumoMedioEstimado || kitTocado) && (
            <div className="flex flex-wrap gap-x-5">
              {(kitTocado || semKit) && <LinkAcao onClick={voltarAoSugerido}>Voltar ao sugerido</LinkAcao>}
              {!editorAberto && !semKit && (
                <LinkAcao
                  onClick={() => {
                    mudarLinhas(linhas);
                    setEditorAberto(true);
                  }}
                >
                  Trocar itens ou montar do zero
                </LinkAcao>
              )}
              {!semKit && (
                <LinkAcao
                  onClick={() => {
                    setSemKit(true);
                    setEditorAberto(false);
                    setMostrarProblemasKit(false);
                  }}
                >
                  Seguir sem kit
                </LinkAcao>
              )}
            </div>
          )}

          {/* Não há conferência de módulo, inversor, tensão ou faixa MPPT neste cadastro: o aviso diz isso, sem nenhum
              "validado" ou "compatível" até existir uma validação de verdade (catálogo com ficha técnica). */}
          <div role="status" className="flex items-start gap-2 text-xs text-dourado-texto">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Compatibilidade técnica não verificada. O Raion ainda não confere módulo, inversor, tensão e faixa MPPT: confirme com a
              engenharia antes de fechar o kit.
            </span>
          </div>

          <div className="border-t border-linha pt-5">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-texto-2">Valor do negócio</span>
              <span className="flex items-baseline gap-2 border-b-[1.5px] border-linha transition-colors duration-300 ease-raion focus-within:border-dourado md:max-w-sm">
                <span aria-hidden="true" className="text-texto-2">
                  R$
                </span>
                <input
                  inputMode="numeric"
                  required
                  value={valor}
                  onChange={(e) => {
                    setValor(formatarMascaraMoeda(e.target.value));
                    setValorTocado(true);
                  }}
                  className="h-13 w-full bg-transparent font-titulo text-3xl font-light text-texto tabular-nums outline-none placeholder:text-texto-2/50"
                  placeholder="0,00"
                />
              </span>
            </label>
            <p className="mt-2 text-xs text-texto-2">
              {!valorTocado && precoSugerido != null
                ? "Preço de referência do catálogo + custos internos configurados (estimativa, não é cotação) — ajuste se precisar."
                : "Sem preço de catálogo para estes itens: digite o valor do negócio."}
            </p>
          </div>
        </Secao>

        {/* Ações: no computador ao fim do formulário; no celular, barra fixa embaixo. */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-fundo/90 px-4 py-3 backdrop-blur-md lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {(erroEtapa || resultado) && (
            <div className="mb-3">
              {erroEtapa ? <Mensagem resultado={{ ok: false, mensagem: erroEtapa }} /> : <Mensagem resultado={resultado} />}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <Botao type="button" variante="secundario" onClick={voltar} className={`gap-1 lg:hidden ${etapaAtual === 1 ? "invisible" : ""}`}>
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Botao>
            {etapaAtual < 3 && (
              <Botao type="button" onClick={avancar} className="min-w-36 gap-1 lg:hidden">
                Avançar <ChevronRight className="h-4 w-4" />
              </Botao>
            )}
            {/* No celular, só no passo 3 (o envio confere os três passos). */}
            <div className={etapaAtual < 3 ? "hidden lg:block" : ""}>
              <Botao type="submit" disabled={pendente} className="min-w-44 rounded-full">
                {rotuloCriar}
              </Botao>
            </div>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-8">{painel}</div>
      </aside>
    </form>
  );
}
