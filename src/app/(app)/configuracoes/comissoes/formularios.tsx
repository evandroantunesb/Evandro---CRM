"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import type { FaixaComissao } from "@/lib/comissoes";
import { formatarMoeda } from "@/lib/formatacao";
import type { MembroResumo } from "@/lib/crm";
import { ROTULO_TIPO_CALCULO_COMISSAO, TIPOS_CALCULO_COMISSAO, type TipoCalculoComissao } from "@/lib/tipos";
import { CabecalhoItemGf } from "../../gamificacao/_compartilhado/formulario-ui";
import { BadgeGf } from "../../gamificacao/_compartilhado/ui";
import { apagarVersaoPlano, calcularComissao, fecharComissao, salvarPlano } from "./actions";

export type VersaoPlano = {
  id: string;
  vigenciaInicio: string;
  salarioBase: number | null;
  metaOte: number | null;
  tipoCalculo: TipoCalculoComissao;
  faixas: FaixaComissao[];
};

type LinhaFaixa = { min: string; max: string; valor: string };

function paraLinhas(faixas: FaixaComissao[]): LinhaFaixa[] {
  if (!faixas.length) return [{ min: "", max: "", valor: "" }];
  return faixas.map((f) => ({
    min: String(f.resultado_minimo),
    max: f.resultado_maximo === null ? "" : String(f.resultado_maximo),
    valor: String(f.valor),
  }));
}

function formatarMesReferencia(dataIso: string) {
  return new Date(`${dataIso}T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Mês seguinte ao de `referencia` (ou o mês atual, se não houver nenhuma versão ainda), em "AAAA-MM". */
function proximoMes(referencia: string | undefined) {
  const base = referencia ? new Date(`${referencia}T00:00:00Z`) : new Date();
  const ano = referencia ? base.getUTCFullYear() : base.getFullYear();
  const mes = referencia ? base.getUTCMonth() : base.getMonth();
  const proximo = new Date(Date.UTC(ano, mes + (referencia ? 1 : 0), 1));
  return `${proximo.getUTCFullYear()}-${String(proximo.getUTCMonth() + 1).padStart(2, "0")}`;
}

function FaixasEditor({ faixasIniciais }: { faixasIniciais: FaixaComissao[] }) {
  const [linhas, setLinhas] = useState<LinhaFaixa[]>(() => paraLinhas(faixasIniciais));

  const json = JSON.stringify(
    linhas
      .filter((l) => l.min.trim() !== "" && l.valor.trim() !== "")
      .map((l) => ({
        resultado_minimo: Number(l.min),
        resultado_maximo: l.max.trim() === "" ? null : Number(l.max),
        valor: Number(l.valor),
      })),
  );

  function atualizar(i: number, campo: keyof LinhaFaixa, valor: string) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <legend className="px-1.5">Faixas de resultado</legend>
      {linhas.map((linha, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 @min-[560px]:grid-cols-[1fr_1fr_1fr_auto] @min-[560px]:items-end">
          <Campo
            rotulo="De (R$)"
            type="number"
            min={0}
            step="0.01"
            value={linha.min}
            onChange={(e) => atualizar(i, "min", e.target.value)}
          />
          <Campo
            rotulo="Até (vazio = sem teto)"
            type="number"
            min={0}
            step="0.01"
            value={linha.max}
            onChange={(e) => atualizar(i, "max", e.target.value)}
          />
          <Campo
            rotulo="Valor"
            type="number"
            min={0}
            step="0.01"
            value={linha.valor}
            onChange={(e) => atualizar(i, "valor", e.target.value)}
          />
          <button
            type="button"
            onClick={() => setLinhas((atual) => (atual.length > 1 ? atual.filter((_, idx) => idx !== i) : atual))}
            className="gf-botao-texto self-start"
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLinhas((atual) => [...atual, { min: "", max: "", valor: "" }])}
        className="gf-botao-texto gf-botao-texto-neutro self-start"
      >
        + Adicionar faixa
      </button>
      <input type="hidden" name="faixasJson" value={json} />
    </fieldset>
  );
}

/**
 * Sempre cria uma NOVA versão do plano (vigência mensal) — nunca edita uma versão existente em
 * lugar. Pré-preenche com os valores da versão mais recente só como ponto de partida; salvar
 * nunca sobrescreve essa versão.
 */
export function PlanoComissaoForm({ membro, versaoAtual }: { membro: MembroResumo; versaoAtual: VersaoPlano | null }) {
  const [resultado, acao, pendente] = useActionState(salvarPlano, null);
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculoComissao>(versaoAtual?.tipoCalculo ?? "percentual");

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="membroId" value={membro.id} />
      <CabecalhoItemGf titulo={membro.nome}>
        {versaoAtual ? (
          <BadgeGf tom="positivo">Plano vigente · {ROTULO_TIPO_CALCULO_COMISSAO[versaoAtual.tipoCalculo]}</BadgeGf>
        ) : (
          <BadgeGf tom="neutro">Sem plano</BadgeGf>
        )}
      </CabecalhoItemGf>
      <div className="grid gap-3 @min-[560px]:grid-cols-2 @min-[960px]:grid-cols-4">
        <Campo rotulo="Vigência a partir de" name="vigenciaMes" type="month" defaultValue={proximoMes(versaoAtual?.vigenciaInicio)} required />
        <Campo
          rotulo="Salário-base (R$, opcional)"
          name="salarioBase"
          type="number"
          min={0}
          step="0.01"
          defaultValue={versaoAtual?.salarioBase ?? undefined}
        />
        <Campo
          rotulo="Meta (OTE, R$, opcional)"
          name="metaOte"
          type="number"
          min={0}
          step="0.01"
          defaultValue={versaoAtual?.metaOte ?? undefined}
        />
        <Selecao
          rotulo="Tipo de cálculo"
          name="tipoCalculo"
          value={tipoCalculo}
          onChange={(e) => setTipoCalculo(e.target.value as TipoCalculoComissao)}
        >
          {TIPOS_CALCULO_COMISSAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CALCULO_COMISSAO[t]}
            </option>
          ))}
        </Selecao>
      </div>
      <FaixasEditor faixasIniciais={versaoAtual?.faixas ?? []} />
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar nova versão
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/** Histórico de versões do plano de um colaborador. Só a(s) ainda não vigente(s) pode(m) ser apagada(s). */
export function HistoricoVersoesPlano({
  versoes,
  versaoVigenteId,
  mesAtual,
}: {
  versoes: VersaoPlano[];
  versaoVigenteId: string | null;
  mesAtual: string;
}) {
  if (!versoes.length) return null;
  return (
    <details className="gf-t-aux text-sm">
      <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-md font-medium text-[var(--gf-texto)] select-none hover:text-[var(--gf-verde)]">
        Ver versões anteriores ({versoes.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {versoes.map((v) => {
          const futura = v.vigenciaInicio > mesAtual;
          const vigente = v.id === versaoVigenteId;
          return (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
              <span>
                Desde {formatarMesReferencia(v.vigenciaInicio)} ·{" "}
                {v.salarioBase !== null ? `${formatarMoeda(v.salarioBase)} + ` : ""}
                {ROTULO_TIPO_CALCULO_COMISSAO[v.tipoCalculo]}
                {vigente && (
                  <>
                    {" "}
                    <BadgeGf tom="positivo">Vigente</BadgeGf>
                  </>
                )}
              </span>
              {futura && (
                <form action={apagarVersaoPlano}>
                  <input type="hidden" name="id" value={v.id} />
                  <button type="submit" className="gf-botao-texto">
                    Apagar
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function CalcularComissaoForm({ membros }: { membros: MembroResumo[] }) {
  const [resultado, acao, pendente] = useActionState(calcularComissao, null);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
      <Selecao rotulo="Colaborador" name="membroId" defaultValue="">
        <option value="" disabled>
          Escolha
        </option>
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Mês" name="mes" type="month" required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={pendente} className="self-start">
          Calcular
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/** Fecha uma comissão `aberta`: congela o snapshot e bloqueia recálculo/edição. */
export function FecharComissaoForm({ comissaoId }: { comissaoId: string }) {
  const [resultado, acao, pendente] = useActionState(fecharComissao, null);

  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="id" value={comissaoId} />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Fechar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
