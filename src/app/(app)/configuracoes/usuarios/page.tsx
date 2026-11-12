import Link from "next/link";
import { BriefcaseBusiness, HardHat, Plus, ShieldCheck, Users } from "lucide-react";
import { Indicadores } from "@/app/(app)/negocios/indicadores";
import { Avatar } from "@/components/avatar";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { FOCO } from "@/components/ui";
import { ROTULO_SETOR, SETORES_OBRA } from "@/lib/obras/rotulos";
import { PERFIL, ROTULO_CAPACIDADE, outrosSetores, perfilDoMembro } from "@/lib/perfis-usuario";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";
import { ROTULO_PERFIL_GAMIFICACAO, type Papel, type PerfilGamificacao, type StatusMembro, type TipoVendedor } from "@/lib/tipos";
import { PainelPessoa, type MembroLinha } from "./formularios";

const ABAS = [
  { valor: "ativos", status: "ativo", rotulo: "Ativos" },
  { valor: "inativos", status: "inativo", rotulo: "Inativos" },
  { valor: "desligados", status: "desligado", rotulo: "Desligados" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Linha "Perfil" da tabela: o perfil e o detalhe abaixo (capacidade, ranking, papel). */
function detalhePerfil(m: MembroLinha): string {
  if (m.papel === "operacao") {
    const principal = m.setores?.find((s) => s.setor === m.perfil);
    return principal ? ROTULO_CAPACIDADE[principal.capacidade as "executar" | "coordenar"] ?? "" : "sem setor";
  }
  if (m.papel === "admin") return "proprietário";
  if (m.papel === "gestor") return m.perfilGamificacao ? `${ROTULO_PERFIL_GAMIFICACAO[m.perfilGamificacao]} no ranking` : "vê a equipe";
  return m.perfilGamificacao ? `${ROTULO_PERFIL_GAMIFICACAO[m.perfilGamificacao]} no ranking` : "fora do ranking";
}

const rotuloPerfil = (m: MembroLinha) => (m.perfil ? PERFIL[m.perfil].rotulo : "Operação");

const tambemAtua = (m: MembroLinha) =>
  outrosSetores(m.perfil, m.setores ?? [])
    .map((s) => `${ROTULO_SETOR[s.setor]} (${ROTULO_CAPACIDADE[s.capacidade]})`)
    .join(", ") || "—";

export default async function Usuarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { atual } = await exigirPapel("admin");
  const params = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const aba: Aba = ABAS.some((a) => a.valor === params.aba) ? (params.aba as Aba) : "ativos";
  const busca = texto(params.q).trim();
  const pessoaId = texto(params.pessoa);
  const nova = params.nova === "1";

  const supabase = await criarClienteServidor();
  const [{ data }, { data: setores, error: erroSetores }, telas] = await Promise.all([
    supabase
      .from("empresa_membros")
      .select("id, papel, tipo_vendedor, perfil_gamificacao, recebe_leads, status, perfis(nome, email)")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase.from("membro_setores_obra").select("membro_id, setor, capacidade, principal").eq("empresa_id", atual.empresaId),
    obterTelasEmpresa(),
  ]);

  const membros: MembroLinha[] = (data ?? []).map((m) => {
    const perfil = m.perfis as unknown as { nome: string; email: string } | null;
    const doMembro = erroSetores ? null : (setores ?? []).filter((s) => s.membro_id === m.id);
    return {
      id: m.id,
      nome: perfil?.nome ?? "",
      email: perfil?.email ?? "",
      papel: m.papel as Papel,
      perfil: perfilDoMembro(m.papel as Papel, doMembro ?? []),
      tipoVendedor: m.tipo_vendedor as TipoVendedor | null,
      perfilGamificacao: m.perfil_gamificacao as PerfilGamificacao | null,
      recebeLeads: m.recebe_leads,
      status: m.status as StatusMembro,
      setores: doMembro,
    };
  });

  const ativos = membros.filter((m) => m.status === "ativo");
  const contar = (p: Papel) => ativos.filter((m) => m.papel === p).length;
  const setoresOperacao = SETORES_OBRA.filter((s) => ativos.some((m) => m.perfil === s)).map((s) => ROTULO_SETOR[s]);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const indicadores = [
    { Icone: Users, valor: String(ativos.length), legenda: "Ativos" },
    {
      Icone: BriefcaseBusiness,
      valor: String(contar("vendedor") + contar("sdr")),
      legenda: `Comercial · ${plural(contar("vendedor"), "vendedor", "vendedores")} · ${contar("sdr")} SDR`,
    },
    { Icone: HardHat, valor: String(contar("operacao")), legenda: `Operação${setoresOperacao.length ? ` · ${setoresOperacao.join(", ")}` : ""}` },
    {
      Icone: ShieldCheck,
      valor: String(contar("gestor") + contar("admin")),
      legenda: `Gestão · ${plural(contar("gestor"), "gestor", "gestores")} · ${plural(contar("admin"), "admin", "admins")}`,
    },
  ];

  const status = ABAS.find((a) => a.valor === aba)!.status;
  const termo = normalizar(busca);
  const lista = membros.filter((m) => m.status === status && (!termo || normalizar(`${m.nome} ${m.email}`).includes(termo)));
  const selecionado = membros.find((m) => m.id === pessoaId) ?? null;
  const painelAberto = nova || selecionado !== null;

  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(aba !== "ativos" ? { aba } : {}), ...(busca ? { q: busca } : {}), ...extra });
    const s = q.toString();
    return `/configuracoes/usuarios${s ? `?${s}` : ""}`;
  };
  const fechar = href({});

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/configuracoes", rotulo: "Configurações" }}
        sobretitulo="Configurações · Equipe"
        titulo="Usuários"
        descricao="Quem entra no Raion e o que cada pessoa faz. Escolha um perfil; os setores vêm junto."
        acoes={
          <Link href={href({ nova: "1" })} className={CLASSE_ACAO_CABECALHO}>
            <Plus size={16} aria-hidden />
            Convidar pessoa
          </Link>
        }
      />

      <Indicadores itens={indicadores} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <nav aria-label="Situação" className="flex gap-1 overflow-x-auto border-b border-linha">
          {ABAS.map((a) => {
            const total = membros.filter((m) => m.status === a.status).length;
            const q = new URLSearchParams({ ...(a.valor !== "ativos" ? { aba: a.valor } : {}), ...(busca ? { q: busca } : {}) }).toString();
            return (
              <Link
                key={a.valor}
                href={`/configuracoes/usuarios${q ? `?${q}` : ""}`}
                aria-current={aba === a.valor ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${FOCO} ${
                  aba === a.valor ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
                }`}
              >
                {a.rotulo} ({total})
              </Link>
            );
          })}
        </nav>
        <form role="search" action="/configuracoes/usuarios" className="flex gap-2">
          {aba !== "ativos" && <input type="hidden" name="aba" value={aba} />}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            aria-label="Buscar pessoa"
            placeholder="Buscar por nome ou e-mail"
            className={`min-h-11 w-full rounded-xl border border-linha bg-superficie px-3 text-sm text-texto md:w-72 ${FOCO}`}
          />
        </form>
      </div>

      {erroSetores && (
        <p role="alert" className="text-sm text-erro">
          Não foi possível carregar os setores. Atualize a página para tentar novamente.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* No celular, com o painel aberto, a lista sai da frente: o painel ocupa a tela. */}
        <section aria-label="Pessoas" className={`painel overflow-hidden ${painelAberto ? "max-lg:hidden" : ""}`}>
          {lista.length === 0 ? (
            <p className="p-6 text-sm text-texto-2">{busca ? "Ninguém encontrado com essa busca." : "Ninguém nesta situação."}</p>
          ) : (
            <>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="text-xs text-texto-2">
                  <tr className="border-b border-linha">
                    <th className="px-4 py-3 font-medium">Pessoa</th>
                    <th className="px-4 py-3 font-medium">Perfil</th>
                    <th className="px-4 py-3 font-medium">Também atua em</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((m) => (
                    <tr key={m.id} className={`border-b border-linha last:border-0 ${m.id === selecionado?.id ? "bg-dourado/10" : ""}`}>
                      <td className="px-4 py-3">
                        <Link href={href({ pessoa: m.id })} className={`flex items-center gap-3 rounded-lg ${FOCO}`} aria-current={m.id === selecionado?.id ? "true" : undefined}>
                          <Avatar nome={m.nome || m.email} tamanho={36} />
                          <span className="min-w-0">
                            <span className="block font-medium text-texto">{m.nome || "(sem nome)"}</span>
                            <span className="block text-xs break-all text-texto-2">{m.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{rotuloPerfil(m)}</span>
                        <span className="mt-1 block text-xs text-texto-2">{detalhePerfil(m)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-texto-2">{tambemAtua(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-linha md:hidden">
                {lista.map((m) => (
                  <li key={m.id}>
                    <Link href={href({ pessoa: m.id })} className={`flex items-center gap-3 px-4 py-3 ${FOCO}`}>
                      <Avatar nome={m.nome || m.email} tamanho={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-texto">{m.nome || "(sem nome)"}</span>
                        <span className="block text-xs text-texto-2">
                          {rotuloPerfil(m)} · {detalhePerfil(m)}
                          {tambemAtua(m) !== "—" && ` · também ${tambemAtua(m)}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {painelAberto ? (
          <PainelPessoa key={selecionado?.id ?? "nova"} membro={nova ? null : selecionado} fecharHref={fechar} setoresDesligados={[...telas.setoresDesligados]} />
        ) : (
          <aside className="painel hidden p-6 text-sm text-texto-2 lg:block">Escolha uma pessoa na lista para editar o perfil e os setores.</aside>
        )}
      </div>
    </div>
  );
}

