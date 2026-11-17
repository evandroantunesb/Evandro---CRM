import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { PLACEHOLDERS_CONTRATO } from "@/lib/contrato";
import { EDITAR_MODELO_CONTRATO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { salvarModeloContrato } from "@/lib/acoes/contratos";
import { FormularioModelo } from "./formularios";

export default async function ConfigContrato() {
  const { atual } = await exigirPapel(...EDITAR_MODELO_CONTRATO);
  const supabase = await criarClienteServidor();
  const { data: modelo } = await supabase
    .from("modelos_contrato")
    .select("conteudo")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Venda"
        titulo="Modelo de contrato"
        descricao="Texto do contrato, com campos preenchidos sozinhos."
      />
      <p className="text-sm text-zinc-600">
        Escreva o texto do contrato que a empresa usa. Ao gerar o contrato de um negócio, os campos entre chaves duplas
        são preenchidos automaticamente. Condições fixas (garantias, prazos, foro, dados da empresa) ficam escritas no
        próprio texto. Só são aceitos os campos da lista abaixo.
      </p>
      <Cartao titulo="Campos disponíveis">
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS_CONTRATO.map((p) => (
            <code key={p.chave} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700" title={p.rotulo}>
              {`{{${p.chave}}}`}
            </code>
          ))}
        </div>
      </Cartao>
      <Cartao titulo="Texto do modelo">
        <FormularioModelo
          conteudoInicial={modelo?.conteudo ?? ""}
          salvar={salvarModeloContrato}
          exemplo="Ex.: Pelo presente instrumento, {{empresa_nome}}, CNPJ {{empresa_cnpj}}, e {{cliente_nome}}..."
        />
      </Cartao>
    </div>
  );
}
