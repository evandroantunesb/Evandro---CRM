import { redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EnviarTabelaPrecos } from "@/components/compras/enviar-tabela-precos";
import { acessoPrecos, carregarMateriais } from "@/lib/compras/dados-precos";
import { chaveFornecedor } from "@/lib/compras/precos";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Enviar tabela de preços (desenho aprovado): fornecedor e planilha, o que é cada coluna (lembrado por fornecedor) e a
 * prévia do que muda antes de importar. Só quem altera a tabela de preços.
 */
export default async function EnviarTabela() {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  if (!(await acessoPrecos(supabase, atual.empresaId)).editar) redirect("/compras/precos");
  const [materiais, tabelasRes] = await Promise.all([
    carregarMateriais(supabase, atual.empresaId),
    supabase.from("compras_tabelas_preco").select("fornecedor").eq("empresa_id", atual.empresaId).order("created_at", { ascending: false }).limit(500),
  ]);
  if (tabelasRes.error) throw tabelasRes.error;
  const fornecedores = new Map<string, string>();
  for (const t of tabelasRes.data ?? []) if (!fornecedores.has(chaveFornecedor(t.fornecedor))) fornecedores.set(chaveFornecedor(t.fornecedor), t.fornecedor);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/compras/precos", rotulo: "Tabela de preços" }}
        sobretitulo="Compras · Tabela de preços"
        titulo="Enviar tabela de preços"
        descricao="Envie a planilha do fornecedor. Antes de importar, o Raion mostra o que muda: preços novos, preços que subiram ou baixaram e linhas com problema."
      />
      <EnviarTabelaPrecos
        empresaId={atual.empresaId}
        materiais={materiais}
        fornecedores={[...fornecedores.values()].sort((a, b) => a.localeCompare(b, "pt-BR"))}
        hoje={hojeEmSaoPaulo()}
      />
    </div>
  );
}
