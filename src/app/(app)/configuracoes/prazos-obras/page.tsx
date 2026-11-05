import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { CHAVES_PRAZO_OBRA, type ChavePrazoObra } from "@/lib/obras/cronograma";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { prazosObraEditaveis } from "@/lib/prazos-permissao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSetoresCoordenados } from "@/lib/setores-coordenados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioPrazosObra } from "./formulario";

const ehChave = (v: string): v is ChavePrazoObra => (CHAVES_PRAZO_OBRA as readonly string[]).includes(v);

/**
 * Prazos das etapas da obra (OPR): dias úteis do cronograma previsto e da entrega contratada. Admin e gestor mudam
 * todos; o coordenador de um setor, os das etapas do setor (20261124100000). Quem não coordena nada não entra.
 */
export default async function PrazosObras() {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const supabase = await criarClienteServidor();
  const [{ data }, coordenados] = await Promise.all([
    supabase.from("obra_prazos_etapas").select("chave, dias_uteis").eq("empresa_id", atual.empresaId),
    carregarSetoresCoordenados(supabase, atual),
  ]);
  const editaveis = prazosObraEditaveis(atual.papel, coordenados);
  if (editaveis.length === 0) notFound();
  const prazos: Partial<Record<ChavePrazoObra, number>> = {};
  for (const p of data ?? []) if (ehChave(p.chave)) prazos[p.chave] = p.dias_uteis;
  const todos = editaveis.length === CHAVES_PRAZO_OBRA.length;

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* Gestor e coordenadores chegam pela obra (o hub de Configurações é só do admin). */}
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
        {!todos && " Você muda os prazos das etapas do setor que coordena; os demais aparecem só para consulta."}
      </p>
      <Cartao titulo="Dias úteis">
        <FormularioPrazosObra prazos={prazos} editaveis={editaveis} />
      </Cartao>
    </div>
  );
}
