import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao, FOCO } from "@/components/ui";
import { carregarCanais, carregarConcessionarias, type ConcessionariaOpcao } from "@/lib/engenharia-concessionaria";
import { lerCondicoes } from "@/lib/engenharia-enquadramento-regras";
import { carregarConfigPrazos, carregarFeriadosEmpresa, carregarPrazosConcessionaria, type ConfigPrazo } from "@/lib/engenharia-prazos";
import { CHAVES_PRAZO_INTERNO } from "@/lib/engenharia-prazos-regras";
import { lerMarcos } from "@/lib/engenharia-trajetoria";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { coordenaSetor } from "@/lib/prazos-permissao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSetoresCoordenados } from "@/lib/setores-coordenados";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { rotulosDistribuidoras } from "@/lib/tarifa-gd";
import { CanaisConcessionaria } from "./canais";
import { NovaConcessionaria, RenomearConcessionaria } from "./concessionarias";
import { LinhaItemModelo, NovoItemModelo } from "./formularios";
import { FormMarcos } from "./marcos";
import { FormPrazos, LinhaFeriado, NovoFeriado } from "./prazos";

const CAMINHO = "/configuracoes/engenharia";

/**
 * Configurações da Engenharia (entrega 3 das concessionárias; prévia aprovada em 26/11/2026). Por concessionária
 * (`?c=<id>`, padrão a Copel): checklist, prazos da distribuidora e canais. Para a empresa toda: prazos internos,
 * feriados e marcos. O admin vê tudo e cria concessionárias (`?c=nova`); o gestor e o coordenador da Engenharia, só os
 * prazos (20261124100000).
 */
export default async function ConfigEngenharia({ searchParams }: PageProps<"/configuracoes/engenharia">) {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const supabase = await criarClienteServidor();
  // Lista positiva: só o admin vê a tela inteira.
  const completa = atual.papel === "admin";
  if (!completa && !coordenaSetor(atual.papel, await carregarSetoresCoordenados(supabase, atual), "engenharia")) notFound();

  const { c } = await searchParams;
  const pedida = typeof c === "string" ? c : null;
  const concessionarias = await carregarConcessionarias(supabase, atual.empresaId);
  const nova = completa && pedida === "nova";
  const escolhida =
    concessionarias.find((x) => x.id === pedida) ?? concessionarias.find((x) => x.distribuidora === "COPEL-DIS") ?? concessionarias[0] ?? null;
  const prazosInternos = await carregarConfigPrazos(supabase, atual.empresaId);

  const faixa = (
    <FaixaConcessionarias concessionarias={concessionarias} escolhida={nova ? null : escolhida} admin={completa} nova={nova} />
  );

  if (!completa) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <CabecalhoPagina
          detalhe
          voltar={{ href: "/engenharia", rotulo: "Engenharia" }}
          sobretitulo="Configurações · Obras"
          titulo="Prazos da Engenharia"
          descricao="Prazos da distribuidora, por concessionária, e prazos internos da equipe."
        />
        <section aria-label="Por concessionária" className="flex flex-col gap-3 rounded-2xl bg-superficie-2 p-3 md:p-4">
          {faixa}
          {escolhida && <PrazosDistribuidora concessionaria={escolhida} prazos={await carregarPrazosConcessionaria(supabase, { empresaId: atual.empresaId, concessionariaId: escolhida.id })} />}
        </section>
        <PrazosInternos prazos={prazosInternos} />
        <Link href="/configuracoes/prazos-obras" className="w-fit px-1 text-sm text-zinc-600 underline hover:text-zinc-900">
          Prazos das etapas da obra (projeto, homologação, vistoria, conexão)
        </Link>
      </div>
    );
  }

  const [feriados, marcosRes] = await Promise.all([
    carregarFeriadosEmpresa(supabase, atual.empresaId),
    supabase.from("engenharia_marcos").select("obras, kwp").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Obras"
        titulo="Engenharia"
        descricao="Por concessionária: checklist, prazos da distribuidora e canais. Para a empresa toda: prazos internos, feriados e marcos."
      />

      <section aria-label="Por concessionária" className="flex flex-col gap-3 rounded-2xl bg-superficie-2 p-3 md:p-4">
        {faixa}
        {nova ? (
          <Cartao titulo="Nova concessionária">
            <NovaConcessionariaDados supabase={supabase} empresaId={atual.empresaId} concessionarias={concessionarias} />
          </Cartao>
        ) : escolhida ? (
          <PorConcessionaria supabase={supabase} empresaId={atual.empresaId} concessionaria={escolhida} />
        ) : (
          <p className="text-sm text-zinc-600">Nenhuma concessionária cadastrada.</p>
        )}
      </section>

      <h2 className="sobretitulo mt-4 px-1">Para a empresa toda</h2>
      <PrazosInternos prazos={prazosInternos} />
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

/** Escolha da concessionária (links, para funcionar sem JavaScript) e, para o admin, "+ Nova concessionária". */
function FaixaConcessionarias({
  concessionarias,
  escolhida,
  admin,
  nova,
}: {
  concessionarias: ConcessionariaOpcao[];
  escolhida: ConcessionariaOpcao | null;
  admin: boolean;
  nova: boolean;
}) {
  const chip = `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors md:min-h-10 ${FOCO}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="sobretitulo">Concessionária</p>
      <nav aria-label="Escolher concessionária" className="flex flex-wrap gap-2">
        {concessionarias.map((c) => (
          <Link
            key={c.id}
            href={`${CAMINHO}?c=${c.id}`}
            aria-current={c.id === escolhida?.id ? "page" : undefined}
            className={`${chip} ${c.id === escolhida?.id ? "border-carvao bg-carvao text-offwhite" : "border-linha bg-superficie text-texto hover:border-dourado"}`}
          >
            {c.nome}
          </Link>
        ))}
        {admin && (
          <Link
            href={`${CAMINHO}?c=nova`}
            aria-current={nova ? "page" : undefined}
            className={`${chip} border-dashed ${nova ? "border-carvao bg-carvao text-offwhite" : "border-linha bg-superficie text-zinc-700 hover:border-dourado"}`}
          >
            + Nova concessionária
          </Link>
        )}
      </nav>
      {escolhida && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
          <span>
            {escolhida.nome} · distribuidora ANEEL {escolhida.distribuidora}
          </span>
          {admin && <RenomearConcessionaria key={escolhida.id} id={escolhida.id} nome={escolhida.nome} />}
        </div>
      )}
    </div>
  );
}

async function PorConcessionaria({
  supabase,
  empresaId,
  concessionaria,
}: {
  supabase: SupabaseServidor;
  empresaId: string;
  concessionaria: ConcessionariaOpcao;
}) {
  const [{ data }, prazos, canais] = await Promise.all([
    supabase
      .from("engenharia_checklist_modelo")
      .select("id, grupo, titulo, obrigatorio, ordem, ativo, condicoes")
      .eq("empresa_id", empresaId)
      .eq("concessionaria_id", concessionaria.id)
      .order("ordem")
      .order("titulo"),
    carregarPrazosConcessionaria(supabase, { empresaId, concessionariaId: concessionaria.id }),
    carregarCanais(supabase, { empresaId, concessionariaId: concessionaria.id }),
  ]);
  const itens = (data ?? []).map((i) => ({ ...i, condicoes: lerCondicoes(i.condicoes) }));
  return (
    <>
      <Cartao titulo={`Checklist de documentos da ${concessionaria.nome} (${itens.length})`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            Documentos que a Engenharia confere em cada obra desta concessionária. Revise com o responsável técnico. Cada obra
            recebe uma cópia ao aplicar o checklist: editar aqui não muda os itens que ela já tem. Itens novos entram na obra
            pelo botão &quot;Trazer itens novos do modelo&quot;. Item desativado não entra mais.
          </p>
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Condições:</span> diga para quais respostas do enquadramento da obra o item vale (ex.:
            procuração só com &quot;Terceiro com procuração&quot;). Sem condição, vale sempre. Pergunta ainda sem resposta na
            obra não tira o item. Ao salvar o enquadramento, a obra recebe os itens que passaram a valer e os pendentes que
            deixaram de valer viram &quot;não se aplica&quot;.
          </p>
          <NovoItemModelo key={concessionaria.id} proximaOrdem={(itens.at(-1)?.ordem ?? 0) + 10} concessionariaId={concessionaria.id} />
          {itens.length === 0 ? <p className="text-sm text-zinc-500">Nenhum item cadastrado.</p> : itens.map((i) => <LinhaItemModelo key={i.id} item={i} />)}
        </div>
      </Cartao>
      <PrazosDistribuidora concessionaria={concessionaria} prazos={prazos} />
      <Cartao titulo={`Canais de entrada da ${concessionaria.nome}`}>
        <CanaisConcessionaria key={concessionaria.id} concessionariaId={concessionaria.id} canais={canais} />
      </Cartao>
    </>
  );
}

async function NovaConcessionariaDados({
  supabase,
  empresaId,
  concessionarias,
}: {
  supabase: SupabaseServidor;
  empresaId: string;
  concessionarias: ConcessionariaOpcao[];
}) {
  const [{ data: tarifas }, { data: semConcessionaria }] = await Promise.all([
    supabase.from("tarifas_gd_aneel").select("distribuidora"),
    supabase.rpc("obras_sem_concessionaria_por_distribuidora", { p_empresa_id: empresaId }),
  ]);
  const rotulos = rotulosDistribuidoras((tarifas ?? []).map((t) => t.distribuidora));
  const distribuidoras = [...rotulos].toSorted((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  return (
    <NovaConcessionaria
      distribuidoras={distribuidoras}
      jaCadastradas={concessionarias.map((c) => c.distribuidora)}
      obrasSemConcessionaria={Object.fromEntries((semConcessionaria ?? []).map((l) => [l.distribuidora, l.obras]))}
      temCopel={concessionarias.some((c) => c.distribuidora === "COPEL-DIS")}
      voltar={CAMINHO}
    />
  );
}

const AJUDA_DIAS =
  "Cada prazo conta em dias úteis ou corridos. Em dias úteis, a partir do dia útil seguinte ao marco: sem sábado, domingo, feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi) e os feriados da empresa. Em dias corridos, todos os dias contam. Prazo vencido aparece na Central da Engenharia; não muda a etapa nem bloqueia nada. Campo vazio = sem prazo.";

/** Prazos que a distribuidora tem para responder, desta concessionária. Admin, gestor e quem coordena a Engenharia. */
function PrazosDistribuidora({ concessionaria, prazos }: { concessionaria: ConcessionariaOpcao; prazos: ConfigPrazo[] }) {
  return (
    <Cartao titulo={`Prazos da distribuidora (${concessionaria.nome})`}>
      {prazos.length === 0 ? (
        <p className="text-sm text-zinc-500">Prazos indisponíveis.</p>
      ) : (
        <FormPrazos
          key={concessionaria.id}
          concessionariaId={concessionaria.id}
          rotuloSalvar={`Salvar prazos da ${concessionaria.nome}`}
          grupos={[
            {
              titulo: "Da distribuidora",
              ajuda: `Prazos que a distribuidora tem para responder, com os valores do responsável técnico. Vazio, a tela não mostra. O da obra de rede continua vindo do orçamento de cada obra. ${AJUDA_DIAS}`,
              prazos,
            },
          ]}
        />
      )}
    </Cartao>
  );
}

/** Prazos internos da equipe (valem para a empresa toda). */
function PrazosInternos({ prazos }: { prazos: ConfigPrazo[] }) {
  const porChave = new Map(prazos.map((p) => [p.chave, p]));
  const linhas = CHAVES_PRAZO_INTERNO.flatMap((c) => porChave.get(c) ?? []);
  return (
    <Cartao titulo="Prazos internos da equipe">
      {linhas.length === 0 ? (
        <p className="text-sm text-zinc-500">Prazos indisponíveis.</p>
      ) : (
        <FormPrazos
          grupos={[{ titulo: "Internos", ajuda: `Metas da própria equipe. Os valores iniciais são sugestões: ajuste à rotina da empresa. ${AJUDA_DIAS}`, prazos: linhas }]}
        />
      )}
    </Cartao>
  );
}
