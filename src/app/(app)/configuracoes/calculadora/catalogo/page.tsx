import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Catalogo } from "./catalogo";

export default async function CatalogoEquipamentos() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: equipamentos } = await supabase
    .from("equipamentos_empresa")
    .select("*")
    .eq("empresa_id", atual.empresaId)
    .order("tipo")
    .order("prioridade", { ascending: false })
    .order("fabricante")
    .order("modelo");

  return <Catalogo itens={equipamentos ?? []} />;
}
