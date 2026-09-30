"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { EditorComponentesKit, linhasParaComponentes, type LinhaComponente } from "@/components/kit-componentes";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { buscarProdutividadeRegionalPorEndereco } from "@/lib/acoes/geodados";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import {
  calcular,
  custosInternosEstimados,
  DISPONIBILIDADE_PADRAO_CAMEL,
  potenciaKitPersonalizadoKwp,
  sugerirQuantidadeModulos,
} from "@/lib/calculadora";
import { dimensionarSistemaAutomatico, type EquipamentoAtivo, type OpcaoSistemaAutomatico } from "@/lib/dimensionamento";
import { formatarMoeda } from "@/lib/formatacao";
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
  temperaturaMinimaProjetoC: number;
};

/** Aceita "450", "450,5" e "1.234,56"; string vazia ou inválida vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function FormularioNegocio({
  funilId,
  etapaId,
  origens,
  responsaveis,
  meuMembroId,
  parametros,
  equipamentosAtivos,
}: {
  funilId: string;
  /** Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban); senão usa a etapa inicial do funil. */
  etapaId?: string;
  origens: Opcao[];
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  parametros: Parametros | null;
  /** Módulos/inversores ativados em "Configurações → Calculadora" pro kit automático — ver `dimensionamento.ts`. */
  equipamentosAtivos: (EquipamentoAtivo & { tipo: "modulo" | "inversor" })[];
}) {
  const [resultado, acao, pendente] = useActionState(criarNegocio, null);
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [, iniciar] = useTransition();

  // Passo 1 (negócio): a calculadora roda no backend a partir daqui — sem
  // aparecer como um passo separado. Potência, consumo e tarifa ficam no
  // negócio, não no contato (que é só dado pessoal/residência do cliente).
  const [valor, setValor] = useState("");
  const [valorTocado, setValorTocado] = useState(false);
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>("trifasico");
  const [consumoMedioKwh, setConsumoMedioKwh] = useState("");
  const [valorFaturaMedio, setValorFaturaMedio] = useState("");
  const [tarifaKwh, setTarifaKwh] = useState("");

  // Passo 3 (depois de "Avançar"): kit automático, com personalização manual disponível em seguida.
  const [mostrarKit, setMostrarKit] = useState(false);
  const [linhas, setLinhas] = useState<LinhaComponente[]>([]);
  const [estruturaTelhado, setEstruturaTelhado] = useState("");
  const [kitAutomaticoId, setKitAutomaticoId] = useState<string | null>(null);

  const modulosAtivos = useMemo(() => equipamentosAtivos.filter((e) => e.tipo === "modulo"), [equipamentosAtivos]);
  const inversoresAtivos = useMemo(() => equipamentosAtivos.filter((e) => e.tipo === "inversor"), [equipamentosAtivos]);

  // Produtividade real da região (PVGIS/NASA a partir do endereço do contato — ver `geodados.ts`).
  // Enquanto não vem (ou o endereço não é geocodificável), usa a média configurada em Parâmetros.
  const [produtividadeRegional, setProdutividadeRegional] = useState<{
    produtividadeKwhKwpMes: number;
    fonte: "pvgis" | "nasa";
  } | null>(null);
  const [buscandoProdutividade, iniciarBuscaProdutividade] = useTransition();
  const produtividadeKwhKwpMes = produtividadeRegional?.produtividadeKwhKwpMes ?? parametros?.produtividadeKwhKwpMes;

  function buscarProdutividadeDoEndereco(endereco: string) {
    setProdutividadeRegional(null);
    if (endereco.trim().length < 8) return;
    iniciarBuscaProdutividade(async () => setProdutividadeRegional(await buscarProdutividadeRegionalPorEndereco(endereco)));
  }

  const componentes = useMemo(() => linhasParaComponentes(linhas), [linhas]);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);

  // Soma dos preços de referência (teste) vindos do catálogo, mais os custos
  // internos configurados (instalação, material CA, engenharia, comissão),
  // só pra sugerir um valor de negócio enquanto não há planilha/distribuidor real.
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

  // Preenche "Valor estimado" com a sugestão assim que ela aparecer/mudar,
  // a não ser que o vendedor já tenha digitado algo à mão (sem useEffect,
  // ajustando durante a renderização — mesmo padrão usado no kit salvo).
  const [ultimoPrecoSugerido, setUltimoPrecoSugerido] = useState<number | null>(null);
  if (precoSugerido !== ultimoPrecoSugerido) {
    setUltimoPrecoSugerido(precoSugerido);
    if (precoSugerido != null && !valorTocado) setValor(String(precoSugerido));
  }

  // Consumo médio em kWh, vindo do campo direto ou calculado a partir da fatura + tarifa.
  const consumoMedioEstimado = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    if (consumo) return consumo;
    if (fatura && tarifa) return fatura / tarifa;
    return null;
  }, [consumoMedioKwh, valorFaturaMedio, tarifaKwh]);

  // Kit sugerido automaticamente a partir do consumo informado — ver `dimensionamento.ts`.
  // Sem equipamento ativo ou sem consumo ainda, fica vazio e o vendedor monta manualmente.
  const sugestoesAutomaticas = useMemo((): OpcaoSistemaAutomatico[] => {
    if (!parametros || !produtividadeKwhKwpMes || !consumoMedioEstimado || !modulosAtivos.length || !inversoresAtivos.length)
      return [];
    return dimensionarSistemaAutomatico({
      consumoMedioKwh: consumoMedioEstimado,
      margemPct: parametros.margemDimensionamentoPct,
      produtividadeKwhKwpMes,
      modulos: modulosAtivos,
      inversores: inversoresAtivos,
      overloadMaximoPct: parametros.overloadMaximoPct,
      temperaturaMinimaProjetoC: parametros.temperaturaMinimaProjetoC,
    });
  }, [parametros, produtividadeKwhKwpMes, consumoMedioEstimado, modulosAtivos, inversoresAtivos]);

  function usarKitAutomatico(opcao: OpcaoSistemaAutomatico) {
    const outrosItens = linhas.filter((l) => l.tipo !== "modulo" && l.tipo !== "inversor");
    setLinhas([
      {
        tipo: "modulo",
        descricao: `${opcao.modulo.fabricante} ${opcao.modulo.modelo}`,
        potenciaW: String(opcao.modulo.potenciaW),
        quantidade: String(opcao.quantidadeModulos),
      },
      {
        tipo: "inversor",
        descricao: `${opcao.inversor.fabricante} ${opcao.inversor.modelo}`,
        potenciaW: String(opcao.inversor.potenciaW),
        quantidade: "1",
      },
      ...outrosItens,
    ]);
    setKitAutomaticoId(`${opcao.modulo.id}-${opcao.inversor.id}`);
  }

  // Sugere a quantidade de módulos pro consumo já informado, assim que o
  // vendedor escolhe (ou digita) a potência de um módulo.
  const sugerirQuantidadeModulo = useMemo(() => {
    if (!produtividadeKwhKwpMes || !consumoMedioEstimado) return undefined;
    return (potenciaW: number) => sugerirQuantidadeModulos(consumoMedioEstimado, produtividadeKwhKwpMes, potenciaW);
  }, [produtividadeKwhKwpMes, consumoMedioEstimado]);

  const previa = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    const precoKit = numero(valor);
    if (!parametros || !produtividadeKwhKwpMes || potenciaKwp <= 0 || !tarifa || (!consumo && !fatura)) return null;
    const consumoMedioFinal = consumo ?? fatura! / tarifa;
    return calcular({
      potenciaKwp,
      precoKit: precoKit ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoMedioFinal,
      tarifaKwh: tarifa,
      produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[tipoLigacao]],
    });
  }, [parametros, produtividadeKwhKwpMes, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh, potenciaKwp, valor]);

  function pesquisar(termo: string) {
    setBusca(termo);
    iniciar(async () => setEncontrados(await buscarContatos(termo)));
  }

  function conferirDuplicado(form: HTMLFormElement) {
    const tel = (form.elements.namedItem("contato_telefone") as HTMLInputElement)?.value ?? "";
    const email = (form.elements.namedItem("contato_email") as HTMLInputElement)?.value ?? "";
    if (tel.replace(/\D/g, "").length < 8 && !email.includes("@")) return setDuplicados([]);
    iniciar(async () => setDuplicados(await verificarDuplicado(tel, email)));
  }

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="funil_id" value={funilId} />
      {etapaId && <input type="hidden" name="etapa_id" value={etapaId} />}
      <input type="hidden" name="tipo_ligacao" value={tipoLigacao} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />

      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-zinc-900">Negócio</legend>
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
        <Campo rotulo="Nome do negócio" name="titulo" placeholder="Ex.: Residência 5 kWp" required />
        <div className="flex flex-col gap-1">
          <Campo
            rotulo="Valor estimado (R$)"
            name="valor"
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
        <Campo
          rotulo="Consumo médio (12 meses, kWh)"
          name="consumo_medio_kwh"
          inputMode="decimal"
          placeholder="ex.: 450"
          value={consumoMedioKwh}
          onChange={(e) => setConsumoMedioKwh(e.target.value)}
        />
        <Campo
          rotulo="Ou valor médio da fatura (R$)"
          name="valor_fatura_medio"
          inputMode="decimal"
          placeholder="ex.: 450,00"
          value={valorFaturaMedio}
          onChange={(e) => setValorFaturaMedio(e.target.value)}
        />
        <Campo
          rotulo="Tarifa (R$/kWh)"
          name="tarifa_kwh"
          inputMode="decimal"
          placeholder="ex.: 0,95"
          value={tarifaKwh}
          onChange={(e) => setTarifaKwh(e.target.value)}
        />
        <Selecao
          rotulo="Tipo de ligação"
          value={tipoLigacao}
          onChange={(e) => setTipoLigacao(e.target.value as TipoLigacao)}
        >
          {TIPOS_LIGACAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_LIGACAO[t]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Unidade consumidora" name="unidade_consumidora" placeholder="Opcional" />
        <Campo rotulo="Padrão do cliente" name="padrao_cliente" placeholder="Opcional" />
        <Campo rotulo="Tipo do telhado" name="tipo_telhado" placeholder="Ex.: cerâmico, metálico, laje, solo" />
        <CampoArquivo rotulo="CNH (opcional)" name="anexo_cnh_negocio" accept="image/*,.pdf" />
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-zinc-700">Descrição</span>
          <textarea name="descricao" rows={2} className="rounded-md border border-zinc-300 px-3 py-2" />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold text-zinc-900">Contato</legend>
        <div className="flex gap-2">
          <Botao type="button" variante={modo === "novo" ? "primario" : "secundario"} onClick={() => setModo("novo")}>
            Novo contato
          </Botao>
          <Botao
            type="button"
            variante={modo === "existente" ? "primario" : "secundario"}
            onClick={() => setModo("existente")}
          >
            Contato existente
          </Botao>
        </div>

        {modo === "existente" ? (
          <div className="flex flex-col gap-2">
            {contato ? (
              <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <span>
                  <strong>{contato.nome}</strong> {contato.telefone ?? contato.email}
                </span>
                <button type="button" className="text-zinc-600 hover:underline" onClick={() => setContato(null)}>
                  Trocar
                </button>
                <input type="hidden" name="contato_id" value={contato.id} />
              </div>
            ) : (
              <>
                <Campo
                  rotulo="Buscar por nome, telefone ou e-mail"
                  value={busca}
                  onChange={(e) => pesquisar(e.target.value)}
                />
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
          <div className="grid gap-3 md:grid-cols-2">
            <Selecao rotulo="Tipo" name="contato_tipo" defaultValue="pf">
              <option value="pf">Pessoa física</option>
              <option value="pj">Empresa</option>
            </Selecao>
            <Campo rotulo="Nome / razão social" name="contato_nome" required />
            <Campo
              rotulo="Telefone / WhatsApp"
              name="contato_telefone"
              type="tel"
              required
              onBlur={(e) => conferirDuplicado(e.currentTarget.form!)}
            />
            <Campo
              rotulo="E-mail"
              name="contato_email"
              type="email"
              onBlur={(e) => conferirDuplicado(e.currentTarget.form!)}
            />
            <div className="flex flex-col gap-1 md:col-span-2">
              <Campo
                rotulo="Endereço"
                name="contato_endereco"
                placeholder="Rua, número, bairro, cidade"
                onBlur={(e) => buscarProdutividadeDoEndereco(e.currentTarget.value)}
              />
              {buscandoProdutividade && <p className="text-xs text-zinc-400">Buscando dado de irradiação solar da região...</p>}
              {!buscandoProdutividade && produtividadeRegional && (
                <p className="text-xs text-green-700">
                  Produtividade real da região: {produtividadeRegional.produtividadeKwhKwpMes.toLocaleString("pt-BR")}{" "}
                  kWh/kWp/mês ({produtividadeRegional.fonte === "pvgis" ? "PVGIS" : "NASA"}) — usada no lugar da média
                  configurada.
                </p>
              )}
            </div>
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
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <CampoArquivo rotulo="CNH / documento do cliente (opcional)" name="anexo_cnh_contato" accept="image/*,.pdf" />
          <CampoArquivo rotulo="Fatura do gerador (opcional)" name="anexo_fatura_gerador" accept="image/*,.pdf" />
          <div className="md:col-span-2">
            <CampoArquivo
              rotulo="Fatura dos beneficiários (quando aplicável)"
              name="anexo_fatura_beneficiario"
              accept="image/*,.pdf"
              multiple
            />
          </div>
        </div>
      </fieldset>

      {!mostrarKit && (
        <Botao type="button" onClick={() => setMostrarKit(true)} className="self-start">
          Avançar
        </Botao>
      )}

      {mostrarKit && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Kit</legend>
          {sugestoesAutomaticas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-zinc-700">Kit sugerido automaticamente</p>
              <p className="-mt-1 text-xs text-zinc-500">
                Calculado a partir do consumo informado e dos equipamentos ativos em Configurações → Calculadora.
                Escolha uma opção e ajuste manualmente abaixo se precisar.
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                {sugestoesAutomaticas.map((opcao) => {
                  const id = `${opcao.modulo.id}-${opcao.inversor.id}`;
                  const selecionado = id === kitAutomaticoId;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => usarKitAutomatico(opcao)}
                      className={`flex flex-col gap-1 rounded-lg border p-3 text-left text-sm ${
                        selecionado ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="font-medium text-zinc-900">
                        {opcao.quantidadeModulos}x {opcao.modulo.fabricante} {opcao.modulo.modelo}
                      </span>
                      <span className="text-zinc-600">
                        + {opcao.inversor.fabricante} {opcao.inversor.modelo}
                      </span>
                      <span className="text-zinc-500">
                        {opcao.potenciaDcKwp.toLocaleString("pt-BR")} kWp · overload{" "}
                        {(opcao.overloadPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                      </span>
                      {opcao.validacao === "valido_com_alerta" && (
                        <span className="text-xs text-amber-700">Overload acima do recomendado — confira</span>
                      )}
                      {opcao.validacaoEletrica === "nao_verificado" && (
                        <span className="text-xs text-zinc-400">String/MPPT não verificados (sem datasheet completo)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {sugestoesAutomaticas.length > 0 && (
            <p className="text-sm font-medium text-zinc-700">Ajustar kit manualmente</p>
          )}
          <EditorComponentesKit linhas={linhas} onChange={setLinhas} sugerirQuantidadeModulo={sugerirQuantidadeModulo} />
          <Campo
            rotulo="Estrutura do telhado"
            name="estrutura_telhado"
            value={estruturaTelhado}
            onChange={(e) => setEstruturaTelhado(e.target.value)}
            placeholder="Ex.: perfil de alumínio, gancho"
          />
          {previa && (
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
          )}

          <Mensagem resultado={resultado} />
          <Botao type="submit" disabled={pendente || (modo === "existente" && !contato)} className="self-start">
            {pendente ? "Salvando..." : "Salvar negócio"}
          </Botao>
        </fieldset>
      )}
    </form>
  );
}
