"use client";

import Link from "next/link";
import { confirmarPagamentoInformado } from "@/lib/acoes/avisos-pagamento";
import type { PagamentoAConfirmarVM } from "@/lib/avisos-pagamento-regras";
import { formatarDataHora, formatarDataIso, formatarMoeda } from "@/lib/formatacao";
import { ConferirPagamento, LinkComprovante } from "@/components/conferir-pagamento";

/** Um pagamento informado: dados para conferir, comprovante e as ações de confirmar ou devolver. */
export function LinhaPagamento({ pagamento: p, abreNegocio }: { pagamento: PagamentoAConfirmarVM; abreNegocio: boolean }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {abreNegocio ? (
          <Link href={`/negocios/${p.negocioId}?aba=proposta`} className="text-sm font-semibold text-dourado-texto hover:underline">
            Negócio #{p.negocioNumero}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-dourado-texto">Negócio #{p.negocioNumero}</span>
        )}
        <h2 className="text-base font-semibold text-texto">{p.cliente}</h2>
        {p.cidade && <span className="text-sm text-texto-2">{p.cidade}</span>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span>
          <span className="text-texto-2">Contrato</span> <strong className="font-semibold">{formatarMoeda(p.valor)}</strong>
        </span>
        <span>
          <span className="text-texto-2">Pago em</span> {formatarDataIso(p.dataPagamento)}
        </span>
      </div>
      <p className="text-sm">
        <span className="text-texto-2">Condição do contrato</span>{" "}
        {p.condicao ?? "não registrada (contrato anterior à escolha da condição)."}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-texto-2">
        <span>
          Informado por {p.informadoPor}, {formatarDataHora(p.informadoEm)}
        </span>
        <LinkComprovante aviso={p} />
      </div>
      {p.observacao && <p className="text-sm text-texto">&ldquo;{p.observacao}&rdquo;</p>}
      <ConferirPagamento negocioId={p.negocioId} contratoId={p.contratoId} avisoId={p.avisoId} acaoConfirmar={confirmarPagamentoInformado} />
    </li>
  );
}
