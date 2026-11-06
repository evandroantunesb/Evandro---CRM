"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { CampoArquivo, arquivoDe, enviarArquivo, useEnvioComArquivo, type Obra } from "@/components/financeiro/comum";
import { Acao } from "@/components/financeiro/formularios";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { cancelarPedidoCompra, iniciarCompra, registrarNfPedido, registrarRecebimentoPedido } from "@/lib/acoes/compras";
import { lerNumeroBr } from "@/lib/formatacao";
import type { ItemPedidoVM } from "@/lib/compras/regras";
import type { ResultadoAcao } from "@/lib/tipos";

/** Ações de Compras na ficha da obra e na tela /compras. Quem pode o banco decide de novo. */

export function IniciarCompra({ obraId }: { obraId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  return (
    <div className="flex flex-col gap-2">
      <Botao
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await iniciarCompra(obraId);
            setResultado(r);
            if (r?.ok) router.refresh();
          })
        }
      >
        {pendente ? "Iniciando..." : "Iniciar compra"}
      </Botao>
      <Mensagem resultado={resultado?.ok ? null : resultado} />
    </div>
  );
}

/** Nota fiscal do pedido: número, valor e arquivo. Ao registrar, a conta a pagar nasce no Financeiro. */
export function RegistrarNf({ obra, pedidoId, valorPedido, vencimento }: { obra: Obra; pedidoId: string; valorPedido: number; vencimento: string }) {
  const { enviar, enviando, resultado } = useEnvioComArquivo(async (form) => {
    const valor = lerNumeroBr(String(form.get("valor") ?? ""));
    if (valor == null || valor <= 0) return { ok: false, mensagem: "Informe o valor da nota (ex.: 1.234,56)." };
    const arquivo = arquivoDe(form, "arquivo");
    if (!arquivo) return { ok: false, mensagem: "Envie o arquivo da nota." };
    const envio = await enviarArquivo(obra, "fornecedor", arquivo);
    if (typeof envio === "string") return { ok: false, mensagem: envio };
    return registrarNfPedido({ obraId: obra.obraId, pedidoId, numero: String(form.get("numero") ?? ""), valor, arquivo: envio });
  });
  return (
    <Acao rotulo="Registrar nota fiscal" destaque>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 rounded-xl bg-superficie-2 p-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Número da nota</span>
          <input name="numero" required maxLength={60} placeholder="Ex.: 001.245" className={CLASSE_ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Valor da nota (R$)</span>
          <input
            name="valor"
            inputMode="decimal"
            required
            defaultValue={valorPedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            className={CLASSE_ENTRADA}
          />
        </label>
        <CampoArquivo rotulo="Arquivo da nota" name="arquivo" required />
        <p className="text-xs text-texto-2 sm:col-span-3">
          Ao registrar, a conta a pagar nasce no Financeiro no valor da nota, com vencimento em {vencimento.slice(8, 10)}/{vencimento.slice(5, 7)} e esta
          nota anexada.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Registrando..." : "Registrar nota fiscal"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </Acao>
  );
}

/** Recebimento: quanto chegou agora de cada item (vem preenchido com o que falta). */
export function RegistrarRecebimento({ obraId, pedidoId, itens }: { obraId: string; pedidoId: string; itens: ItemPedidoVM[] }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const pendentes = itens.filter((i) => i.quantidadeRecebida < i.quantidade);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const lidos = pendentes.map((i) => ({ itemId: i.id, quantidade: lerNumeroBr(String(form.get(i.id) ?? "")) ?? -1 }));
    if (lidos.some((l) => l.quantidade < 0)) {
      setResultado({ ok: false, mensagem: "Confira as quantidades (ex.: 10 ou 2,5)." });
      return;
    }
    setEnviando(true);
    const r = await registrarRecebimentoPedido({ obraId, pedidoId, itens: lidos });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) router.refresh();
  };
  if (pendentes.length === 0) return null;
  return (
    <Acao rotulo="Registrar recebimento" destaque>
      <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl bg-superficie-2 p-3">
        <ul className="flex flex-col gap-2">
          {pendentes.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 text-texto">
                {i.descricao}
                <span className="block text-xs text-texto-2">
                  {i.quantidadeRecebida.toLocaleString("pt-BR")} de {i.quantidade.toLocaleString("pt-BR")} {i.unidade} recebidos
                </span>
              </span>
              <label className="flex items-center gap-2">
                <span className="text-xs text-texto-2">Chegou agora</span>
                <input
                  name={i.id}
                  inputMode="decimal"
                  aria-label={`Quanto chegou agora de ${i.descricao}`}
                  defaultValue={(i.quantidade - i.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                  className={`${CLASSE_ENTRADA} w-24 text-right tabular-nums`}
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Registrando..." : "Registrar recebimento"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </Acao>
  );
}

export function CancelarPedido({ obraId, pedidoId }: { obraId: string; pedidoId: string }) {
  const [resultado, acao, pendente] = useActionState(cancelarPedidoCompra, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <Acao rotulo="Cancelar pedido">
      <form onSubmit={enviar} className="flex flex-col gap-2 rounded-xl bg-superficie-2 p-3 sm:flex-row sm:items-end">
        <input type="hidden" name="obraId" value={obraId} />
        <input type="hidden" name="pedidoId" value={pedidoId} />
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Motivo</span>
          <input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: fornecedor sem estoque" className={CLASSE_ENTRADA} />
        </label>
        <Botao type="submit" variante="perigo" disabled={pendente}>
          {pendente ? "Cancelando..." : "Cancelar pedido"}
        </Botao>
        <Mensagem resultado={resultado} />
      </form>
    </Acao>
  );
}

