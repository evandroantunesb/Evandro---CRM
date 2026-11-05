"use client";

import { useActionState, type ReactNode } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, CLASSE_ENTRADA, Mensagem, Selecao } from "@/components/ui";
import { anexarNfConta, cancelarContaPagar, estornarPagamentoConta, lancarContaPagar, registrarPagamentoConta } from "@/lib/acoes/financeiro-obra";
import { formatarMoeda } from "@/lib/formatacao";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO } from "@/lib/obras/custos";
import { resumoContas, situacaoConta, type ContaPagarVM } from "@/lib/obras/financeiro-regras";
import type { ResultadoAcao } from "@/lib/tipos";
import { CampoArquivo, TOM_SELO, arquivoDe, enviarArquivo, useEnvioComArquivo, type Obra } from "./financeiro-comum";

/**
 * Pagamentos a fornecedores na ficha da obra (desenho aprovado "Ficha da obra · Administrativo"): lançar, registrar o
 * pagamento com comprovante, anexar a nota, cancelar e estornar. Os controles aparecem para quem atua no Administrativo
 * da obra (ou admin); quem pode o quê o banco decide de novo.
 */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Acao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="w-fit cursor-pointer list-none text-xs font-medium text-texto-2 underline select-none hover:text-texto">{rotulo}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}


export function PagamentosFornecedores({
  obra,
  contas,
  planejado,
  podeEscrever,
  hoje,
  fornecedores,
}: {
  obra: Obra;
  contas: ContaPagarVM[];
  planejado: number | null;
  podeEscrever: boolean;
  hoje: string;
  fornecedores: string[];
}) {
  const r = resumoContas(contas, hoje);
  return (
    <div className="flex flex-col gap-4">
      {podeEscrever && <LancarConta obraId={obra.obraId} hoje={hoje} fornecedores={fornecedores} />}
      {contas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum pagamento a fornecedor lançado.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-linha">
          {contas.map((c) => (
            <LinhaConta key={c.id} obra={obra} conta={c} hoje={hoje} podeEscrever={podeEscrever} />
          ))}
        </ul>
      )}
      <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-linha pt-3 text-sm text-texto-2">
        {planejado != null && (
          <span>
            Planejado <b className="text-texto tabular-nums">{formatarMoeda(planejado)}</b>
          </span>
        )}
        <span>
          Pago <b className="text-texto tabular-nums">{formatarMoeda(r.pago)}</b>
        </span>
        <span>
          A pagar <b className="text-texto tabular-nums">{formatarMoeda(r.aPagar)}</b>
        </span>
      </p>
      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        Cada pagamento entra como custo real da obra, na categoria dele: o semáforo e a margem usam os mesmos números. Nada é apagado; erro se corrige
        com estorno.
      </p>
    </div>
  );
}

function LancarConta({ obraId, hoje, fornecedores }: { obraId: string; hoje: string; fornecedores: string[] }) {
  const [resultado, acao, pendente] = useActionState(lancarContaPagar, null);
  const enviar = useEnvioSemReset(acao);
  const lista = `fornecedores-${obraId}`;
  return (
    <details className="rounded-xl border border-linha">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-texto select-none">+ Lançar pagamento</summary>
      <form onSubmit={enviar} className="grid gap-3 p-3 sm:grid-cols-2">
        <input type="hidden" name="obraId" value={obraId} />
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-texto-2">Fornecedor</span>
          <input name="fornecedor" required minLength={2} maxLength={120} list={lista} autoComplete="off" className={CLASSE_ENTRADA} placeholder="Ex.: Distribuidora Solar Sul" />
          <datalist id={lista}>
            {fornecedores.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <Selecao rotulo="Categoria" name="categoria" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {CATEGORIAS_CUSTO_OBRA.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CATEGORIA_CUSTO[c]}
            </option>
          ))}
        </Selecao>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Valor (R$)</span>
          <input name="valor" inputMode="decimal" required placeholder="Ex.: 1.250,00" className={CLASSE_ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Vencimento</span>
          <input name="vencimento" type="date" required defaultValue={hoje} className={CLASSE_ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Descrição (opcional)</span>
          <input name="descricao" maxLength={300} className={CLASSE_ENTRADA} placeholder="Ex.: frete do kit" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Botao type="submit" disabled={pendente}>
            {pendente ? "Lançando..." : "Lançar pagamento"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </details>
  );
}

function Documento({ rotulo, url }: { rotulo: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-energia underline-offset-2 hover:underline">
      ✓ {rotulo}
    </a>
  ) : (
    <span className="text-energia">✓ {rotulo}</span>
  );
}

function LinhaConta({ obra, conta: c, hoje, podeEscrever }: { obra: Obra; conta: ContaPagarVM; hoje: string; podeEscrever: boolean }) {
  const selo = situacaoConta(c, hoje);
  const ativa = c.situacao === "a_pagar" || c.situacao === "paga";
  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-texto">{c.fornecedor}</p>
          <p className="text-xs text-texto-2">
            {ROTULO_CATEGORIA_CUSTO[c.categoria]}
            {c.descricao && ` · ${c.descricao}`} · vence {dataBr(c.vencimento)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`font-medium tabular-nums ${ativa ? "text-texto" : "text-texto-2"}`}>{formatarMoeda(c.valor)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TOM_SELO[selo.tom]}`}>{selo.rotulo}</span>
        </div>
      </div>
      {(c.situacao === "paga" || c.nfNome || c.motivo) && (
        <p className="flex flex-wrap gap-x-3 text-xs text-texto-2">
          {c.nfNome ? <Documento rotulo="NF" url={c.nfUrl} /> : c.situacao === "paga" && <span>NF pendente</span>}
          {c.comprovanteNome && <Documento rotulo="comprovante" url={c.comprovanteUrl} />}
          {c.motivo && <span>Motivo: {c.motivo}</span>}
        </p>
      )}
      {podeEscrever && c.situacao === "a_pagar" && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Acao rotulo="Registrar pagamento">
            <RegistrarPagamento obra={obra} contaId={c.id} hoje={hoje} />
          </Acao>
          {!c.nfNome && (
            <Acao rotulo="Anexar nota fiscal">
              <AnexarNf obra={obra} contaId={c.id} />
            </Acao>
          )}
          <Acao rotulo="Cancelar">
            <Encerrar obraId={obra.obraId} contaId={c.id} acaoServidor={cancelarContaPagar} botao="Cancelar pagamento" pendenteTexto="Cancelando..." />
          </Acao>
        </div>
      )}
      {podeEscrever && c.situacao === "paga" && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {!c.nfNome && (
            <Acao rotulo="Anexar nota fiscal">
              <AnexarNf obra={obra} contaId={c.id} />
            </Acao>
          )}
          <Acao rotulo="Estornar">
            <Encerrar obraId={obra.obraId} contaId={c.id} acaoServidor={estornarPagamentoConta} botao="Confirmar estorno" pendenteTexto="Estornando..." />
          </Acao>
        </div>
      )}
    </li>
  );
}

function RegistrarPagamento({ obra, contaId, hoje }: { obra: Obra; contaId: string; hoje: string }) {
  const { enviar, enviando, resultado } = useEnvioComArquivo(async (form) => {
    const comprovante = arquivoDe(form, "comprovante");
    if (!comprovante) return { ok: false, mensagem: "Anexe o comprovante do pagamento." };
    const enviado = await enviarArquivo(obra, "fornecedor", comprovante);
    if (typeof enviado === "string") return { ok: false, mensagem: enviado };
    const nota = arquivoDe(form, "nf");
    const nf = nota ? await enviarArquivo(obra, "fornecedor", nota) : null;
    if (typeof nf === "string") return { ok: false, mensagem: nf };
    return registrarPagamentoConta({ obraId: obra.obraId, contaId, pagoEm: String(form.get("pagoEm") ?? ""), comprovante: enviado, nf });
  });
  return (
    <form onSubmit={enviar} className="grid gap-3 rounded-xl border border-linha p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Data do pagamento</span>
        <input name="pagoEm" type="date" required max={hoje} defaultValue={hoje} className={CLASSE_ENTRADA} />
      </label>
      <CampoArquivo rotulo="Comprovante" name="comprovante" required ajuda="Foto ou PDF, até 10 MB." />
      <CampoArquivo rotulo="Nota fiscal (opcional)" name="nf" ajuda="Pode ser anexada depois." />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Registrar pagamento"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function AnexarNf({ obra, contaId }: { obra: Obra; contaId: string }) {
  const { enviar, enviando, resultado } = useEnvioComArquivo(async (form) => {
    const nota = arquivoDe(form, "nf");
    if (!nota) return { ok: false, mensagem: "Escolha o arquivo da nota." };
    const enviado = await enviarArquivo(obra, "fornecedor", nota);
    if (typeof enviado === "string") return { ok: false, mensagem: enviado };
    return anexarNfConta({ obraId: obra.obraId, contaId, ...enviado });
  });
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <CampoArquivo rotulo="Nota fiscal" name="nf" required />
      <Botao type="submit" variante="secundario" disabled={enviando}>
        {enviando ? "Enviando..." : "Anexar"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function Encerrar({
  obraId,
  contaId,
  acaoServidor,
  botao,
  pendenteTexto,
}: {
  obraId: string;
  contaId: string;
  acaoServidor: (anterior: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;
  botao: string;
  pendenteTexto: string;
}) {
  const [resultado, acao, pendente] = useActionState(acaoServidor, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="contaId" value={contaId} />
      <input name="motivo" required minLength={3} maxLength={300} aria-label="Motivo" placeholder="Motivo" className={`${CLASSE_ENTRADA} sm:flex-1`} />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? pendenteTexto : botao}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
