import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { formatarDataHora } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BUCKET_TELA_ENTRADA, montarTelaEntrada } from "@/lib/tela-entrada";
import { FormularioTelaEntrada } from "./formulario";

/** Imagem, frase e texto que a equipe vê ao entrar no Raion (só o admin; o banco confere de novo). */
export default async function TelaEntrada() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: linha } = await supabase
    .from("empresa_tela_entrada")
    .select("frase, texto, imagem_caminho, updated_at")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  const tela = montarTelaEntrada(linha, (caminho) => supabase.storage.from(BUCKET_TELA_ENTRADA).getPublicUrl(caminho).data.publicUrl);

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
      {linha && <p className="text-xs text-texto-2">Última alteração em {formatarDataHora(linha.updated_at)}.</p>}
      <FormularioTelaEntrada
        empresaId={atual.empresaId}
        frase={linha?.frase ?? ""}
        texto={linha?.texto ?? ""}
        imagem={tela.imagem}
        nomeImagem={tela.imagemPersonalizada ? "Imagem da empresa" : "Paisagem do Raion (padrão)"}
        personalizada={!!linha}
      />
    </div>
  );
}
