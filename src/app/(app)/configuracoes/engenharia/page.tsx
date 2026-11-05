import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { lerCondicoes } from "@/lib/engenharia-enquadramento-regras";
import { carregarConfigPrazos, carregarFeriadosEmpresa } from "@/lib/engenharia-prazos";
import { CHAVES_PRAZO_DISTRIBUIDORA, CHAVES_PRAZO_INTERNO, type ChavePrazo } from "@/lib/engenharia-prazos-regras";
import { lerMarcos } from "@/lib/engenharia-trajetoria";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { coordenaSetor } from "@/lib/prazos-permissao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSetoresCoordenados } from "@/lib/setores-coordenados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaItemModelo, NovoItemModelo } from "./formularios";
import { FormMarcos } from "./marcos";
import { FormPrazos, LinhaFeriado, NovoFeriado } from "./prazos";

/**
 * Configurações da Engenharia. O admin vê tudo; o gestor e o coordenador da Engenharia, só os prazos
 * (20261124100000). Checklist, feriados e marcos continuam do admin.
 */
export default async function ConfigEngenharia() {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const supabase = await criarClienteServidor();
  // Lista positiva: só o admin vê a tela inteira.
  const completa = atual.papel === "admin";
  if (!completa) {
    if (!coordenaSetor(atual.papel, await carregarSetoresCoordenados(supabase, atual), "engenharia")) notFound();
    const prazos = await carregarConfigPrazos(supabase, atual.empresaId);
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <CabecalhoPagina
          detalhe
          voltar={{ href: "/engenharia", rotulo: "Engenharia" }}
          sobretitulo="Configurações · Obras"
          titulo="Prazos da Engenharia"
          descricao="Prazos internos da equipe e prazos da distribuidora."
        />
        <SecaoPrazos prazos={prazos} />
        <Link href="/configuracoes/prazos-obras" className="w-fit px-1 text-sm text-zinc-600 underline hover:text-zinc-900">
          Prazos das etapas da obra (projeto, homologação, vistoria, conexão)
        </Link>
      </div>
    );
  }
  // Enquanto a migration não estiver aplicada (preview usa o banco de produção), as listas vêm vazias.
  const [{ data }, prazos, feriados, marcosRes] = await Promise.all([
    supabase
      .from("engenharia_checklist_modelo")
      .select("id, grupo, titulo, obrigatorio, ordem, ativo, condicoes")
      .eq("empresa_id", atual.empresaId)
      .order("ordem")
      .order("titulo"),
    carregarConfigPrazos(supabase, atual.empresaId),
    carregarFeriadosEmpresa(supabase, atual.empresaId),
    supabase.from("engenharia_marcos").select("obras, kwp").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  const itens = (data ?? []).map((i) => ({ ...i, condicoes: lerCondicoes(i.condicoes) }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Obras"
        titulo="Engenharia"
        descricao="Checklist de documentos, prazos, feriados da empresa e marcos da trajetória."
      />

      <h2 className="sobretitulo mt-4 px-1">Checklist de documentos</h2>
      <p className="text-sm text-zinc-600">
        Documentos que a Engenharia confere em cada obra. A lista inicial é um ponto de partida para a Copel: revise com o
        responsável técnico. Cada obra recebe uma cópia ao aplicar o checklist: editar aqui não muda os itens que ela já tem.
        Itens novos entram na obra pelo botão &quot;Trazer itens novos do modelo&quot;. Item desativado não entra mais.
      </p>
      <p className="text-sm text-zinc-600">
        <span className="font-medium">Condições:</span> diga para quais respostas do enquadramento da obra o item vale (ex.:
        procuração só com &quot;Terceiro com procuração&quot;). Sem condição, vale sempre. Pergunta ainda sem resposta na
        obra não tira o item. Ao salvar o enquadramento, a obra recebe os itens que passaram a valer e os pendentes que
        deixaram de valer viram &quot;não se aplica&quot;.
      </p>
      <Cartao titulo="Novo item">
        <NovoItemModelo proximaOrdem={(itens.at(-1)?.ordem ?? 0) + 10} />
      </Cartao>
      <Cartao titulo={`Itens (${itens.length})`}>
        {itens.length === 0 ? <p className="text-sm text-zinc-500">Nenhum item cadastrado.</p> : itens.map((i) => <LinhaItemModelo key={i.id} item={i} />)}
      </Cartao>

      <SecaoPrazos prazos={prazos} />
      <Cartao titulo={`Feriados da empresa (${feriados.length})`}>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">Municipais ou estaduais. Os nacionais já são considerados.</p>
          <NovoFeriado />
          {feriados.map((f) => (
            <LinhaFeriado key={f.id} feriado={f} />
          ))}
        </div>
      </Cartao>

      <h2 className="sobretitulo mt-4 px-1">Marcos da trajetória</h2>
      <p className="text-sm text-zinc-600">
        Em &quot;Sua trajetória&quot; e na &quot;Trajetória da equipe&quot;, a barra mostra quanto falta para o próximo marco: a cada
        tantas obras ou tantos kWp com a Engenharia concluída. Vale para a empresa toda.
      </p>
      <Cartao titulo="Marcos">
        {marcosRes.error || !marcosRes.data ? <p className="text-sm text-zinc-500">Marcos indisponíveis.</p> : <FormMarcos marcos={lerMarcos(marcosRes.data)} />}
      </Cartao>
    </div>
  );
}

/** Prazos da Engenharia (internos e da distribuidora): admin, gestor e o coordenador da Engenharia editam. */
function SecaoPrazos({ prazos }: { prazos: Awaited<ReturnType<typeof carregarConfigPrazos>> }) {
  const porChave = new Map(prazos.map((p) => [p.chave, p]));
  const linhas = (chaves: readonly ChavePrazo[]) => chaves.flatMap((c) => porChave.get(c) ?? []);
  return (
    <>
      <h2 className="sobretitulo mt-4 px-1">Prazos</h2>
      <p className="text-sm text-zinc-600">
        Cada prazo conta em dias úteis ou corridos. Em dias úteis, a partir do dia útil seguinte ao marco: sem sábado,
        domingo, feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi) e os feriados da empresa. Em
        dias corridos, todos os dias contam. Prazo vencido aparece na Central da Engenharia; não muda a etapa nem bloqueia
        nada. Campo vazio = sem prazo.
      </p>
      <Cartao titulo="Prazos da Engenharia">
        {prazos.length === 0 ? (
          <p className="text-sm text-zinc-500">Prazos indisponíveis.</p>
        ) : (
          <FormPrazos
            grupos={[
              { titulo: "Internos", ajuda: "Metas da própria equipe. Os valores iniciais são sugestões: ajuste à rotina da empresa.", prazos: linhas(CHAVES_PRAZO_INTERNO) },
              {
                titulo: "Da distribuidora",
                ajuda: "Prazos que a Copel/ANEEL dá à distribuidora, com os valores informados pelo engenheiro. Ajuste com o responsável técnico; vazio, a tela não mostra.",
                prazos: linhas(CHAVES_PRAZO_DISTRIBUIDORA),
              },
            ]}
          />
        )}
      </Cartao>
    </>
  );
}
