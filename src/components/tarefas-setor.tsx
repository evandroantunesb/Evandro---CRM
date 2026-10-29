"use client";

import { Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selecao, Selo } from "@/components/ui";
import {
  assumirTarefaSetor,
  atribuirTarefaSetor,
  cancelarTarefaSetor,
  concluirTarefaSetor,
  criarTarefaSetor,
  reabrirTarefaSetor,
  registrarAnexoTarefaSetor,
  removerAnexoTarefaSetor,
} from "@/lib/acoes/tarefas-setor";
import { metaArquivo, nomeSeguro, problemaArquivo } from "@/lib/anexos-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import {
  BUCKET_ANEXOS_TAREFA,
  dataBr,
  hojeBrasilia,
  PRAZO_PADRAO_DIAS_UTEIS,
  SETORES_TAREFA,
  somarDiasUteis,
  type MembroOpcao,
  type SetorTarefa,
  type TarefaSetorVM,
} from "@/lib/tarefas-setor-regras";
import type { ResultadoAcao } from "@/lib/tipos";

const ROTULO_SETOR: Record<SetorTarefa, string> = { compras: "Compras", engenharia: "Engenharia", operacional: "Operacional" };

type Acao = (estado: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;

/** Campos que toda ação leva: a tarefa e onde ela aparece (para atualizar a tela certa). */
function Vinculo({ tarefa }: { tarefa: TarefaSetorVM }) {
  return (
    <>
      <input type="hidden" name="tarefaId" value={tarefa.id} />
      {tarefa.obraId && <input type="hidden" name="obraId" value={tarefa.obraId} />}
      {tarefa.negocioId && <input type="hidden" name="negocioId" value={tarefa.negocioId} />}
    </>
  );
}

/** Botão simples (assumir, reabrir) com a mensagem do servidor. */
function BotaoAcao({ tarefa, acao, rotulo }: { tarefa: TarefaSetorVM; acao: Acao; rotulo: string }) {
  const [resultado, enviar, pendente] = useActionState(acao, null);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <Vinculo tarefa={tarefa} />
      <Botao type="submit" variante="secundario" disabled={pendente} className="px-3 py-1 text-xs">
        {pendente ? "..." : rotulo}
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

/** Ação que pede um texto antes (concluir com resposta, cancelar com motivo). */
function AcaoComTexto({
  tarefa,
  acao,
  rotulo,
  campo,
  placeholder,
  obrigatorio = false,
}: {
  tarefa: TarefaSetorVM;
  acao: Acao;
  rotulo: string;
  campo: string;
  placeholder: string;
  obrigatorio?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultado, enviar, pendente] = useActionState(acao, null);
  if (!aberto) {
    return (
      <Botao type="button" variante="secundario" onClick={() => setAberto(true)} className="px-3 py-1 text-xs">
        {rotulo}
      </Botao>
    );
  }
  return (
    <form action={enviar} className="flex w-full flex-col gap-2">
      <Vinculo tarefa={tarefa} />
      <textarea name={campo} placeholder={placeholder} required={obrigatorio} rows={2} maxLength={2000} className={`${CLASSE_ENTRADA} text-sm`} />
      <div className="flex gap-2">
        <Botao type="submit" disabled={pendente} className="px-3 py-1 text-xs">
          {pendente ? "Salvando..." : rotulo}
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)} className="px-3 py-1 text-xs">
          Voltar
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function Atribuir({ tarefa, membros }: { tarefa: TarefaSetorVM; membros: MembroOpcao[] }) {
  const [resultado, enviar, pendente] = useActionState(atribuirTarefaSetor, null);
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2">
      <Vinculo tarefa={tarefa} />
      <Selecao name="membroId" defaultValue={tarefa.responsavel?.id ?? ""} aria-label="Responsável" className="text-xs">
        <option value="">Fila do setor</option>
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" variante="secundario" disabled={pendente} className="px-3 py-1 text-xs">
        Atribuir
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

const ROTULO_STATUS = { aberta: "Aberta", concluida: "Concluída", cancelada: "Cancelada" } as const;

export function ListaTarefasSetor({
  tarefas,
  membrosPorSetor,
  vazio,
  mostrarReferencia = true,
}: {
  tarefas: TarefaSetorVM[];
  membrosPorSetor: Partial<Record<SetorTarefa, MembroOpcao[]>>;
  vazio: string;
  mostrarReferencia?: boolean;
}) {
  if (!tarefas.length) return <p className="text-sm text-zinc-500">{vazio}</p>;
  return (
    <ul className="flex flex-col">
      {tarefas.map((t) => (
        <li key={t.id} className="flex flex-col gap-2 border-t border-zinc-100 py-3 text-sm first:border-t-0">
          <div className="flex flex-wrap items-center gap-2">
            <Selo>{t.setorRotulo}</Selo>
            {t.status !== "aberta" && <Selo tom={t.status === "cancelada" ? "negativo" : "neutro"}>{ROTULO_STATUS[t.status]}</Selo>}
            {t.automatica && <Selo>Automática</Selo>}
            <p className={`min-w-0 flex-1 font-medium ${t.status === "aberta" ? "text-zinc-900" : "text-zinc-500"}`}>{t.titulo}</p>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
            <span className={t.atrasada ? "font-medium text-red-700" : ""}>
              {t.atrasada ? "Atrasada · " : "Prazo "}
              {dataBr(t.prazo)}
            </span>
            <span>{t.responsavel ? `Com ${t.responsavel.nome}` : "Na fila do setor"}</span>
            {t.pedidoPor && <span>Pedido por {t.pedidoPor}</span>}
            {mostrarReferencia &&
              (t.referencia.href ? (
                <Link href={t.referencia.href} className="text-amber-700 hover:underline">
                  {t.referencia.rotulo}
                </Link>
              ) : (
                <span>{t.referencia.rotulo}</span>
              ))}
          </p>
          {t.descricao && <p className="whitespace-pre-line text-zinc-700">{t.descricao}</p>}
          {t.resposta && (
            <p className="rounded-md bg-zinc-50 px-3 py-2 whitespace-pre-line text-zinc-800">
              <span className="font-medium">Resposta: </span>
              {t.resposta}
            </p>
          )}
          {t.motivoCancelamento && <p className="text-xs text-zinc-500">Motivo do cancelamento: {t.motivoCancelamento}</p>}
          <AnexosTarefa tarefa={t} />
          <div className="flex flex-wrap items-start gap-2">
            {t.podeAgir && t.responsavel === null && <BotaoAcao tarefa={t} acao={assumirTarefaSetor} rotulo="Assumir" />}
            {t.podeAgir && (
              <AcaoComTexto
                tarefa={t}
                acao={concluirTarefaSetor}
                rotulo="Concluir"
                campo="resposta"
                placeholder="Resposta para quem pediu (opcional): valor, link, observação"
              />
            )}
            {t.podeAtribuir && (membrosPorSetor[t.setor]?.length ?? 0) > 0 && <Atribuir tarefa={t} membros={membrosPorSetor[t.setor]!} />}
            {t.podeReabrir && <BotaoAcao tarefa={t} acao={reabrirTarefaSetor} rotulo="Reabrir" />}
            {t.podeCancelar && (
              <AcaoComTexto tarefa={t} acao={cancelarTarefaSetor} rotulo="Cancelar" campo="motivo" placeholder="Motivo do cancelamento" obrigatorio />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Envia os arquivos direto ao Storage, na pasta da tarefa, e registra cada um (arquivo nunca passa por Server
 * Action). Devolve a primeira falha, ou null.
 */
async function enviarAnexos(
  pasta: string,
  arquivos: File[],
  vinculo: { obraId?: string | null; negocioId?: string | null },
): Promise<string | null> {
  const supabase = criarClienteNavegador();
  let falha: string | null = null;
  for (const arquivo of arquivos) {
    const problema = problemaArquivo(metaArquivo(arquivo));
    if (problema) {
      falha ??= problema;
      continue;
    }
    const caminho = `${pasta}/${nomeSeguro(arquivo.name)}`;
    const { error } = await supabase.storage.from(BUCKET_ANEXOS_TAREFA).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
    if (error) {
      falha ??= `Não foi possível enviar "${arquivo.name}".`;
      continue;
    }
    const r = await registrarAnexoTarefaSetor({ caminho, nome: arquivo.name, ...vinculo });
    if (!r?.ok) falha ??= r?.mensagem ?? `Não foi possível registrar "${arquivo.name}".`;
  }
  return falha;
}

/** Arquivos da tarefa: baixar, anexar (tarefa aberta) e remover (quem enviou ou o admin). */
function AnexosTarefa({ tarefa }: { tarefa: TarefaSetorVM }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!tarefa.anexos.length && !tarefa.podeAnexar) return null;

  async function anexar(input: HTMLInputElement) {
    const lista = Array.from(input.files ?? []);
    if (!lista.length) return;
    setErro(null);
    setEnviando(true);
    setErro(await enviarAnexos(tarefa.pastaAnexos, lista, tarefa));
    setEnviando(false);
    input.value = "";
    router.refresh();
  }

  // Separados por origem: o que veio com o pedido e o que o setor devolveu.
  const grupos = [
    { titulo: "Enviados no pedido", anexos: tarefa.anexos.filter((a) => a.doPedido) },
    { titulo: `Entregues por ${tarefa.setorRotulo}`, anexos: tarefa.anexos.filter((a) => !a.doPedido) },
  ].filter((g) => g.anexos.length > 0);

  return (
    <div className="flex flex-col gap-2">
      {grupos.map((g, i) => (
        <section key={g.titulo} aria-label={g.titulo} className={`flex flex-col gap-1 ${i > 0 ? "border-t border-zinc-100 pt-2" : ""}`}>
          <p className="text-xs font-medium text-zinc-600">{g.titulo}</p>
          <ul className="flex flex-col gap-1">
            {g.anexos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                <a href={`/anexos-tarefa/${a.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                  <Paperclip aria-hidden className="size-3.5" />
                  {a.nome}
                </a>
                {a.enviadoPor && <span className="text-zinc-500">por {a.enviadoPor}</span>}
                {a.podeRemover && <RemoverAnexo tarefa={tarefa} anexoId={a.id} nome={a.nome} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {tarefa.podeAnexar && (
        <label className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-400 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50">
          <Paperclip aria-hidden className="size-3.5" />
          {enviando ? "Enviando..." : "Anexar"}
          <input type="file" multiple disabled={enviando} className="hidden" onChange={(e) => anexar(e.target)} />
        </label>
      )}
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}
    </div>
  );
}

function RemoverAnexo({ tarefa, anexoId, nome }: { tarefa: TarefaSetorVM; anexoId: string; nome: string }) {
  const [resultado, enviar, pendente] = useActionState(removerAnexoTarefaSetor, null);
  return (
    <form action={enviar} className="inline-flex items-center gap-1">
      <Vinculo tarefa={tarefa} />
      <input type="hidden" name="anexoId" value={anexoId} />
      <button type="submit" disabled={pendente} aria-label={`Remover ${nome}`} className="text-zinc-500 hover:text-red-700">
        <X aria-hidden className="size-3.5" />
      </button>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

/** Pedir uma tarefa a um setor, na obra ou no negócio. Prazo sugerido: 2 dias úteis. Os anexos sobem depois de criada. */
export function NovaTarefaSetor({
  obraId,
  negocioId,
  exemplo,
  setorPadrao,
}: {
  obraId?: string;
  negocioId?: string;
  exemplo: string;
  /** Setor já escolhido ao abrir o formulário (tela de um setor). */
  setorPadrao?: SetorTarefa;
}) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  // Cria a tarefa e, com ela criada, envia os arquivos escolhidos; "Enviando..." cobre as duas etapas.
  const [resultado, enviar, pendente] = useActionState(async (anterior: ResultadoAcao, dados: FormData): Promise<ResultadoAcao> => {
    const r = await criarTarefaSetor(anterior, dados);
    if (!r?.ok || !r.pastaAnexos || !arquivos.length) return r;
    const falha = await enviarAnexos(r.pastaAnexos, arquivos, { obraId, negocioId });
    setArquivos([]);
    router.refresh();
    return { ok: true, mensagem: falha ? `Tarefa enviada ao setor, mas: ${falha} Anexe de novo na tarefa.` : r.mensagem };
  }, null);
  const form = useRef<HTMLFormElement>(null);
  const [hoje] = useState(() => hojeBrasilia());
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);
  return (
    <form ref={form} action={enviar} className="flex flex-col gap-2">
      {obraId && <input type="hidden" name="obraId" value={obraId} />}
      {negocioId && <input type="hidden" name="negocioId" value={negocioId} />}
      <input name="titulo" placeholder={exemplo} required minLength={2} maxLength={160} className={`${CLASSE_ENTRADA} text-sm`} />
      <textarea name="descricao" placeholder="Detalhes (opcional)" rows={2} maxLength={2000} className={`${CLASSE_ENTRADA} text-sm`} />
      {/* Sem `name`: os arquivos não vão na ação; sobem direto ao Storage depois que a tarefa existe. */}
      <label className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-400 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
        <Paperclip aria-hidden className="size-4" />
        {arquivos.length ? `${arquivos.length} arquivo${arquivos.length > 1 ? "s" : ""} para anexar` : "Anexar arquivos (fotos, PDF)"}
        <input type="file" multiple className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Setor responsável
          <Selecao name="setor" defaultValue={setorPadrao ?? ""} required aria-label="Setor">
            <option value="" disabled>
              Para qual setor?
            </option>
            {SETORES_TAREFA.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SETOR[s]}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Prazo: até quando o setor deve entregar
          <input
            type="date"
            name="prazo"
            min={hoje}
            defaultValue={somarDiasUteis(hoje, PRAZO_PADRAO_DIAS_UTEIS)}
            required
            aria-label="Prazo"
            className={`${CLASSE_ENTRADA} text-sm`}
          />
        </label>
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Enviando..." : "Enviar ao setor"}
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
