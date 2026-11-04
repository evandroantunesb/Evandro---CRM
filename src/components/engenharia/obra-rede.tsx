"use client";

import { useActionState, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import { registrarObraRedeEngenharia } from "@/lib/acoes/engenharia";
import type { ObraRedeVM } from "@/lib/engenharia-obra-rede";
import { formatarDataIso, hojeEmSaoPaulo } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";

/** Prazos que a Copel costuma informar no orçamento (dias úteis); o engenheiro escolhe o da obra. */
const PRAZOS_OBRA_REDE = [
  { dias: 30, rotulo: "30 dias úteis" },
  { dias: 60, rotulo: "60 dias úteis" },
  { dias: 90, rotulo: "90 dias úteis" },
  { dias: 130, rotulo: "~6 meses (130 dias úteis)" },
] as const;

type Etapa = "documentos" | "pagamento" | "concluida";

const ETAPAS: { etapa: Etapa; titulo: string; ajuda: string }[] = [
  { etapa: "documentos", titulo: "Documentação enviada ao e-mail do cliente", ajuda: "Orçamento e documentos da distribuidora." },
  { etapa: "pagamento", titulo: "Pagamento à distribuidora", ajuda: "Conforme negociado; com o prazo da obra que a Copel informou." },
  { etapa: "concluida", titulo: "Obra de rede concluída", ajuda: "Libera o pedido de vistoria do padrão novo." },
];

const dataDa = (r: ObraRedeVM | null, e: Etapa) =>
  !r ? null : e === "documentos" ? r.documentosEnviadosEm : e === "pagamento" ? r.pagamentoEm : r.concluidaEm;

/**
 * Obra de rede com custo, no passo 7: só aparece quando a distribuidora emitiu orçamento. Quem atua na Engenharia
 * registra cada etapa; uma etapa já registrada só muda com motivo (fica no histórico). A RPC confere tudo de novo.
 */
export function ObraRedeEngenharia({ obraId, obraRede, podeAgir }: { obraId: string; obraRede: ObraRedeVM | null; podeAgir: boolean }) {
  return (
    <div role="group" aria-label="Obra de rede" className="flex flex-col gap-1">
      <p className="text-sm font-medium text-texto">Obra de rede (orçamento com custo)</p>
      <p className="text-xs text-texto-2">A vistoria do padrão novo só pode ser pedida depois da obra de rede concluída.</p>
      <ul className="flex flex-col divide-y divide-linha">
        {ETAPAS.map((e) => (
          <EtapaObraRede key={e.etapa} obraId={obraId} etapa={e} obraRede={obraRede} podeAgir={podeAgir} />
        ))}
      </ul>
    </div>
  );
}

function EtapaObraRede({
  obraId,
  etapa,
  obraRede,
  podeAgir,
}: {
  obraId: string;
  etapa: (typeof ETAPAS)[number];
  obraRede: ObraRedeVM | null;
  podeAgir: boolean;
}) {
  const [corrigindo, setCorrigindo] = useState(false);
  const [resultado, acao, pendente] = useActionState(async (anterior: ResultadoAcao, formData: FormData) => {
    const r = await registrarObraRedeEngenharia(anterior, formData);
    // Correção gravada: volta a mostrar só o registro.
    if (r?.ok) setCorrigindo(false);
    return r;
  }, null);
  const data = dataDa(obraRede, etapa.etapa);
  const hoje = hojeEmSaoPaulo();
  const mostrarForm = podeAgir && (!data || corrigindo);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-texto">{etapa.titulo}</p>
          <p className="text-xs text-texto-2">
            {data
              ? `Em ${formatarDataIso(data)}${etapa.etapa === "pagamento" && obraRede?.prazoDias ? ` · prazo da obra: ${obraRede.prazoDias} dias úteis` : ""}`
              : etapa.ajuda}
          </p>
        </div>
        {data && <Selo tom="positivo">Feito</Selo>}
      </div>
      {data && podeAgir && !corrigindo && (
        <Botao type="button" variante="secundario" className="self-start" onClick={() => setCorrigindo(true)}>
          Corrigir
        </Botao>
      )}
      {mostrarForm && (
        <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="etapa" value={etapa.etapa} />
          <label className="flex flex-col gap-1 text-xs text-texto-2">
            Data
            <input name="data" type="date" defaultValue={data ?? hoje} max={hoje} required className={`${CLASSE_ENTRADA} text-sm`} />
          </label>
          {etapa.etapa === "pagamento" && (
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Prazo da obra informado pela Copel
              <select name="prazoDias" defaultValue={obraRede?.prazoDias ?? 60} required className={`${CLASSE_ENTRADA} text-sm`}>
                {PRAZOS_OBRA_REDE.map((p) => (
                  <option key={p.dias} value={p.dias}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data && (
            <label className="flex flex-1 flex-col gap-1 text-xs text-texto-2">
              Motivo da correção
              <input name="motivo" required minLength={3} maxLength={500} className={`${CLASSE_ENTRADA} text-sm`} />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Botao type="submit" disabled={pendente}>
              {data ? "Salvar correção" : "Registrar"}
            </Botao>
            {corrigindo && (
              <Botao type="button" variante="secundario" onClick={() => setCorrigindo(false)}>
                Cancelar
              </Botao>
            )}
          </div>
          <Mensagem resultado={resultado} />
        </form>
      )}
    </li>
  );
}
