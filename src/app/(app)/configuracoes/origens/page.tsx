import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { DistribuicaoLeads, LinhaOrigem, NovaOrigem } from "./formularios";

export default async function ConfigOrigens() {
  const { atual } = await exigirPapel("admin");
  const { origens, modoDistribuicaoLeads, percentualLeadsSdr } = await carregarConfiguracao(atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Origens dos leads</h1>
      <p className="text-sm text-zinc-600">
        Os canais por onde os leads chegam. Origem desativada some das opções, mas os negócios antigos continuam com ela.
        Todo lead que cai numa origem é sugerido pro rodízio e fica pendente de aprovação do gestor (Painel) até o prazo de
        auto-aprovação abaixo — depois disso, entra sozinho pro vendedor sugerido.
      </p>
      <Cartao titulo="Nova origem">
        <NovaOrigem />
      </Cartao>
      <Cartao titulo={`Origens (${origens.length})`}>
        {origens.map((o) => (
          <LinhaOrigem key={o.id} origem={o} />
        ))}
      </Cartao>
      <Cartao titulo="Distribuição de leads entre vendedores e SDR">
        <p className="mb-3 text-sm text-zinc-600">
          Define como o rodízio escolhe o responsável sugerido quando um lead novo chega.
        </p>
        <DistribuicaoLeads modo={modoDistribuicaoLeads} percentual={percentualLeadsSdr} />
      </Cartao>
    </div>
  );
}
