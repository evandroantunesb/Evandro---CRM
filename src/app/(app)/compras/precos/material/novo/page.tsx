import { redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { FormularioMaterial } from "@/components/compras/formularios-preco";
import { acessoPrecos } from "@/lib/compras/dados-precos";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** "+ Material" da tabela de preços: cadastra o material sem preço (o preço vem de uma tabela ou é lançado à mão). */
export default async function NovoMaterial() {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  if (!(await acessoPrecos(supabase, atual.empresaId)).editar) redirect("/compras/precos");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/compras/precos", rotulo: "Tabela de preços" }}
        sobretitulo="Compras · Tabela de preços"
        titulo="Novo material"
        descricao="Depois de cadastrar, lance o preço à mão ou envie a tabela do fornecedor."
      />
      <section className="painel p-4 md:p-6">
        <FormularioMaterial />
      </section>
    </div>
  );
}
