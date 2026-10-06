import { Gift } from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, VoltarGf } from "../../_compartilhado/ui";
import { LinhaRecompensa, NovaRecompensa } from "../_compartilhado/formularios";

export default async function Recompensas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: recompensas } = await supabase
    .from("recompensas")
    .select("id, nome, descricao, custo_moedas, estoque, limite_por_membro, validade_ate, ativa")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");

  return (
    <PaginaGf largura="formulario">
      <VoltarGf href="/gamificacao/administracao">Administração</VoltarGf>
      <CabecalhoPaginaGf
        titulo="Recompensas"
        descricao="A loja de recompensas deixa o colaborador trocar moedas por prêmios. O saldo é debitado assim que ele resgata; cancelar um resgate devolve as moedas."
      />
      <CartaoGf titulo="Nova recompensa">
        <NovaRecompensa />
      </CartaoGf>
      <CartaoGf titulo={`Recompensas (${recompensas?.length ?? 0})`}>
        {!recompensas?.length ? (
          <EstadoVazioGf Icone={Gift} compacto titulo="Nenhuma recompensa cadastrada">
            Crie a primeira recompensa acima para abrir a loja.
          </EstadoVazioGf>
        ) : (
          <div className="flex flex-col gap-3">
            {recompensas.map((r) => (
              <LinhaRecompensa
                key={r.id}
                recompensa={{
                  id: r.id,
                  nome: r.nome,
                  descricao: r.descricao,
                  custoMoedas: r.custo_moedas,
                  estoque: r.estoque,
                  limitePorMembro: r.limite_por_membro,
                  validadeAte: r.validade_ate,
                  ativa: r.ativa,
                }}
              />
            ))}
          </div>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
