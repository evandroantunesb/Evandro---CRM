"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import { alterarItemEngenharia, aplicarChecklistEngenharia, registrarDocumentoEngenharia } from "@/lib/acoes/engenharia";
import { metaArquivo, nomeSeguro, problemaArquivo } from "@/lib/anexos-regras";
import {
  BUCKET_DOCUMENTOS_ENGENHARIA,
  ROTULO_STATUS_ITEM,
  acoesItem,
  agruparItens,
  resumoChecklist,
  type AutorizacaoEngenharia,
  type ItemEngenhariaVM,
  type StatusItemEngenharia,
} from "@/lib/engenharia-checklist-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

// Sem verde (reservado ao WhatsApp); vermelho só para o inválido (erro).
const TOM: Record<StatusItemEngenharia, "neutro" | "atencao" | "negativo"> = {
  pendente: "neutro",
  em_conferencia: "atencao",
  valido: "neutro",
  invalido: "negativo",
  dispensado: "neutro",
};

const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Checklist de documentos da obra. Quem atua na Engenharia anexa (cada arquivo é uma versão), confere (válido ou
 * inválido com motivo) e marca "não se aplica" com motivo; os demais só leem. Arquivo vai direto ao Storage e é
 * registrado pela RPC; nada é apagado.
 */
export function ChecklistEngenharia({
  obraId,
  pasta,
  itens,
  autorizacao,
  cancelada,
  veDocumentos,
}: {
  obraId: string;
  /** `empresa/obra`, pasta da obra no bucket. */
  pasta: string;
  itens: ItemEngenhariaVM[];
  autorizacao: AutorizacaoEngenharia;
  cancelada: boolean;
  veDocumentos: boolean;
}) {
  const podeAplicar = autorizacao !== null && !cancelada;
  if (itens.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-zinc-600">O checklist ainda não foi aplicado nesta obra.</p>
        {podeAplicar && <Aplicar obraId={obraId} rotulo="Aplicar checklist" />}
      </div>
    );
  }
  const r = resumoChecklist(itens);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-700">
        Obrigatórios resolvidos: <span className="font-medium text-texto">{r.obrigatoriosResolvidos} de {r.obrigatorios}</span>
        {" · "}Total: {r.resolvidos} de {r.total}
        {r.emConferencia > 0 && ` · ${r.emConferencia} em conferência`}
        {r.invalidos > 0 && ` · ${r.invalidos} inválido${r.invalidos > 1 ? "s" : ""}`}
      </p>
      {!veDocumentos && <p className="text-xs text-zinc-500">Os arquivos ficam visíveis só para quem atua na Engenharia desta obra.</p>}
      {agruparItens(itens).map((g) => (
        <section key={g.grupo} aria-label={g.grupo}>
          <h3 className="mb-2 text-sm font-medium text-texto">{g.grupo}</h3>
          <ul className="divide-y divide-linha rounded-lg border border-linha">
            {g.itens.map((i) => (
              <Item key={i.id} obraId={obraId} pasta={pasta} item={i} acoes={acoesItem(i, autorizacao, cancelada)} />
            ))}
          </ul>
        </section>
      ))}
      {podeAplicar && <Aplicar obraId={obraId} rotulo="Trazer itens novos do modelo" secundario />}
    </div>
  );
}

function Aplicar({ obraId, rotulo, secundario = false }: { obraId: string; rotulo: string; secundario?: boolean }) {
  const [resultado, acao, pendente] = useActionState(aplicarChecklistEngenharia, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <Botao type="submit" variante={secundario ? "secundario" : "primario"} disabled={pendente}>
        {pendente ? "Aplicando..." : rotulo}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function Item({ obraId, pasta, item, acoes }: { obraId: string; pasta: string; item: ItemEngenhariaVM; acoes: ReturnType<typeof acoesItem> }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comMotivo, setComMotivo] = useState<"invalido" | "dispensado" | null>(null);

  async function anexar(input: HTMLInputElement) {
    const lista = Array.from(input.files ?? []);
    if (!lista.length) return;
    setErro(null);
    setEnviando(true);
    const supabase = criarClienteNavegador();
    let falha: string | null = null;
    for (const arquivo of lista) {
      const problema = problemaArquivo(metaArquivo(arquivo));
      if (problema) {
        falha ??= problema;
        continue;
      }
      const caminho = `${pasta}/${nomeSeguro(arquivo.name)}`;
      const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS_ENGENHARIA).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
      if (error) {
        falha ??= `Não foi possível enviar "${arquivo.name}".`;
        continue;
      }
      const r = await registrarDocumentoEngenharia({ obraId, itemId: item.id, caminho, nome: arquivo.name });
      if (!r?.ok) falha ??= r?.mensagem ?? `Não foi possível registrar "${arquivo.name}".`;
    }
    setErro(falha);
    setEnviando(false);
    input.value = "";
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium text-texto">{item.titulo}</p>
          {item.descricao && <p className="text-xs text-zinc-500">{item.descricao}</p>}
          <p className="text-xs text-zinc-500">
            {item.obrigatorio ? "Obrigatório" : "Se aplicável"}
            {item.atualizadoPor && item.atualizadoEm && ` · ${item.atualizadoPor}, ${dataHora(item.atualizadoEm)}`}
          </p>
          {item.motivo && <p className="text-xs text-zinc-700">Motivo: {item.motivo}</p>}
        </div>
        <Selo tom={TOM[item.status]}>{ROTULO_STATUS_ITEM[item.status]}</Selo>
      </div>

      {item.documentos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {item.documentos.map((d, i) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
              <a href={`/documentos-engenharia/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                <Paperclip aria-hidden className="size-3.5" />
                {d.nome}
              </a>
              <span className="text-zinc-500">
                v{d.versao}
                {i === 0 && item.documentos.length > 1 ? " (atual)" : ""} · {d.enviadoPor ?? "—"}, {dataHora(d.quando)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {comMotivo ? (
        <FormMotivo obraId={obraId} itemId={item.id} status={comMotivo} fechar={() => setComMotivo(null)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {acoes.anexar && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-400 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50">
              <Paperclip aria-hidden className="size-3.5" />
              {enviando ? "Enviando..." : item.documentos.length ? "Nova versão" : "Anexar"}
              <input type="file" multiple disabled={enviando} className="hidden" aria-label={`Anexar arquivo: ${item.titulo}`} onChange={(e) => anexar(e.target)} />
            </label>
          )}
          {acoes.validar && <MudarStatus obraId={obraId} itemId={item.id} status="valido" rotulo="Marcar válido" />}
          {acoes.invalidar && (
            <Botao type="button" variante="secundario" onClick={() => setComMotivo("invalido")}>
              Inválido
            </Botao>
          )}
          {acoes.dispensar && (
            <Botao type="button" variante="secundario" onClick={() => setComMotivo("dispensado")}>
              Não se aplica
            </Botao>
          )}
          {acoes.reabrir && <MudarStatus obraId={obraId} itemId={item.id} status="pendente" rotulo="Reabrir" />}
        </div>
      )}
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}
    </li>
  );
}

function MudarStatus({ obraId, itemId, status, rotulo }: { obraId: string; itemId: string; status: "valido" | "pendente"; rotulo: string }) {
  const [resultado, acao, pendente] = useActionState(alterarItemEngenharia, null);
  return (
    <form action={acao} className="inline-flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="status" value={status} />
      <Botao type="submit" variante={status === "valido" ? "primario" : "secundario"} disabled={pendente}>
        {rotulo}
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

function FormMotivo({ obraId, itemId, status, fechar }: { obraId: string; itemId: string; status: "invalido" | "dispensado"; fechar: () => void }) {
  const [resultado, acao, pendente] = useActionState(alterarItemEngenharia, null);
  useEffect(() => {
    if (resultado?.ok) fechar();
  }, [resultado, fechar]);
  const rotulo = status === "invalido" ? "Por que está inválido?" : "Por que não se aplica?";
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="status" value={status} />
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        {rotulo}
        <input name="motivo" required minLength={3} maxLength={500} className={CLASSE_ENTRADA} autoFocus />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {status === "invalido" ? "Marcar inválido" : "Confirmar"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={fechar}>
          Cancelar
        </Botao>
        {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
      </div>
    </form>
  );
}
