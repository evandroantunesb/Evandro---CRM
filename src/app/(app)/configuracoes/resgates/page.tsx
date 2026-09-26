import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusResgate } from "@/lib/tipos";
import { LinhaResgate } from "./formulario";

export default async function ConfigResgates() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: resgates } = await supabase
    .from("resgates")
    .select("id, status, pontos_debitados, created_at, recompensas(nome), empresa_membros(perfis(nome, email))")
    .eq("empresa_id", atual.empresaId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Resgates</h1>
      <p className="text-sm text-zinc-600">
        Pedidos de troca de pontos por recompensas. Cancelar um pedido devolve os pontos ao colaborador.
      </p>
      <Cartao titulo={`Pedidos (${resgates?.length ?? 0})`}>
        {!resgates?.length && <p className="text-sm text-zinc-600">Nenhum resgate ainda.</p>}
        {(resgates ?? []).map((r) => {
          const recompensa = r.recompensas as unknown as { nome: string } | null;
          const perfil = (r.empresa_membros as unknown as { perfis: { nome: string; email: string } | null } | null)?.perfis;
          return (
            <LinhaResgate
              key={r.id}
              resgate={{
                id: r.id,
                status: r.status as StatusResgate,
                pontosDebitados: r.pontos_debitados,
                createdAt: r.created_at,
                recompensaNome: recompensa?.nome ?? "(recompensa removida)",
                membroNome: perfil?.nome || perfil?.email || "(sem nome)",
              }}
            />
          );
        })}
      </Cartao>
    </div>
  );
}
