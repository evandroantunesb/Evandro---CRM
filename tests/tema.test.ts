import { describe, expect, it } from "vitest";
import { lerTema, TEMAS } from "@/lib/tema";

describe("lerTema", () => {
  it("aceita só os três temas", () => {
    for (const t of TEMAS) expect(lerTema(t)).toBe(t);
  });

  it("qualquer outro valor segue o aparelho", () => {
    for (const v of [undefined, null, "", "dark", "ESCURO", "escuro "]) expect(lerTema(v)).toBe("sistema");
  });
});
