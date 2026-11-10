"use client";

import { useState, type ReactNode } from "react";
import { CLASSE_ENTRADA, Campo, Selecao } from "@/components/ui";
import { MEIOS_PARCELAMENTO, ROTULO_MEIO_PARCELAMENTO, type MeioParcelamento } from "@/lib/condicoes-pagamento";
import {
  CARENCIAS_FINANCIAMENTO,
  FORMAS_PERSONALIZADO,
  LIMITES_CONDICOES,
  MOMENTOS_PERSONALIZADO,
  ROTULO_FORMA,
  ROTULO_MOMENTO,
  descontoDaSoma,
  descontoDoValor,
  descontoPermitido,
  excessoAVista,
  passaDoPermitido,
  pendenciaValorNegocio,
  valorAVista,
  valorParcela,
  type EntradaCondicoes,
  type RegrasCondicoes,
} from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import { AvisoDesconto, PrecoDoSistema, SolicitarAoGestor } from "./solicitar-ao-gestor";

type Financiamento = NonNullable<EntradaCondicoes["financiamento"]>;
type Parte = NonNullable<EntradaCondicoes["personalizado"]>["partes"][number];

const percentual = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
/** "28.500,00": formato que `lerNumeroBr` lê de volta. */
const reaisEditaveis = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const opcaoVazia = (): Financiamento["opcoes"][number] => ({ entrada: "", parcelas: "", valorParcela: "", carenciaDias: 90 });
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
  const meiosDisponiveis = MEIOS_PARCELAMENTO.filter((m) => regras.taxas[m].length > 0);
  const maxDesconto = descontoPermitido(regras);

  const [aVista, setAVista] = useState(true);
  const [desconto, setDesconto] = useState("0");
  // Valor à vista digitado em R$ (nulo = calculado a partir do %).
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const [parcelado, setParcelado] = useState(meiosDisponiveis.length > 0);
  const [meio, setMeio] = useState<MeioParcelamento>(meiosDisponiveis[0] ?? "cartao");
  // Por meio: as parcelas marcadas para aparecer (padrão: todas as configuradas).
  const [parcelasMarcadas, setParcelasMarcadas] = useState(() =>
    Object.fromEntries(MEIOS_PARCELAMENTO.map((m) => [m, regras.taxas[m].map((t) => t.parcelas)])) as Record<MeioParcelamento, number[]>,
  );
  const [repassarTaxas, setRepassarTaxas] = useState(true);
  const [financiamento, setFinanciamento] = useState(false);
  const [dadosFinanciamento, setDadosFinanciamento] = useState<Financiamento>({ instituicao: "", opcoes: [opcaoVazia()] });
  const [personalizado, setPersonalizado] = useState(false);
  const [partes, setPartes] = useState<Parte[]>([parteVazia(), parteVazia()]);
  const [observacao, setObservacao] = useState(observacaoSugerida.trim().slice(0, LIMITES_CONDICOES.observacao));

  const entrada: EntradaCondicoes = {
    aVista: aVista ? { desconto, ...(valorDigitado != null ? { valor: valorDigitado } : {}) } : null,
    parcelado: parcelado ? { meio, parcelas: parcelasMarcadas[meio], repassarTaxas } : null,
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

  const mudarFinanciamento = (i: number, campo: keyof Financiamento["opcoes"][number], valor: string | number) =>
    setDadosFinanciamento((f) => ({ ...f, opcoes: f.opcoes.map((o, k) => (k === i ? { ...o, [campo]: valor } : o)) }));
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
          <div role="group" aria-label="Parcelas que aparecem na proposta" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="w-full text-xs text-texto-2">Mostrar no {ROTULO_MEIO_PARCELAMENTO[meio].toLowerCase()}:</span>
            {regras.taxas[meio].map((t) => (
              <label key={t.parcelas} className="flex min-h-11 items-center gap-1.5 md:min-h-0">
                <input
                  type="checkbox"
                  checked={parcelasMarcadas[meio].includes(t.parcelas)}
                  onChange={(e) =>
                    setParcelasMarcadas((atual) => ({
                      ...atual,
                      [meio]: e.target.checked ? [...atual[meio], t.parcelas] : atual[meio].filter((n) => n !== t.parcelas),
                    }))
                  }
                />
                {t.parcelas}x
              </label>
            ))}
          </div>
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
              {regras.taxas[meio]
                .filter((t) => parcelasMarcadas[meio].includes(t.parcelas))
                .map((t) => `${t.parcelas}x ${formatarMoeda(valorParcela(preco, t.parcelas, t.taxa, repassarTaxas))}`)
                .join(" · ")}
            </p>
          )}
        </Modalidade>
      )}

      <Modalidade rotulo="Financiamento" marcada={financiamento} aoMarcar={setFinanciamento}>
        <Campo
          rotulo="Instituição (opcional)"
          value={dadosFinanciamento.instituicao}
          maxLength={LIMITES_CONDICOES.instituicao}
          onChange={(e) => setDadosFinanciamento((f) => ({ ...f, instituicao: e.target.value }))}
        />
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Campo rotulo="Entrada (R$)" inputMode="decimal" placeholder="0" value={o.entrada} onChange={(e) => mudarFinanciamento(i, "entrada", e.target.value)} />
              <Campo rotulo="Parcelas" inputMode="numeric" placeholder="60" value={o.parcelas} onChange={(e) => mudarFinanciamento(i, "parcelas", e.target.value)} />
              <Campo
                rotulo="Parcela (R$)"
                inputMode="decimal"
                placeholder="690,00"
                value={o.valorParcela}
                onChange={(e) => mudarFinanciamento(i, "valorParcela", e.target.value)}
              />
              <Selecao rotulo="Carência" value={o.carenciaDias} onChange={(e) => mudarFinanciamento(i, "carenciaDias", Number(e.target.value))}>
                {CARENCIAS_FINANCIAMENTO.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </Selecao>
            </div>
          </div>
        ))}
        {dadosFinanciamento.opcoes.length < LIMITES_CONDICOES.opcoesFinanciamento && (
          <BotaoAdicionar onClick={() => setDadosFinanciamento((f) => ({ ...f, opcoes: [...f.opcoes, opcaoVazia()] }))}>
            + Adicionar opção (até {LIMITES_CONDICOES.opcoesFinanciamento})
          </BotaoAdicionar>
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

function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 self-start text-sm font-medium text-dourado-texto underline-offset-2 hover:underline md:min-h-0">
      {children}
    </button>
  );
}
