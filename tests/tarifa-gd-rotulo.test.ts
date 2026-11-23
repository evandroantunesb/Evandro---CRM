import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rotulosDistribuidoras } from "@/lib/tarifa-gd";

describe("rotulosDistribuidoras", () => {
  it("rótulo curto quando único; sigla como publicada quando o curto se repete", () => {
    const r = rotulosDistribuidoras(["COPEL-DIS", "ENEL CE", "ENEL RJ", "CEMIG-D", "CPFL-PAULISTA", "CPFL Santa Cruz", "LIGHT SESA"]);
    expect(r.get("COPEL-DIS")).toBe("Copel");
    expect(r.get("CEMIG-D")).toBe("Cemig");
    expect(r.get("LIGHT SESA")).toBe("Light");
    expect(r.get("ENEL CE")).toBe("ENEL CE");
    expect(r.get("ENEL RJ")).toBe("ENEL RJ");
    expect(r.get("CPFL-PAULISTA")).toBe("CPFL-PAULISTA");
    expect(r.get("CPFL Santa Cruz")).toBe("CPFL Santa Cruz");
  });

  it("acento e caixa: 'Âmbar Amazonas' e 'Âmbar Roraima' ficam como publicadas; 'CERIPa' vira 'Ceripa'", () => {
    const r = rotulosDistribuidoras(["Âmbar Amazonas", "Âmbar Roraima", "CERIPa"]);
    expect(r.get("Âmbar Amazonas")).toBe("Âmbar Amazonas");
    expect(r.get("CERIPa")).toBe("Ceripa");
  });

  it("todos os rótulos distintos na lista carregada (85 distribuidoras + Copel)", () => {
    const fonte = JSON.parse(readFileSync(".aurora/fontes/aneel-componentes-2026-b1-todas.json", "utf8")) as { carregadas: { distribuidora: string }[] };
    const siglas = [...new Set(["COPEL-DIS", ...fonte.carregadas.map((c) => c.distribuidora)])];
    const rotulos = [...rotulosDistribuidoras(siglas).values()];
    expect(rotulos).toHaveLength(siglas.length);
    expect(new Set(rotulos.map((x) => x.toLowerCase())).size).toBe(siglas.length);
  });
});
