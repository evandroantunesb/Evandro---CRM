import Link from "next/link";
import { CabecalhoPagina, CLASSE_VIDRO_CABECALHO } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { NEGOCIOS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";

/** Forecast: o botão de Negócios já leva aqui; a tela com a previsão de fechamento vem numa entrega própria. */
export default async function Forecast() {
  await exigirPapel(...NEGOCIOS);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Comercial"
        titulo="Forecast"
        descricao="Os negócios com chance real de fechar e o previsto para os próximos meses."
        acoes={
          <Link href="/negocios" className={CLASSE_VIDRO_CABECALHO}>
            Voltar para Negócios
          </Link>
        }
      />
      <Cartao titulo="Em construção">
        <p className="text-sm text-texto-2">Esta tela está sendo preparada. Por enquanto, acompanhe a carteira em Negócios.</p>
      </Cartao>
    </div>
  );
}
