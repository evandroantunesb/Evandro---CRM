import { Cartao, Voltar } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaFixacao, NovaFixacao } from "./formularios";

export default async function ConfigFixacoes() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  // Enquanto a migration não estiver aplicada (preview usa o banco de produção), a lista vem vazia.
  const { data } = await supabase.from("fixacoes_telhado").select("id, nome, ativa").eq("empresa_id", atual.empresaId).order("nome");
  const fixacoes = data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Tipos de fixação do telhado</h1>
      <p className="text-sm text-zinc-600">
        Opções que Engenharia, Compras e Operacional escolhem na obra. Opção desativada some da escolha, mas as obras que já a usam
        continuam mostrando o nome.
      </p>
      <Cartao titulo="Nova opção">
        <NovaFixacao />
      </Cartao>
      <Cartao titulo={`Opções (${fixacoes.length})`}>
        {fixacoes.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma opção cadastrada.</p>
        ) : (
          fixacoes.map((f) => <LinhaFixacao key={f.id} fixacao={f} />)
        )}
      </Cartao>
    </div>
  );
}
