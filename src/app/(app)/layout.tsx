import { LogOut } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { assinarAvatares } from "@/lib/avatares";
import { LogoRaion } from "@/components/marca";
import { carregarDiasConsideradoParado, carregarHorasConsideradoSemContato } from "@/lib/crm";
import { carregarNotificacoesNaoLidas, contarPendencias, contarPendenciasSetores, temConquistaNaoVisualizada } from "@/lib/notificacoes";
import { linksPendencias, type ContagemPendencias } from "@/lib/pendencias";
import { CARTEIRA_CONTATOS, GAMIFICACAO, GESTAO_COMERCIAL, NEGOCIOS, OBRAS, PARTICIPANTES_GAMIFICACAO, PEDIDOS_AOS_SETORES, PROPOSTA_E_CONTRATO, TAREFAS, TAREFAS_DO_SETOR, pode } from "@/lib/permissoes";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { trocarEmpresa } from "@/lib/acoes/empresa-atual";
import { COOKIE_TEMA, lerTema } from "@/lib/tema";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";
import { MenuLateral, NavegacaoCelular, type ItemMenu } from "./menu";
import { SeletorTema } from "./seletor-tema";
import { BotaoAvisos, Sininho } from "./sininho";

const SECAO_GAMIFICACAO = "Gamificação";

/**
 * Itens da seção Gamificação por papel. Ranking/Metas/Comissões e Loja/Extrato não são
 * itens próprios: viram abas dentro de Desempenho e Recompensas (`ativoEm` mantém o item
 * ativo nessas rotas). A administração (admin) fica no hub de Configurações.
 */
function itensGamificacao(papel: Papel | undefined, conquistaNova: boolean): ItemMenu[] {
  if (!pode(papel, GAMIFICACAO)) return [];
  const visaoGeral = {
    href: "/gamificacao",
    rotulo: "Visão geral",
    secao: SECAO_GAMIFICACAO,
    novo: conquistaNova,
    // Só a própria rota: as demais telas pertencem a Desempenho/Recompensas.
    // A Jornada (aberta a partir do dashboard) é a exceção que mantém Visão geral ativa.
    exato: true,
    ativoEm: ["/gamificacao/jornada"],
  };
  const desempenho = {
    href: "/gamificacao/ranking",
    rotulo: "Desempenho",
    secao: SECAO_GAMIFICACAO,
    ativoEm: ["/gamificacao/metas", "/gamificacao/comissoes"],
  };
  if (!pode(papel, PARTICIPANTES_GAMIFICACAO)) return [visaoGeral, desempenho];
  return [
    visaoGeral,
    desempenho,
    { href: "/gamificacao/loja", rotulo: "Recompensas", secao: SECAO_GAMIFICACAO, ativoEm: ["/gamificacao/extrato"] },
  ];
}

/** Abas fixas da barra do celular por papel (o resto do menu fica em "Mais"). */
function abasDoCelular(papel: Papel | undefined) {
  if (papel === "admin" || papel === "gestor") return ["/inicio", "/negocios", "/painel"];
  if (papel === "operacao") return ["/inicio", "/tarefas/setores", "/obras"];
  return ["/inicio", "/negocios", "/tarefas"];
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  const papel = sessao.atual?.papel;
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);

  let pendencias: ContagemPendencias = { leadsADistribuir: 0, demais: 0 };
  let notificacoes: Awaited<ReturnType<typeof carregarNotificacoesNaoLidas>> = [];
  let conquistaNova = false;
  if (sessao.atual) {
    const [dias, horas] = await Promise.all([
      carregarDiasConsideradoParado(sessao.atual.empresaId),
      carregarHorasConsideradoSemContato(sessao.atual.empresaId),
    ]);
    [pendencias, notificacoes, conquistaNova] = await Promise.all([
      pode(papel, TAREFAS_DO_SETOR)
        ? contarPendenciasSetores(sessao.atual.empresaId, sessao.atual.membroId)
        : contarPendencias(sessao.atual.empresaId, sessao.atual.membroId, sessao.atual.papel, dias, horas),
      carregarNotificacoesNaoLidas(sessao.atual.empresaId, sessao.atual.membroId),
      temConquistaNaoVisualizada(sessao.atual.empresaId, sessao.atual.membroId),
    ]);
  }
  const avisos = { notificacoes, pendencias: linksPendencias(papel, pendencias) };

  // Foto do próprio usuário (sidebar desktop e menu do celular): uma assinatura com a sessão dele.
  const urlAvatar = sessao.avatarCaminho
    ? ((await assinarAvatares(await criarClienteServidor(), [sessao.avatarCaminho])).get(sessao.avatarCaminho) ?? null)
    : null;

  // Ordem segue o fluxo do cliente; `secao` dá o título do bloco. Apenas a posição no menu muda:
  // rotas e permissões de cada tela continuam as mesmas (Leads a distribuir: admin/gestor).
  // As configurações do admin (inclusive Captura e a administração da Gamificação) ficam todas
  // no hub /configuracoes.
  const itens: ItemMenu[] = [
    ...(sessao.atual
      ? [
          { href: "/inicio", rotulo: "Início" },
          ...(pode(papel, TAREFAS) ? [{ href: "/tarefas", rotulo: "Tarefas" }] : []),
          // Tarefas dos setores: para a Operação é a tela de tarefas; para o comercial, os pedidos que fez aos setores.
          ...(pode(papel, TAREFAS_DO_SETOR) ? [{ href: "/tarefas/setores", rotulo: "Tarefas" }] : []),
          ...(pode(papel, GESTAO_COMERCIAL) ? [{ href: "/leads-a-distribuir", rotulo: "Leads a distribuir", secao: "Comercial" }] : []),
          ...(pode(papel, NEGOCIOS) ? [{ href: "/negocios", rotulo: "Negócios", secao: "Comercial" }] : []),
          ...(pode(papel, CARTEIRA_CONTATOS) ? [{ href: "/contatos", rotulo: "Contatos", secao: "Comercial" }] : []),
          // SDR não gera proposta nem contrato (spec RAION_SDR_REGRAS_PERMISSOES §40/§41).
          ...(pode(papel, PROPOSTA_E_CONTRATO) ? [{ href: "/propostas-contratos", rotulo: "Propostas e contratos", secao: "Comercial" }] : []),
          // Obras (somente leitura): comerciais e `operacao` (que hoje só vê Início).
          ...(pode(papel, OBRAS) ? [{ href: "/obras", rotulo: "Obras", secao: "Operação" }] : []),
          ...(pode(papel, PEDIDOS_AOS_SETORES) ? [{ href: "/tarefas/setores", rotulo: "Pedidos aos setores", secao: "Operação" }] : []),
          ...(pode(papel, GESTAO_COMERCIAL) ? [{ href: "/painel", rotulo: "Painel", secao: "Gestão" }] : []),
          ...itensGamificacao(papel, conquistaNova),
        ]
      : []),
    ...(papel === "admin"
      ? [{ href: "/configuracoes", rotulo: "Configurações", secao: "Administração", ativoEm: ["/gamificacao/administracao"] }]
      : []),
    ...(sessao.superAdmin
      ? [
          { href: "/super-admin", rotulo: "Super-admin", secao: "Plataforma" },
          { href: "/super-admin/cobranca", rotulo: "Cobrança", secao: "Plataforma" },
        ]
      : []),
  ];

  const seletorEmpresa =
    sessao.vinculos.length > 1 ? (
      <form action={trocarEmpresa} className="flex gap-2">
        <select
          name="empresaId"
          defaultValue={sessao.atual?.empresaId}
          aria-label="Empresa"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-linha bg-superficie px-3 text-sm text-texto md:min-h-0 md:border-white/10 md:bg-white/5 md:px-2 md:py-1.5 md:text-offwhite"
        >
          {sessao.vinculos.map((v) => (
            <option key={v.empresaId} value={v.empresaId} className="text-carvao">
              {v.empresaNome}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-lg border border-linha px-3 text-sm text-texto hover:border-dourado md:min-h-0 md:border-white/10 md:px-2 md:text-offwhite">
          Ir
        </button>
      </form>
    ) : null;

  // Fim do "Mais" no celular: quem está logado, empresa, tema e sair.
  const extrasCelular = (
    <div className="flex flex-col gap-4 border-t border-linha pt-4">
      <Link href="/perfil" className="flex items-center gap-3 rounded-2xl px-1 py-1">
        <Avatar nome={sessao.nome} tamanho={40} src={urlAvatar} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-texto">{sessao.nome}</span>
          <span className="block truncate text-xs text-texto-2">
            {[papel && ROTULO_PAPEL[papel], sessao.atual?.empresaNome].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
      {seletorEmpresa}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-texto-2">Aparência</span>
        <SeletorTema tema={tema} naJanela />
      </div>
      <form action="/sair" method="post">
        <button className="min-h-11 w-full rounded-xl border border-linha text-sm font-medium text-texto hover:border-erro hover:text-erro">
          Sair
        </button>
      </form>
    </div>
  );

  return (
    <div data-tema={tema} className="tema-app flex min-h-screen flex-col md:flex-row">
      {/* Celular: cabeçalho enxuto em cima; o menu vai para a barra de abas embaixo. */}
      <header className="barra-lateral sticky top-0 z-30 flex h-14 items-center justify-between bg-carvao/95 px-4 backdrop-blur-md md:hidden">
        <Link href="/inicio" aria-label="Início">
          <LogoRaion tom="claro" altura={24} />
        </Link>
        {sessao.atual && <BotaoAvisos {...avisos} total={notificacoes.length + pendencias.leadsADistribuir + pendencias.demais} />}
      </header>

      <aside className="barra-lateral hidden flex-col gap-5 border-r border-white/5 bg-carvao p-5 text-offwhite md:sticky md:top-0 md:flex md:h-screen md:w-64 md:overflow-y-auto">
        <div>
          <Link href="/inicio" aria-label="Início">
            <LogoRaion tom="claro" altura={28} />
          </Link>
          <div className="mt-5">
            {seletorEmpresa ??
              (sessao.atual && <p className="truncate text-xs tracking-[0.2em] text-offwhite/50 uppercase">{sessao.atual.empresaNome}</p>)}
          </div>
        </div>
        {sessao.atual && <Sininho {...avisos} />}
        <MenuLateral itens={itens} />
        <div className="mt-auto">
          <SeletorTema tema={tema} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 pt-4">
          <Avatar nome={sessao.nome} tamanho={36} src={urlAvatar} />
          <Link href="/perfil" className="min-w-0 flex-1" title="Meu perfil">
            <span className="block truncate text-sm font-medium text-offwhite hover:underline">{sessao.nome}</span>
            {papel && <span className="block text-xs text-offwhite/50">{ROTULO_PAPEL[papel]}</span>}
          </Link>
          <form action="/sair" method="post">
            <button aria-label="Sair" title="Sair" className="rounded-md p-1.5 text-offwhite/50 hover:bg-white/5 hover:text-offwhite">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-28 md:p-10">{children}</main>

      <NavegacaoCelular itens={itens} abas={abasDoCelular(papel)} extras={extrasCelular} />
    </div>
  );
}
