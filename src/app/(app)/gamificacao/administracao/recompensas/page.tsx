import { Gift } from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { assinarImagensEmLote } from "@/lib/storage-imagens";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, VoltarGf } from "../../_compartilhado/ui";
import { LinhaRecompensa, NovaRecompensa } from "../_compartilhado/formularios";

export default async function Recompensas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: recompensas } = await supabase
    .from("recompensas")
    .select("id, nome, descricao, custo_moedas, estoque, limite_por_membro, validade_ate, ativa, imagem_caminho")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");
  const urlsImagem = await assinarImagensEmLote(
    supabase,
    "recompensas",
    (recompensas ?? []).map((r) => r.imagem_caminho),
  );

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
                empresaId={atual.empresaId}
                recompensa={{
                  id: r.id,
                  nome: r.nome,
                  descricao: r.descricao,
                  custoMoedas: r.custo_moedas,
                  estoque: r.estoque,
                  limitePorMembro: r.limite_por_membro,
                  validadeAte: r.validade_ate,
                  ativa: r.ativa,
                  imagemCaminho: r.imagem_caminho,
                  imagemUrl: r.imagem_caminho ? (urlsImagem.get(r.imagem_caminho) ?? null) : null,
                }}
              />
            ))}
          </div>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
