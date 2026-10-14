/**
 * Interface do pagamento do Raion Solo (issue #187): marcos da venda com registro manual, situação
 * na visão de vendas, linha do tempo e renderização do cartão. Nada aqui toca banco; as regras de
 * autorização estão nas RPCs (testes *-db).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// O cartão usa Server Actions que puxam Supabase e env; aqui só importa a renderização.
vi.mock("@/lib/acoes/pagamentos", () => ({
  registrarPagamento: vi.fn(async () => null),
  estornarRegistroPagamento: vi.fn(async () => null),
  corrigirRegistroPagamento: vi.fn(async () => null),
}));
import { PagamentoSolo, type RegistroVisivel } from "@/app/(app)/negocios/[id]/pagamento-solo";
import { formatarDataIso, hojeEmSaoPaulo } from "@/lib/formatacao";
import { descreverAtividade } from "@/lib/linha-do-tempo";
import { filtrarLinhasVenda, marcosDaVenda, situacaoPagamentoVenda, type LinhaVenda } from "@/lib/venda";

const fonte = (...partes: string[]) => readFileSync(join(__dirname, "..", ...partes), "utf8");
const nomes = { etapa: (i: string) => i, origem: (i: string) => i, membro: (i: string) => i, motivo: (i: string) => i };

describe("datas", () => {
  it("hoje em São Paulo vira o dia de Brasília, não o UTC", () => {
    // 02h UTC de 15/10 ainda é 14/10 em Brasília (UTC−3).
    expect(hojeEmSaoPaulo(Date.parse("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
  });
  it("data ISO sem hora formata sem deslocar o dia", () => {
    expect(formatarDataIso("2026-10-01")).toBe("01/10/2026");
  });
});

describe("marcosDaVenda com registro manual do Solo", () => {
  it("registro ativo cumpre o marco de pagamento, mesmo sem contrato", () => {
    const m = marcosDaVenda({ negocio: "aberto", contrato: "nao_gerado", pagamento: null, registro: { ativo: true, disponivel: true } });
    expect(m.pagamento).toEqual({ titulo: "Pagamento registrado", estado: "cumprido", rotulo: "Registrado manualmente", ancora: "#pagamento" });
    expect(m.concluidos).toBe(1);
  });

  it("Solo sem registro: marco pendente com âncora (pode registrar antes do contrato)", () => {
    const m = marcosDaVenda({ negocio: "ganho", contrato: "rascunho", pagamento: null, registro: { ativo: false, disponivel: true } });
    expect(m.pagamento).toMatchObject({ estado: "pendente", rotulo: "Não registrado", ancora: "#pagamento" });
  });

  it("ganho + assinado + registrado = venda concluída (sem falar de obra)", () => {
    const m = marcosDaVenda({ negocio: "ganho", contrato: "assinado", pagamento: "pendente", registro: { ativo: true, disponivel: true } });
    expect(m.concluida).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/obra/i);
  });

  it("contrato gerado não conta como assinado", () => {
    const m = marcosDaVenda({ negocio: "ganho", contrato: "aguardando_assinatura", pagamento: null, registro: { ativo: true, disponivel: true } });
    expect(m.contrato.estado).toBe("pendente");
    expect(m.concluida).toBe(false);
  });

  it("sem registro e sem permissão de registrar: comportamento do Pro inalterado", () => {
    const semRegistro = marcosDaVenda({ negocio: "ganho", contrato: "aguardando_assinatura", pagamento: null, registro: { ativo: false, disponivel: false } });
    const pro = marcosDaVenda({ negocio: "ganho", contrato: "aguardando_assinatura", pagamento: null });
    expect(semRegistro.pagamento).toEqual(pro.pagamento);
    expect(pro.pagamento.estado).toBe("bloqueado");
  });
});

describe("situação do pagamento na visão de vendas", () => {
  const ativo = { estornado_em: null };
  const estornado = { estornado_em: "2026-10-10T12:00:00Z" };
  const confirmada = { confirmado_em: "2026-10-10T12:00:00Z", estornado_em: null };

  it("registro ativo vira 'registrado', com ou sem contrato", () => {
    expect(situacaoPagamentoVenda(null, [], [ativo])).toBe("registrado");
    expect(situacaoPagamentoVenda("assinado", [], [ativo])).toBe("registrado");
  });
  it("registro estornado não conta; confirmação do Pro tem prioridade", () => {
    expect(situacaoPagamentoVenda("assinado", [], [estornado])).toBe("pendente");
    expect(situacaoPagamentoVenda(null, [], [estornado])).toBeNull();
    expect(situacaoPagamentoVenda("assinado", [confirmada], [estornado])).toBe("confirmado");
  });
  it("atalhos tratam 'registrado' como pago", () => {
    const base: LinhaVenda = {
      negocioId: "n", numero: 1, titulo: "t", clienteNome: "c", responsavelId: null, valor: null, negocio: "aberto",
      proposta: "nao_gerada", propostaUltimaAbertura: null, propostaAberturas: 0, contrato: "assinado", pagamento: "registrado", ultimaMovimentacao: "",
    };
    expect(filtrarLinhasVenda([base], { atalho: "assinado_sem_pagamento" })).toEqual([]);
    expect(filtrarLinhasVenda([base], { atalho: "pago_nao_ganho" })).toEqual([base]);
    expect(filtrarLinhasVenda([base], { pagamento: "registrado" })).toEqual([base]);
  });
});

describe("linha do tempo", () => {
  it("descreve registro, estorno e correção", () => {
    expect(descreverAtividade("pagamento_registrado", { data_recebimento: "2026-10-01" }, nomes)).toBe(
      "Pagamento registrado manualmente (recebido em 01/10/2026)",
    );
    expect(descreverAtividade("pagamento_registro_estornado", { motivo: "Pix devolvido" }, nomes)).toBe("Registro de pagamento estornado: Pix devolvido");
    expect(descreverAtividade("pagamento_registro_corrigido", { motivo: "Data errada" }, nomes)).toBe("Registro de pagamento corrigido: Data errada");
  });
});

describe("cartão PagamentoSolo", () => {
  const ativo: RegistroVisivel = {
    id: "r2", dataRecebimento: "2026-10-01", observacao: "Pix", autor: "Ana", registradoEm: "2026-10-01T15:00:00Z",
    substituiId: "r1", estornadoEm: null, estornadoPor: null, motivoEstorno: null,
  };
  const estornado: RegistroVisivel = {
    id: "r1", dataRecebimento: "2026-10-02", observacao: null, autor: "Ana", registradoEm: "2026-10-01T14:00:00Z",
    substituiId: null, estornadoEm: "2026-10-01T15:00:00Z", estornadoPor: "Ana", motivoEstorno: "Data errada",
  };
  const render = (props: Partial<Parameters<typeof PagamentoSolo>[0]>) =>
    renderToStaticMarkup(
      createElement(PagamentoSolo, { negocioId: "n1", hoje: "2026-10-14", situacao: "permitido", podeRetificar: true, registros: [], ...props }),
    );

  it("Solo sem registro: formulário com data de hoje (máximo hoje), observação e 'Marcar como pago'", () => {
    const h = render({});
    expect(h).toContain("Pagamento não registrado");
    expect(h).toContain("Marcar como pago");
    expect(h).toContain('name="dataRecebimento"');
    expect(h).toContain('value="2026-10-14"');
    expect(h).toContain('max="2026-10-14"');
    expect(h).toContain('name="observacao"');
    expect(h).toContain("Não precisa de outra aprovação");
  });

  it("Solo com vários usuários ativos: aviso claro, sem botão e sem suspender ninguém", () => {
    const h = render({ situacao: "varios_usuarios" });
    expect(h).not.toContain("Marcar como pago");
    expect(h).toContain("mais de um");
    expect(h).toContain("Nenhum acesso foi suspenso");
  });

  it("Pro sem registro Solo: não oferece registro novo", () => {
    expect(render({ situacao: "indisponivel" })).not.toContain("Marcar como pago");
  });

  it("registro ativo: Pago/Recebido com data, autor, aviso de registro manual e histórico", () => {
    const h = render({ registros: [ativo, estornado] });
    expect(h).toContain("Pago/Recebido");
    expect(h).toContain("01/10/2026");
    expect(h).toContain("Ana");
    expect(h).toContain("(correção)");
    expect(h).toContain("Não é conciliação bancária");
    expect(h).toContain("Histórico de registros (1)");
    expect(h).toContain("Data errada");
    expect(h).not.toContain("Marcar como pago");
    expect(h).toContain("Corrigir data ou observação");
    expect(h).toContain("Estornar");
  });

  it("após upgrade (Pro), admin ainda vê corrigir/estornar do registro Solo, mas não registro novo", () => {
    const h = render({ situacao: "indisponivel", registros: [ativo] });
    expect(h).toContain("Corrigir data ou observação");
    expect(h).not.toContain("Marcar como pago");
  });

  it("quem não é admin só vê o registro", () => {
    const h = render({ podeRetificar: false, registros: [ativo] });
    expect(h).toContain("Pago/Recebido");
    expect(h).not.toContain("Corrigir data ou observação");
    expect(h).not.toContain("Estornar");
  });

  it("só estornado: selo de estornado e, no Solo, volta o formulário", () => {
    const h = render({ registros: [estornado] });
    expect(h).toContain("Registro de pagamento estornado");
    expect(h).toContain("Marcar como pago");
  });
});

describe("ficha do negócio: ligação do cartão", () => {
  const page = fonte("src", "app", "(app)", "negocios", "[id]", "page.tsx");
  const acoes = fonte("src", "lib", "acoes", "pagamentos.ts");

  it("dados de pagamento só para quem já vê contrato e pagamento (SDR fora)", () => {
    expect(page).toContain("const veContratoEPagamento = pode(atual.papel, PROPOSTA_E_CONTRATO);");
    expect(page).toMatch(/veContratoEPagamento\s*\?\s*await Promise\.all/);
  });

  it("um único cartão Pagamento com âncora, Solo e Pro no mesmo lugar", () => {
    expect(page.match(/id="pagamento"/g)).toHaveLength(1);
    expect(page).toContain("<PagamentoSolo");
    expect(page).toContain("situacao_registro_pagamento");
  });

  it("ações chamam só as RPCs (sem escrita direta na tabela)", () => {
    expect(acoes).not.toContain('from("registros_pagamento")');
    for (const rpc of ["registrar_pagamento_negocio", "estornar_registro_pagamento", "corrigir_registro_pagamento"]) expect(acoes).toContain(rpc);
  });
});
