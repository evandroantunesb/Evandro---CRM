"use client";

import { Documento, TOM_SELO, type Obra } from "@/components/financeiro/comum";
import { Acao, AnexarNf, Encerrar, LancarConta, RegistrarPagamento } from "@/components/financeiro/formularios";
import { cancelarContaPagar, estornarPagamentoConta } from "@/lib/acoes/financeiro-obra";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_CATEGORIA_CUSTO } from "@/lib/obras/custos";
import { resumoContas, situacaoConta, type ContaPagarVM } from "@/lib/obras/financeiro-regras";

/**
 * Pagamentos a fornecedores na ficha da obra (desenho aprovado "Ficha da obra · Administrativo"): lançar, registrar o
 * pagamento com comprovante, anexar a nota, cancelar e estornar. Os controles aparecem para quem atua no Administrativo
 * da obra (ou admin); quem pode o quê o banco decide de novo. Os formulários são os mesmos da tela Financeiro.
 */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

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
