import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * E0 — a Etapa 2 do assistente de novo negócio não afirma compatibilidade técnica (interface real +
 * Supabase LOCAL). Antes: um banner verde fixo "Combinação compatível · MPPT validado · Voc validado" e um
 * botão com alertas de exemplo. Agora: "Compatibilidade técnica não verificada", sem nada validado.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

async function irParaEtapa2(page: Page, nome: string, whatsapp: string) {
  await page.goto("/negocios/novo");
  await page.getByRole("textbox", { name: "Nome do negócio" }).fill(nome);
  await page.getByRole("combobox", { name: /^Origem/ }).selectOption({ index: 1 });
  await page.getByRole("textbox", { name: /^Nome \/ Razão social/ }).fill(nome);
  await page.getByRole("textbox", { name: /^WhatsApp/ }).fill(whatsapp);
  await page.getByRole("textbox", { name: /^Cidade/ }).fill("Cascavel");
  await page.getByRole("combobox", { name: /^Estado/ }).selectOption("PR");
  await page.getByRole("textbox", { name: "Consumo médio mensal (kWh)" }).fill("780");
  await page.getByRole("button", { name: /^Avançar/ }).click();
}

test.describe("compatibilidade técnica não verificada", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Etapa 2 avisa que a compatibilidade não foi verificada e não mostra nada validado", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await irParaEtapa2(page, "Cliente E0 compatibilidade (fictício)", "45900000010");

    await expect(page.getByText("Sistema de referência", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Compatibilidade técnica não verificada" })).toBeVisible();

    for (const proibido of [/MPPT validado/i, /Voc validado/i, /Combinação compatível/i, /Combinação incompatível/i, /Overload acima/i, /\(exemplo\)/i]) {
      await expect(page.getByText(proibido)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /exemplos? de alerta técnico/i })).toHaveCount(0);
    await expect(page.getByText("exemplo de catálogo")).toHaveCount(0);
  });

  test("o aviso continua na Etapa 2 mesmo montando o kit manualmente", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await irParaEtapa2(page, "Cliente E0 kit manual (fictício)", "45900000011");

    await page.getByRole("button", { name: "Montar kit manualmente" }).click();
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    await page.getByLabel("Potência (W)").last().fill("620");
    await expect(page.getByRole("status").filter({ hasText: "Compatibilidade técnica não verificada" })).toBeVisible();
    await expect(page.getByText(/MPPT validado|Voc validado|Combinação compatível/i)).toHaveCount(0);
  });
});
