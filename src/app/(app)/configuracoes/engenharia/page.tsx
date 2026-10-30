import { Cartao, Voltar } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaItemModelo, NovoItemModelo } from "./formularios";

export default async function ConfigChecklistEngenharia() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  // Enquanto a migration não estiver aplicada (preview usa o banco de produção), a lista vem vazia.
  const { data } = await supabase
    .from("engenharia_checklist_modelo")
    .select("id, grupo, titulo, obrigatorio, ordem, ativo")
    .eq("empresa_id", atual.empresaId)
    .order("ordem")
    .order("titulo");
  const itens = data ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Checklist da Engenharia</h1>
      <p className="text-sm text-zinc-600">
        Documentos que a Engenharia confere em cada obra. A lista inicial é um ponto de partida para a Copel: revise com o
        responsável técnico. Cada obra recebe uma cópia ao aplicar o checklist: editar aqui não muda os itens que ela já tem.
        Itens novos entram na obra pelo botão &quot;Trazer itens novos do modelo&quot;. Item desativado não entra mais.
      </p>
      <Cartao titulo="Novo item">
        <NovoItemModelo proximaOrdem={(itens.at(-1)?.ordem ?? 0) + 10} />
      </Cartao>
      <Cartao titulo={`Itens (${itens.length})`}>
        {itens.length === 0 ? <p className="text-sm text-zinc-500">Nenhum item cadastrado.</p> : itens.map((i) => <LinhaItemModelo key={i.id} item={i} />)}
      </Cartao>
    </div>
  );
}
