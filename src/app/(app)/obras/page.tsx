import { assinarAvatares } from "@/lib/avatares";
import { kpis } from "@/lib/obras/derivados";
import { carregarObras } from "@/lib/obras/dados";
import { OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ListaObras } from "./_componentes/lista-obras";

export default async function Obras() {
  const { atual } = await exigirPapel(...OBRAS);
  const supabase = await criarClienteServidor();
  const obras = await carregarObras(supabase, {
    papel: atual.papel,
    empresaId: atual.empresaId,
    membroId: atual.membroId,
  });
  const k = kpis(obras);

  const caminhos = obras.flatMap((o) =>
    Object.values(o.setores).map((s) => s.principal?.avatarCaminho),
  );
  const urlsAvatar = Object.fromEntries(await assinarAvatares(supabase, caminhos));

  const indicadores = [
    { legenda: "Total de obras", valor: k.total },
    { legenda: "Em andamento", valor: k.emAndamento },
    { legenda: "Com setor parado", valor: k.comSetorParado },
    { legenda: "Aguardando terceiro", valor: k.comSetorAguardando },
    { legenda: "Concluídas", valor: k.concluidas },
    { legenda: "Pausadas", valor: k.pausadas },
    { legenda: "Canceladas", valor: k.canceladas },
    { legenda: "Com alerta", valor: k.comAlerta },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Obras</h1>
        <p className="text-sm text-zinc-500">
          Acompanhe o andamento de Compras, Engenharia e Operacional em cada obra.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {indicadores.map((i) => (
          <div
            key={i.legenda}
            className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4"
          >
            <p className="text-xs font-medium text-zinc-500">{i.legenda}</p>
            <p className="text-2xl font-semibold text-zinc-900 [font-variant-numeric:tabular-nums]">
              {i.valor}
            </p>
          </div>
        ))}
      </div>

      <ListaObras obras={obras} urlsAvatar={urlsAvatar} />
    </div>
  );
}
