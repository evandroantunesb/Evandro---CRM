import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { candidatosDistribuicao, carregarAtribuicoesPendentes, responsavelPadrao } from "@/lib/distribuicao-leads";
import { exigirPapel } from "@/lib/sessao";
import { GESTAO_COMERCIAL } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaAtribuicaoPendente } from "./linha-atribuicao";

export default async function LeadsADistribuir() {
  const { atual } = await exigirPapel(...GESTAO_COMERCIAL);
  const supabase = await criarClienteServidor();
  const [config, atribuicoes] = await Promise.all([carregarConfiguracao(atual.empresaId), carregarAtribuicoesPendentes(supabase, atual.empresaId)]);
  const candidatos = candidatosDistribuicao(config.membros);
  const agora = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Leads a distribuir</h1>
        <p className="text-sm text-zinc-500">
          Leads que chegaram pela captura com um responsável sugerido pelo rodízio. Confirme a sugestão ou escolha outra
          pessoa. Sem decisão, o lead é atribuído automaticamente ao sugerido quando vence o prazo de auto-aprovação da
          origem.
        </p>
      </div>

      <Cartao titulo={`Aguardando distribuição (${atribuicoes.length})`}>
        {atribuicoes.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum lead aguardando distribuição. Novos leads da captura aparecem aqui.</p>
        ) : (
          atribuicoes.map((a) => (
            <LinhaAtribuicaoPendente
              key={a.id}
              atribuicao={a}
              minutosRestantes={Math.round((new Date(a.expiraEm).getTime() - agora.getTime()) / 60_000)}
              candidatos={candidatos}
              padrao={responsavelPadrao(candidatos, a.membroSugeridoId)}
            />
          ))
        )}
      </Cartao>
    </div>
  );
}
