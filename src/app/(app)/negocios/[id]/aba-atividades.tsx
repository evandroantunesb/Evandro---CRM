import { ListaTarefas } from "@/components/lista-tarefas";
import { NovaTarefa } from "@/components/nova-tarefa";
import { ListaTarefasSetor, NovaTarefaSetor } from "@/components/tarefas-setor";
import { Cartao } from "@/components/ui";
import { formatarDataHora } from "@/lib/crm";
import { descreverAtividade } from "@/lib/linha-do-tempo";
import { ATRIBUIR_TAREFA_A_OUTROS, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { type TipoTarefa } from "@/lib/tipos";
import { NovaNota } from "./nova-nota";
import type { Ficha } from "./dados-ficha";

/** Aba Atividades: tarefas, pedidos aos setores e notas com a linha do tempo. */
export function AbaAtividades({ ficha }: { ficha: Ficha }) {
  const { atual, negocio, config, tarefas, atividades, notas, nomes, souAdmin, arquivado, pedidosSetor } = ficha;
  // Linha do tempo: atividades do sistema e notas, da mais recente para a mais antiga.
  const linha = [
    ...(atividades ?? []).map((a) => ({
      chave: `a${a.id}`,
      quando: a.created_at,
      nota: null,
      texto: descreverAtividade(a.tipo, a.dados, nomes),
    })),
    ...(notas ?? []).map((n) => ({ chave: `n${n.id}`, quando: n.created_at, nota: n, texto: n.texto })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Cartao titulo="Tarefas">
        <div className="flex flex-col gap-3">
          <ListaTarefas
            vazio="Nenhuma tarefa. Crie a próxima ação para este cliente não esfriar."
            tarefas={(tarefas ?? []).map((t) => ({
              id: t.id,
              titulo: t.titulo,
              tipo: t.tipo as TipoTarefa,
              vence_em: t.vence_em,
              concluida_em: t.concluida_em,
              responsavel: t.responsavel_id ? nomes.membro(t.responsavel_id) : null,
              podeApagar: souAdmin || t.criado_por === atual.membroId,
            }))}
          />
          {!arquivado && (
          <NovaTarefa
            negocioId={negocio.id}
            responsaveis={pode(atual.papel, ATRIBUIR_TAREFA_A_OUTROS) ? config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL)) : []}
            responsavelPadrao={negocio.responsavel_id}
          />
          )}
        </div>
      </Cartao>
      {pedidosSetor && (
        <Cartao titulo="Pedidos aos setores">
          <div className="flex flex-col gap-3">
            <ListaTarefasSetor
              tarefas={pedidosSetor.tarefas}
              membrosPorSetor={pedidosSetor.membrosPorSetor}
              vazio="Nenhum pedido. Peça um orçamento a Compras ou um 3D à Engenharia."
              mostrarReferencia={false}
            />
            {!arquivado && <NovaTarefaSetor negocioId={negocio.id} exemplo="O que você precisa? Ex.: orçamento do kit, projeto 3D" />}
          </div>
        </Cartao>
      )}
      <Cartao titulo="Notas e linha do tempo">
        <NovaNota negocioId={negocio.id} />
        <ol className="flex flex-col">
          {linha.map((item) =>
            item.nota ? (
              <li
                key={item.chave}
                className="my-1 flex flex-col rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="whitespace-pre-wrap text-zinc-900">{item.texto}</span>
                <span className="flex gap-2 text-xs text-zinc-500">
                  {item.nota.autor_id ? nomes.membro(item.nota.autor_id) : "usuário removido"} ·{" "}
                  {formatarDataHora(item.quando)}
                </span>
              </li>
            ) : (
              <li key={item.chave} className="flex flex-col border-l-2 border-zinc-200 py-2 pl-3 text-sm">
                <span className="text-zinc-800">{item.texto}</span>
                <span className="text-xs text-zinc-500">{formatarDataHora(item.quando)}</span>
              </li>
            ),
          )}
        </ol>
      </Cartao>
    </div>
  );
}
