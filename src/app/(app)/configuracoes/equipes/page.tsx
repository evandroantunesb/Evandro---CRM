import { Cartao, Selo } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { alternarEquipeAtiva, alternarGestor, removerDaEquipe } from "./actions";
import { FormularioAdicionar, FormularioEquipe } from "./formularios";

export default async function Equipes() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();

  const [{ data: equipes }, { data: membros }] = await Promise.all([
    supabase
      .from("equipes")
      .select("id, nome, ativa, equipe_membros(membro_id, e_gestor)")
      .eq("empresa_id", atual.empresaId)
      .order("nome"),
    supabase
      .from("empresa_membros")
      .select("id, ativo, perfis(nome, email)")
      .eq("empresa_id", atual.empresaId),
  ]);

  const nomes = new Map(
    (membros ?? []).map((m) => {
      const p = m.perfis as unknown as { nome: string; email: string } | null;
      return [m.id, p?.nome || p?.email || "(sem nome)"];
    }),
  );
  const ativos = (membros ?? []).filter((m) => m.ativo);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Equipes</h1>
      <Cartao titulo="Nova equipe">
        <FormularioEquipe />
      </Cartao>
      {(equipes ?? []).map((equipe) => {
        const naEquipe = new Set(equipe.equipe_membros.map((em) => em.membro_id));
        return (
          <Cartao
            key={equipe.id}
            titulo={equipe.nome}
            acao={
              <form action={alternarEquipeAtiva} className="flex items-center gap-2">
                {!equipe.ativa && <Selo tom="negativo">Inativa</Selo>}
                <input type="hidden" name="equipeId" value={equipe.id} />
                <input type="hidden" name="ativa" value={String(!equipe.ativa)} />
                <button className="text-sm text-zinc-600 hover:underline">
                  {equipe.ativa ? "Desativar" : "Reativar"}
                </button>
              </form>
            }
          >
            <ul className="mb-3 flex flex-col">
              {equipe.equipe_membros.map((em) => (
                <li key={em.membro_id} className="flex items-center gap-2 border-t border-zinc-100 py-2 text-sm">
                  <span className="flex-1">{nomes.get(em.membro_id)}</span>
                  {em.e_gestor && <Selo tom="atencao">Gestor</Selo>}
                  <form action={alternarGestor}>
                    <input type="hidden" name="equipeId" value={equipe.id} />
                    <input type="hidden" name="membroId" value={em.membro_id} />
                    <input type="hidden" name="e_gestor" value={String(!em.e_gestor)} />
                    <button className="text-zinc-600 hover:underline">
                      {em.e_gestor ? "Tirar gestor" : "Tornar gestor"}
                    </button>
                  </form>
                  <form action={removerDaEquipe}>
                    <input type="hidden" name="equipeId" value={equipe.id} />
                    <input type="hidden" name="membroId" value={em.membro_id} />
                    <button className="text-red-700 hover:underline">Remover</button>
                  </form>
                </li>
              ))}
              {!equipe.equipe_membros.length && <li className="text-sm text-zinc-500">Ninguém nesta equipe ainda.</li>}
            </ul>
            <FormularioAdicionar
              equipeId={equipe.id}
              candidatos={ativos.filter((m) => !naEquipe.has(m.id)).map((m) => ({ id: m.id, nome: nomes.get(m.id)! }))}
            />
          </Cartao>
        );
      })}
    </div>
  );
}
