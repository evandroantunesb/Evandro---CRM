import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: () => null }));
const { PONTO, TEXTO } = await import("@/components/obras/semaforo-ui");

// Marca da empresa (Onboarding, subprojeto 2): o "amarelo" do semáforo e os avisos de atenção têm significado e não
// seguem a cor de destaque da empresa (que substitui o dourado). Usam o token fixo `atencao`.
describe("semáforo e atenção fora da marca", () => {
  it("o amarelo do semáforo usa o token fixo de atenção", () => {
    expect(PONTO.amarela).toBe("bg-atencao");
    expect(TEXTO.amarela).toBe("text-atencao-texto");
  });

  it("o token de atenção é fixo no tema (não muda com a marca)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/--color-atencao:\s*#d4af37/);
    expect(css).toMatch(/--color-atencao-texto:/);
  });
});
