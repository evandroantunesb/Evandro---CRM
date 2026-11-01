"use client";

import { useActionState, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { salvarEnquadramentoEngenharia } from "@/lib/acoes/engenharia";
import { PERGUNTAS_ENQUADRAMENTO, rotuloResposta, type EnquadramentoVM } from "@/lib/engenharia-enquadramento-regras";

const numero = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Ficha de enquadramento da obra (passo 2). Quem atua na Engenharia preenche e salva; ao salvar, o checklist já
 * aplicado se ajusta (entram os itens que passaram a valer; os que deixaram de valer, se ainda pendentes, viram "não se
 * aplica"). Os demais só leem. Os dados do kit ficam ao lado para conferir a potência.
 */
export function EnquadramentoEngenharia({
  obraId,
  enquadramento,
  podeEditar,
  kit,
}: {
  obraId: string;
  enquadramento: EnquadramentoVM | null;
  podeEditar: boolean;
  kit: { potenciaKwp: number | null; inversores: string | null };
}) {
  const [resultado, acao, pendente] = useActionState(salvarEnquadramentoEngenharia, null);
  const [ambiental, setAmbiental] = useState(enquadramento?.respostas.situacao_ambiental ?? "");

  if (!podeEditar) {
    if (!enquadramento) return <p className="text-sm text-zinc-500">Enquadramento ainda não preenchido.</p>;
    return (
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {PERGUNTAS_ENQUADRAMENTO.map((p) => {
          const r = enquadramento.respostas[p.chave];
          return (
            <div key={p.chave}>
              <dt className="text-xs text-zinc-500">{p.rotulo}</dt>
              <dd className="text-zinc-900">{r ? rotuloResposta(p.chave, r) : "—"}</dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="obraId" value={obraId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PERGUNTAS_ENQUADRAMENTO.map((p) => (
          <label key={p.chave} className="flex flex-col gap-1 text-xs text-zinc-600">
            {p.rotulo}
            <select
              name={p.chave}
              defaultValue={enquadramento?.respostas[p.chave] ?? ""}
              onChange={p.chave === "situacao_ambiental" ? (e) => setAmbiental(e.target.value) : undefined}
              className={CLASSE_ENTRADA}
            >
              <option value="">Sem resposta</option>
              {p.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {ambiental === "nao_aplicavel" && (
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Por que a questão ambiental não se aplica?
          <input
            name="justificativaAmbiental"
            required
            minLength={3}
            maxLength={500}
            defaultValue={enquadramento?.justificativaAmbiental ?? ""}
            className={CLASSE_ENTRADA}
          />
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Potência dos módulos (kWp)
          <input name="potenciaModulosKwp" inputMode="decimal" defaultValue={numero(enquadramento?.potenciaModulosKwp ?? null)} className={CLASSE_ENTRADA} />
          {kit.potenciaKwp != null && <span className="text-zinc-500">No kit da venda: {numero(kit.potenciaKwp)} kWp</span>}
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Potência dos inversores (kW)
          <input name="potenciaInversoresKw" inputMode="decimal" defaultValue={numero(enquadramento?.potenciaInversoresKw ?? null)} className={CLASSE_ENTRADA} />
          {kit.inversores && <span className="text-zinc-500">No kit da venda: {kit.inversores}</span>}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar enquadramento
        </Botao>
        <Mensagem resultado={resultado} />
        {enquadramento && (
          <span className="text-xs text-zinc-500">
            Salvo em {dataHora(enquadramento.atualizadoEm)}
            {enquadramento.atualizadoPor ? ` por ${enquadramento.atualizadoPor}` : ""}
          </span>
        )}
      </div>
    </form>
  );
}
