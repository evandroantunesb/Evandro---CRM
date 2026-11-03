import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { CHAVES_PRAZO_OBRA, type ChavePrazoObra } from "@/lib/obras/cronograma";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioPrazosObra } from "./formulario";

const ehChave = (v: string): v is ChavePrazoObra => (CHAVES_PRAZO_OBRA as readonly string[]).includes(v);

/** Prazos das etapas da obra (OPR): admin e gestor definem os dias úteis do cronograma previsto e da entrega contratada. */
export default async function PrazosObras() {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("obra_prazos_etapas").select("chave, dias_uteis").eq("empresa_id", atual.empresaId);
  const prazos: Partial<Record<ChavePrazoObra, number>> = {};
  for (const p of data ?? []) if (ehChave(p.chave)) prazos[p.chave] = p.dias_uteis;

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela Apresentação da obra (o hub de Configurações é só do admin). */}
      <CabecalhoPagina
        detalhe
        voltar={atual.papel === "admin" ? { href: "/configuracoes", rotulo: "Configurações" } : { href: "/obras", rotulo: "Obras" }}
        sobretitulo="Configurações · Obras"
        titulo="Prazos das etapas"
        descricao="Dias úteis de cada etapa da obra e da entrega contratada."
      />
      <p className="text-sm text-texto-2">
        Quantos dias úteis cada etapa da obra deve levar. É o que forma o previsto do cronograma e a entrega contratada. Os prazos da
        Engenharia (protocolo, exigência, vistoria) continuam em Configurações › Engenharia.
      </p>
      <Cartao titulo="Dias úteis">
        <FormularioPrazosObra prazos={prazos} />
      </Cartao>
    </div>
  );
}
