import { describe, expect, it } from "vitest";
import { PASSOS, estadoDoPasso, passoAnterior, passosDoPlano, proximoPasso } from "@/lib/assistente";

describe("passos do assistente", () => {
  it("Solo tem 5 passos; PRO tem 7 (setores entram no subprojeto 4)", () => {
    expect(passosDoPlano(true)).toEqual(["empresa", "marca", "imagens", "pagamento", "revisar"]);
    expect(passosDoPlano(false)).toEqual(["empresa", "marca", "imagens", "telas", "pagamento", "equipe", "revisar"]);
    expect(PASSOS.imagens.titulo).toBe("Tela de entrada e faixa");
    expect(PASSOS.revisar.titulo).toBe("Revisar e começar");
  });

  it("próximo e anterior, nulos nas pontas", () => {
    const pro = passosDoPlano(false);
    expect(proximoPasso(pro, "empresa")).toBe("marca");
    expect(proximoPasso(pro, "revisar")).toBeNull();
    expect(passoAnterior(pro, "empresa")).toBeNull();
    expect(passoAnterior(pro, "telas")).toBe("imagens");
  });

  it("estado: antes do atual = feito (ou pulado); o atual e os seguintes = pendente", () => {
    const solo = passosDoPlano(true);
    const o = { passo_atual: 4, pulados: [2] };
    expect(estadoDoPasso(o, solo, "empresa")).toBe("feito");
    expect(estadoDoPasso(o, solo, "marca")).toBe("pulado");
    expect(estadoDoPasso(o, solo, "imagens")).toBe("feito");
    expect(estadoDoPasso(o, solo, "pagamento")).toBe("pendente");
    expect(estadoDoPasso(o, solo, "revisar")).toBe("pendente");
  });
});
