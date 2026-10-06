import { PackageCheck } from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusResgate } from "@/lib/tipos";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, VoltarGf } from "../../gamificacao/_compartilhado/ui";
import { LinhaResgate } from "./formulario";

export default async function ConfigResgates() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: resgates } = await supabase
    .from("resgates")
    .select("id, status, moedas_debitadas, created_at, recompensas(nome), empresa_membros(perfis(nome, email))")
    .eq("empresa_id", atual.empresaId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <PaginaGf largura="formulario">
      <VoltarGf href="/gamificacao/administracao">Administração</VoltarGf>
      <CabecalhoPaginaGf
        titulo="Resgates"
        descricao="Pedidos de troca de moedas por recompensas. Cancelar um pedido devolve as moedas ao colaborador."
      />
      <CartaoGf titulo={`Pedidos (${resgates?.length ?? 0})`}>
        {!resgates?.length ? (
          <EstadoVazioGf Icone={PackageCheck} compacto titulo="Nenhum resgate ainda">
            Os pedidos feitos na loja aparecem aqui para você aprovar e acompanhar a entrega.
          </EstadoVazioGf>
        ) : (
          <div className="flex flex-col">
            {resgates.map((r) => {
              const recompensa = r.recompensas as unknown as { nome: string } | null;
              const perfil = (r.empresa_membros as unknown as { perfis: { nome: string; email: string } | null } | null)?.perfis;
              return (
                <LinhaResgate
                  key={r.id}
                  resgate={{
                    id: r.id,
                    status: r.status as StatusResgate,
                    moedasDebitadas: r.moedas_debitadas,
                    createdAt: r.created_at,
                    recompensaNome: recompensa?.nome ?? "(recompensa removida)",
                    membroNome: perfil?.nome || perfil?.email || "(sem nome)",
                  }}
                />
              );
            })}
          </div>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
