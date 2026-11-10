import { describe, expect, it } from "vitest";
import { resumoDescontoGestor } from "@/lib/descontos-resumo";

// Custos internos como no quadro aprovado P4AprovarDesconto: 10 módulos de 550 W → R$ 3.360.
const parametros = { custoInstalacaoPorModulo: 150, custoMaterialCaPorKwp: 120, custoEngenharia: 1200, comissaoPercentual: 0.05 };
const kit = [
  { tipo: "modulo" as const, quantidade: 10, potenciaW: 550 },
  { tipo: "inversor" as const, quantidade: 1, potenciaW: 5000 },
  { tipo: "outro" as const, quantidade: 30, potenciaW: null },
];

describe("resumo do desconto para o gestor (Compras P4c)", () => {
  it("valor pedido, custos internos, comissão sobre o valor pedido e sobra", () => {
    const r = resumoDescontoGestor({ sugerido: 10000, percentual: 10, custoItens: 4000, custoParcial: false, kit, parametros });
    expect(r.valorPedido).toBe(9000);
    expect(r.custosInternos).toBe(3360);
    expect(r.comissao).toBe(450); // 5% de 9.000 (decisão de 10/11/2026), não do sugerido
    expect(r.sobra).toBe(1190);
    expect(r.sobraPercentual).toBe(13.2);
  });

  it("sobra negativa aparece como é; custo parcial é repassado", () => {
    const r = resumoDescontoGestor({ sugerido: 10000, percentual: 30, custoItens: 4000, custoParcial: true, kit, parametros });
    expect(r.valorPedido).toBe(7000);
    expect(r.sobra).toBe(-710);
    expect(r.custoParcial).toBe(true);
  });
});
