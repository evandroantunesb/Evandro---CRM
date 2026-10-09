"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { tempoDesde } from "@/lib/formatacao";
import { aceitarHandoff, devolverHandoff } from "@/lib/acoes/negocios";
import { ROTULO_PRAZO_INSTALACAO_QUALIF, ROTULO_TIPO_CLIENTE_QUALIF, type PrazoInstalacaoQualif, type TipoClienteQualif } from "@/lib/tipos";

/**
 * Uma linha de oportunidades_pendentes_equipe (só as colunas autorizadas pela função). Sem textos
 * livres (título do negócio, objetivo, distribuidora, observações): quem decide aqui pode não ter
 * acesso à ficha do negócio.
 */
export type OportunidadePendente = {
  handoff_id: string;
  negocio_id: string;
  negocio_numero: number;
  contato_nome: string;
  contato_cidade: string | null;
  contato_uf: string | null;
  telefone_informado: boolean;
  sdr_nome: string | null;
  destinatario_nome: string | null;
  enviado_em: string;
  status_qualificacao: string;
  tipo_cliente: string | null;
  possui_conta_energia: boolean | null;
  imovel_proprio: boolean | null;
  prazo_instalacao: string | null;
  busca_financiamento: boolean | null;
  orcamento_outra_empresa: boolean | null;
  e_decisor: boolean | null;
  outro_decisor: boolean | null;
};

const simNao = (v: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "Não informado");

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className="text-sm text-zinc-800">{valor}</dd>
    </div>
  );
}

/**
 * Oportunidade aguardando aceite de um vendedor da equipe (gestor) ou da empresa (admin).
 * Aceitar/devolver usam as ações e as RPCs de sempre; o banco confere a permissão de novo.
 */
function Item({ o, agoraMs }: { o: OportunidadePendente; agoraMs: number }) {
  const [resultadoAceite, acaoAceitar, pendenteAceitar] = useActionState(aceitarHandoff, null);
  const [resultadoDevolucao, acaoDevolver, pendenteDevolver] = useActionState(devolverHandoff, null);
  const [devolvendo, setDevolvendo] = useState(false);
  const respondido = resultadoAceite?.ok || resultadoDevolucao?.ok;
  const local = [o.contato_cidade, o.contato_uf].filter(Boolean).join("/");

  return (
    <li className="flex flex-col gap-3 border-b border-zinc-100 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-zinc-900">Negócio #{o.negocio_numero}</span>
          <span className="text-sm text-zinc-600">
            {o.contato_nome}
            {local && ` · ${local}`}
          </span>
          <span className="text-xs text-zinc-500">
            {o.sdr_nome ?? "SDR"} → {o.destinatario_nome ?? "vendedor"} · aguardando {tempoDesde(o.enviado_em, agoraMs)}
          </span>
        </div>
        <Selo tom="atencao">{o.status_qualificacao}</Selo>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Info rotulo="Tipo de cliente" valor={o.tipo_cliente ? (ROTULO_TIPO_CLIENTE_QUALIF[o.tipo_cliente as TipoClienteQualif] ?? o.tipo_cliente) : "Não informado"} />
        <Info
          rotulo="Prazo para instalar"
          valor={o.prazo_instalacao ? (ROTULO_PRAZO_INSTALACAO_QUALIF[o.prazo_instalacao as PrazoInstalacaoQualif] ?? o.prazo_instalacao) : "Não informado"}
        />
        <Info rotulo="É o decisor?" valor={simNao(o.e_decisor)} />
        <Info rotulo="Outro decisor?" valor={simNao(o.outro_decisor)} />
        <Info rotulo="Telefone informado" valor={o.telefone_informado ? "Sim" : "Não"} />
        <Info rotulo="Conta de energia" valor={simNao(o.possui_conta_energia)} />
        <Info rotulo="Imóvel próprio" valor={simNao(o.imovel_proprio)} />
        <Info rotulo="Busca financiamento" valor={simNao(o.busca_financiamento)} />
        <Info rotulo="Orçamento de outra empresa" valor={simNao(o.orcamento_outra_empresa)} />
      </dl>

      {respondido ? (
        <Mensagem resultado={(resultadoAceite?.ok ? resultadoAceite : resultadoDevolucao)!} />
      ) : !devolvendo ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={acaoAceitar}>
            <input type="hidden" name="handoffId" value={o.handoff_id} />
            <input type="hidden" name="negocioId" value={o.negocio_id} />
            <Botao type="submit" variante="primario" disabled={pendenteAceitar}>
              Aceitar em nome de {o.destinatario_nome ?? "vendedor"}
            </Botao>
          </form>
          <Botao type="button" variante="secundario" onClick={() => setDevolvendo(true)}>
            Devolver
          </Botao>
          {resultadoAceite && <Mensagem resultado={resultadoAceite} />}
        </div>
      ) : (
        <form action={acaoDevolver} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
          <input type="hidden" name="handoffId" value={o.handoff_id} />
          <input type="hidden" name="negocioId" value={o.negocio_id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Motivo da devolução</span>
            <textarea name="motivo" rows={2} required className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Botao type="submit" variante="primario" disabled={pendenteDevolver}>
              Confirmar devolução
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setDevolvendo(false)}>
              Cancelar
            </Botao>
            {resultadoDevolucao && <Mensagem resultado={resultadoDevolucao} />}
          </div>
        </form>
      )}
    </li>
  );
}

export function OportunidadesPendentes({ itens, agoraMs }: { itens: OportunidadePendente[]; agoraMs: number }) {
  return (
    <ul className="flex flex-col">
      {itens.map((o) => (
        <Item key={o.handoff_id} o={o} agoraMs={agoraMs} />
      ))}
    </ul>
  );
}
