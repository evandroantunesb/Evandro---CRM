"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, GrupoOpcoes, Mensagem } from "@/components/ui";
import { salvarEletroposto } from "@/lib/acoes/eletroposto";
import { CATALOGO_ELETROPOSTO, MODELOS_ELETROPOSTO, type ModeloEletroposto } from "@/lib/eletroposto";
import { formatarDataHora, formatarMoeda } from "@/lib/formatacao";

type SimNao = "sim" | "nao";
const OPCOES_SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
] as const;
const simNao = (v: boolean | null): SimNao | null => (v == null ? null : v ? "sim" : "nao");

/**
 * Aba Eletroposto da ficha: link da proposta (copiar, WhatsApp, abrir) e o que alimenta a proposta — modelos
 * (preços do catálogo, nunca somados) — e o que só o vendedor vê (local próprio e usina FV).
 */
export function EletropostoNegocio({
  negocioId,
  siteUrl,
  telefoneCliente,
  podeEditar,
  registro,
}: {
  negocioId: string;
  siteUrl: string;
  telefoneCliente: string | null;
  podeEditar: boolean;
  /** Nulo quando a criação não gravou os modelos: a tela pede para escolher de novo. */
  registro: {
    token: string;
    modelos: ModeloEletroposto[];
    precos: Partial<Record<ModeloEletroposto, number>>;
    localProprio: boolean;
    usinaFv: boolean;
    emitidaEm: string;
  } | null;
}) {
  const [resultado, acao, salvando] = useActionState(salvarEletroposto, null);
  const [modelos, setModelos] = useState<ModeloEletroposto[]>(registro?.modelos ?? []);
  const [localProprio, setLocalProprio] = useState<SimNao | null>(simNao(registro?.localProprio ?? null));
  const [usinaFv, setUsinaFv] = useState<SimNao | null>(simNao(registro?.usinaFv ?? null));
  const [copiado, setCopiado] = useState(false);

  function alternar(m: ModeloEletroposto) {
    setModelos((atuais) => (atuais.includes(m) ? atuais.filter((x) => x !== m) : MODELOS_ELETROPOSTO.filter((x) => x === m || atuais.includes(x))));
  }

  const link = registro ? `${siteUrl}/proposta/eletroposto/${registro.token}` : null;
  const telefone = telefoneCliente?.replace(/\D/g, "") ?? "";
  const destino = telefone.length >= 10 ? (telefone.startsWith("55") ? telefone : `55${telefone}`) : "";
  const linkWhatsapp = link ? `https://wa.me/${destino}?text=${encodeURIComponent(`Segue a proposta do eletroposto: ${link}`)}` : null;

  return (
    <div className="flex flex-col gap-6">
      {registro && link ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-texto-2">Link da proposta</span>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              aria-label="Link da proposta"
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto-2 outline-none md:min-h-10"
            />
            <Botao
              type="button"
              variante="secundario"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            >
              {copiado ? "Copiado!" : "Copiar"}
            </Botao>
            <a
              href={linkWhatsapp!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 md:min-h-9"
            >
              Enviar no WhatsApp
            </a>
            <a
              href={`/proposta/eletroposto/${registro.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linha bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:border-dourado md:min-h-9"
            >
              Abrir proposta
            </a>
          </div>
          <p className="text-xs text-texto-2">
            Proposta de {formatarDataHora(registro.emitidaEm)} · válida por 7 dias. Na proposta, o cliente imprime ou salva em PDF.
          </p>
        </div>
      ) : (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Os modelos do eletroposto ainda não foram salvos. Escolha abaixo e salve para gerar a proposta.
        </p>
      )}

      {podeEditar ? (
        <form action={acao} className="flex flex-col gap-5">
          <input type="hidden" name="negocioId" value={negocioId} />
          {modelos.map((m) => (
            <input key={m} type="hidden" name="modelos" value={m} />
          ))}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-texto-2">Modelos na proposta (cada um é uma alternativa; os preços não se somam)</span>
            <div role="group" aria-label="Modelos de eletroposto" className="grid gap-2 sm:grid-cols-3">
              {MODELOS_ELETROPOSTO.map((m) => {
                const marcado = modelos.includes(m);
                const preco = registro?.modelos.includes(m) ? (registro.precos[m] ?? CATALOGO_ELETROPOSTO[m].preco) : CATALOGO_ELETROPOSTO[m].preco;
                return (
                  <button
                    key={m}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => alternar(m)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 ease-raion outline-none focus-visible:ring-2 focus-visible:ring-dourado/60 ${
                      marcado ? "border-dourado bg-dourado/10" : "border-linha bg-superficie hover:border-texto-2"
                    }`}
                  >
                    <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${marcado ? "border-dourado bg-dourado text-carvao" : "border-linha"}`}>
                      {marcado && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-texto">{CATALOGO_ELETROPOSTO[m].nome}</span>
                      <span className="block text-xs text-texto-2 tabular-nums">{formatarMoeda(preco)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-texto-2">Tem local próprio para a instalação?</span>
              <GrupoOpcoes rotulo="Tem local próprio para a instalação?" opcoes={OPCOES_SIM_NAO} valor={localProprio} aoEscolher={setLocalProprio} name="local_proprio" />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-texto-2">Tem usina fotovoltaica para fornecer a energia?</span>
              <GrupoOpcoes rotulo="Tem usina fotovoltaica para fornecer a energia?" opcoes={OPCOES_SIM_NAO} valor={usinaFv} aoEscolher={setUsinaFv} name="usina_fv" />
            </div>
          </div>
          <p className="text-xs text-texto-2">Mudar os modelos atualiza a proposta no mesmo link, com nova data e os preços de catálogo de hoje.</p>
          <Mensagem resultado={resultado} />
          <Botao type="submit" disabled={salvando || !modelos.length || !localProprio || !usinaFv} className="self-start">
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </form>
      ) : (
        registro && (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-texto-2">Modelos</dt>
              <dd>{registro.modelos.map((m) => CATALOGO_ELETROPOSTO[m].nome).join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-texto-2">Local próprio</dt>
              <dd>{registro.localProprio ? "Sim" : "Não"}</dd>
            </div>
            <div>
              <dt className="text-texto-2">Usina FV</dt>
              <dd>{registro.usinaFv ? "Sim" : "Não"}</dd>
            </div>
          </dl>
        )
      )}
    </div>
  );
}
