"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState, type FormEvent } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Acao } from "@/components/financeiro/formularios";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { anexarOrcamentoCompra, descartarOrcamentoCompra, editarOrcamentoCompra } from "@/lib/acoes/compras-arquivos";
import {
  ACEITA_ARQUIVO_COMPRAS,
  ROTULO_COBERTURA,
  ROTULO_SELO_ORCAMENTO,
  orcamentoLivre,
  selosOrcamentos,
  type Cobertura,
  type OrcamentoVM,
  type SeloOrcamento,
} from "@/lib/compras/orcamentos-regras";
import { ROTULO_FRETE, numeroPedido, type ModalidadeFrete } from "@/lib/compras/regras";
import { formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";
import { LinkArquivo, Rotulo, arquivoDe, dataCurta, diaDe, dinheiroBr, enviarArquivoCompras, type ObraCompras } from "./orcamentos-comum";

/**
 * Orçamentos e arquivos de compra da obra (desenho aprovado "Orçamentos e pedidos da obra"). Escreve quem escreve em
 * Compras na obra, depois do "Iniciar compra"; o banco confere de novo. Arquivo nunca passa por Server Action: o
 * navegador envia ao Storage e a ação recebe só o caminho.
 */

const TOM_SELO: Record<SeloOrcamento, string> = {
  escolhido: "bg-dourado/20 text-dourado-texto",
  mais_rapida: "bg-zinc-100 text-zinc-700",
  parcial: "bg-zinc-100 text-zinc-700",
  vencido: "bg-zinc-100 text-zinc-500",
};

/** Anexar (sem `inicial`) ou corrigir um orçamento. Na correção o arquivo não muda. */
export function FormularioOrcamento({
  obra,
  hoje,
  fornecedores,
  inicial,
}: {
  obra: ObraCompras;
  hoje: string;
  fornecedores: string[];
  inicial?: OrcamentoVM;
}) {
  const router = useRouter();
  const lista = useId();
  const [cobertura, setCobertura] = useState<Cobertura>(inicial?.cobertura ?? "kit_completo");
  const [freteModalidade, setFreteModalidade] = useState<ModalidadeFrete>(inicial?.freteModalidade ?? "cif");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulario = e.currentTarget;
    const form = new FormData(formulario);
    const valor = lerNumeroBr(String(form.get("valor") ?? ""));
    if (valor == null || valor <= 0) {
      setResultado({ ok: false, mensagem: "Informe o valor total (ex.: 13.250,00)." });
      return;
    }
    const frete = freteModalidade === "fob" ? lerNumeroBr(String(form.get("frete") ?? "")) : 0;
    if (frete == null || frete < 0) {
      setResultado({ ok: false, mensagem: "Informe o valor do frete (ex.: 350,00)." });
      return;
    }
    const dados = {
      obraId: obra.obraId,
      freteModalidade,
      frete,
      fornecedor: String(form.get("fornecedor") ?? ""),
      valor,
      cobertura,
      itens: String(form.get("itens") ?? ""),
      entregaPrevista: String(form.get("entregaPrevista") ?? ""),
      validoAte: String(form.get("validoAte") ?? ""),
      condicaoPagamento: String(form.get("condicaoPagamento") ?? ""),
      observacao: String(form.get("observacao") ?? ""),
    };
    setEnviando(true);
    setResultado(null);
    let r: ResultadoAcao;
    if (inicial) {
      r = await editarOrcamentoCompra({ ...dados, orcamentoId: inicial.id });
    } else {
      const arquivo = arquivoDe(form, "arquivo");
      const envio = arquivo ? await enviarArquivoCompras(obra, arquivo) : "Envie o arquivo do orçamento.";
      r = typeof envio === "string" ? { ok: false, mensagem: envio } : await anexarOrcamentoCompra({ ...dados, arquivo: envio });
    }
    setEnviando(false);
    setResultado(r);
    if (r?.ok) {
      if (!inicial) {
        formulario.reset();
        setCobertura("kit_completo");
        setFreteModalidade("cif");
      }
      router.refresh();
    }
  };

  return (
    <form onSubmit={enviar} aria-label={inicial ? "Corrigir orçamento" : "Anexar orçamento"} className="grid grid-cols-1 gap-3 rounded-xl bg-superficie-2 p-3 sm:grid-cols-2 lg:grid-cols-3 md:p-4">
      <Rotulo texto="Fornecedor">
        <input name="fornecedor" required minLength={2} maxLength={120} list={lista} defaultValue={inicial?.fornecedor} placeholder="Nome do fornecedor" className={CLASSE_ENTRADA} />
        <datalist id={lista}>
          {fornecedores.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Rotulo>
      <Rotulo texto="Valor total (R$)">
        <input name="valor" inputMode="decimal" required defaultValue={inicial ? dinheiroBr(inicial.valorTotal) : undefined} placeholder="0,00" className={`${CLASSE_ENTRADA} tabular-nums`} />
      </Rotulo>
      <Rotulo texto="Itens cobertos">
        <select name="cobertura" value={cobertura} onChange={(e) => setCobertura(e.target.value as Cobertura)} className={CLASSE_ENTRADA}>
          <option value="kit_completo">{ROTULO_COBERTURA.kit_completo}</option>
          <option value="parte">{ROTULO_COBERTURA.parte}</option>
        </select>
      </Rotulo>
      {cobertura === "parte" && (
        <Rotulo texto="Quais itens" className="sm:col-span-2 lg:col-span-3">
          <input name="itens" required minLength={2} maxLength={200} defaultValue={inicial?.itensDescricao ?? undefined} placeholder="Ex.: estrutura e cabos" className={CLASSE_ENTRADA} />
        </Rotulo>
      )}
      <Rotulo texto="Entrega prometida">
        <input name="entregaPrevista" type="date" required defaultValue={inicial?.entregaPrevista} className={CLASSE_ENTRADA} />
      </Rotulo>
      <Rotulo texto="Válido até">
        <input name="validoAte" type="date" required min={inicial ? undefined : hoje} defaultValue={inicial?.validoAte} className={CLASSE_ENTRADA} />
      </Rotulo>
      <Rotulo texto="Frete">
        <select name="freteModalidade" value={freteModalidade} onChange={(e) => setFreteModalidade(e.target.value as ModalidadeFrete)} className={CLASSE_ENTRADA}>
          <option value="cif">{ROTULO_FRETE.cif}</option>
          <option value="fob">{ROTULO_FRETE.fob}</option>
        </select>
      </Rotulo>
      {freteModalidade === "fob" && (
        <Rotulo texto="Valor do frete (R$)">
          <input name="frete" inputMode="decimal" required defaultValue={inicial?.freteModalidade === "fob" ? dinheiroBr(inicial.frete) : undefined} placeholder="0,00" className={`${CLASSE_ENTRADA} tabular-nums`} />
        </Rotulo>
      )}
      <Rotulo texto="Condição de pagamento (opcional)">
        <input name="condicaoPagamento" maxLength={60} defaultValue={inicial?.condicaoPagamento ?? undefined} placeholder="Ex.: 28 dias, à vista" className={CLASSE_ENTRADA} />
      </Rotulo>
      {!inicial && (
        <Rotulo texto="Arquivo (PDF, imagem ou planilha)">
          {/* `w-full min-w-0`: o campo de arquivo tem largura própria (~300px) e estourava a tela de 320px. */}
          <input name="arquivo" type="file" required accept={ACEITA_ARQUIVO_COMPRAS} className={`${CLASSE_ENTRADA} w-full min-w-0 text-sm`} />
        </Rotulo>
      )}
      <Rotulo texto="Observação (opcional)" className={inicial ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-2"}>
        <input name="observacao" maxLength={300} defaultValue={inicial?.observacao ?? undefined} placeholder="Ex.: preço com frete incluso" className={CLASSE_ENTRADA} />
      </Rotulo>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : inicial ? "Salvar orçamento" : "Anexar orçamento"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function DescartarOrcamento({ obraId, orcamentoId }: { obraId: string; orcamentoId: string }) {
  const [resultado, acao, pendente] = useActionState(descartarOrcamentoCompra, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <Acao rotulo="Descartar">
      <form onSubmit={enviar} className="flex flex-col gap-2 rounded-xl bg-superficie-2 p-3">
        <input type="hidden" name="obraId" value={obraId} />
        <input type="hidden" name="orcamentoId" value={orcamentoId} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Motivo</span>
          <input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: valor digitado errado" className={CLASSE_ENTRADA} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" variante="perigo" disabled={pendente}>
            {pendente ? "Descartando..." : "Descartar orçamento"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </Acao>
  );
}

/** Cartões dos orçamentos em comparação; os descartados ficam numa lista recolhida. */
export function CartoesOrcamentos({
  obra,
  orcamentos,
  hoje,
  fornecedores,
  podeEscrever,
}: {
  obra: ObraCompras;
  orcamentos: OrcamentoVM[];
  hoje: string;
  fornecedores: string[];
  podeEscrever: boolean;
}) {
  const ativos = orcamentos.filter((o) => !o.descartado);
  const descartados = orcamentos.filter((o) => o.descartado);
  const selos = selosOrcamentos(orcamentos, hoje);
  return (
    <div className="flex flex-col gap-3">
      {ativos.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum orçamento ainda.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ativos.map((o) => {
            const escolhido = o.pedido != null;
            return (
              <li key={o.id} className={`flex min-w-0 flex-col gap-2.5 rounded-xl border p-4 ${escolhido ? "border-dourado bg-dourado/10" : "border-linha bg-superficie"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words text-texto">{o.fornecedor}</p>
                  <div className="flex flex-wrap gap-1">
                    {(selos.get(o.id) ?? []).map((s) => (
                      <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TOM_SELO[s]}`}>
                        {ROTULO_SELO_ORCAMENTO[s]}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="font-titulo text-2xl font-light text-texto tabular-nums">{formatarMoeda(o.valorTotal)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-texto-2">
                  <dt>Entrega</dt>
                  <dd className="text-right text-texto tabular-nums">{dataCurta(o.entregaPrevista)}</dd>
                  <dt>Válido até</dt>
                  <dd className="text-right text-texto tabular-nums">{dataCurta(o.validoAte)}</dd>
                  <dt>Frete</dt>
                  <dd className="text-right text-texto tabular-nums">{o.freteModalidade === "fob" ? `FOB · ${formatarMoeda(o.frete)}` : "CIF"}</dd>
                  <dt>Pagamento</dt>
                  <dd className="text-right text-texto">{o.condicaoPagamento ?? "—"}</dd>
                  <dt>Itens</dt>
                  <dd className="text-right break-words text-texto">{o.cobertura === "parte" ? o.itensDescricao : ROTULO_COBERTURA.kit_completo}</dd>
                </dl>
                {o.observacao && <p className="text-xs break-words text-texto-2">{o.observacao}</p>}
                <LinkArquivo nome={o.arquivo.nome} url={o.arquivo.url} />
                {o.pedido ? (
                  <p className="text-xs text-texto-2">
                    Virou o pedido{" "}
                    <Link href={`/obras/${obra.obraId}#pedidos-compra`} className="font-medium text-dourado-texto underline-offset-2 hover:underline">
                      {numeroPedido(o.pedido.numero)}
                    </Link>{" "}
                    em {diaDe(o.pedido.criadoEm)}
                  </p>
                ) : (
                  podeEscrever && (
                    <div className="mt-auto flex flex-col gap-2">
                      <Link
                        href={`/compras/pedido?obra=${obra.obraId}&orcamento=${o.id}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium text-texto hover:border-dourado"
                      >
                        Gerar pedido deste
                      </Link>
                      {orcamentoLivre(o) && (
                        <div className="flex flex-wrap items-start gap-3">
                          <Acao rotulo="Corrigir">
                            <FormularioOrcamento obra={obra} hoje={hoje} fornecedores={fornecedores} inicial={o} />
                          </Acao>
                          <DescartarOrcamento obraId={obra.obraId} orcamentoId={o.id} />
                        </div>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {descartados.length > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-xs font-medium text-texto-2 underline select-none hover:text-texto">
            {descartados.length} {descartados.length === 1 ? "orçamento descartado" : "orçamentos descartados"}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-linha">
            {descartados.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs text-texto-2">
                <span className="font-medium text-texto">{o.fornecedor}</span>
                <span className="tabular-nums">{formatarMoeda(o.valorTotal)}</span>
                {o.motivoDescarte && <span className="break-words">Motivo: {o.motivoDescarte}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
