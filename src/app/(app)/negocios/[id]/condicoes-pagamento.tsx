"use client";

import { useState, type ReactNode } from "react";
import { CLASSE_ENTRADA, Campo, Selecao } from "@/components/ui";
import { MAX_PARCELAS, MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, type MeioParcelamento } from "@/lib/condicoes-pagamento";
import {
  CARENCIAS_FINANCIAMENTO,
  FORMAS_PERSONALIZADO,
  LIMITES_CONDICOES,
  MOMENTOS_PERSONALIZADO,
  PRAZOS_FINANCIAMENTO_AUTOMATICO,
  ROTULO_FORMA,
  ROTULO_MOMENTO,
  descontoDaSoma,
  descontoDoValor,
  descontoPermitido,
  excessoAVista,
  parcelaCartaoMensal,
  parcelaPrice,
  passaDoPermitido,
  pendenciaValorNegocio,
  taxaPeloVendedor,
  valorAVista,
  valorParcela,
  type EntradaCondicoes,
  type ModoFinanciamento,
  type ModoTaxaVendedor,
  type RegrasCondicoes,
} from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import { AvisoDesconto, PrecoDoSistema, SolicitarAoGestor } from "./solicitar-ao-gestor";

type Financiamento = NonNullable<EntradaCondicoes["financiamento"]>;
type Parte = NonNullable<EntradaCondicoes["personalizado"]>["partes"][number];

const percentual = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
/** "28.500,00": formato que `lerNumeroBr` lê de volta. */
const reaisEditaveis = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const opcaoVazia = (): Financiamento["opcoes"][number] => ({ parcelas: "", valorParcela: "" });
/** Parcelas marcadas de saída no cartão com a taxa do vendedor. */
const PARCELAS_SUGERIDAS = [1, 3, 6, 10, 12];
const parteVazia = (): Parte => ({ valor: "", forma: "pix", momento: "assinatura", data: "", observacao: "" });

/**
 * Condições de pagamento da proposta, por modalidade (à vista, parcelado, financiamento e Personalizado). A tela só
 * mostra prévias: o que vai no envio é o que o vendedor marcou (campo `condicoes`, JSON), e o servidor confere e calcula
 * tudo de novo na emissão (`montarCondicoesPagamento`).
 */
export function CondicoesPagamento({
  negocioId,
  preco,
  regras,
  observacaoSugerida,
  hoje,
}: {
  negocioId: string;
  /** Valor do negócio (preço da proposta); nulo = ainda sem valor (a emissão aponta a pendência). */
  preco: number | null;
  regras: RegrasCondicoes;
  /** Texto das condições do modelo da empresa: pré-preenche a observação. */
  observacaoSugerida: string;
  hoje: string;
}) {
  // O cartão aparece sempre: sem taxas da empresa, o vendedor informa a taxa da maquininha (27/11/2026).
  const meiosDisponiveis = MEIOS_PARCELAMENTO.filter((m) => regras.taxas[m].length > 0 || taxaPeloVendedor(m, regras));
  const maxDesconto = descontoPermitido(regras);

  const [aVista, setAVista] = useState(true);
  const [desconto, setDesconto] = useState("0");
  // Valor à vista digitado em R$ (nulo = calculado a partir do %).
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const [parcelado, setParcelado] = useState(MEIOS_PARCELAMENTO.some((m) => regras.taxas[m].length > 0));
  const [meio, setMeio] = useState<MeioParcelamento>(meiosDisponiveis[0] ?? "cartao");
  // Por meio: as parcelas marcadas para aparecer (padrão: todas as configuradas).
  const [parcelasMarcadas, setParcelasMarcadas] = useState(() =>
    Object.fromEntries(
      MEIOS_PARCELAMENTO.map((m) => [m, taxaPeloVendedor(m, regras) ? PARCELAS_SUGERIDAS : regras.taxas[m].map((t) => t.parcelas)]),
    ) as Record<MeioParcelamento, number[]>,
  );
  // Cartão com a taxa do vendedor: taxa ao mês ou uma taxa por parcela.
  const [modoTaxa, setModoTaxa] = useState<ModoTaxaVendedor>("mensal");
  const [taxaMensalCartao, setTaxaMensalCartao] = useState("");
  const [taxasPorParcela, setTaxasPorParcela] = useState<Record<number, string>>({});
  const [repassarTaxas, setRepassarTaxas] = useState(true);
  const [financiamento, setFinanciamento] = useState(false);
  const [dadosFinanciamento, setDadosFinanciamento] = useState<Financiamento>({
    instituicao: "",
    entrada: "",
    carenciaDias: 90,
    modo: "automatico",
    taxaMensal: "",
    opcoes: [opcaoVazia()],
  });
  const [personalizado, setPersonalizado] = useState(false);
  const [partes, setPartes] = useState<Parte[]>([parteVazia(), parteVazia()]);
  const [observacao, setObservacao] = useState(observacaoSugerida.trim().slice(0, LIMITES_CONDICOES.observacao));

  const entrada: EntradaCondicoes = {
    aVista: aVista ? { desconto, ...(valorDigitado != null ? { valor: valorDigitado } : {}) } : null,
    parcelado: parcelado
      ? {
          meio,
          parcelas: parcelasMarcadas[meio],
          repassarTaxas,
          taxaVendedor: taxaPeloVendedor(meio, regras)
            ? {
                modo: modoTaxa,
                mensal: taxaMensalCartao,
                porParcela: parcelasMarcadas[meio].map((n) => ({ parcelas: n, taxa: taxasPorParcela[n] ?? "" })),
              }
            : null,
        }
      : null,
    financiamento: financiamento ? dadosFinanciamento : null,
    personalizado: personalizado && regras.personalizadoAtivo ? { partes } : null,
    observacao,
  };

  const temPreco = preco != null && preco > 0;
  const descontoBruto = lerNumeroBr(desconto) ?? 0;
  const descontoValido = Number.isFinite(descontoBruto) && descontoBruto >= 0 && descontoBruto < 100;
  const descontoLido = descontoValido ? Math.round(descontoBruto * 100) / 100 : 0;
  const somaPartes = partes.reduce((s, p) => s + Math.round((lerNumeroBr(p.valor) || 0) * 100), 0) / 100;
  // Compras P4c: o valor do negócio abaixo do sugerido além do permitido trava a emissão em qualquer condição.
  const pendenciaValor = temPreco ? pendenciaValorNegocio(preco, regras) : null;
  const excesso = temPreco && descontoValido ? excessoAVista(preco, descontoLido, regras) : null;
  const nenhuma = !aVista && !parcelado && !financiamento && !personalizado;

  const mudarFinanciamento = (i: number, campo: keyof Financiamento["opcoes"][number], valor: string) =>
    setDadosFinanciamento((f) => ({ ...f, opcoes: f.opcoes.map((o, k) => (k === i ? { ...o, [campo]: valor } : o)) }));
  const marcarParcela = (n: number, marcar: boolean) =>
    setParcelasMarcadas((atual) => ({
      ...atual,
      [meio]: marcar ? [...atual[meio], n].sort((a, b) => a - b) : atual[meio].filter((x) => x !== n),
    }));

  // Prévias (o servidor refaz as contas na emissão).
  const taxaVendedorNoMeio = taxaPeloVendedor(meio, regras);
  const mensalCartao = lerNumeroBr(taxaMensalCartao);
  const taxaMensalOk = mensalCartao != null && Number.isFinite(mensalCartao) && mensalCartao >= 0 && mensalCartao <= LIMITES_CONDICOES.taxaMensal;
  const previaParcela = (n: number): number | null => {
    if (!temPreco) return null;
    if (!taxaVendedorNoMeio) {
      const t = regras.taxas[meio].find((x) => x.parcelas === n);
      return t ? valorParcela(preco, n, t.taxa, repassarTaxas) : null;
    }
    if (modoTaxa === "mensal") return taxaMensalOk ? parcelaCartaoMensal(preco, mensalCartao, n, repassarTaxas) : null;
    const t = lerNumeroBr(taxasPorParcela[n] ?? "");
    return t != null && Number.isFinite(t) && t >= 0 && t < 100 ? valorParcela(preco, n, t, repassarTaxas) : null;
  };
  const entradaFin = lerNumeroBr(dadosFinanciamento.entrada) ?? 0;
  const taxaFin = lerNumeroBr(dadosFinanciamento.taxaMensal);
  const financiado = temPreco && Number.isFinite(entradaFin) && entradaFin >= 0 && entradaFin < preco ? preco - entradaFin : null;
  const taxaFinOk = taxaFin != null && Number.isFinite(taxaFin) && taxaFin >= 0 && taxaFin <= LIMITES_CONDICOES.taxaMensal;
  const mudarParte = (i: number, campo: keyof Parte, valor: string) => setPartes((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-linha p-3" data-testid="condicoes-pagamento">
      <input type="hidden" name="condicoes" value={JSON.stringify(entrada)} />
      <input type="hidden" name="precoEsperado" value={preco ?? ""} />
      <legend className="px-1 text-sm font-medium text-texto">Condições de pagamento</legend>
      <PrecoDoSistema preco={temPreco ? preco : null} precoSugerido={regras.precoSugerido ?? null} pendencia={pendenciaValor} />

      <Modalidade rotulo="À vista" marcada={aVista} aoMarcar={setAVista}>
        {/* Dois campos ligados: digitar um calcula o outro. Vale o último digitado (o valor em R$ vai exato). */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Desconto (%)</span>
            <input
              value={desconto}
              onChange={(e) => {
                setDesconto(e.target.value);
                setValorDigitado(null);
              }}
              inputMode="decimal"
              className={`${CLASSE_ENTRADA} w-24`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Valor à vista (R$)</span>
            <input
              value={valorDigitado ?? (temPreco && descontoValido ? reaisEditaveis(valorAVista(preco, descontoLido)) : "")}
              onChange={(e) => {
                const texto = e.target.value;
                setValorDigitado(texto);
                const v = lerNumeroBr(texto);
                if (temPreco && v != null && Number.isFinite(v) && v > 0 && v <= preco) setDesconto(percentual(descontoDoValor(preco, v)));
              }}
              inputMode="decimal"
              className={`${CLASSE_ENTRADA} w-36`}
            />
          </label>
        </div>
        <p className="text-xs text-texto-2">
          Seu limite: {percentual(regras.limiteDesconto)}%
          {regras.descontoAprovado > 0 && ` · Aprovado neste negócio: ${percentual(regras.descontoAprovado)}%`}
        </p>
        {excesso && (
          <SolicitarAoGestor
            negocioId={negocioId}
            desconto={excesso.pedir}
            maximo={maxDesconto}
            maximoAVista={excesso.maximoAVista}
            aoUsarMaximo={() => {
              setDesconto(percentual(excesso.maximoAVista));
              setValorDigitado(null);
            }}
          />
        )}
      </Modalidade>

      {meiosDisponiveis.length > 0 && (
        <Modalidade rotulo="Parcelado" marcada={parcelado} aoMarcar={setParcelado}>
          {meiosDisponiveis.length > 1 && (
            <div role="radiogroup" aria-label="Meio do parcelamento" className="flex gap-4 text-sm">
              {meiosDisponiveis.map((m) => (
                <label key={m} className="flex min-h-11 items-center gap-2 md:min-h-0">
                  <input type="radio" name="meioParcelado" checked={meio === m} onChange={() => setMeio(m)} />
                  {ROTULO_MEIO_PARCELAMENTO[m]}
                </label>
              ))}
            </div>
          )}
          {taxaVendedorNoMeio ? (
            <>
              <Alternar
                rotulo="Como informar a taxa da maquininha"
                opcoes={[
                  { valor: "mensal", rotulo: "Taxa ao mês" },
                  { valor: "parcela", rotulo: "Parcela a parcela" },
                ]}
                valor={modoTaxa}
                aoEscolher={(v) => setModoTaxa(v as ModoTaxaVendedor)}
              />
              {modoTaxa === "mensal" && (
                <label className="flex w-36 flex-col gap-1 text-sm">
                  <span className="font-medium text-texto-2">Taxa ao mês (%)</span>
                  <input value={taxaMensalCartao} onChange={(e) => setTaxaMensalCartao(e.target.value)} inputMode="decimal" placeholder="2,99" className={CLASSE_ENTRADA} />
                </label>
              )}
              <div role="group" aria-label="Parcelas que aparecem na proposta" className="flex flex-wrap gap-1.5">
                <span className="w-full text-xs text-texto-2">Parcelas que aparecem na proposta:</span>
                {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => {
                  const marcada = parcelasMarcadas[meio].includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => marcarParcela(n, !marcada)}
                      className={`min-h-11 min-w-11 rounded-full border px-2 text-sm font-medium md:min-h-8 md:min-w-10 ${marcada ? "border-texto bg-texto text-fundo" : "border-linha text-texto-2"}`}
                    >
                      {n}x
                    </button>
                  );
                })}
              </div>
              {modoTaxa === "parcela" && parcelasMarcadas[meio].length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {parcelasMarcadas[meio].map((n) => (
                    <label key={n} className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-texto-2">Taxa em {n}x (%)</span>
                      <input
                        value={taxasPorParcela[n] ?? ""}
                        onChange={(e) => setTaxasPorParcela((t) => ({ ...t, [n]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0"
                        className={CLASSE_ENTRADA}
                      />
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div role="group" aria-label="Parcelas que aparecem na proposta" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="w-full text-xs text-texto-2">Mostrar no {ROTULO_MEIO_PARCELAMENTO[meio].toLowerCase()}:</span>
              {regras.taxas[meio].map((t) => (
                <label key={t.parcelas} className="flex min-h-11 items-center gap-1.5 md:min-h-0">
                  <input type="checkbox" checked={parcelasMarcadas[meio].includes(t.parcelas)} onChange={(e) => marcarParcela(t.parcelas, e.target.checked)} />
                  {t.parcelas}x
                </label>
              ))}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={repassarTaxas} onChange={(e) => setRepassarTaxas(e.target.checked)} className="mt-0.5" />
            <span>
              Repassar taxas
              <span className="block text-xs text-texto-2">A parcela inclui a taxa da operadora e a empresa recebe o preço cheio.</span>
            </span>
          </label>
          {temPreco && parcelasMarcadas[meio].length > 0 && (
            <p className="text-xs text-texto-2" data-testid="previa-parcelado">
              Prévia:{" "}
              {parcelasMarcadas[meio]
                .map((n) => {
                  const v = previaParcela(n);
                  return `${n}x ${v != null ? formatarMoeda(v) : "—"}`;
                })
                .join(" · ")}
            </p>
          )}
        </Modalidade>
      )}

      <Modalidade rotulo="Financiamento" marcada={financiamento} aoMarcar={setFinanciamento}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Campo
            rotulo="Instituição (opcional)"
            value={dadosFinanciamento.instituicao}
            maxLength={LIMITES_CONDICOES.instituicao}
            onChange={(e) => setDadosFinanciamento((f) => ({ ...f, instituicao: e.target.value }))}
          />
          <Campo
            rotulo="Entrada (R$)"
            inputMode="decimal"
            placeholder="0"
            value={dadosFinanciamento.entrada}
            onChange={(e) => setDadosFinanciamento((f) => ({ ...f, entrada: e.target.value }))}
          />
          <Selecao rotulo="Carência" value={dadosFinanciamento.carenciaDias} onChange={(e) => setDadosFinanciamento((f) => ({ ...f, carenciaDias: Number(e.target.value) }))}>
            {CARENCIAS_FINANCIAMENTO.map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </Selecao>
        </div>
        <Alternar
          rotulo="Como montar as opções do financiamento"
          opcoes={[
            { valor: "automatico", rotulo: "Automático pela taxa" },
            { valor: "manual", rotulo: "Manual" },
          ]}
          valor={dadosFinanciamento.modo}
          aoEscolher={(v) => setDadosFinanciamento((f) => ({ ...f, modo: v as ModoFinanciamento }))}
        />
        {dadosFinanciamento.modo === "automatico" ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex w-36 flex-col gap-1 text-sm">
                <span className="font-medium text-texto-2">Taxa ao mês (%)</span>
                <input
                  value={dadosFinanciamento.taxaMensal}
                  onChange={(e) => setDadosFinanciamento((f) => ({ ...f, taxaMensal: e.target.value }))}
                  inputMode="decimal"
                  placeholder="2,5"
                  className={CLASSE_ENTRADA}
                />
              </label>
              {financiado != null && (
                <p className="pb-2 text-xs text-texto-2">
                  Financiado: {formatarMoeda(financiado)}
                  {entradaFin > 0 && ` (${formatarMoeda(preco!)} menos a entrada)`}
                </p>
              )}
            </div>
            {financiado != null && taxaFinOk && (
              <table className="w-full text-sm" data-testid="previa-financiamento">
                <thead>
                  <tr className="border-b border-linha text-left text-xs text-texto-2">
                    <th className="py-1.5 font-medium">Prazo</th>
                    <th className="py-1.5 text-right font-medium">Parcela</th>
                    <th className="py-1.5 text-right font-medium">Total pago</th>
                  </tr>
                </thead>
                <tbody>
                  {PRAZOS_FINANCIAMENTO_AUTOMATICO.map((n) => {
                    const v = parcelaPrice(financiado, taxaFin, n);
                    return (
                      <tr key={n} className="border-b border-linha">
                        <td className="py-1.5">{n}x</td>
                        <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{formatarMoeda(v)}</td>
                        <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{formatarMoeda(entradaFin + v * n)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="text-xs text-texto-2">Parcelas iguais pela tabela Price. O total pago é só para você conferir; a proposta mostra a entrada e as parcelas.</p>
          </>
        ) : (
          <>
            {dadosFinanciamento.opcoes.map((o, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md bg-superficie-2 p-2">
                <div className="flex items-center justify-between text-xs font-medium text-texto-2">
                  Opção {i + 1}
                  {dadosFinanciamento.opcoes.length > 1 && (
                    <button
                      type="button"
                      className="min-h-11 px-2 text-xs text-texto-2 underline-offset-2 hover:underline md:min-h-0"
                      onClick={() => setDadosFinanciamento((f) => ({ ...f, opcoes: f.opcoes.filter((_, k) => k !== i) }))}
                    >
                      Remover
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Parcelas" inputMode="numeric" placeholder="60" value={o.parcelas} onChange={(e) => mudarFinanciamento(i, "parcelas", e.target.value)} />
                  <Campo
                    rotulo="Parcela (R$)"
                    inputMode="decimal"
                    placeholder="690,00"
                    value={o.valorParcela}
                    onChange={(e) => mudarFinanciamento(i, "valorParcela", e.target.value)}
                  />
                </div>
              </div>
            ))}
            {dadosFinanciamento.opcoes.length < LIMITES_CONDICOES.opcoesFinanciamento && (
              <BotaoAdicionar onClick={() => setDadosFinanciamento((f) => ({ ...f, opcoes: [...f.opcoes, opcaoVazia()] }))}>
                + Adicionar opção (até {LIMITES_CONDICOES.opcoesFinanciamento})
              </BotaoAdicionar>
            )}
          </>
        )}
      </Modalidade>

      {regras.personalizadoAtivo && (
        <Modalidade rotulo="Personalizado" marcada={personalizado} aoMarcar={setPersonalizado}>
          {partes.map((parte, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md bg-superficie-2 p-2">
              <div className="flex items-center justify-between text-xs font-medium text-texto-2">
                Parte {i + 1}
                {partes.length > 1 && (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-xs text-texto-2 underline-offset-2 hover:underline md:min-h-0"
                    onClick={() => setPartes((ps) => ps.filter((_, k) => k !== i))}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Campo rotulo="Valor (R$)" inputMode="decimal" value={parte.valor} onChange={(e) => mudarParte(i, "valor", e.target.value)} />
                <Selecao rotulo="Forma" value={parte.forma} onChange={(e) => mudarParte(i, "forma", e.target.value)}>
                  {FORMAS_PERSONALIZADO.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FORMA[f]}
                    </option>
                  ))}
                </Selecao>
                <Selecao rotulo="Quando" value={parte.momento} onChange={(e) => mudarParte(i, "momento", e.target.value)}>
                  {MOMENTOS_PERSONALIZADO.map((m) => (
                    <option key={m} value={m}>
                      {ROTULO_MOMENTO[m]}
                    </option>
                  ))}
                </Selecao>
                {parte.momento === "data" && (
                  <Campo rotulo="Data" type="date" min={hoje} value={parte.data} onChange={(e) => mudarParte(i, "data", e.target.value)} />
                )}
                <div className="col-span-2 sm:col-span-3">
                  <Campo
                    rotulo="Observação (opcional)"
                    maxLength={LIMITES_CONDICOES.observacaoParte}
                    value={parte.observacao}
                    onChange={(e) => mudarParte(i, "observacao", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          {partes.length < LIMITES_CONDICOES.partesPersonalizado && (
            <BotaoAdicionar onClick={() => setPartes((ps) => [...ps, parteVazia()])}>+ Adicionar parte</BotaoAdicionar>
          )}
          {temPreco && somaPartes > 0 && (
            <p className="text-xs text-texto-2" data-testid="soma-personalizado">
              Soma {formatarMoeda(somaPartes)}
              {somaPartes < preco && ` = desconto de ${percentual(descontoDaSoma(preco, somaPartes))}%`}
            </p>
          )}
          {temPreco && somaPartes > 0 && !pendenciaValor && passaDoPermitido(somaPartes, preco, regras) && <AvisoDesconto />}
        </Modalidade>
      )}

      {nenhuma && (
        <p role="status" className="text-xs text-erro">
          Marque pelo menos uma condição de pagamento.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Observação (opcional)</span>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={LIMITES_CONDICOES.observacao}
          placeholder="Ex.: valores válidos para pagamento até a validade"
          className={CLASSE_ENTRADA}
        />
      </label>
      <p className="text-xs text-texto-2">O que estiver marcado aqui na emissão fica congelado na versão enviada.</p>
    </fieldset>
  );
}

function Modalidade({ rotulo, marcada, aoMarcar, children }: { rotulo: string; marcada: boolean; aoMarcar: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-linha pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-texto md:min-h-0">
        <input type="checkbox" checked={marcada} onChange={(e) => aoMarcar(e.target.checked)} />
        {rotulo}
      </label>
      {marcada && <div className="flex flex-col gap-2 pl-6">{children}</div>}
    </div>
  );
}

/** Escolha entre dois modos (botões que alternam), com o modo atual marcado. */
function Alternar({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: { valor: string; rotulo: string }[];
  valor: string;
  aoEscolher: (v: string) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex self-start rounded-full border border-linha p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => aoEscolher(o.valor)}
          className={`min-h-11 rounded-full px-3 text-sm font-medium md:min-h-8 ${valor === o.valor ? "bg-texto text-fundo" : "text-texto-2"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 self-start text-sm font-medium text-dourado-texto underline-offset-2 hover:underline md:min-h-0">
      {children}
    </button>
  );
}
