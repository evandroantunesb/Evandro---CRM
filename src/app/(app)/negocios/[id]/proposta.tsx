"use client";

import { Eye } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { definirExibicaoProposta, gerarLinkProposta } from "@/lib/acoes/propostas";
import { formatarDataHora } from "@/lib/formatacao";
import { MODOS_PRECO, ROTULO_MODO_PRECO, type ModoPreco } from "@/lib/tipos";

export type PropostaSalva = {
  token: string;
  modoPreco: ModoPreco;
  mostrarSistema: boolean;
  mostrarEconomia: boolean;
  aberturas: number;
  ultimaAbertura: string | null;
};

export type ModeloDisponivel = { id: string; nome: string; padrao: boolean };

export function Proposta({
  negocioId,
  precoDesatualizado = false,
  bloqueio = null,
  proposta,
  siteUrl,
  modelos,
}: {
  negocioId: string;
  /** Valor do negócio diferente do preço do cálculo: a proposta mostra o preço antigo. */
  precoDesatualizado?: boolean;
  /** Mensagem do servidor para a proposta bloqueada (estimativa incompleta ou cálculo legado); nulo = liberada. */
  bloqueio?: string | null;
  proposta: PropostaSalva | null;
  siteUrl: string;
  modelos: ModeloDisponivel[];
}) {
  const [resultadoGerar, acaoGerar, gerando] = useActionState(gerarLinkProposta, null);
  const [resultadoExibicao, acaoExibicao] = useActionState(definirExibicaoProposta, null);
  const [copiado, setCopiado] = useState(false);

  if (!proposta) {
    const padrao = modelos.find((m) => m.padrao);
    return (
      <form action={acaoGerar} className="flex flex-col gap-3">
        <input type="hidden" name="negocioId" value={negocioId} />
        <p className="text-sm text-texto-2">Gere um link para enviar a proposta ao cliente, sem precisar de PDF.</p>
        {bloqueio ? <AvisoProposta mensagem={bloqueio} /> : precoDesatualizado && <AvisoPrecoDesatualizado />}
        {modelos.length > 0 && (
          <Selecao rotulo="Modelo de proposta" name="modeloId" defaultValue={padrao?.id ?? modelos[0]!.id}>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.padrao ? " (padrão)" : ""}
              </option>
            ))}
          </Selecao>
        )}
        <Mensagem resultado={resultadoGerar} />
        <Botao type="submit" disabled={gerando || !!bloqueio} className="self-start">
          {gerando ? "Gerando..." : "Gerar link da proposta"}
        </Botao>
      </form>
    );
  }

  const link = `${siteUrl}/proposta/${proposta.token}`;
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(`Segue a proposta: ${link}`)}`;

  return (
    <div className="flex flex-col gap-3">
      {bloqueio ? <AvisoProposta mensagem={bloqueio} jaEmitida /> : precoDesatualizado && <AvisoPrecoDesatualizado />}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-texto-2">Link da proposta</span>
        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto-2 outline-none"
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
          <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
            <Botao type="button">Enviar no WhatsApp</Botao>
          </a>
          {!bloqueio && (
            <a href={`/proposta/${proposta.token}/pdf`} target="_blank" rel="noopener noreferrer">
              <Botao type="button" variante="secundario">
                Baixar PDF
              </Botao>
            </a>
          )}
        </div>
      </div>

      <form action={acaoExibicao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
        <input type="hidden" name="negocioId" value={negocioId} />
        <Selecao rotulo="Como mostrar o preço" name="modoPreco" defaultValue={proposta.modoPreco}>
          {MODOS_PRECO.map((m) => (
            <option key={m} value={m}>
              {ROTULO_MODO_PRECO[m]}
            </option>
          ))}
        </Selecao>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-texto-2">Seções na proposta</span>
          <label className="flex items-center gap-2 text-sm text-texto-2">
            <input type="checkbox" name="mostrarSistema" defaultChecked={proposta.mostrarSistema} className="rounded border-linha" />
            O sistema (kit, potência, geração)
          </label>
          <label className="flex items-center gap-2 text-sm text-texto-2">
            <input type="checkbox" name="mostrarEconomia" defaultChecked={proposta.mostrarEconomia} className="rounded border-linha" />
            Sua economia (conta, economia, payback)
          </label>
        </div>
        <Botao type="submit" variante="secundario" className="self-start">
          Salvar
        </Botao>
        <Mensagem resultado={resultadoExibicao} />
      </form>

      {proposta.aberturas === 0 ? (
        <p className="text-sm text-texto-2">O cliente ainda não abriu o link.</p>
      ) : (
        <p className="flex items-center gap-2 text-[11px] text-texto-2">
          <span className="flex items-center gap-1" title="Vezes que o cliente abriu o link">
            <Eye size={12} /> {proposta.aberturas}
          </span>
          {proposta.ultimaAbertura && <span>última em {formatarDataHora(proposta.ultimaAbertura)}</span>}
        </p>
      )}
    </div>
  );
}

function AvisoProposta({ mensagem, jaEmitida = false }: { mensagem: string; jaEmitida?: boolean }) {
  return (
    <div role="status" data-testid="proposta-bloqueada" className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p>{mensagem}</p>
      {jaEmitida && (
        <p>
          O link já enviado ao cliente continua válido, mas informa que os valores desta proposta não estão disponíveis, e o PDF não é
          gerado.
        </p>
      )}
    </div>
  );
}

function AvisoPrecoDesatualizado() {
  return (
    <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      O valor do negócio mudou depois do cálculo: a proposta mostra o preço e o payback antigos. Use “Atualizar preço no cálculo”
      em Kit personalizado.
    </p>
  );
}
