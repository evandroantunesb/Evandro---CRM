import { Cartao, Voltar } from "@/components/ui";
import { lerCondicoes } from "@/lib/engenharia-enquadramento-regras";
import { carregarConfigPrazos, carregarFeriadosEmpresa } from "@/lib/engenharia-prazos";
import { CHAVES_PRAZO_DISTRIBUIDORA, CHAVES_PRAZO_INTERNO, type ChavePrazo } from "@/lib/engenharia-prazos-regras";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaItemModelo, NovoItemModelo } from "./formularios";
import { FormPrazos, LinhaFeriado, NovoFeriado } from "./prazos";

export default async function ConfigEngenharia() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  // Enquanto a migration não estiver aplicada (preview usa o banco de produção), as listas vêm vazias.
  const [{ data }, prazos, feriados] = await Promise.all([
    supabase
      .from("engenharia_checklist_modelo")
      .select("id, grupo, titulo, obrigatorio, ordem, ativo, condicoes")
      .eq("empresa_id", atual.empresaId)
      .order("ordem")
      .order("titulo"),
    carregarConfigPrazos(supabase, atual.empresaId),
    carregarFeriadosEmpresa(supabase, atual.empresaId),
  ]);
  const itens = (data ?? []).map((i) => ({ ...i, condicoes: lerCondicoes(i.condicoes) }));
  const dias = new Map(prazos.map((p) => [p.chave, p.diasUteis]));
  const linhas = (chaves: readonly ChavePrazo[]) => chaves.filter((c) => dias.has(c)).map((chave) => ({ chave, diasUteis: dias.get(chave) ?? null }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <div className="flex flex-col gap-1">
        <p className="sobretitulo">Configurações · Obras</p>
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Engenharia</h1>
      </div>

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

      <h2 className="sobretitulo mt-4 px-1">Prazos</h2>
      <p className="text-sm text-zinc-600">
        Contam em dias úteis a partir do dia útil seguinte ao marco: sem sábado, domingo, feriados nacionais (inclusive
        Carnaval, Sexta-feira Santa e Corpus Christi) e os feriados da empresa abaixo. Prazo vencido aparece na Central da
        Engenharia; não muda a etapa nem bloqueia nada. Campo vazio = sem prazo.
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
                ajuda: "Prazos que a Copel/ANEEL dá à distribuidora. Preencha com o responsável técnico; vazio, a tela não mostra.",
                prazos: linhas(CHAVES_PRAZO_DISTRIBUIDORA),
              },
            ]}
          />
        )}
      </Cartao>
      <Cartao titulo={`Feriados da empresa (${feriados.length})`}>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">Municipais ou estaduais. Os nacionais já são considerados.</p>
          <NovoFeriado />
          {feriados.map((f) => (
            <LinhaFeriado key={f.id} feriado={f} />
          ))}
        </div>
      </Cartao>
    </div>
  );
}
