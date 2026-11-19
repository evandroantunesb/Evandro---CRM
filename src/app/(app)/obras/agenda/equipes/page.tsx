import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { carregarEquipesInstalacao } from "@/lib/obras/agenda";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaEquipe, NovaEquipe } from "./formularios";

/**
 * Equipes de instalação terceirizadas (20261217100000): admin, gestor e quem atua no Operacional cadastram; não se
 * apagam, ficam inativas (somem da escolha ao agendar e continuam nas obras antigas). Elas não acessam o Raion.
 */
export default async function EquipesInstalacao() {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  const equipes = await carregarEquipesInstalacao(supabase, atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/obras/agenda", rotulo: "Agenda" }}
        sobretitulo="Obras · Agenda"
        titulo="Equipes de instalação"
        descricao="Equipes terceirizadas que você usa com frequência. Elas não acessam o Raion."
      />
      <Cartao titulo="Nova equipe">
        <NovaEquipe />
      </Cartao>
      <Cartao titulo="Cadastradas">
        {equipes.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma equipe ainda. Ao agendar, também dá para digitar uma equipe só para aquela obra.</p>
        ) : (
          equipes.map((e) => <LinhaEquipe key={e.id} equipe={e} />)
        )}
        <p className="mt-3 text-xs text-zinc-500">Equipe inativa some da escolha ao agendar, mas continua nas obras em que já foi usada.</p>
      </Cartao>
    </div>
  );
}
