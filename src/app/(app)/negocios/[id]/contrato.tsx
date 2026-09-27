"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { atualizarStatusContrato, gerarContrato } from "@/lib/acoes/contratos";
import { ROTULO_STATUS_CONTRATO, STATUS_CONTRATO, type StatusContrato } from "@/lib/tipos";

export type ContratoSalvo = {
  token: string;
  status: StatusContrato;
};

export function Contrato({
  negocioId,
  contrato,
  siteUrl,
}: {
  negocioId: string;
  contrato: ContratoSalvo | null;
  siteUrl: string;
}) {
  const [resultadoGerar, acaoGerar, gerando] = useActionState(gerarContrato, null);
  const [resultadoStatus, acaoStatus] = useActionState(atualizarStatusContrato, null);
  const [copiado, setCopiado] = useState(false);

  if (!contrato || contrato.status === "rascunho") {
    return (
      <div className="flex flex-col gap-3">
        {contrato && (
          <p className="text-sm text-zinc-600">
            Contrato gerado como rascunho. Gerar de novo substitui o texto pelo modelo atual.
          </p>
        )}
        <form action={acaoGerar} className="flex flex-col gap-2">
          <input type="hidden" name="negocioId" value={negocioId} />
          <Mensagem resultado={resultadoGerar} />
          <Botao type="submit" disabled={gerando} className="self-start">
            {gerando ? "Gerando..." : contrato ? "Gerar novamente" : "Gerar contrato"}
          </Botao>
        </form>
        {contrato && <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />}
        {contrato && <LinkContrato token={contrato.token} siteUrl={siteUrl} copiado={copiado} setCopiado={setCopiado} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <LinkContrato token={contrato.token} siteUrl={siteUrl} copiado={copiado} setCopiado={setCopiado} />
      <FormularioStatus negocioId={negocioId} status={contrato.status} acao={acaoStatus} resultado={resultadoStatus} />
    </div>
  );
}

function LinkContrato({
  token,
  siteUrl,
  copiado,
  setCopiado,
}: {
  token: string;
  siteUrl: string;
  copiado: boolean;
  setCopiado: (v: boolean) => void;
}) {
  const link = `${siteUrl}/contrato/${token}`;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-700">Link do contrato</span>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <Botao
          type="button"
          variante="secundario"
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? "Copiado!" : "Copiar"}
        </Botao>
      </div>
    </div>
  );
}

function FormularioStatus({
  negocioId,
  status,
  acao,
  resultado,
}: {
  negocioId: string;
  status: StatusContrato;
  acao: (payload: FormData) => void;
  resultado: { ok: boolean; mensagem: string } | null;
}) {
  return (
    <form action={acao} className="flex items-end gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <Selecao rotulo="Status do contrato" name="status" defaultValue={status}>
        {STATUS_CONTRATO.map((s) => (
          <option key={s} value={s}>
            {ROTULO_STATUS_CONTRATO[s]}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" variante="secundario">
        Salvar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
