"use client";

import { useActionState, type ReactNode } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, CLASSE_ENTRADA, Mensagem, Selecao } from "@/components/ui";
import { anexarNfCliente, anexarNfConta, lancarContaPagar, registrarPagamentoConta } from "@/lib/acoes/financeiro-obra";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO } from "@/lib/obras/custos";
import type { ResultadoAcao } from "@/lib/tipos";
import { CampoArquivo, arquivoDe, enviarArquivo, useEnvioComArquivo, type Obra } from "./comum";

/**
 * Formulários das contas a pagar e da nota fiscal do cliente, usados na ficha da obra e na tela Financeiro. Cada um só
 * monta o envio: quem pode (Administrativo da obra ou admin) o banco decide de novo.
 */

/** Ação recolhida atrás de um link ("Registrar pagamento", "Cancelar"…). */
export function Acao({ rotulo, children, destaque = false }: { rotulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <details className="group">
      <summary
        className={
          destaque
            ? "inline-flex min-h-9 w-fit cursor-pointer list-none items-center rounded-full border border-linha bg-superficie px-3.5 text-sm font-medium whitespace-nowrap text-texto select-none hover:border-dourado"
            : "w-fit cursor-pointer list-none text-xs font-medium text-texto-2 underline select-none hover:text-texto"
        }
      >
        {rotulo}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export type OpcaoObra = { id: string; rotulo: string };

/**
 * Lançar conta a pagar. Na ficha a obra vem fixa (`obraId`); na tela Financeiro a pessoa escolhe entre `obras` (as obras
 * em que pode lançar).
 */
export function LancarConta({
  obraId,
  obras,
  hoje,
  fornecedores,
  aberto = false,
}: {
  obraId?: string;
  obras?: OpcaoObra[];
  hoje: string;
  fornecedores: string[];
  aberto?: boolean;
}) {
  const [resultado, acao, pendente] = useActionState(lancarContaPagar, null);
  const enviar = useEnvioSemReset(acao);
  const lista = `fornecedores-${obraId ?? "financeiro"}`;
  return (
    <details id="lancar" className="rounded-xl border border-linha bg-superficie" open={aberto}>
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-texto select-none">+ Lançar pagamento</summary>
      <form onSubmit={enviar} className="grid gap-3 p-3 sm:grid-cols-2">
        {obraId ? (
          <input type="hidden" name="obraId" value={obraId} />
        ) : (
          <div className="sm:col-span-2">
            <Selecao rotulo="Obra" name="obraId" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {(obras ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
        )}
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

export function RegistrarPagamento({ obra, contaId, hoje }: { obra: Obra; contaId: string; hoje: string }) {
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
    <form onSubmit={enviar} className="grid gap-3 rounded-xl border border-linha bg-superficie p-3 sm:grid-cols-2">
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

export function AnexarNf({ obra, contaId }: { obra: Obra; contaId: string }) {
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

/** Cancelar conta a pagar ou estornar pagamento: os dois pedem o motivo. */
export function Encerrar({
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

/** Anexar (ou substituir) a nota fiscal do cliente: conclui o marco "NF do cliente" da obra. */
export function FormNfCliente({ obra, substituir = false }: { obra: Obra; substituir?: boolean }) {
  const { enviar, enviando, resultado } = useEnvioComArquivo(async (form) => {
    const nota = arquivoDe(form, "nf");
    if (!nota) return { ok: false, mensagem: "Escolha o arquivo da nota." };
    const enviado = await enviarArquivo(obra, "cliente", nota);
    if (typeof enviado === "string") return { ok: false, mensagem: enviado };
    return anexarNfCliente({ obraId: obra.obraId, ...enviado });
  });
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <CampoArquivo rotulo={substituir ? "Nova nota fiscal do cliente" : "Nota fiscal do cliente"} name="nf" required />
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante={substituir ? "secundario" : "primario"} disabled={enviando}>
          {enviando ? "Enviando..." : substituir ? "Substituir" : "Anexar nota fiscal"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
