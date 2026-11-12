import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TELAS_OPCIONAIS } from "@/lib/telas-empresa";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";
import { FormularioTelas } from "./formulario";

const TELAS_DO_SOLO = ["Início", "Tarefas", "Negócios", "Contatos", "Propostas e contratos", "Configurações"];

/**
 * Telas da empresa (telas por empresa, 20261203100000_telas_empresa.sql): no PRO, o admin liga e desliga as telas
 * opcionais e os setores da obra (20261206100000_setores_da_obra.sql); no Solo, as telas são as do plano. Só o admin; o banco confere de novo.
 */
export default async function TelasDaEmpresa() {
  const { atual } = await exigirPapel("admin");
  const telas = await obterTelasEmpresa();
  const { data: empresa } = telas.solo
    ? { data: null }
    : await (await criarClienteServidor()).from("empresas").select("eletroposto_ativo").eq("id", atual.empresaId).maybeSingle();

  return (
    <div className="mx-auto flex max-w-5xl animate-entrar flex-col gap-6">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Empresa"
        titulo="Telas da empresa"
        descricao={
          telas.solo
            ? "No plano Solo você toca a empresa sozinho: estas são as telas que você usa."
            : "Início, Tarefas, Negócios, Contatos e Propostas e contratos ficam sempre ligados. Uma tela desligada some do menu de todo mundo, e os dados dela continuam guardados."
        }
      />
      {telas.solo ? (
        <section className="painel flex flex-col gap-3 p-5">
          <ul className="flex flex-col divide-y divide-linha">
            {TELAS_DO_SOLO.map((t) => (
              <li key={t} className="py-2.5 font-medium text-texto first:pt-0">
                {t}
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-superficie-2 px-3 py-2.5 text-sm text-texto-2">
            Cresceu e contratou alguém? Passe para o PRO e libere equipe, setores, gestão e Gamificação.
          </p>
        </section>
      ) : (
        <FormularioTelas
          ligadasIniciais={TELAS_OPCIONAIS.filter((t) => telas.ligadas.has(t))}
          setoresDesligadosIniciais={[...telas.setoresDesligados]}
          eletropostoLiberado={!!empresa?.eletroposto_ativo}
        />
      )}
    </div>
  );
}
