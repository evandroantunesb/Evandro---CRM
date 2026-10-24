import { expect, test } from "@playwright/test";
import { entrarComo, lerBase, preencherNovoNegocio } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * E0 — a seção Sistema do Novo negócio não afirma compatibilidade técnica (interface real + Supabase LOCAL).
 * Antes: um banner verde fixo "Combinação compatível · MPPT validado · Voc validado" e um botão com alertas de
 * exemplo. Agora: "Compatibilidade técnica não verificada", sem nada validado, inclusive no kit sugerido.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

test.describe("compatibilidade técnica não verificada", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("o kit sugerido avisa que a compatibilidade não foi verificada e não mostra nada validado", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente E0 compatibilidade (fictício)", "45900000010", "780");

    // 780 / 120 = 6,5 kWp → 11 módulos de 620 W.
    await expect(page.getByRole("region", { name: "Sistema" }).locator("output")).toHaveText("11");
    await expect(page.getByRole("status").filter({ hasText: "Compatibilidade técnica não verificada" })).toBeVisible();

    for (const proibido of [/MPPT validado/i, /Voc validado/i, /Combinação compatível/i, /Combinação incompatível/i, /Overload acima/i, /\(exemplo\)/i]) {
      await expect(page.getByText(proibido)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /exemplos? de alerta técnico/i })).toHaveCount(0);
    await expect(page.getByText("exemplo de catálogo")).toHaveCount(0);
  });

  test("o aviso continua mesmo montando o kit à mão", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente E0 kit manual (fictício)", "45900000011", "780");

    await page.getByRole("button", { name: "Trocar itens ou montar do zero" }).click();
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    await page.getByLabel("Potência (W)").last().fill("620");
    await expect(page.getByRole("status").filter({ hasText: "Compatibilidade técnica não verificada" })).toBeVisible();
    await expect(page.getByText(/MPPT validado|Voc validado|Combinação compatível/i)).toHaveCount(0);
  });
});
