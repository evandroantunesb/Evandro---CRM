import { describe, expect, it } from "vitest";
import { filtrarPorTelas } from "@/lib/menu-telas";
import { telasDaEmpresa } from "@/lib/telas-empresa";

const hrefs = (...lista: string[]) => lista.map((href) => ({ href }));
const restantes = (itens: { href: string }[]) => itens.map((i) => i.href);

const TODOS = hrefs(
  "/inicio",
  "/tarefas",
  "/negocios",
  "/contatos",
  "/propostas-contratos",
  "/forecast",
  "/painel",
  "/leads-a-distribuir",
  "/obras",
  "/engenharia",
  "/compras",
  "/compras/precos",
  "/financeiro",
  "/tarefas/setores",
  "/gamificacao/loja",
  "/gamificacao/administracao/regras",
  "/configuracoes",
  "/configuracoes/tela-entrada",
  "/configuracoes/usuarios",
  "/configuracoes/usuarios#perfil-gamificacao",
  "/configuracoes/equipes",
  "/configuracoes/metas",
  "/configuracoes/captura",
  "/configuracoes/fixacoes",
);

describe("filtrarPorTelas", () => {
  it("Solo: fica só o que o plano tem", () => {
    const solo = telasDaEmpresa({ produto: "solo", desligadas: [], eletropostoLiberado: true });
    expect(restantes(filtrarPorTelas(TODOS, solo))).toEqual([
      "/inicio",
      "/tarefas",
      "/negocios",
      "/contatos",
      "/propostas-contratos",
      "/configuracoes",
      "/configuracoes/tela-entrada",
      "/configuracoes/usuarios",
    ]);
  });

  it("PRO com a Gamificação desligada: some tudo dela, inclusive o atalho de perfis em Usuários", () => {
    const t = telasDaEmpresa({ produto: "pro", desligadas: ["gamificacao"], eletropostoLiberado: false });
    const r = restantes(filtrarPorTelas(TODOS, t));
    for (const fora of ["/gamificacao/loja", "/gamificacao/administracao/regras", "/configuracoes/metas", "/configuracoes/usuarios#perfil-gamificacao"]) {
      expect(r).not.toContain(fora);
    }
    expect(r).toContain("/configuracoes/usuarios");
    expect(r).toContain("/compras");
  });

  it("PRO sem nada desligado: tudo fica", () => {
    const t = telasDaEmpresa({ produto: "pro", desligadas: [], eletropostoLiberado: true });
    expect(filtrarPorTelas(TODOS, t)).toHaveLength(TODOS.length);
  });

  it("prefixo exato: /tarefas/setores é do PRO, /tarefas não; ?visao é ignorado", () => {
    const solo = telasDaEmpresa({ produto: "solo", desligadas: [], eletropostoLiberado: false });
    expect(restantes(filtrarPorTelas(hrefs("/tarefas?aba=hoje", "/tarefas/setores?x=1", "/obrasx"), solo))).toEqual(["/tarefas?aba=hoje", "/obrasx"]);
  });
});
