import { redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EnviarListaEquipamentos } from "@/components/compras/enviar-lista-equipamentos";
import { acessoPrecos, carregarMateriais } from "@/lib/compras/dados-precos";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Enviar lista de equipamentos (item 5 do roadmap, prévia aprovada em 18/11/2026): cadastra equipamentos e completa a
 * potência em massa, sem preço. Só quem altera a tabela de preços.
 */
export default async function EnviarListaEquipamentosPagina() {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  if (!(await acessoPrecos(supabase, atual.empresaId)).editar) redirect("/compras/precos");
  const materiais = await carregarMateriais(supabase, atual.empresaId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/compras/precos", rotulo: "Tabela de preços" }}
        sobretitulo="Compras · Tabela de preços"
        titulo="Enviar lista de equipamentos"
        descricao="Cadastre equipamentos e a potência de cada um de uma vez. Antes de importar, o Raion mostra o que entra no cadastro e o que é completado."
      />
      <EnviarListaEquipamentos materiais={materiais} />
    </div>
  );
}
