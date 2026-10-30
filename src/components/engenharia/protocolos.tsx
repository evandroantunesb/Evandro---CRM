"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import {
  registrarArquivoProtocoloEngenharia,
  registrarEventoProtocoloEngenharia,
  registrarProtocoloEngenharia,
  type ResultadoEventoProtocolo,
} from "@/lib/acoes/engenharia";
import { metaArquivo, nomeSeguro, problemaArquivo } from "@/lib/anexos-regras";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import {
  CANAIS_PROTOCOLO,
  CATEGORIAS_EXIGENCIA,
  ROTULO_CANAL,
  ROTULO_CATEGORIA,
  ROTULO_EVENTO,
  ROTULO_STATUS_EXIGENCIA,
  ROTULO_STATUS_PROTOCOLO,
  ROTULO_TIPO_SOLICITACAO,
  TIPOS_SOLICITACAO,
  exigeDescricao,
  protocoloEncerrado,
  respostasPossiveis,
  rotuloDe,
  type ProtocoloVM,
  type StatusProtocolo,
  type TipoResposta,
} from "@/lib/engenharia-protocolos-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

// Sem verde (WhatsApp); vermelho só para indeferido (perda). Exigência é atenção, não erro.
const TOM: Record<StatusProtocolo, "neutro" | "atencao" | "negativo"> = {
  protocolado: "neutro",
  em_analise: "neutro",
  com_exigencia: "atencao",
  aprovado: "neutro",
  orcamento_emitido: "atencao",
  indeferido: "negativo",
  cancelado: "neutro",
  encerrado: "neutro",
};

/** Envia os arquivos à pasta da obra e liga cada um ao evento. Devolve a primeira falha, ou null. */
async function anexarAoEvento(pasta: string, obraId: string, eventoId: string, arquivos: File[]): Promise<string | null> {
  const supabase = criarClienteNavegador();
  let falha: string | null = null;
  for (const arquivo of arquivos) {
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
    const r = await registrarArquivoProtocoloEngenharia({ obraId, eventoId, caminho, nome: arquivo.name });
    if (!r?.ok) falha ??= r?.mensagem ?? `Não foi possível registrar "${arquivo.name}".`;
  }
  return falha;
}

/**
 * Protocolo na concessionária: o engenheiro protocola no portal da distribuidora e registra aqui (o Raion não acessa o
 * portal). Depois registra cada resposta (em análise, exigência, aprovado, orçamento, indeferido) e o reenvio. Só
 * para admin e quem atua em Engenharia na obra.
 */
export function ProtocolosEngenharia({
  obraId,
  pasta,
  protocolos,
  podeAgir,
  pendentesChecklist,
}: {
  obraId: string;
  pasta: string;
  protocolos: ProtocoloVM[];
  podeAgir: boolean;
  /** Itens obrigatórios do checklist ainda não resolvidos (gate G2); null = checklist não aplicado. */
  pendentesChecklist: number | null;
}) {
  const ativo = protocolos.find((p) => !protocoloEncerrado(p.status)) ?? null;
  const anteriores = protocolos.filter((p) => p !== ativo);
  return (
    <div className="flex flex-col gap-4">
      {ativo ? (
        <Protocolo obraId={obraId} pasta={pasta} protocolo={ativo} podeAgir={podeAgir} />
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-zinc-600">{protocolos.length ? "Nenhum protocolo em andamento." : "Nenhum protocolo registrado."}</p>
          {podeAgir &&
            (pendentesChecklist === null ? (
              <p className="text-zinc-700">Aplique o checklist e resolva os itens obrigatórios para registrar o protocolo.</p>
            ) : pendentesChecklist > 0 ? (
              <p className="text-zinc-700">
                Faltam {pendentesChecklist} {pendentesChecklist === 1 ? "item obrigatório" : "itens obrigatórios"} do checklist para registrar o protocolo.
              </p>
            ) : (
              <NovoProtocolo obraId={obraId} pasta={pasta} />
            ))}
        </div>
      )}
      {anteriores.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600">Protocolos anteriores ({anteriores.length})</summary>
          <div className="mt-3 flex flex-col gap-4">
            {anteriores.map((p) => (
              <Protocolo key={p.id} obraId={obraId} pasta={pasta} protocolo={p} podeAgir={false} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function NovoProtocolo({ obraId, pasta }: { obraId: string; pasta: string }) {
  const router = useRouter();
  const [resultado, acao, pendente] = useActionState(registrarProtocoloEngenharia, null);
  const [comprovantes, setComprovantes] = useState<File[]>([]);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  useEnvioDepois(resultado, pasta, obraId, comprovantes, setErroArquivo, router.refresh);

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="obraId" value={obraId} />
      <p className="text-xs text-zinc-600">Protocole no portal da distribuidora e registre aqui o número e a data. O Raion não envia nada ao portal.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Rotulo texto="Distribuidora">
          <input name="distribuidora" defaultValue="Copel" required maxLength={60} className={CLASSE_ENTRADA} />
        </Rotulo>
        <Rotulo texto="Número do protocolo">
          <input name="numero" required maxLength={60} className={CLASSE_ENTRADA} />
        </Rotulo>
        <Rotulo texto="Canal">
          <select name="canal" defaultValue="pew" className={CLASSE_ENTRADA}>
            {CANAIS_PROTOCOLO.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CANAL[c]}
              </option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto="Tipo de solicitação">
          <select name="tipoSolicitacao" defaultValue="nova_conexao" className={CLASSE_ENTRADA}>
            {TIPOS_SOLICITACAO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_SOLICITACAO[t]}
              </option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto="Data do protocolo">
          <input type="date" name="protocoladoEm" defaultValue={hojeBr()} max={hojeBr()} required className={CLASSE_ENTRADA} />
        </Rotulo>
        <Rotulo texto="Comprovante (opcional)">
          <input type="file" multiple onChange={(e) => setComprovantes(Array.from(e.target.files ?? []))} className="text-sm" />
        </Rotulo>
      </div>
      <Rotulo texto="Observação (opcional)">
        <textarea name="observacao" maxLength={1000} rows={2} className={CLASSE_ENTRADA} />
      </Rotulo>
      <p className="text-xs text-zinc-500">O pacote enviado (versão atual de cada item válido do checklist) fica registrado, e a Engenharia passa para Enviado à concessionária.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Registrando..." : "Registrar protocolo"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
      {erroArquivo && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erroArquivo}</p>}
    </form>
  );
}

/** Depois que o registro devolve o evento, envia os arquivos escolhidos e atualiza a tela. */
function useEnvioDepois(
  resultado: ResultadoEventoProtocolo,
  pasta: string,
  obraId: string,
  arquivos: File[],
  setErro: (e: string | null) => void,
  atualizar: () => void,
) {
  useEffect(() => {
    if (!resultado?.ok || !resultado.eventoId || arquivos.length === 0) return;
    let ativo = true;
    anexarAoEvento(pasta, obraId, resultado.eventoId, arquivos).then((falha) => {
      if (!ativo) return;
      setErro(falha);
      atualizar();
    });
    return () => {
      ativo = false;
    };
    // Um envio por resultado: os arquivos são os do momento do registro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);
}

function Protocolo({ obraId, pasta, protocolo, podeAgir }: { obraId: string; pasta: string; protocolo: ProtocoloVM; podeAgir: boolean }) {
  const possiveis = podeAgir ? respostasPossiveis(protocolo.status) : [];
  const abertas = protocolo.exigencias.filter((x) => x.status !== "resolvida");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-texto">
          {protocolo.distribuidora} · Protocolo {protocolo.numero}
        </p>
        <Selo tom={TOM[protocolo.status]}>{ROTULO_STATUS_PROTOCOLO[protocolo.status]}</Selo>
      </div>
      <p className="text-xs text-zinc-500">
        {rotuloDe(ROTULO_CANAL, protocolo.canal)} · {rotuloDe(ROTULO_TIPO_SOLICITACAO, protocolo.tipoSolicitacao)} · protocolado em {dataBr(protocolo.protocoladoEm)} · registrado
        manualmente
      </p>
      {protocolo.observacao && <p className="text-xs text-zinc-700">{protocolo.observacao}</p>}

      {abertas.length > 0 && (
        <section aria-label="Exigências pendentes" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <h3 className="mb-2 text-sm font-medium text-texto">Exigências pendentes ({abertas.length})</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {abertas.map((x) => (
              <li key={x.id} className="flex flex-col gap-0.5">
                <p className="font-medium text-texto">
                  {rotuloDe(ROTULO_CATEGORIA, x.categoria)} <span className="text-xs font-normal text-zinc-500">· {ROTULO_STATUS_EXIGENCIA[x.status]}</span>
                </p>
                <p className="whitespace-pre-line text-zinc-700">{x.descricao}</p>
                {x.prazoInterno && <p className="text-xs text-zinc-500">Prazo interno: {dataBr(x.prazoInterno)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="flex flex-col border-l border-linha pl-3">
        {protocolo.eventos.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 py-1.5 text-sm">
            <p className="font-medium text-texto">
              {ROTULO_EVENTO[e.tipo]} <span className="text-xs font-normal text-zinc-500">· {dataBr(e.ocorridoEm)}{e.autor ? ` · ${e.autor}` : ""}</span>
            </p>
            {e.descricao && <p className="whitespace-pre-line text-zinc-700">{e.descricao}</p>}
            {e.pacote.length > 0 && (
              <details className="text-xs text-zinc-600">
                <summary className="cursor-pointer">Pacote enviado ({e.pacote.length})</summary>
                <ul className="mt-1 list-disc pl-5">
                  {e.pacote.map((d) => (
                    <li key={`${d.item}-${d.versao}`}>
                      {d.item} — v{d.versao}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {e.arquivos.map((a) => (
              <a key={a.id} href={`/arquivos-protocolo/${a.id}`} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-1 text-xs text-amber-700 hover:underline">
                <Paperclip aria-hidden className="size-3.5" />
                {a.nome}
              </a>
            ))}
          </li>
        ))}
      </ol>

      {possiveis.length > 0 && <NovaResposta obraId={obraId} pasta={pasta} protocolo={protocolo} possiveis={possiveis} />}
    </div>
  );
}

function NovaResposta({ obraId, pasta, protocolo, possiveis }: { obraId: string; pasta: string; protocolo: ProtocoloVM; possiveis: TipoResposta[] }) {
  const router = useRouter();
  const [resultado, acao, pendente] = useActionState(registrarEventoProtocoloEngenharia, null);
  const [tipo, setTipo] = useState<TipoResposta>(possiveis[0]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  useEnvioDepois(resultado, pasta, obraId, arquivos, setErroArquivo, router.refresh);
  const atual = possiveis.includes(tipo) ? tipo : possiveis[0];

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="protocoloId" value={protocolo.id} />
      <p className="text-sm font-medium text-texto">Registrar resposta ou reenvio</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Rotulo texto="O que aconteceu">
          <select name="tipo" value={atual} onChange={(e) => setTipo(e.target.value as TipoResposta)} className={CLASSE_ENTRADA}>
            {possiveis.map((t) => (
              <option key={t} value={t}>
                {ROTULO_EVENTO[t]}
              </option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto="Data">
          <input type="date" name="ocorridoEm" defaultValue={hojeBr()} min={protocolo.protocoladoEm} max={hojeBr()} required className={CLASSE_ENTRADA} />
        </Rotulo>
        {atual === "exigencia" && (
          <>
            <Rotulo texto="Categoria da exigência">
              <select name="categoria" required defaultValue="" className={CLASSE_ENTRADA}>
                <option value="" disabled>
                  Escolha
                </option>
                {CATEGORIAS_EXIGENCIA.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </Rotulo>
            <Rotulo texto="Prazo interno (opcional)">
              <input type="date" name="prazoInterno" className={CLASSE_ENTRADA} />
            </Rotulo>
          </>
        )}
      </div>
      <Rotulo texto={atual === "exigencia" ? "Texto da exigência" : exigeDescricao(atual) ? "Motivo / texto da distribuidora" : "Observação (opcional)"}>
        <textarea name="descricao" rows={3} maxLength={4000} required={exigeDescricao(atual)} minLength={exigeDescricao(atual) ? 3 : undefined} className={CLASSE_ENTRADA} />
      </Rotulo>
      {atual === "reenvio" && <p className="text-xs text-zinc-500">O novo pacote (versão atual de cada item válido do checklist) fica registrado com o reenvio.</p>}
      <Rotulo texto="Arquivos (ofício, comprovante, orçamento — opcional)">
        <input type="file" multiple onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} className="text-sm" />
      </Rotulo>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Registrando..." : "Registrar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
      {erroArquivo && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erroArquivo}</p>}
    </form>
  );
}

function Rotulo({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      {texto}
      {children}
    </label>
  );
}
