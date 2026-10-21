import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * M2-b — dimensionamento único (interface real + Supabase LOCAL).
 * Antes: o assistente de novo negócio multiplicava a potência por um fator oculto de 1,24
 * (1.200 kWh / 120 kWh/kWp/mês = 10 kWp virava 12,4 kWp e 20 módulos de 620 W) enquanto o kit
 * personalizado sugeria pela conta direta. Agora os dois usam `dimensionarSistema`.
 * Padrão da empresa fictícia: produtividade 120 kWh/kWp/mês.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

/** Etapa 1 do assistente de novo negócio (campos obrigatórios + consumo) e avanço para a Etapa 2. */
async function preencherEtapa1EAvancar(page: Page, nome: string, whatsapp: string, consumo: string) {
  await page.getByRole("textbox", { name: "Nome do negócio" }).fill(nome);
  await page.getByRole("combobox", { name: /^Origem/ }).selectOption({ index: 1 });
  await page.getByRole("textbox", { name: /^Nome \/ Razão social/ }).fill(nome);
  await page.getByRole("textbox", { name: /^WhatsApp/ }).fill(whatsapp);
  await page.getByRole("textbox", { name: /^Cidade/ }).fill("Cascavel");
  await page.getByRole("combobox", { name: /^Estado/ }).selectOption("PR");
  await page.getByRole("textbox", { name: "Consumo médio mensal (kWh)" }).fill(consumo);
  await page.getByRole("button", { name: /^Avançar/ }).click();
}

test.describe("dimensionamento sem fator oculto", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("assistente: 1.200 kWh recomenda 17 módulos de 620 W (10,54 kWp), não 12,4 kWp", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto("/negocios/novo");

    await preencherEtapa1EAvancar(page, "Cliente M2-b dimensionamento (fictício)", "45900000000", "1.200");

    // 1.200 / 120 = 10 kWp → 10.000 W / 620 W = 16,13 → 17 módulos → 10,54 kWp instalados.
    await expect(page.getByText("Sistema de referência", { exact: true })).toBeVisible();
    await expect(page.getByText("17 × 620 W")).toBeVisible();
    await expect(page.getByText("10,54 kWp").first()).toBeVisible();
    await expect(page.getByText(/12,4\d* kWp/)).toHaveCount(0);
    await expect(page.getByText("20 × 620 W")).toHaveCount(0);
  });

  test("kit personalizado: o módulo de 620 W recebe a mesma quantidade sugerida (17)", async ({ page }) => {
    const v = base.usuarios.vendedor;
    // Mesmo consumo informado na Etapa 1: a Etapa 2 (kit) sugere a quantidade ao digitar a potência.
    await entrarComo(page, v, base.senha);
    await page.goto("/negocios/novo");
    await preencherEtapa1EAvancar(page, "Cliente M2-b kit (fictício)", "45900000001", "1200");

    await page.getByRole("button", { name: "Montar kit manualmente" }).click();
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    await page.getByLabel("Potência (W)").last().fill("620");
    await expect(page.getByLabel("Qtd.").last()).toHaveValue("17");
  });
});
