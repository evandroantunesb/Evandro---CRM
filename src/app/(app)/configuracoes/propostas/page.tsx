import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CardModelo } from "./card-modelo";
import { NovoModeloColapsavel } from "./novo-modelo";

export default async function ConfigPropostas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: modelos } = await supabase
    .from("proposta_modelos")
    .select("id, nome, descricao, capa_variante, status, padrao, updated_at, proposta_modelo_blocos(id, ativo)")
    .eq("empresa_id", atual.empresaId)
    .order("created_at", { ascending: false });

  const lista = (modelos ?? []).map((m) => ({
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    capaVariante: m.capa_variante,
    status: m.status,
    padrao: m.padrao,
    atualizadoEm: m.updated_at,
    blocosAtivos: (m.proposta_modelo_blocos ?? []).filter((b) => b.ativo).length,
    blocosTotal: (m.proposta_modelo_blocos ?? []).length,
  }));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <NovoModeloColapsavel />
      <div className="flex flex-col gap-3">
        {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum modelo criado ainda.</p>}
        {lista.map((modelo) => (
          <CardModelo key={modelo.id} modelo={modelo} />
        ))}
      </div>
    </div>
  );
}
