import { User, UserCog } from "lucide-react";
import { Botao, Cartao, Selo, Voltar } from "@/components/ui";
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
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Equipes</h1>
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
            <ul className="mb-3 flex flex-col gap-2">
              {[...equipe.equipe_membros]
                .sort((a, b) => Number(b.e_gestor) - Number(a.e_gestor))
                .map((em) => {
                  const Icone = em.e_gestor ? UserCog : User;
                  return (
                    <li
                      key={em.membro_id}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border border-linha bg-superficie-2 p-3 text-sm ${em.e_gestor ? "bg-gradient-to-br from-dourado/10 via-transparent" : ""}`}
                    >
                      <Icone size={16} aria-hidden className="shrink-0 text-texto-2" />
                      <span className="flex-1 truncate text-texto">{nomes.get(em.membro_id)}</span>
                      {em.e_gestor && <Selo tom="atencao">Gestor</Selo>}
                      <form action={alternarGestor}>
                        <input type="hidden" name="equipeId" value={equipe.id} />
                        <input type="hidden" name="membroId" value={em.membro_id} />
                        <input type="hidden" name="e_gestor" value={String(!em.e_gestor)} />
                        <Botao type="submit" variante="secundario" className="min-h-0 px-3 py-1 text-xs">
                          {em.e_gestor ? "Tirar gestor" : "Tornar gestor"}
                        </Botao>
                      </form>
                      <form action={removerDaEquipe}>
                        <input type="hidden" name="equipeId" value={equipe.id} />
                        <input type="hidden" name="membroId" value={em.membro_id} />
                        <Botao type="submit" variante="perigo" className="min-h-0 px-3 py-1 text-xs">
                          Remover
                        </Botao>
                      </form>
                    </li>
                  );
                })}
              {!equipe.equipe_membros.length && <li className="text-sm text-texto-2">Ninguém nesta equipe ainda.</li>}
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
