"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import {
  alterarStatusFluxoObra,
  atribuirParticipanteObra,
  atualizarMarcoObra,
  definirAguardandoFluxoObra,
  definirFixacaoObra,
  encerrarParticipanteObra,
  marcarParadoFluxoObra,
} from "@/lib/acoes/obras";
import type { FixacaoObraVM, MarcoDetalheVM, ParticipanteGestaoVM, SetorDetalheVM, SetorGestaoVM } from "@/lib/obras/detalhe";
import { FUNCOES_OPERACIONAIS } from "@/lib/obras/gestao";
import { AGUARDANDO_OBRA, ROTULO_FUNCAO_PARTICIPANTE, ROTULO_SETOR, STATUS_POR_SETOR, rotuloAguardando, rotuloStatus } from "@/lib/obras/rotulos";

/**
 * Controles do modo Gestão. Só aparecem para quem o servidor marcou como autorizado (espelho de
 * `autorizacao_setor_obra`); cada envio passa pela RPC, que é quem decide. Depois de um envio bem
 * sucedido a ação revalida a página e os dados voltam do servidor.
 */

const CAMPO_TEXTO =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20";

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{titulo}</p>
      {children}
    </div>
  );
}

/** Painel recolhível com as ações de um setor. */
export function GestaoSetor({ obraId, setor, gestao }: { obraId: string; setor: SetorDetalheVM; gestao: SetorGestaoVM }) {
  const { alterarFluxo, gerirParticipantes } = gestao.permissoes;
  if (!alterarFluxo && !gerirParticipantes) return null;
  return (
    <details className="group w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/60 text-sm [&_select]:w-full [&_select]:min-w-0">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-zinc-800 select-none group-open:border-b group-open:border-zinc-200">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> Atualizar {ROTULO_SETOR[setor.setor]}
      </summary>
      <div className="flex flex-col gap-3 p-3">
        {alterarFluxo && (
          <>
            <FormStatus obraId={obraId} setor={setor} />
            <FormParado obraId={obraId} setor={setor} />
            <FormAguardando obraId={obraId} setor={setor} aguardandoCodigo={gestao.aguardandoCodigo} />
          </>
        )}
        {gerirParticipantes && <GestaoParticipantes obraId={obraId} gestao={gestao} />}
      </div>
    </details>
  );
}

function FormStatus({ obraId, setor }: { obraId: string; setor: SetorDetalheVM }) {
  const [resultado, acao, pendente] = useActionState(alterarStatusFluxoObra, null);
  const enviar = useEnvioSemReset(acao);
  const opcoes = STATUS_POR_SETOR[setor.setor];
  const [escolhido, setEscolhido] = useState(setor.status ?? "");
  const [confirmando, setConfirmando] = useState(false);
  // O status do servidor mudou (salvo aqui ou por outra pessoa): a escolha local volta a ele.
  const [statusBase, setStatusBase] = useState(setor.status);
  if (statusBase !== setor.status) {
    setStatusBase(setor.status);
    setEscolhido(setor.status ?? "");
    setConfirmando(false);
  }
  // Volta a uma etapa anterior: permitido e auditado pelo banco, mas pede um segundo clique.
  const retrocesso = setor.status != null && opcoes.indexOf(escolhido) < opcoes.indexOf(setor.status);
  const mudou = escolhido !== "" && escolhido !== setor.status;

  return (
    <Bloco titulo="Status do setor">
      <form onSubmit={enviar} className="flex flex-col gap-2">
        <input type="hidden" name="obraId" value={obraId} />
        <input type="hidden" name="setor" value={setor.setor} />
        <Selecao
          name="status"
          aria-label={`Status de ${ROTULO_SETOR[setor.setor]}`}
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            setConfirmando(false);
          }}
        >
          {setor.status == null && <option value="">Selecione</option>}
          {opcoes.map((s) => (
            <option key={s} value={s}>
              {rotuloStatus(setor.setor, s)}
              {s === setor.status ? " (atual)" : ""}
            </option>
          ))}
        </Selecao>
        {retrocesso && mudou && !confirmando ? (
          <div className="flex flex-col gap-2 rounded-md bg-amber-50 p-2 text-amber-900">
            <p>Isso volta o setor para uma etapa anterior. A mudança fica registrada no histórico.</p>
            <Botao type="button" variante="secundario" onClick={() => setConfirmando(true)}>
              Entendi, quero voltar
            </Botao>
          </div>
        ) : (
          <Botao type="submit" variante="secundario" disabled={!mudou || pendente}>
            {pendente ? "Salvando..." : "Salvar status"}
          </Botao>
        )}
      </form>
      <Mensagem resultado={resultado} />
    </Bloco>
  );
}

function FormParado({ obraId, setor }: { obraId: string; setor: SetorDetalheVM }) {
  const [resultado, acao, pendente] = useActionState(marcarParadoFluxoObra, null);
  const enviar = useEnvioSemReset(acao);
  const parado = setor.estado === "parado" || setor.paradoMotivo != null;

  return (
    <Bloco titulo="Parada">
      {parado ? (
        <div className="flex flex-col gap-2">
          {setor.paradoMotivo && <p className="text-zinc-700">Motivo atual: {setor.paradoMotivo}</p>}
          <form onSubmit={enviar} className="flex flex-col gap-2">
            <input type="hidden" name="obraId" value={obraId} />
            <input type="hidden" name="setor" value={setor.setor} />
            <input type="hidden" name="parado" value="true" />
            <textarea name="motivo" required maxLength={1000} rows={2} defaultValue={setor.paradoMotivo ?? ""} aria-label="Motivo da parada" className={CAMPO_TEXTO} />
            <Botao type="submit" variante="secundario" disabled={pendente}>
              Atualizar motivo
            </Botao>
          </form>
          <form onSubmit={enviar}>
            <input type="hidden" name="obraId" value={obraId} />
            <input type="hidden" name="setor" value={setor.setor} />
            <input type="hidden" name="parado" value="false" />
            <Botao type="submit" disabled={pendente} className="w-full">
              Retomar setor
            </Botao>
          </form>
        </div>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-2">
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="setor" value={setor.setor} />
          <input type="hidden" name="parado" value="true" />
          <textarea
            name="motivo"
            required
            maxLength={1000}
            rows={2}
            placeholder="Por que o setor parou? (obrigatório)"
            aria-label="Motivo da parada"
            className={CAMPO_TEXTO}
          />
          <Botao type="submit" variante="secundario" disabled={pendente}>
            Marcar como parado
          </Botao>
        </form>
      )}
      <Mensagem resultado={resultado} />
    </Bloco>
  );
}

function FormAguardando({ obraId, setor, aguardandoCodigo }: { obraId: string; setor: SetorDetalheVM; aguardandoCodigo: string | null }) {
  const [resultado, acao, pendente] = useActionState(definirAguardandoFluxoObra, null);
  const enviar = useEnvioSemReset(acao);
  const [escolhido, setEscolhido] = useState(aguardandoCodigo ?? "");
  const [base, setBase] = useState(aguardandoCodigo);
  if (base !== aguardandoCodigo) {
    setBase(aguardandoCodigo);
    setEscolhido(aguardandoCodigo ?? "");
  }

  return (
    <Bloco titulo="Aguardando terceiros">
      <form onSubmit={enviar} className="flex flex-col gap-2">
        <input type="hidden" name="obraId" value={obraId} />
        <input type="hidden" name="setor" value={setor.setor} />
        <Selecao name="aguardando" aria-label="Aguardando quem" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
          <option value="">Ninguém</option>
          {AGUARDANDO_OBRA.map((a) => (
            <option key={a} value={a}>
              {rotuloAguardando(a)}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario" disabled={pendente || escolhido === (aguardandoCodigo ?? "")}>
          {pendente ? "Salvando..." : "Salvar pendência"}
        </Botao>
      </form>
      <Mensagem resultado={resultado} />
    </Bloco>
  );
}

function GestaoParticipantes({ obraId, gestao }: { obraId: string; gestao: SetorGestaoVM }) {
  return (
    <Bloco titulo="Participantes">
      {gestao.participantes.length === 0 ? (
        <p className="text-zinc-500">Nenhum participante ativo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {gestao.participantes.map((p) => (
            <ItemParticipante key={p.participanteId} obraId={obraId} participante={p} />
          ))}
        </ul>
      )}
      <FormAtribuir obraId={obraId} gestao={gestao} />
    </Bloco>
  );
}

function ItemParticipante({ obraId, participante }: { obraId: string; participante: ParticipanteGestaoVM }) {
  const [resultado, acao, pendente] = useActionState(encerrarParticipanteObra, null);
  const enviar = useEnvioSemReset(acao);
  const [encerrando, setEncerrando] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-zinc-900">
          {participante.nome}{" "}
          <span className="text-xs text-zinc-500">· {participante.principal ? `${participante.funcaoRotulo} principal` : participante.funcaoRotulo}</span>
        </span>
        {participante.proprio ? (
          <span className="text-xs text-zinc-500">Você</span>
        ) : (
          !encerrando && (
            <button type="button" onClick={() => setEncerrando(true)} className="text-xs text-zinc-600 underline hover:text-zinc-900">
              Encerrar participação
            </button>
          )
        )}
      </div>
      {encerrando && (
        <form onSubmit={enviar} className="flex flex-col gap-2">
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="participanteId" value={participante.participanteId} />
          <textarea name="motivo" required maxLength={1000} rows={2} placeholder="Motivo do encerramento (obrigatório)" aria-label="Motivo do encerramento" className={CAMPO_TEXTO} />
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" variante="perigo" disabled={pendente}>
              {pendente ? "Encerrando..." : `Confirmar encerramento de ${participante.nome}`}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setEncerrando(false)} disabled={pendente}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
      <Mensagem resultado={resultado} />
    </li>
  );
}

function FormAtribuir({ obraId, gestao }: { obraId: string; gestao: SetorGestaoVM }) {
  const [resultado, acao, pendente] = useActionState(atribuirParticipanteObra, null);
  const enviar = useEnvioSemReset(acao);
  const [aberto, setAberto] = useState(false);
  const [funcao, setFuncao] = useState<string>("apoio");
  const [principal, setPrincipal] = useState(false);
  const principalAtual = gestao.participantes.find((p) => p.principal);
  // Já há responsável principal: entrar outro como principal é uma substituição (a RPC exige o id).
  const substituindo = principal && principalAtual ? principalAtual : null;

  if (!aberto) {
    return (
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)}>
        Adicionar participante
      </Botao>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="setor" value={gestao.setor} />
      <input type="hidden" name="principal" value={principal ? "true" : "false"} />
      <input type="hidden" name="substituiId" value={substituindo?.participanteId ?? ""} />
      {gestao.candidatos.length === 0 ? (
        <p className="text-zinc-500">Nenhum colaborador de Operação com este setor. O admin define os setores em Configurações.</p>
      ) : (
        <Selecao name="membroId" rotulo="Colaborador" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {gestao.candidatos.map((c) => (
            <option key={c.membroId} value={c.membroId}>
              {c.nome}
              {c.detalhe ? ` · ${c.detalhe}` : ""}
            </option>
          ))}
        </Selecao>
      )}
      {!gestao.candidatosVerificados && (
        <p className="text-xs text-zinc-500">
          A lista mostra os colaboradores ativos. Só entra quem tem o papel Operação neste setor e não é coordenador; o sistema avisa se não for possível.
        </p>
      )}
      <Selecao
        name="funcao"
        rotulo="Função"
        value={funcao}
        onChange={(e) => {
          setFuncao(e.target.value);
          if (e.target.value !== "responsavel") setPrincipal(false);
        }}
      >
        {FUNCOES_OPERACIONAIS.map((f) => (
          <option key={f} value={f}>
            {ROTULO_FUNCAO_PARTICIPANTE[f]}
          </option>
        ))}
      </Selecao>
      {funcao === "responsavel" && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
          Responsável principal do setor
        </label>
      )}
      {substituindo && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-900">
          {substituindo.nome} deixa de ser o responsável principal: a participação dele é encerrada e substituída por esta.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" disabled={pendente || gestao.candidatos.length === 0}>
          {pendente ? "Salvando..." : substituindo ? "Confirmar substituição" : "Atribuir"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}

const STATUS_MARCO = ["pendente", "concluido", "nao_se_aplica"] as const;
const ROTULO_STATUS_MARCO: Record<(typeof STATUS_MARCO)[number], string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  nao_se_aplica: "Não se aplica",
};

/** Atualização de um marco (NF do cliente, garantia): admin e quem atua no setor Operacional. */
export function GestaoMarco({ obraId, marco }: { obraId: string; marco: MarcoDetalheVM }) {
  const [resultado, acao, pendente] = useActionState(atualizarMarcoObra, null);
  const enviar = useEnvioSemReset(acao);
  const [status, setStatus] = useState(marco.status ?? "pendente");
  const [base, setBase] = useState(marco.status);
  if (base !== marco.status) {
    setBase(marco.status);
    setStatus(marco.status ?? "pendente");
  }
  const mudou = status !== marco.status || status === "nao_se_aplica";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50/60 p-2 text-sm">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="marco" value={marco.marco} />
      <div className="flex flex-wrap items-center gap-2">
        <Selecao name="status" aria-label={`Status de ${marco.rotulo}`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_MARCO.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_MARCO[s]}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario" disabled={pendente || !mudou}>
          {pendente ? "Salvando..." : "Salvar"}
        </Botao>
      </div>
      {status === "nao_se_aplica" && (
        <textarea
          name="motivo"
          required
          maxLength={1000}
          rows={2}
          defaultValue={marco.motivo ?? ""}
          placeholder="Por que não se aplica? (obrigatório)"
          aria-label={`Motivo de ${marco.rotulo} não se aplicar`}
          className={CAMPO_TEXTO}
        />
      )}
      <Mensagem resultado={resultado} />
    </form>
  );
}

/** Escolha da fixação do telhado (Engenharia, Compras ou Operacional). Sem opções, aponta para Configurações. */
export function GestaoFixacao({ obraId, fixacao, podeConfigurar }: { obraId: string; fixacao: FixacaoObraVM; podeConfigurar: boolean }) {
  const [resultado, acao, pendente] = useActionState(definirFixacaoObra, null);
  const enviar = useEnvioSemReset(acao);
  const atualId = fixacao.atual?.id ?? "";
  const [escolhido, setEscolhido] = useState(atualId);
  const [base, setBase] = useState(atualId);
  if (base !== atualId) {
    setBase(atualId);
    setEscolhido(atualId);
  }

  if (fixacao.opcoes.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        A empresa ainda não cadastrou os tipos de fixação.{" "}
        {podeConfigurar ? (
          <Link href="/configuracoes/fixacoes" className="font-medium text-dourado-texto underline-offset-2 hover:underline">
            Cadastrar em Configurações
          </Link>
        ) : (
          "Peça ao admin para cadastrar em Configurações."
        )}
      </p>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
      <form onSubmit={enviar} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="obraId" value={obraId} />
        {/* O select mede pela opção mais longa: sem w-full/min-w-0 ele estoura a largura do celular. */}
        <div className="w-full min-w-0 sm:w-72 [&_select]:w-full [&_select]:min-w-0">
          <Selecao name="fixacaoId" aria-label="Tipo de fixação" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
            <option value="">Não definida</option>
            {fixacao.opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </div>
        <Botao type="submit" variante="secundario" disabled={pendente || escolhido === atualId}>
          {pendente ? "Salvando..." : "Salvar fixação"}
        </Botao>
      </form>
      <Mensagem resultado={resultado} />
    </div>
  );
}
