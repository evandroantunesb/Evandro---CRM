"use client";

import { useActionState, useState, useTransition } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { agendarInstalacao, sugerirTerminoInstalacao } from "@/lib/acoes/agenda";
import { alterarStatusFluxoObra } from "@/lib/acoes/obras";
import type { EquipeInstalacao, HistoricoInstalacao, InstalacaoObra } from "@/lib/obras/agenda";

/**
 * Cartão "Instalação" no setor Operacional da obra (prévia aprovada em 18/11/2026): agendar com equipe do cadastro ou
 * digitada, término sugerido de 3 dias úteis, reagendar com motivo, trocar equipe, previsto × real e histórico. O banco
 * confere permissão, status, Solo e motivo (`agendar_instalacao_obra`).
 */

const OUTRA = "__outra__";
const entrada = "w-full min-w-0 rounded-lg border border-linha bg-superficie px-3 py-2 text-sm";
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dataCurta(d: string | null) {
  if (!d) return "—";
  const x = new Date(`${d}T12:00:00Z`);
  return `${SEMANA[x.getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function textoHistorico(h: HistoricoInstalacao): string {
  const d = h.dados as Record<string, string | undefined>;
  const periodo = (i?: string, t?: string) => (i && t ? `${dataCurta(i)} a ${dataCurta(t)}` : "");
  switch (d.acao) {
    case "agendada":
      return `${h.autor} agendou: ${d.equipe}, ${periodo(d.inicio, d.termino)}`;
    case "reagendada":
      return `${h.autor} reagendou de ${periodo(d.inicio_antes, d.termino_antes)} para ${periodo(d.inicio, d.termino)} — “${d.motivo ?? ""}”`;
    case "equipe_trocada":
      return `${h.autor} trocou a equipe: ${d.equipe_antes} → ${d.equipe}`;
    default:
      return `${h.autor} mudou a observação para a equipe`;
  }
}

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function InstalacaoObraCartao({
  obraId,
  status,
  podeAgendar,
  instalacao,
  equipes,
  real,
  historico,
}: {
  obraId: string;
  status: string | null;
  podeAgendar: boolean;
  instalacao: InstalacaoObra | null;
  equipes: EquipeInstalacao[];
  real: { inicio: string | null; fim: string | null };
  historico: HistoricoInstalacao[];
}) {
  const [editando, setEditando] = useState(false);
  const statusAgendavel = status === "liberada_agendamento" || status === "agendada";

  if (!instalacao) {
    if (!podeAgendar) return null;
    if (!statusAgendavel) {
      return <p className="text-xs text-texto-2">A instalação é agendada quando o Operacional estiver em “Liberada para agendamento”.</p>;
    }
    return <FormularioAgendamento obraId={obraId} equipes={equipes} instalacao={null} aoConcluir={() => undefined} />;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-medium text-texto">Instalação · {instalacao.equipeNome}</p>
        {instalacao.equipeTelefone && <p className="text-xs text-texto-2">{instalacao.equipeTelefone}</p>}
        {instalacao.observacao && <p className="mt-1 text-xs text-texto-2">Observação: {instalacao.observacao}</p>}
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 text-xs">
        <span />
        <span className="text-texto-2">Previsto</span>
        <span className="text-texto-2">Real</span>
        <span className="font-medium">Início</span>
        <span>{dataCurta(instalacao.inicio)}</span>
        <span>{dataCurta(real.inicio)}</span>
        <span className="font-medium">Término</span>
        <span>{dataCurta(instalacao.termino)}</span>
        <span>{dataCurta(real.fim)}</span>
      </div>
      {podeAgendar && !editando && (
        <div className="flex flex-wrap gap-2">
          {status === "agendada" && <MudarStatus obraId={obraId} status="em_instalacao" rotulo="Iniciar instalação" />}
          {status === "em_instalacao" && <MudarStatus obraId={obraId} status="instalacao_concluida" rotulo="Concluir instalação" />}
          {statusAgendavel && (
            <Botao type="button" variante="secundario" onClick={() => setEditando(true)}>
              Reagendar ou trocar equipe
            </Botao>
          )}
        </div>
      )}
      {editando && <FormularioAgendamento obraId={obraId} equipes={equipes} instalacao={instalacao} aoConcluir={() => setEditando(false)} />}
      {historico.length > 0 && (
        <ul className="border-t border-linha pt-2 text-xs leading-relaxed text-texto-2">
          {historico.map((h, i) => (
            <li key={i}>
              <span className="font-medium text-texto">{quando(h.quando)}</span> · {textoHistorico(h)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MudarStatus({ obraId, status, rotulo }: { obraId: string; status: string; rotulo: string }) {
  const [resultado, acao, pendente] = useActionState(alterarStatusFluxoObra, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="setor" value="operacional" />
      <input type="hidden" name="status" value={status} />
      <Botao type="submit" disabled={pendente}>
        {rotulo}
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

function FormularioAgendamento({
  obraId,
  equipes,
  instalacao,
  aoConcluir,
}: {
  obraId: string;
  equipes: EquipeInstalacao[];
  instalacao: InstalacaoObra | null;
  aoConcluir: () => void;
}) {
  const [resultado, acao, pendente] = useActionState(async (anterior: Parameters<typeof agendarInstalacao>[0], fd: FormData) => {
    const r = await agendarInstalacao(anterior, fd);
    if (r?.ok) aoConcluir();
    return r;
  }, null);
  // Equipe inativa continua escolhível só na obra em que já está.
  const opcoes = equipes.filter((e) => e.ativa || e.id === instalacao?.equipeId);
  const [equipe, setEquipe] = useState(instalacao ? (instalacao.equipeId ?? OUTRA) : (opcoes[0]?.id ?? OUTRA));
  const [inicio, setInicio] = useState(instalacao?.inicio ?? "");
  const [termino, setTermino] = useState(instalacao?.termino ?? "");
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [calculando, iniciar] = useTransition();
  const mudouDatas = Boolean(instalacao) && (inicio !== instalacao?.inicio || termino !== instalacao?.termino);

  function aoMudarInicio(valor: string) {
    setInicio(valor);
    if (!valor) return;
    iniciar(async () => {
      const t = await sugerirTerminoInstalacao(valor);
      setSugestao(t);
      if (t) setTermino(t);
    });
  }

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-xl border border-linha p-3 text-sm">
      <input type="hidden" name="obraId" value={obraId} />
      <label className="flex flex-col gap-1">
        <span className="font-medium">Equipe</span>
        <select name="equipeId" value={equipe === OUTRA ? "" : equipe} onChange={(e) => setEquipe(e.target.value || OUTRA)} className={entrada}>
          {opcoes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
              {e.telefone ? ` · ${e.telefone}` : ""}
            </option>
          ))}
          <option value="">✎ Outra equipe (digitar, só para esta obra)</option>
        </select>
      </label>
      {equipe === OUTRA && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input name="equipeNome" defaultValue={instalacao && !instalacao.equipeId ? instalacao.equipeNome : ""} placeholder="Nome da equipe" aria-label="Nome da equipe" className={entrada} required minLength={2} maxLength={80} />
          <input name="equipeTelefone" defaultValue={instalacao && !instalacao.equipeId ? (instalacao.equipeTelefone ?? "") : ""} placeholder="Telefone (opcional)" aria-label="Telefone da equipe" className={entrada} maxLength={30} inputMode="tel" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Início</span>
          <input type="date" name="inicio" value={inicio} onChange={(e) => aoMudarInicio(e.target.value)} className={entrada} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Término previsto</span>
          <input type="date" name="termino" value={termino} min={inicio || undefined} onChange={(e) => setTermino(e.target.value)} className={entrada} required />
        </label>
      </div>
      <p className="text-xs text-texto-2">
        {calculando
          ? "Calculando o término sugerido…"
          : sugestao
            ? `Sugestão: 3 dias úteis contando o início, até ${dataCurta(sugestao)} (pula fim de semana e feriados). Pode encurtar ou alongar.`
            : "Ao escolher o início, o término é sugerido com 3 dias úteis, pulando fim de semana e feriados."}
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Observação para a equipe (opcional)</span>
        <input name="observacao" defaultValue={instalacao?.observacao ?? ""} placeholder="Ex.: telhado de fibrocimento, levar escada de 8 m" className={entrada} maxLength={500} />
      </label>
      {mudouDatas && (
        <label className="flex flex-col gap-1">
          <span className="font-medium">Motivo do reagendamento</span>
          <input name="motivo" className={entrada} required minLength={3} maxLength={300} placeholder="Ex.: chuva prevista" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente || calculando}>
          {instalacao ? "Salvar" : "Agendar instalação"}
        </Botao>
        {instalacao && (
          <Botao type="button" variante="secundario" onClick={aoConcluir}>
            Cancelar
          </Botao>
        )}
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
