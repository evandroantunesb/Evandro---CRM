import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioAtendimentoCompras } from "./formulario";

/**
 * Quem atende Compras quando a empresa não tem ninguém ativo no setor (20261125100000): o admin escolhe Administrativo,
 * Operacional ou só admin e gestor. Vale só enquanto ninguém ativo tiver o setor Compras.
 */
export default async function AtendimentoCompras() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: empresa, error }, { data: atende, error: erroAtende }] = await Promise.all([
    supabase.from("empresas").select("compras_atendido_por").eq("id", atual.empresaId).single(),
    supabase.rpc("setor_atende_compras", { p_empresa_id: atual.empresaId }),
  ]);
  if (error) throw error;
  if (erroAtende) throw erroAtende;
  const temCompras = atende === "compras";

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Obras"
        titulo="Compras"
        descricao="Quem atende Compras quando a empresa não tem ninguém no setor."
      />
      <p className="text-sm text-texto-2">
        {temCompras
          ? "Hoje há pessoas no setor Compras, então elas atendem. A escolha abaixo só vale enquanto ninguém ativo tiver o setor Compras."
          : "Hoje ninguém ativo tem o setor Compras. Quem você escolher aqui vê as obras a comprar, inicia a compra e faz os pedidos."}
      </p>
      <Cartao titulo="Quem atende Compras">
        <FormularioAtendimentoCompras atual={empresa?.compras_atendido_por ?? "nenhum"} />
      </Cartao>
    </div>
  );
}
