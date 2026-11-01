"use client";

import { useActionState, useEffect, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import { registrarPassoEngenharia } from "@/lib/acoes/engenharia";
import {
  ROTULO_ACAO_PASSO,
  ROTULO_STATUS_PASSO,
  proximaAcaoPasso,
  type PassoComRegistro,
  type PassoVM,
  type RegistroPassoVM,
  type StatusPasso,
} from "@/lib/engenharia-passos-regras";

// Sem verde (reservado ao WhatsApp); pendência em atenção, nunca vermelho (não é erro nem perda).
export const TOM_PASSO: Record<StatusPasso, "neutro" | "atencao"> = {
  a_fazer: "neutro",
  em_andamento: "neutro",
  concluido: "neutro",
  com_pendencia: "atencao",
  nao_se_aplica: "neutro",
};

const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Topo do card: onde a obra está, a próxima ação, as pendências, quem responde e o prazo interno. Abaixo, os oito
 * passos com o status de cada um; tocar leva à seção do passo (navegação livre, nenhum passo trava a consulta).
 */
export function ResumoPassos({
  passos,
  atual,
  responsavel,
  prazo,
}: {
  passos: PassoVM[];
  atual: PassoVM | null;
  responsavel: string | null;
  prazo: { texto: string; tom: "neutro" | "atencao" | "negativo" } | null;
}) {
  const pendencias = passos.filter((p) => p.status === "com_pendencia");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {atual ? (
          <>
            <p className="text-sm text-zinc-600">
              Etapa {atual.numero} de 8 · {atual.titulo}
            </p>
            <p className="text-lg font-semibold text-texto">{proximaAcaoPasso(atual)}</p>
            {atual.detalhe && <p className="text-sm text-zinc-600">{atual.detalhe}</p>}
          </>
        ) : (
          <p className="text-lg font-semibold text-texto">Todos os passos concluídos</p>
        )}
        <p className="text-sm text-zinc-600">
          Responsável: {responsavel ?? "não definido"}
          {prazo && (
            <>
              {" · "}
              <Selo tom={prazo.tom}>{prazo.texto}</Selo>
            </>
          )}
        </p>
        {pendencias.length > 0 && (
          <p className="text-sm text-zinc-700">
            {pendencias.length === 1 ? "1 pendência" : `${pendencias.length} pendências`}:{" "}
            {pendencias.map((p) => `${p.titulo}${p.detalhe ? ` (${p.detalhe})` : ""}`).join("; ")}
          </p>
        )}
      </div>
      <nav aria-label="Passos da Engenharia">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {passos.map((p) => (
            <li key={p.numero}>
              <a
                href={`#passo-${p.numero}`}
                aria-current={atual?.numero === p.numero ? "step" : undefined}
                className={`flex h-full flex-col gap-1 rounded-lg border px-3 py-2 text-sm hover:border-dourado ${
                  atual?.numero === p.numero ? "border-dourado bg-dourado/10" : "border-linha"
                }`}
              >
                <span className="font-medium text-texto">
                  {p.numero}. {p.titulo}
                </span>
                <span>
                  <Selo tom={TOM_PASSO[p.status]}>{ROTULO_STATUS_PASSO[p.status]}</Selo>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

/**
 * Registro formal de um passo sem fato próprio (2, 3, 5 e 7): quem registrou por último e os botões que a RPC aceita.
 * Reabrir e "não se aplica" pedem motivo.
 */
export function RegistroPasso({
  obraId,
  passo,
  registro,
  acoes,
}: {
  obraId: string;
  passo: PassoComRegistro;
  registro: RegistroPassoVM | undefined;
  acoes: { confirmar: boolean; reabrir: boolean; naoSeAplica: boolean; bloqueio: string | null };
}) {
  const [comMotivo, setComMotivo] = useState<"reaberto" | "nao_se_aplica" | null>(null);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {registro ? (
        <p className="text-zinc-700">
          {ROTULO_ACAO_PASSO[registro.acao]} em {dataHora(registro.quando)}
          {registro.autor ? ` por ${registro.autor}` : ""}
          {registro.observacao ? ` · ${registro.observacao}` : ""}
        </p>
      ) : (
        <p className="text-zinc-500">Ainda não registrado.</p>
      )}
      {acoes.bloqueio && <p className="text-zinc-600">{acoes.bloqueio}</p>}
      {comMotivo ? (
        <FormPasso obraId={obraId} passo={passo} acao={comMotivo} fechar={() => setComMotivo(null)} />
      ) : (
        (acoes.confirmar || acoes.reabrir || acoes.naoSeAplica) && (
          <div className="flex flex-wrap items-start gap-2">
            {acoes.confirmar && <FormPasso obraId={obraId} passo={passo} acao="confirmado" />}
            {acoes.naoSeAplica && (
              <Botao type="button" variante="secundario" onClick={() => setComMotivo("nao_se_aplica")}>
                Não se aplica
              </Botao>
            )}
            {acoes.reabrir && (
              <Botao type="button" variante="secundario" onClick={() => setComMotivo("reaberto")}>
                Reabrir
              </Botao>
            )}
          </div>
        )
      )}
    </div>
  );
}

const ROTULO_BOTAO: Record<PassoComRegistro, string> = {
  2: "Concluir enquadramento",
  3: "Concluir conferência",
  5: "Concluir revisão",
  7: "Registrar condições",
};

function FormPasso({ obraId, passo, acao, fechar }: { obraId: string; passo: PassoComRegistro; acao: "confirmado" | "reaberto" | "nao_se_aplica"; fechar?: () => void }) {
  const [resultado, enviar, pendente] = useActionState(registrarPassoEngenharia, null);
  useEffect(() => {
    if (resultado?.ok) fechar?.();
  }, [resultado, fechar]);
  const motivo = acao !== "confirmado";
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="passo" value={passo} />
      <input type="hidden" name="acao" value={acao} />
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        {motivo ? (acao === "reaberto" ? "Por que reabrir?" : "Por que não se aplica?") : "Observação (opcional)"}
        <input name="observacao" required={motivo} minLength={3} maxLength={500} className={CLASSE_ENTRADA} autoFocus={motivo} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante={motivo ? "secundario" : "primario"} disabled={pendente}>
          {acao === "confirmado" ? ROTULO_BOTAO[passo] : acao === "reaberto" ? "Reabrir passo" : "Confirmar"}
        </Botao>
        {fechar && (
          <Botao type="button" variante="secundario" onClick={fechar}>
            Cancelar
          </Botao>
        )}
        {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
      </div>
    </form>
  );
}
