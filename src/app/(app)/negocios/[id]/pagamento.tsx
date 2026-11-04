"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { Botao, Campo, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import { ConferirPagamento, LinkComprovante } from "@/components/conferir-pagamento";
import { cancelarAvisoPagamento, informarPagamento } from "@/lib/acoes/avisos-pagamento";
import { confirmarPagamento, estornarConfirmacaoPagamento } from "@/lib/acoes/contratos";
import { nomeSeguro } from "@/lib/anexos-regras";
import { BUCKET_COMPROVANTES, problemaComprovante, TIPOS_COMPROVANTE, type AvisoPagamentoVM } from "@/lib/avisos-pagamento-regras";
import { formatarDataHora, formatarDataIso } from "@/lib/formatacao";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { ROTULO_STATUS_PAGAMENTO_CONTRATO, type ResultadoAcao, type StatusPagamentoContrato } from "@/lib/tipos";

/**
 * Pagamento do Pro: marco operacional auditável, separado do status do contrato. Só aparece com contrato assinado.
 * O vendedor informa que o cliente pagou, com comprovante; admin, gestor ou o Operacional confirma ou devolve com
 * motivo (20261113100000_aviso_pagamento_vendedor.sql). Gestor e admin também confirmam direto, sem aviso.
 * Toda ação é decidida na RPC; os botões só aparecem para quem o papel permite.
 */
export function Pagamento({
  negocioId,
  contratoId,
  status,
  podeConfirmar,
  podeInformar,
  aviso,
  pastaComprovante,
  hoje,
}: {
  negocioId: string;
  contratoId: string;
  status: StatusPagamentoContrato;
  /** Admin ou gestor: confirma (com ou sem aviso), devolve e estorna. */
  podeConfirmar: boolean;
  /** Vendedor: informa que o cliente pagou. */
  podeInformar: boolean;
  /** Último aviso do contrato, ou null. */
  aviso: AvisoPagamentoVM | null;
  pastaComprovante: string;
  hoje: string;
}) {
  const [informando, setInformando] = useState(false);
  const aberto = aviso?.situacao === "aberto" ? aviso : null;
  const devolvido = aviso?.situacao === "devolvido" ? aviso : null;

  if (status === "confirmado") {
    return (
      <div className="flex flex-col gap-3">
        <Selo tom="positivo">{ROTULO_STATUS_PAGAMENTO_CONTRATO.confirmado}</Selo>
        {aviso?.situacao === "confirmado" && (
          <DadosAviso aviso={aviso}>
            {aviso.encerradoPor && aviso.encerradoEm && (
              <Item rotulo="Confirmado">
                por {aviso.encerradoPor}, {formatarDataHora(aviso.encerradoEm)}
              </Item>
            )}
          </DadosAviso>
        )}
        {podeConfirmar && <Estornar negocioId={negocioId} contratoId={contratoId} />}
      </div>
    );
  }

  if (aberto) {
    return (
      <div className="flex flex-col gap-3">
        <Selo>Aguardando confirmação</Selo>
        <DadosAviso aviso={aberto}>{aberto.observacao && <Item rotulo="Observação">{aberto.observacao}</Item>}</DadosAviso>
        {podeConfirmar ? (
          <ConferirPagamento negocioId={negocioId} contratoId={contratoId} avisoId={aberto.id} acaoConfirmar={confirmarPagamento} />
        ) : (
          <p className="text-sm text-texto-2">
            O gestor ou o Operacional vai conferir. Você recebe um aviso quando confirmarem ou se não encontrarem o pagamento.
          </p>
        )}
        {aberto.souQuemInformou && <CancelarAviso negocioId={negocioId} avisoId={aberto.id} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {devolvido ? (
        <>
          <Selo tom="negativo">Pagamento não encontrado</Selo>
          <div className="flex flex-col gap-1 rounded-lg bg-superficie-2 px-3 py-2">
            {devolvido.encerradoPor && devolvido.encerradoEm && (
              <span className="text-xs text-texto-2">
                {devolvido.encerradoPor}, {formatarDataHora(devolvido.encerradoEm)}
              </span>
            )}
            <span className="text-sm">{devolvido.motivoDevolucao}</span>
          </div>
          <p className="text-xs text-texto-2">
            Aviso anterior: pago em {formatarDataIso(devolvido.dataPagamento)}, <LinkComprovante aviso={devolvido} />
          </p>
        </>
      ) : (
        <Selo tom={status === "estornado" ? "negativo" : "atencao"}>
          {status === "estornado" ? ROTULO_STATUS_PAGAMENTO_CONTRATO.estornado : "Pendente"}
        </Selo>
      )}

      {podeConfirmar && (
        <>
          <p className="text-sm text-texto-2">O vendedor ainda não informou o pagamento. Você pode confirmar direto.</p>
          <ConfirmarDireto negocioId={negocioId} contratoId={contratoId} />
        </>
      )}

      {!podeConfirmar && podeInformar && !informando && (
        <>
          {!devolvido && (
            <p className="text-sm text-texto-2">
              Quando o cliente pagar, informe aqui com o comprovante. O gestor ou o Operacional confere e confirma.
            </p>
          )}
          <Botao type="button" className="self-start" onClick={() => setInformando(true)}>
            {devolvido ? "Informar de novo" : "O cliente pagou"}
          </Botao>
        </>
      )}
      {!podeConfirmar && podeInformar && informando && (
        <FormInformar
          negocioId={negocioId}
          contratoId={contratoId}
          pasta={pastaComprovante}
          hoje={hoje}
          aoCancelar={() => setInformando(false)}
        />
      )}
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-texto-2">{rotulo}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  );
}

function DadosAviso({ aviso, children }: { aviso: AvisoPagamentoVM; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <Item rotulo="Pago em">{formatarDataIso(aviso.dataPagamento)}</Item>
      <Item rotulo="Informado">
        por {aviso.souQuemInformou ? "você" : aviso.informadoPor}, {formatarDataHora(aviso.informadoEm)}
      </Item>
      <Item rotulo="Comprovante">
        <LinkComprovante aviso={aviso} />
      </Item>
      {children}
    </dl>
  );
}

/** Envia o comprovante direto ao Storage (arquivo nunca passa por Server Action) e então registra o aviso. */
function FormInformar({
  negocioId,
  contratoId,
  pasta,
  hoje,
  aoCancelar,
}: {
  negocioId: string;
  contratoId: string;
  pasta: string;
  hoje: string;
  aoCancelar: () => void;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const arquivo = form.get("comprovante");
    if (!(arquivo instanceof File) || !arquivo.name) {
      setResultado({ ok: false, mensagem: "Anexe o comprovante do pagamento." });
      return;
    }
    const problema = problemaComprovante({ nome: arquivo.name, tamanho: arquivo.size, tipoMime: arquivo.type });
    if (problema) {
      setResultado({ ok: false, mensagem: problema });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const caminho = `${pasta}/${nomeSeguro(arquivo.name)}`;
    const { error } = await criarClienteNavegador()
      .storage.from(BUCKET_COMPROVANTES)
      .upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) {
      setEnviando(false);
      setResultado({ ok: false, mensagem: "Não foi possível enviar o comprovante. Tente de novo." });
      return;
    }
    const r = await informarPagamento({
      negocioId,
      contratoId,
      dataPagamento: String(form.get("dataPagamento") ?? ""),
      observacao: String(form.get("observacao") ?? ""),
      caminho,
      nome: arquivo.name,
    });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <Campo rotulo="Data do pagamento" name="dataPagamento" type="date" defaultValue={hoje} max={hoje} required />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Comprovante</span>
        <input name="comprovante" type="file" accept={TIPOS_COMPROVANTE.join(",")} required className={CLASSE_ENTRADA} />
        <span className="text-xs text-texto-2">Foto ou PDF, até 10 MB.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Observação (opcional)</span>
        <textarea name="observacao" rows={2} maxLength={500} className={CLASSE_ENTRADA} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar para confirmação"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function CancelarAviso({ negocioId, avisoId }: { negocioId: string; avisoId: string }) {
  const [resultado, acao, pendente] = useActionState(cancelarAvisoPagamento, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="avisoId" value={avisoId} />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Cancelar aviso
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function ConfirmarDireto({ negocioId, contratoId }: { negocioId: string; contratoId: string }) {
  const [resultado, acao, pendente] = useActionState(confirmarPagamento, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="contratoId" value={contratoId} />
      <Botao type="submit" disabled={pendente}>
        Confirmar pagamento
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function Estornar({ negocioId, contratoId }: { negocioId: string; contratoId: string }) {
  const [resultado, acao] = useActionState(estornarConfirmacaoPagamento, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <Botao type="button" variante="secundario" className="self-start" onClick={() => setAberto(true)}>
        Estornar confirmação
      </Botao>
    );
  }
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg border border-linha p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="contratoId" value={contratoId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-texto-2">Motivo do estorno</span>
        <textarea name="motivo" rows={2} required className={CLASSE_ENTRADA} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit">Confirmar estorno</Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
