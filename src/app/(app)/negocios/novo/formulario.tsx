"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { EditorComponentesKit, linhasParaComponentes, type LinhaComponente } from "@/components/kit-componentes";
import { Botao, Campo, Mensagem, Selecao, Selo } from "@/components/ui";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import { enviarArquivosReservados } from "@/lib/anexos-navegador";
import { prepararEnvioCriacao } from "@/lib/anexos-regras";
import {
  calcular,
  custosInternosEstimados,
  DISPONIBILIDADE_PADRAO_CAMEL,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";
import { formatarCep, formatarMascaraMoeda, formatarMoeda, formatarTelefoneBr } from "@/lib/formatacao";
import { montarEndereco } from "@/lib/negocio-dados";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type ResultadoAcao, type TipoLigacao } from "@/lib/tipos";

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

const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

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

/** Estimativa ilustrativa (não é o motor de cálculo) só pra prévia mockada da Etapa 2. */
function estimarSistemaMockKwp(consumoMedioKwh: number | null, produtividadeKwhKwpMes: number) {
  if (!consumoMedioKwh || !produtividadeKwhKwpMes) return null;
  return Number(((consumoMedioKwh / produtividadeKwhKwpMes) * 1.24).toFixed(2));
}

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

/** Card de documento com "leitura automática" simulada: não há OCR real, só a estrutura visual. */
function CardDocumentoInteligente({
  titulo,
  legenda,
  campos,
  name,
  accept,
}: {
  titulo: string;
  legenda: string;
  campos: string[];
  name: string;
  accept?: string;
}) {
  const id = useId();
  const [processado, setProcessado] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3">
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-1">
        <span className="text-sm font-medium text-zinc-800">{titulo}</span>
        {!processado && <span className="text-xs text-zinc-500">{legenda}</span>}
      </label>
      {processado && (
        <div className="flex flex-col gap-1 rounded-md bg-green-50 px-3 py-2">
          <p className="text-sm font-medium text-green-800">Documento processado</p>
          <ul className="text-xs text-green-700">
            {campos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" className="text-xs font-medium text-amber-700 hover:underline" onClick={() => setProcessado(false)}>
              Revisar dados
            </button>
            <span className="truncate text-xs text-zinc-400">· {nomeArquivo}</span>
          </div>
        </div>
      )}
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          setNomeArquivo(arquivo.name);
          setProcessado(true);
        }}
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
}: {
  funilId: string;
  /** Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban); senão usa a etapa inicial do funil. */
  etapaId?: string;
  origens: Opcao[];
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  parametros: Parametros | null;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciarEnvio] = useTransition();
  const [enviandoArquivos, setEnviandoArquivos] = useState(false);
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

  // Localização (Etapa 1) — rua/número/complemento/bairro/CEP vão juntos em `contatos.endereco`;
  // cidade e UF vão em `contatos.cidade`/`uf` (antes ficavam só dentro do texto do endereço).
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

  const enderecoCompleto = montarEndereco({ rua, numero: numeroEndereco, complemento, bairro, cep });

  /** Contato existente: traz a cidade e a UF já cadastradas (o servidor só completa o que estiver vazio). */
  function escolherContato(c: ContatoEncontrado) {
    setContato(c);
    if (c.cidade) setCidade(c.cidade);
    if (c.uf) setUf(c.uf);
  }

  // Consumo (Etapa 1): kWh direto ou valor da conta (com máscara), nunca os dois exigidos.
  const [consumoMedioKwh, setConsumoMedioKwh] = useState("");
  const [valorFaturaMedio, setValorFaturaMedio] = useState("");
  const [tarifaKwh, setTarifaKwh] = useState("");

  // Dados técnicos (Etapa 3, movidos pra fora do primeiro contato).
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>("trifasico");

  // Kit personalizado (dentro da Etapa 2, escondido até o vendedor pedir).
  const [mostrarKit, setMostrarKit] = useState(false);
  const [mostrarAlertasExemplo, setMostrarAlertasExemplo] = useState(false);
  const [linhas, setLinhas] = useState<LinhaComponente[]>([]);
  const [estruturaTelhado, setEstruturaTelhado] = useState("");

  const componentes = useMemo(() => linhasParaComponentes(linhas), [linhas]);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);

  const precoSugerido = useMemo(() => {
    const somaComponentes = linhas.reduce((acc, l) => {
      const precoUnitario = l.precoEstimadoUnitario ? Number(l.precoEstimadoUnitario) : NaN;
      const quantidade = Number(l.quantidade) || 0;
      return Number.isFinite(precoUnitario) ? acc + precoUnitario * quantidade : acc;
    }, 0);
    if (somaComponentes <= 0) return null;
    if (!parametros) return Math.round(somaComponentes);
    const quantidadeModulos = componentes.filter((c) => c.tipo === "modulo").reduce((acc, c) => acc + c.quantidade, 0);
    const custos = custosInternosEstimados(somaComponentes, quantidadeModulos, potenciaKwp, parametros);
    return Math.round(custos.total);
  }, [linhas, componentes, potenciaKwp, parametros]);

  const [valor, setValor] = useState("");
  const [valorTocado, setValorTocado] = useState(false);
  const [ultimoPrecoSugerido, setUltimoPrecoSugerido] = useState<number | null>(null);
  if (precoSugerido !== ultimoPrecoSugerido) {
    setUltimoPrecoSugerido(precoSugerido);
    if (precoSugerido != null && !valorTocado) setValor(String(precoSugerido));
  }

  const consumoMedioEstimado = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    if (consumo) return consumo;
    if (fatura && tarifa) return fatura / tarifa;
    return null;
  }, [consumoMedioKwh, valorFaturaMedio, tarifaKwh]);

  const sistemaMockKwp = useMemo(
    () => estimarSistemaMockKwp(consumoMedioEstimado, parametros?.produtividadeKwhKwpMes ?? 120),
    [consumoMedioEstimado, parametros],
  );

  const sugerirQuantidadeModulo = useMemo(() => {
    if (!parametros || !consumoMedioEstimado) return undefined;
    return (potenciaW: number) =>
      sugerirQuantidadeModulos(consumoMedioEstimado, parametros.produtividadeKwhKwpMes, potenciaW);
  }, [parametros, consumoMedioEstimado]);

  const previa = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    const precoKit = numero(valor);
    if (!parametros || potenciaKwp <= 0 || !tarifa || (!consumo && !fatura)) return null;
    const consumoMedioFinal = consumo ?? fatura! / tarifa;
    return calcular({
      potenciaKwp,
      precoKit: precoKit ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoMedioFinal,
      tarifaKwh: tarifa,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[tipoLigacao]],
    });
  }, [parametros, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh, potenciaKwp, valor]);

  /**
   * Envio sem o reset automático (nada do que foi digitado se perde se o servidor recusar).
   * Os arquivos não vão para a ação (limite de 1 MB): depois de criar o negócio, cada um vai
   * direto ao Storage no caminho reservado; o que não chegar fica pendente na ficha.
   */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const { dados, arquivos, problema } = prepararEnvioCriacao(new FormData(evento.currentTarget));
    if (problema) return setResultado({ ok: false, mensagem: `${problema} Escolha outro arquivo.` });
    setResultado(null);
    iniciarEnvio(async () => {
      const r = await criarNegocio(dados);
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
      if (r.reservas.length) {
        setEnviandoArquivos(true);
        const falhas = await enviarArquivosReservados(
          criarClienteNavegador(),
          r.reservas.map((reserva, i) => ({ caminho: reserva.caminho, arquivo: arquivos[i].arquivo })),
        );
        if (falhas.length && !avisos.includes("anexos")) avisos.push("anexos");
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
      setErroEtapa(null);
      return setEtapaAtual(3);
    }
  }

  function voltar() {
    setErroEtapa(null);
    setEtapaAtual((e) => (e === 3 ? 2 : e === 2 ? 1 : e));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <input type="hidden" name="funil_id" value={funilId} />
      {etapaId && <input type="hidden" name="etapa_id" value={etapaId} />}
      <input type="hidden" name="tipo_ligacao" value={tipoLigacao} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />
      <input type="hidden" name="contato_endereco" value={enderecoCompleto} />
      <input type="hidden" name="contato_cidade" value={cidade} />
      <input type="hidden" name="contato_uf" value={uf} />
      <input type="hidden" name="contato_nome" value={contatoNome} />
      <input type="hidden" name="contato_telefone" value={contatoTelefone} />
      <input type="hidden" name="contato_email" value={contatoEmail} />
      <input type="hidden" name="valor" value={valor} />
      <input type="hidden" name="consumo_medio_kwh" value={consumoMedioKwh} />
      <input type="hidden" name="valor_fatura_medio" value={valorFaturaMedio} />
      <input type="hidden" name="tarifa_kwh" value={tarifaKwh} />
      <input type="hidden" name="estrutura_telhado" value={estruturaTelhado} />
      {contato && <input type="hidden" name="contato_id" value={contato.id} />}

      <IndicadorEtapas atual={etapaAtual} />

      {/* Etapa 1 — Cliente e consumo */}
      <div className={etapaAtual === 1 ? "flex flex-col gap-5" : "hidden"}>
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Negócio</legend>
          <Campo rotulo="Nome do negócio" name="titulo" placeholder="Ex.: Residência 5 kWp" required />
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
                          onClick={() => escolherContato(c)}
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
          {modo === "existente" && contato?.endereco && (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 md:col-span-3">
              Endereço já cadastrado no contato: <strong>{contato.endereco}</strong>. Ele é mantido; o que for digitado
              aqui só completa campos vazios do contato.
            </p>
          )}
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
            Cidade e estado identificam a distribuidora de energia e a tarifa aplicável — preencha pelo CEP ou manualmente.
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
            <CardDocumentoInteligente
              titulo="📄 Anexar CNH"
              legenda="Preencher cadastro automaticamente"
              name="anexo_cnh_contato"
              accept="image/*,.pdf"
              campos={["Nome encontrado", "CPF encontrado", "Data de nascimento encontrada"]}
            />
            <CardDocumentoInteligente
              titulo="⚡ Anexar conta de energia"
              legenda="Preencher dados automaticamente"
              name="anexo_fatura_gerador"
              accept="image/*,.pdf"
              campos={["Distribuidora", "Unidade consumidora", "Endereço", "Consumo médio"]}
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
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Resumo do sistema</legend>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 px-4 py-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Consumo mensal</dt>
              <dd className="font-medium text-zinc-900">
                {consumoMedioEstimado ? `${consumoMedioEstimado.toLocaleString("pt-BR")} kWh` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Produtividade</dt>
              <dd className="font-medium text-zinc-900">{parametros?.produtividadeKwhKwpMes ?? 120} kWh/kWp/mês</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Sistema recomendado</dt>
              <dd className="font-medium text-zinc-900">{sistemaMockKwp ? `${sistemaMockKwp.toLocaleString("pt-BR")} kWp` : "—"}</dd>
            </div>
          </dl>

          {sistemaMockKwp && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-zinc-900">Kit recomendado (estimativa)</p>
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-zinc-500">Potência</dt>
                  <dd className="font-medium text-zinc-900">{sistemaMockKwp.toLocaleString("pt-BR")} kWp</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Módulos</dt>
                  <dd className="font-medium text-zinc-900">{Math.max(1, Math.round((sistemaMockKwp * 1000) / 620))} × 620 W</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Inversor</dt>
                  <dd className="font-medium text-zinc-900">exemplo de catálogo</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Geração / economia / payback</dt>
                  <dd className="font-medium text-zinc-900">a calcular</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">
                Estimativa ilustrativa — os números reais aparecem ao montar o kit manualmente ou depois de informar a
                tarifa, na Etapa 3.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Combinação compatível · MPPT validado · Voc validado</span>
            </div>
            {!mostrarAlertasExemplo ? (
              <button
                type="button"
                className="self-start text-xs font-medium text-amber-700 hover:underline"
                onClick={() => setMostrarAlertasExemplo(true)}
              >
                Ver outros exemplos de alerta técnico
              </button>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Overload acima do recomendado (110%) — limite automático: 30% <em className="text-amber-600">(exemplo)</em>
                  </span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Combinação incompatível — motivo: faixa MPPT inválida <em className="text-red-600">(exemplo)</em>
                  </span>
                </div>
              </>
            )}
          </div>
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
            <EditorComponentesKit linhas={linhas} onChange={setLinhas} sugerirQuantidadeModulo={sugerirQuantidadeModulo} />
            {previa && (
              <>
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-zinc-500">Potência do kit</dt>
                    <dd className="font-medium text-zinc-900">{potenciaKwp.toLocaleString("pt-BR")} kWp</dd>
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
                      {previa.paybackMeses != null ? `${previa.paybackMeses.toLocaleString("pt-BR")} meses` : "—"}
                    </dd>
                  </div>
                </dl>
                {potenciaKwp > 0 && parametros && (previa.geracaoEstimadaKwhMes ?? 0) > 0 ? null : (
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
          <Campo rotulo="Distribuidora" placeholder="Preenchida automaticamente em breve" disabled />
          <Campo
            rotulo="Tarifa ANEEL (R$/kWh)"
            inputMode="decimal"
            placeholder="ex.: 0,95"
            value={tarifaKwh}
            disabled={!componentes.length}
            onChange={(e) => setTarifaKwh(e.target.value)}
          />
          <Selecao
            rotulo="Tipo de ligação"
            value={tipoLigacao}
            disabled={!componentes.length}
            onChange={(e) => setTipoLigacao(e.target.value as TipoLigacao)}
          >
            {TIPOS_LIGACAO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_LIGACAO[t]}
              </option>
            ))}
          </Selecao>
          {!componentes.length && (
            <p className="text-xs text-zinc-400 md:col-span-2">
              Tarifa e tipo de ligação são usados no cálculo do kit: monte o kit na etapa 2 para informá-los.
            </p>
          )}
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Características técnicas</legend>
          <Campo rotulo="Tipo do telhado" name="tipo_telhado" placeholder="Ex.: cerâmico, metálico, laje, solo" />
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
          <CampoArquivo rotulo="Fotos" name="anexo_geral" accept="image/*" multiple />
          <CampoArquivo rotulo="Outros documentos" name="anexo_geral" multiple />
        </fieldset>

        <Mensagem resultado={resultado} />
        <div className="flex justify-between">
          <Botao type="button" variante="secundario" onClick={voltar} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Botao>
          <Botao type="submit" disabled={pendente || (modo === "existente" && !contato)}>
            {enviandoArquivos ? "Enviando arquivos..." : pendente ? "Salvando..." : "Salvar negócio"}
          </Botao>
        </div>
      </div>
    </form>
  );
}
