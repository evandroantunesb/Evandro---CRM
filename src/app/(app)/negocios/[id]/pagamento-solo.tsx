"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selo } from "@/components/ui";
import { corrigirRegistroPagamento, estornarRegistroPagamento, registrarPagamento } from "@/lib/acoes/pagamentos";
import { formatarDataHora, formatarDataIso } from "@/lib/formatacao";

/** Linha de `registros_pagamento` já com os nomes resolvidos no servidor. */
export type RegistroVisivel = {
  id: string;
  dataRecebimento: string;
  observacao: string | null;
  autor: string;
  registradoEm: string;
  substituiId: string | null;
  estornadoEm: string | null;
  estornadoPor: string | null;
  motivoEstorno: string | null;
};

/** Resultado de `situacao_registro_pagamento` (mesma regra de `registrar_pagamento_negocio`). */
export type SituacaoRegistro = "permitido" | "varios_usuarios" | "indisponivel";

/**
 * Pagamento do Raion Solo (issue #187): o administrador marca "pago" sozinho, antes ou depois do
 * contrato, sem segundo aprovador. É um registro manual, não conciliação bancária. Estornar e
 * corrigir exigem motivo e ficam com o admin da empresa, inclusive depois do upgrade para o Pro.
 * Tudo é autorizado de novo nas RPCs; os botões só refletem o que o banco já permite.
 */
export function PagamentoSolo({
  negocioId,
  hoje,
  situacao,
  podeRetificar,
  registros,
}: {
  negocioId: string;
  /** Hoje no fuso de Brasília ("2026-10-14"): padrão e limite do campo de data. */
  hoje: string;
  situacao: SituacaoRegistro;
  /** Admin da empresa: pode estornar e corrigir o registro ativo de origem Solo. */
  podeRetificar: boolean;
  /** Mais recente primeiro. */
  registros: RegistroVisivel[];
}) {
  const ativo = registros.find((r) => r.estornadoEm == null) ?? null;
  const historico = registros.filter((r) => r.estornadoEm != null);
  // A ação aberta vale só para o registro em que foi aberta: depois de corrigir/estornar, fecha sozinha.
  const [aberta, setAberta] = useState<{ tipo: "estornar" | "corrigir"; registroId: string } | null>(null);
  const modo = ativo && aberta?.registroId === ativo.id ? aberta.tipo : null;

  return (
    <div className="flex flex-col gap-3">
      {ativo ? (
        <RegistroAtivo registro={ativo} />
      ) : (
        <Selo tom={historico.length ? "negativo" : "atencao"}>{historico.length ? "Registro de pagamento estornado" : "Pagamento não registrado"}</Selo>
      )}

      {!ativo && situacao === "permitido" && <FormRegistrar negocioId={negocioId} hoje={hoje} />}

      {!ativo && situacao === "varios_usuarios" && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O registro direto de pagamento é do plano Solo com um único usuário ativo, e esta empresa tem mais de um. Use a
          confirmação de pagamento do contrato assinado. Nenhum acesso foi suspenso.
        </p>
      )}

      {ativo && podeRetificar && modo === null && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="button" variante="secundario" onClick={() => setAberta({ tipo: "corrigir", registroId: ativo.id })}>
            Corrigir data ou observação
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => setAberta({ tipo: "estornar", registroId: ativo.id })}>
            Estornar
          </Botao>
        </div>
      )}
      {ativo && modo === "corrigir" && (
        <FormCorrigir negocioId={negocioId} hoje={hoje} registro={ativo} onCancelar={() => setAberta(null)} />
      )}
      {ativo && modo === "estornar" && <FormEstornar negocioId={negocioId} onCancelar={() => setAberta(null)} />}

      {historico.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600">Histórico de registros ({historico.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {historico.map((r) => (
              <li key={r.id} className="border-l-2 border-zinc-200 pl-3 text-zinc-700">
                Recebido em {formatarDataIso(r.dataRecebimento)} · registrado por {r.autor} em {formatarDataHora(r.registradoEm)}
                {r.observacao && <> · {r.observacao}</>}
                <br />
                <span className="text-zinc-500">
                  Estornado{r.estornadoPor ? ` por ${r.estornadoPor}` : ""} em {formatarDataHora(r.estornadoEm!)}: {r.motivoEstorno}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RegistroAtivo({ registro }: { registro: RegistroVisivel }) {
  return (
    <div className="flex flex-col gap-1">
      <Selo tom="positivo">Pago/Recebido</Selo>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500">Recebido em</dt>
        <dd className="text-zinc-900">{formatarDataIso(registro.dataRecebimento)}</dd>
        <dt className="text-zinc-500">Registrado por</dt>
        <dd className="text-zinc-900">
          {registro.autor} · {formatarDataHora(registro.registradoEm)}
          {registro.substituiId && " (correção)"}
        </dd>
        {registro.observacao && (
          <>
            <dt className="text-zinc-500">Observação</dt>
            <dd className="whitespace-pre-wrap text-zinc-900">{registro.observacao}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-zinc-500">Registro manual informado pelo administrador. Não é conciliação bancária.</p>
    </div>
  );
}

function CamposPagamento({ hoje, data, observacao }: { hoje: string; data: string; observacao?: string | null }) {
  return (
    <>
      <Campo rotulo="Data do recebimento" type="date" name="dataRecebimento" defaultValue={data} max={hoje} required />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Observação (opcional)</span>
        <textarea
          name="observacao"
          rows={2}
          maxLength={500}
          defaultValue={observacao ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </label>
    </>
  );
}

function FormRegistrar({ negocioId, hoje }: { negocioId: string; hoje: string }) {
  const [resultado, acao, enviando] = useActionState(registrarPagamento, null);
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <CamposPagamento hoje={hoje} data={hoje} />
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Registrando…" : "Marcar como pago"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
      <p className="text-xs text-zinc-500">Pode ser antes ou depois de gerar o contrato. Não precisa de outra aprovação.</p>
    </form>
  );
}

function FormCorrigir({ negocioId, hoje, registro, onCancelar }: { negocioId: string; hoje: string; registro: RegistroVisivel; onCancelar: () => void }) {
  const [resultado, acao, enviando] = useActionState(corrigirRegistroPagamento, null);
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <CamposPagamento hoje={hoje} data={registro.dataRecebimento} observacao={registro.observacao} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Motivo da correção</span>
        <textarea name="motivo" rows={2} required maxLength={1000} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-zinc-500">O registro atual fica no histórico como estornado e o corrigido passa a valer.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar correção"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function FormEstornar({ negocioId, onCancelar }: { negocioId: string; onCancelar: () => void }) {
  const [resultado, acao, enviando] = useActionState(estornarRegistroPagamento, null);
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Motivo do estorno</span>
        <textarea name="motivo" rows={2} required maxLength={1000} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="secundario" disabled={enviando}>
          {enviando ? "Estornando…" : "Confirmar estorno"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
