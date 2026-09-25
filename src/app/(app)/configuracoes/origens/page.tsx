import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { LinhaOrigem, NovaOrigem } from "./formularios";

export default async function ConfigOrigens() {
  const { atual } = await exigirPapel("admin");
  const { origens } = await carregarConfiguracao(atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Origens dos leads</h1>
      <p className="text-sm text-zinc-600">
        Os canais por onde os leads chegam. Origem desativada some das opções, mas os negócios antigos continuam com ela.
      </p>
      <Cartao titulo="Nova origem">
        <NovaOrigem />
      </Cartao>
      <Cartao titulo={`Origens (${origens.length})`}>
        {origens.map((o) => (
          <LinhaOrigem key={o.id} origem={o} />
        ))}
      </Cartao>
    </div>
  );
}
