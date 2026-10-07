import { LogOut } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { assinarAvatares } from "@/lib/avatares";
import { LogoRaion } from "@/components/marca";
import { carregarDiasConsideradoParado, carregarHorasConsideradoSemContato } from "@/lib/crm";
import { carregarNotificacoesNaoLidas, contarPendencias, temConquistaNaoVisualizada } from "@/lib/notificacoes";
import { linksPendencias, type ContagemPendencias } from "@/lib/pendencias";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { trocarEmpresa } from "@/lib/acoes/empresa-atual";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";
import { Menu } from "./menu";
import { Sininho } from "./sininho";

const GRUPO_GAMIFICACAO = "Gamificação";

/**
 * Itens do grupo Gamificação por papel. Ranking/Metas/Comissões e Loja/Extrato não são
 * itens próprios: viram abas dentro de Desempenho e Recompensas (`ativoEm` mantém o item
 * ativo nessas rotas). Administração (admin) segue como hub das telas de configuração.
 */
function itensGamificacao(papel: Papel | undefined, conquistaNova: boolean) {
  const visaoGeral = {
    href: "/gamificacao",
    rotulo: "Visão geral",
    grupo: GRUPO_GAMIFICACAO,
    novo: conquistaNova,
    // Só a própria rota: as demais telas pertencem a Desempenho/Recompensas/Administração.
    // A Jornada (aberta a partir do dashboard) é a exceção que mantém Visão geral ativa.
    exato: true,
    ativoEm: ["/gamificacao/jornada"],
  };
  const desempenho = {
    href: "/gamificacao/ranking",
    rotulo: "Desempenho",
    grupo: GRUPO_GAMIFICACAO,
    ativoEm: ["/gamificacao/metas", "/gamificacao/comissoes"],
  };
  if (papel === "admin") {
    return [
      visaoGeral,
      desempenho,
      {
        href: "/gamificacao/administracao",
        rotulo: "Administração",
        grupo: GRUPO_GAMIFICACAO,
        // Telas administrativas da Gamificação que vivem fora da árvore /gamificacao.
        ativoEm: ["/configuracoes/metas", "/configuracoes/comissoes", "/configuracoes/resgates"],
      },
    ];
  }
  if (papel === "gestor") return [visaoGeral, desempenho];
  return [
    visaoGeral,
    desempenho,
    { href: "/gamificacao/loja", rotulo: "Recompensas", grupo: GRUPO_GAMIFICACAO, ativoEm: ["/gamificacao/extrato"] },
  ];
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  const papel = sessao.atual?.papel;

  let pendencias: ContagemPendencias = { leadsADistribuir: 0, demais: 0 };
  let notificacoes: Awaited<ReturnType<typeof carregarNotificacoesNaoLidas>> = [];
  let conquistaNova = false;
  if (sessao.atual) {
    const [dias, horas] = await Promise.all([
      carregarDiasConsideradoParado(sessao.atual.empresaId),
      carregarHorasConsideradoSemContato(sessao.atual.empresaId),
    ]);
    [pendencias, notificacoes, conquistaNova] = await Promise.all([
      contarPendencias(sessao.atual.empresaId, sessao.atual.membroId, sessao.atual.papel, dias, horas),
      carregarNotificacoesNaoLidas(sessao.atual.empresaId, sessao.atual.membroId),
      temConquistaNaoVisualizada(sessao.atual.empresaId, sessao.atual.membroId),
    ]);
  }

  // Foto do próprio usuário (sidebar desktop e bloco mobile): uma assinatura com a sessão dele.
  const urlAvatar = sessao.avatarCaminho
    ? ((await assinarAvatares(await criarClienteServidor(), [sessao.avatarCaminho])).get(sessao.avatarCaminho) ?? null)
    : null;

  // Ordem segue o fluxo do cliente. `secao` (Aquisição/Comercial/Gestão) só titula no desktop;
  // no celular esses itens ficam na faixa principal. Apenas a posição no menu muda: rotas e
  // permissões de cada tela continuam as mesmas (Leads a distribuir: admin/gestor; Captura: só admin).
  const itens = [
    ...(sessao.atual
      ? [
          { href: "/inicio", rotulo: "Início" },
          { href: "/tarefas", rotulo: "Tarefas" },
          ...(papel === "admin" || papel === "gestor" ? [{ href: "/leads-a-distribuir", rotulo: "Leads a distribuir", secao: "Aquisição" }] : []),
          ...(papel === "admin" ? [{ href: "/configuracoes/captura", rotulo: "Captura de leads", secao: "Aquisição" }] : []),
          { href: "/negocios", rotulo: "Negócios", secao: "Comercial" },
          ...(papel !== "sdr" ? [{ href: "/contatos", rotulo: "Contatos", secao: "Comercial" }] : []),
          ...(papel === "admin" || papel === "gestor" ? [{ href: "/painel", rotulo: "Painel", secao: "Gestão" }] : []),
          ...itensGamificacao(papel, conquistaNova),
        ]
      : []),
    ...(papel === "admin"
      ? [
          { href: "/configuracoes/origens", rotulo: "Origens", grupo: "Configurações", subgrupo: "Aquisição" },
          { href: "/configuracoes/funil", rotulo: "Funis e etapas", grupo: "Configurações", subgrupo: "Comercial" },
          { href: "/configuracoes/listas", rotulo: "Etiquetas e motivos", grupo: "Configurações", subgrupo: "Comercial" },
          { href: "/configuracoes/calculadora", rotulo: "Kits e calculadora", grupo: "Configurações", subgrupo: "Venda" },
          { href: "/configuracoes/propostas", rotulo: "Propostas comerciais", grupo: "Configurações", subgrupo: "Venda" },
          { href: "/configuracoes/contrato", rotulo: "Modelo de contrato", grupo: "Configurações", subgrupo: "Venda" },
          { href: "/configuracoes/usuarios", rotulo: "Usuários", grupo: "Configurações", subgrupo: "Pessoas" },
          { href: "/configuracoes/equipes", rotulo: "Equipes", grupo: "Configurações", subgrupo: "Pessoas" },
        ]
      : []),
    ...(sessao.superAdmin
      ? [
          { href: "/super-admin", rotulo: "Super-admin", grupo: "Plataforma" },
          { href: "/super-admin/cobranca", rotulo: "Cobrança", grupo: "Plataforma" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-5 bg-carvao p-4 text-offwhite md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:p-5">
        <div className="flex items-center justify-between gap-3 md:block">
          <Link href="/inicio" aria-label="Início">
            <LogoRaion tom="claro" altura={28} />
          </Link>
          {sessao.vinculos.length > 1 ? (
            <form action={trocarEmpresa} className="flex gap-1 md:mt-5">
              <select
                name="empresaId"
                defaultValue={sessao.atual?.empresaId}
                aria-label="Empresa"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-offwhite"
              >
                {sessao.vinculos.map((v) => (
                  <option key={v.empresaId} value={v.empresaId} className="text-carvao">
                    {v.empresaNome}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-white/10 px-2 text-sm hover:border-dourado">Ir</button>
            </form>
          ) : (
            sessao.atual && (
              <p className="hidden truncate text-xs tracking-[0.2em] text-offwhite/50 uppercase md:mt-5 md:block">{sessao.atual.empresaNome}</p>
            )
          )}
        </div>
        {sessao.atual && (
          <Sininho
            notificacoes={notificacoes}
            pendencias={linksPendencias(papel, pendencias)}
          />
        )}
        <Menu itens={itens} />
        <div className="hidden items-center gap-3 border-t border-white/10 pt-4 md:mt-auto md:flex">
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
        <div className="flex items-center justify-between text-sm md:hidden">
          <Link href="/perfil" className="flex min-w-0 items-center gap-2 text-offwhite/70">
            {urlAvatar && <Avatar nome={sessao.nome} tamanho={24} src={urlAvatar} />}
            <span className="truncate">{sessao.nome}</span>
          </Link>
          <form action="/sair" method="post">
            <button className="text-offwhite/70">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-10">{children}</main>
    </div>
  );
}
