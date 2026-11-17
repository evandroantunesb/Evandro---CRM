import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { salvarModeloProcuracao } from "@/lib/acoes/procuracao";
import { PLACEHOLDERS_CONTRATO, type ChaveContrato } from "@/lib/contrato";
import { EDITAR_MODELO_CONTRATO } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioModelo } from "../contrato/formularios";

/** Os campos que uma procuração costuma usar, em destaque na lista (desenho aprovado em 17/11/2026). */
const CAMPOS_DA_PROCURACAO = new Set<ChaveContrato>([
  "cliente_nome",
  "cliente_documento",
  "cliente_rg",
  "cliente_endereco",
  "cliente_cidade",
  "cliente_uf",
  "negocio_uc",
  "distribuidora",
  "empresa_nome",
  "empresa_cnpj",
  "data_hoje",
]);

export default async function ConfigProcuracao() {
  const { atual } = await exigirPapel(...EDITAR_MODELO_CONTRATO);
  const supabase = await criarClienteServidor();
  const { data: modelo } = await supabase
    .from("modelos_procuracao")
    .select("conteudo")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  const campos = [...PLACEHOLDERS_CONTRATO].sort((a, b) => Number(CAMPOS_DA_PROCURACAO.has(b.chave)) - Number(CAMPOS_DA_PROCURACAO.has(a.chave)));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Venda"
        titulo="Modelo de procuração"
        descricao="Texto da procuração, com campos preenchidos sozinhos."
      />
      <p className="text-sm text-zinc-600">
        Cole aqui o texto da procuração que a empresa usa (pode copiar de um Word ou PDF). Ao gerar a procuração de um
        negócio ou de uma obra, os campos entre chaves duplas são preenchidos com os dados do cliente, da unidade
        consumidora e da empresa. Só são aceitos os campos da lista abaixo. Mudar o modelo vale para as próximas
        procurações; as já baixadas não mudam.
      </p>
      <Cartao titulo="Campos disponíveis">
        <p className="mb-2 text-xs text-zinc-500">Em destaque, os que uma procuração costuma usar.</p>
        <div className="flex flex-wrap gap-2">
          {campos.map((p) => (
            <code
              key={p.chave}
              className={`rounded px-2 py-1 text-xs ${CAMPOS_DA_PROCURACAO.has(p.chave) ? "bg-dourado/15 text-carvao" : "bg-zinc-100 text-zinc-700"}`}
              title={p.rotulo}
            >
              {`{{${p.chave}}}`}
            </code>
          ))}
        </div>
      </Cartao>
      <Cartao titulo="Texto do modelo">
        <FormularioModelo
          conteudoInicial={modelo?.conteudo ?? ""}
          salvar={salvarModeloProcuracao}
          exemplo="Ex.: OUTORGANTE: {{cliente_nome}}, inscrito(a) no CPF/CNPJ sob nº {{cliente_documento}}, titular da unidade consumidora nº {{negocio_uc}} junto à {{distribuidora}}..."
        />
      </Cartao>
    </div>
  );
}
