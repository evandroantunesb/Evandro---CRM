import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_STATUS_RESGATE, type StatusResgate } from "@/lib/tipos";
import { CartaoRecompensa } from "./formulario";

const TOM_STATUS: Record<StatusResgate, "neutro" | "positivo" | "negativo" | "atencao"> = {
  solicitado: "atencao",
  aprovado: "neutro",
  entregue: "positivo",
  cancelado: "negativo",
};

export default async function LojaDeRecompensas() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: lancamentos }, { data: recompensas }, { data: meusResgates }] = await Promise.all([
    supabase.from("point_ledger").select("pontos").eq("membro_id", atual.membroId).eq("estornado", false),
    supabase
      .from("recompensas")
      .select("id, nome, descricao, custo_pontos")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .or(`validade_ate.is.null,validade_ate.gte.${hoje}`)
      .order("custo_pontos"),
    supabase
      .from("resgates")
      .select("id, status, pontos_debitados, created_at, recompensas(nome)")
      .eq("membro_id", atual.membroId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const saldo = (lancamentos ?? []).reduce((soma, l) => soma + l.pontos, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Loja de recompensas</h1>

      <Cartao titulo="Seu saldo">
        <p className="text-3xl font-semibold text-zinc-900">{saldo.toLocaleString("pt-BR")} pts</p>
      </Cartao>

      <Cartao titulo="Recompensas disponíveis">
        {!recompensas?.length && <p className="text-sm text-zinc-600">Nenhuma recompensa disponível no momento.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(recompensas ?? []).map((r) => (
            <CartaoRecompensa
              key={r.id}
              recompensa={{ id: r.id, nome: r.nome, descricao: r.descricao, custoPontos: r.custo_pontos }}
              saldo={saldo}
            />
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Meus resgates">
        {!meusResgates?.length && <p className="text-sm text-zinc-600">Você ainda não resgatou nada.</p>}
        <ul className="flex flex-col">
          {(meusResgates ?? []).map((r) => {
            const recompensa = r.recompensas as unknown as { nome: string } | null;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2 text-sm first:border-t-0">
                <div className="flex flex-col">
                  <span className="text-zinc-900">{recompensa?.nome ?? "(recompensa removida)"}</span>
                  <span className="text-xs text-zinc-500">{formatarDataHora(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">{r.pontos_debitados.toLocaleString("pt-BR")} pts</span>
                  <Selo tom={TOM_STATUS[r.status as StatusResgate]}>{ROTULO_STATUS_RESGATE[r.status as StatusResgate]}</Selo>
                </div>
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}
