import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { formatarDataHora } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarImagensParaEditar } from "@/lib/tela-entrada-servidor";
import { CartaoFaixa } from "./cartao-faixa";
import { FormularioTelaEntrada } from "./formulario";

/** Imagem, frase e texto que a equipe vê ao entrar no Raion, e a foto da faixa do topo (só o admin; o banco confere de novo). */
export default async function TelaEntrada() {
  const { atual } = await exigirPapel("admin");
  const imagens = await carregarImagensParaEditar(await criarClienteServidor(), atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Empresa"
        titulo="Tela de entrada"
        descricao="A imagem, a frase e o texto que a equipe vê ao entrar no Raion. A logo fica fixa ao lado do formulário."
      />
      <p className="text-sm text-texto-2">
        O aparelho lembra a empresa depois do primeiro login. No primeiro acesso ou num aparelho novo, aparece a tela padrão do Raion.
      </p>
      {imagens.atualizadoEm && <p className="text-xs text-texto-2">Última alteração em {formatarDataHora(imagens.atualizadoEm)}.</p>}
      <FormularioTelaEntrada empresaId={atual.empresaId} {...imagens.formulario} />
      <CartaoFaixa empresaId={atual.empresaId} {...imagens.faixa} />
    </div>
  );
}
