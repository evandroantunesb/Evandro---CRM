import { describe, expect, it } from "vitest";
import {
  CHAVES_PRAZO,
  ROTULO_PRAZO,
  MARCO_PRAZO,
  lerIndicadores,
  lerPeriodo,
  porUrgencia,
  seloPrazo,
  textoMediana,
  textoProporcao,
} from "@/lib/engenharia-prazos-regras";

describe("prazos da Engenharia: selo", () => {
  it("interno e da distribuidora, no prazo, vence hoje e vencido", () => {
    expect(seloPrazo({ chave: "a_iniciar", limite: "2026-11-03", diasRestantes: 2 })).toEqual({ texto: "Prazo interno: 2 dias úteis", tom: "neutro" });
    expect(seloPrazo({ chave: "exigencia", limite: "2026-11-03", diasRestantes: 1 })).toEqual({ texto: "Prazo interno: 1 dia útil", tom: "neutro" });
    expect(seloPrazo({ chave: "distribuidora_vistoria", limite: "2026-11-03", diasRestantes: 0 })).toEqual({
      texto: "Prazo da distribuidora vence hoje",
      tom: "atencao",
    });
    expect(seloPrazo({ chave: "distribuidora_analise", limite: "2026-11-03", diasRestantes: -3 })).toEqual({
      texto: "Prazo da distribuidora vencido há 3 dias úteis",
      tom: "negativo",
    });
    expect(seloPrazo({ chave: "correcao_campo", limite: "2026-11-03", diasRestantes: -1 }).texto).toBe("Prazo interno vencido há 1 dia útil");
  });

  it("mais urgente primeiro; toda chave tem rótulo e marco", () => {
    const lista = [
      { chave: "a_iniciar" as const, limite: "", diasRestantes: 3 },
      { chave: "exigencia" as const, limite: "", diasRestantes: -1 },
    ].sort(porUrgencia);
    expect(lista.map((p) => p.chave)).toEqual(["exigencia", "a_iniciar"]);
    for (const c of CHAVES_PRAZO) {
      expect(ROTULO_PRAZO[c]).toBeTruthy();
      expect(MARCO_PRAZO[c]).toBeTruthy();
    }
  });
});

describe("indicadores da Engenharia", () => {
  it("lê o jsonb do banco, inclusive vazio e números em texto", () => {
    expect(
      lerIndicadores({
        carteira: { total: 4, paradas: 1 },
        etapas: [{ etapa: "a_iniciar", mediana: "1.5", n: 2 }],
        protocolo_aprovacao: { mediana: null, n: 0 },
        exigencia: { com: 1, total: 4 },
        nao_conformidade: { com: 0, total: 0 },
        conexao: { mediana: 3, n: 1 },
      }),
    ).toEqual({
      carteira: { total: 4, paradas: 1 },
      etapas: [{ etapa: "a_iniciar", mediana: 1.5, n: 2 }],
      protocoloAprovacao: { mediana: null, n: 0 },
      exigencia: { com: 1, total: 4 },
      naoConformidade: { com: 0, total: 0 },
      conexao: { mediana: 3, n: 1 },
    });
    expect(lerIndicadores(null).carteira).toEqual({ total: 0, paradas: 0 });
  });

  it("textos: sem amostra mostra traço; mediana com vírgula; proporção arredondada", () => {
    expect(textoMediana({ mediana: null, n: 0 })).toBe("—");
    expect(textoMediana({ mediana: 4.5, n: 3 })).toBe("4,5 dias úteis");
    expect(textoMediana({ mediana: 1, n: 1 })).toBe("1 dia útil");
    expect(textoProporcao({ com: 0, total: 0 })).toBe("—");
    expect(textoProporcao({ com: 1, total: 3 })).toBe("33%");
  });

  it("período: 30 por padrão, 90 só quando pedido", () => {
    expect(lerPeriodo(undefined)).toBe(30);
    expect(lerPeriodo("90")).toBe(90);
    expect(lerPeriodo("7")).toBe(30);
  });
});
