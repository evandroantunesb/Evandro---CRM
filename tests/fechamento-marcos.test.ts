/**
 * Fechamento da venda em 3 marcos (ficha do negócio): função pura, o que o SDR recebe,
 * renderização do cartão (só leitura), âncoras, link da obra e aviso de reabertura.
 * Nada aqui toca banco: as regras de servidor e os gatilhos não mudaram.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvisoReabertura, Fechamento } from "@/app/(app)/negocios/[id]/fechamento";
import { MarcosVenda } from "@/app/(app)/negocios/[id]/marcos-venda";
import { PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import type { Papel, StatusPagamentoContrato } from "@/lib/tipos";
import {
  avisoReabertura,
  cartaoFechamento,
  marcosDaVenda,
  type SituacaoContrato,
  type StatusNegocio,
} from "@/lib/venda";

const NEGOCIOS: StatusNegocio[] = ["aberto", "ganho", "perdido"];
const CONTRATOS: SituacaoContrato[] = ["nao_gerado", "rascunho", "aguardando_assinatura", "assinado"];
const PAGAMENTOS: (StatusPagamentoContrato | null)[] = [null, "pendente", "confirmado", "estornado"];
const COMBINACOES = NEGOCIOS.flatMap((negocio) =>
  CONTRATOS.flatMap((contrato) => PAGAMENTOS.map((pagamento) => ({ negocio, contrato, pagamento }))),
);

const fonte = (...partes: string[]) => readFileSync(join(__dirname, "..", ...partes), "utf8");
const PASTA = ["src", "app", "(app)", "negocios", "[id]"];

describe("marcosDaVenda", () => {
  it("conta exatamente os marcos cumpridos em todas as combinações", () => {
    for (const c of COMBINACOES) {
      const m = marcosDaVenda(c);
      const esperado =
        Number(c.negocio === "ganho") + Number(c.contrato === "assinado") + Number(c.pagamento === "confirmado");
      expect(m.concluidos, JSON.stringify(c)).toBe(esperado);
      expect(m.concluida, JSON.stringify(c)).toBe(esperado === 3);
    }
  });

  it("venda concluída só com ganho + assinado + confirmado", () => {
    const concluidas = COMBINACOES.filter((c) => marcosDaVenda(c).concluida);
    expect(concluidas).toEqual([{ negocio: "ganho", contrato: "assinado", pagamento: "confirmado" }]);
    const m = marcosDaVenda(concluidas[0]);
    expect(m.progresso).toBe("3 de 3 marcos concluídos");
  });

  it("marco Venda ganha reflete o status do negócio", () => {
    const rotulos = NEGOCIOS.map((negocio) => marcosDaVenda({ negocio, contrato: "nao_gerado", pagamento: null }).venda);
    expect(rotulos.map((v) => [v.rotulo, v.estado])).toEqual([
      ["Em andamento", "pendente"],
      ["Ganho", "cumprido"],
      ["Perdido", "pendente"],
    ]);
  });

  it("marco Contrato: só 'assinado' cumpre; rótulos de cada situação; âncora #contrato", () => {
    const linhas = CONTRATOS.map((contrato) => marcosDaVenda({ negocio: "aberto", contrato, pagamento: null }).contrato);
    expect(linhas.map((c) => [c.rotulo, c.estado, c.ancora])).toEqual([
      ["Não gerado", "pendente", "#contrato"],
      ["Rascunho", "pendente", "#contrato"],
      ["Aguardando assinatura", "pendente", "#contrato"],
      ["Assinado", "cumprido", "#contrato"],
    ]);
  });

  it("marco Pagamento: sem status fica bloqueado e sem âncora (o cartão Pagamento não existe)", () => {
    const p = marcosDaVenda({ negocio: "ganho", contrato: "aguardando_assinatura", pagamento: null }).pagamento;
    expect(p).toEqual({
      titulo: "Pagamento confirmado",
      estado: "bloqueado",
      rotulo: "Aguardando contrato assinado",
      ancora: null,
    });
  });

  it("marco Pagamento: pendente, confirmado e estornado; estornado não conta", () => {
    const pag = (pagamento: StatusPagamentoContrato) =>
      marcosDaVenda({ negocio: "ganho", contrato: "assinado", pagamento });
    expect(pag("pendente").pagamento).toMatchObject({ estado: "pendente", rotulo: "A confirmar", ancora: "#pagamento" });
    expect(pag("confirmado").pagamento).toMatchObject({ estado: "cumprido", rotulo: "Confirmado", ancora: "#pagamento" });
    expect(pag("estornado").pagamento).toMatchObject({ estado: "pendente", rotulo: "Estornado", ancora: "#pagamento" });
    expect(pag("estornado").concluidos).toBe(2);
    expect(pag("estornado").concluida).toBe(false);
    expect(pag("estornado").progresso).toBe("2 de 3 marcos concluídos");
  });

  it("progresso é factual e nunca fala de obra nem de etapas faltantes", () => {
    for (const c of COMBINACOES) {
      const m = marcosDaVenda(c);
      const texto = JSON.stringify(m);
      expect(texto).not.toMatch(/obra/i);
      expect(texto).not.toMatch(/faltam/i);
      if (c.negocio === "perdido") expect(m.progresso).toBeNull();
      else expect(m.progresso).toBe(`${m.concluidos} de 3 marcos concluídos`);
    }
  });
});

describe("cartaoFechamento: o que cada papel recebe", () => {
  const entrada = { negocio: "ganho" as const, contrato: "assinado" as const, pagamento: "confirmado" as const };

  it("quem não vê contrato/pagamento recebe só a situação comercial (nada de contrato, pagamento ou marcos)", () => {
    const cartao = cartaoFechamento(false, entrada);
    expect(cartao).toEqual({ tipo: "situacao", titulo: "Situação", negocio: "ganho" });
    const json = JSON.stringify(cartao);
    for (const proibido of ["contrato", "pagamento", "marcos", "assinado", "confirmado", "concluídos"]) {
      expect(json).not.toContain(proibido);
    }
  });

  it("SDR recebe a situação; admin, gestor e vendedor recebem os marcos", () => {
    const tipoPorPapel = (papel: Papel) => cartaoFechamento(pode(papel, PROPOSTA_E_CONTRATO), entrada).tipo;
    expect(tipoPorPapel("sdr")).toBe("situacao");
    expect(tipoPorPapel("admin")).toBe("marcos");
    expect(tipoPorPapel("gestor")).toBe("marcos");
    expect(tipoPorPapel("vendedor")).toBe("marcos");
  });

  it("com permissão, o cartão vira 'Fechamento da venda' com os marcos calculados", () => {
    const cartao = cartaoFechamento(true, entrada);
    expect(cartao.tipo).toBe("marcos");
    expect(cartao.titulo).toBe("Fechamento da venda");
    if (cartao.tipo === "marcos") expect(cartao.marcos).toEqual(marcosDaVenda(entrada));
  });
});

describe("MarcosVenda (renderização, só leitura)", () => {
  const html = (
    c: { negocio: StatusNegocio; contrato: SituacaoContrato; pagamento: StatusPagamentoContrato | null },
    obra: { id: string; numero: number } | null = null,
  ) => renderToStaticMarkup(
      createElement(MarcosVenda, { marcos: marcosDaVenda(c), obra }, createElement("span", null, "AÇÃO")),
    );

  it("mostra os 3 marcos na ordem e a ação de fechamento dentro do marco Venda ganha", () => {
    const h = html({ negocio: "aberto", contrato: "nao_gerado", pagamento: null });
    const i = ["Venda ganha", "AÇÃO", "Contrato assinado", "Pagamento confirmado"].map((t) => h.indexOf(t));
    expect(i.every((x) => x >= 0)).toBe(true);
    expect([...i].sort((a, b) => a - b)).toEqual(i);
    expect(h).toContain("0 de 3 marcos concluídos");
  });

  it("âncoras: #contrato sempre; #pagamento só quando o cartão Pagamento existe", () => {
    const semPagamento = html({ negocio: "ganho", contrato: "aguardando_assinatura", pagamento: null });
    expect(semPagamento).toContain('href="#contrato"');
    expect(semPagamento).not.toContain('href="#pagamento"');
    expect(semPagamento).toContain("Aguardando contrato assinado");
    const comPagamento = html({ negocio: "ganho", contrato: "assinado", pagamento: "pendente" });
    expect(comPagamento).toContain('href="#pagamento"');
  });

  it("não tem nenhuma ação de escrita própria (sem form nem botão)", () => {
    for (const c of COMBINACOES) {
      const h = html(c, { id: "o1", numero: 7 });
      expect(h).not.toContain("<form");
      expect(h).not.toContain("<button");
    }
  });

  it("venda concluída com obra visível: texto factual e link da obra", () => {
    const h = html({ negocio: "ganho", contrato: "assinado", pagamento: "confirmado" }, { id: "o1", numero: 7 });
    expect(h).toContain("Venda concluída · 3 de 3 marcos concluídos");
    expect(h).toContain('href="/obras/o1"');
    expect(h).toContain("Ver obra nº 7");
  });

  it("venda concluída sem obra visível: não afirma nada sobre a obra", () => {
    const h = html({ negocio: "ganho", contrato: "assinado", pagamento: "confirmado" });
    expect(h).toContain("Venda concluída · 3 de 3 marcos concluídos");
    expect(h).not.toMatch(/obra/i);
  });

  it("pagamento estornado com obra existente: 2 de 3 e o link da obra continua", () => {
    const h = html({ negocio: "ganho", contrato: "assinado", pagamento: "estornado" }, { id: "o1", numero: 7 });
    expect(h).toContain("2 de 3 marcos concluídos");
    expect(h).not.toContain("Venda concluída");
    expect(h).toContain("Estornado");
    expect(h).toContain("Ver obra nº 7");
  });

  it("negócio perdido: mostra 'Perdido', sem contador", () => {
    const h = html({ negocio: "perdido", contrato: "rascunho", pagamento: null });
    expect(h).toContain("Perdido");
    expect(h).not.toContain("marcos concluídos");
    expect(h).not.toMatch(/faltam/i);
  });
});

describe("reabertura com confirmação", () => {
  it("negócio ganho: aviso aprovado, palavra por palavra", () => {
    expect(avisoReabertura("ganho")).toEqual({
      titulo: "Confirmar reabertura da venda?",
      linhas: [
        "Ao reabrir este negócio, ele voltará para o status Aberto.",
        "O contrato assinado, o pagamento confirmado e a obra, caso existam, não serão cancelados automaticamente.",
        'Se já houver obra, ela receberá o alerta "Venda alterada", que não será removido automaticamente caso a venda seja ganha novamente.',
        "Os pontos concedidos pela venda ganha serão estornados, incluindo os pontos do SDR de origem, quando aplicável.",
      ],
    });
  });

  it("negócio perdido: confirmação simples, sem efeitos da saída de 'ganho'", () => {
    const aviso = avisoReabertura("perdido");
    expect(aviso).toEqual({
      titulo: "Confirmar reabertura do negócio?",
      linhas: ["Ao reabrir este negócio, ele voltará para o status Aberto."],
    });
    const texto = JSON.stringify(aviso);
    expect(texto).not.toMatch(/pontos|obra|Venda alterada|estorn/i);
  });

  it("reabrir não é apresentado como cancelamento de venda", () => {
    for (const status of ["ganho", "perdido"] as const) {
      const { titulo, linhas } = avisoReabertura(status);
      expect(titulo).not.toMatch(/cancel/i);
      expect(linhas.filter((l) => /cancel/i.test(l)).every((l) => /não serão cancelados/.test(l))).toBe(true);
    }
  });

  it("AvisoReabertura renderiza título e linhas", () => {
    const h = renderToStaticMarkup(createElement(AvisoReabertura, { status: "ganho" }));
    expect(h).toContain("Confirmar reabertura da venda?");
    expect(h).toContain("Os pontos concedidos pela venda ganha serão estornados");
  });

  it("Fechamento de negócio ganho/perdido mostra só o botão 'Reabrir negócio' até a confirmação", () => {
    for (const status of ["ganho", "perdido"] as const) {
      const h = renderToStaticMarkup(createElement(Fechamento, { negocioId: "n1", status, motivos: [] }));
      expect(h).toContain("Reabrir negócio");
      expect(h).not.toContain("<form");
      expect(h).not.toContain('value="aberto"');
      expect(h).not.toContain("Confirmar reabertura");
    }
  });

  it("o formulário de reabertura só existe no passo de confirmação, com Voltar e Confirmar reabertura", () => {
    const f = fonte(...PASTA, "fechamento.tsx");
    const inicio = f.indexOf("if (reabrindo)");
    const fim = f.indexOf("Reabrir negócio");
    expect(inicio).toBeGreaterThan(0);
    const confirmacao = f.slice(inicio, fim);
    expect(confirmacao).toContain('name="status" value="aberto"');
    expect(confirmacao).toContain("Voltar");
    expect(confirmacao).toContain("Confirmar reabertura");
    expect(f.match(/value="aberto"/g)).toHaveLength(1);
  });

  it("SDR continua só leitura no Fechamento", () => {
    const h = renderToStaticMarkup(
      createElement(Fechamento, { negocioId: "n1", status: "ganho", motivos: [], somenteLeitura: true }),
    );
    expect(h).toBe('<span class="text-sm text-zinc-700">Ganho</span>');
  });
});

describe("ficha do negócio (fonte)", () => {
  const page = fonte(...PASTA, "page.tsx");
  const marcos = fonte(...PASTA, "marcos-venda.tsx");

  it("um único Fechamento na página: a ação de escrita não é duplicada", () => {
    expect(page.match(/<Fechamento\b/g)).toHaveLength(1);
    expect(page).not.toContain('titulo="Situação"');
  });

  it("o cartão de marcos não importa ações de escrita e não é componente cliente", () => {
    expect(marcos).not.toContain("@/lib/acoes");
    expect(marcos).not.toContain('"use client"');
    expect(marcos).not.toContain("<form");
    expect(marcos).not.toContain("Botao");
  });

  it("permissão decide os dados do cartão antes de renderizar", () => {
    expect(page).toContain("cartaoFechamento(pode(atual.papel, PROPOSTA_E_CONTRATO)");
    expect(page).toContain('cartao.tipo === "marcos"');
  });

  it("âncoras nos cartões existentes e link da obra no cabeçalho mantido", () => {
    expect(page).toContain('id="contrato"');
    expect(page).toContain('id="pagamento"');
    expect(page).toContain("Ver obra nº {obraDoNegocio.numero}");
    expect(page).toContain("obra={obraDoNegocio}");
  });
});
