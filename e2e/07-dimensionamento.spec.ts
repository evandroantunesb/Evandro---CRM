import { expect, test } from "@playwright/test";
import { entrarComo, lerBase, preencherNovoNegocio } from "./ajuda";
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

test.describe("dimensionamento sem fator oculto", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("kit sugerido: 1.200 kWh recomenda 17 módulos de 620 W (10,54 kWp), não 12,4 kWp", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente M2-b dimensionamento (fictício)", "45900000000", "1.200");

    // 1.200 / 120 = 10 kWp → 10.000 W / 620 W = 16,13 → 17 módulos → 10,54 kWp instalados.
    const sistema = page.getByRole("region", { name: "Sistema" });
    await expect(sistema.locator("output")).toHaveText("17");
    await expect(sistema.getByText("10,54 kWp")).toBeVisible();
    await expect(page.getByText(/12,4\d* kWp/)).toHaveCount(0);
  });

  test("editor do kit: o módulo de 620 W recebe a mesma quantidade sugerida (17)", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente M2-b kit (fictício)", "45900000001", "1200");

    // "Montar do zero" abre o editor com os itens sugeridos; um módulo novo de 620 W recebe a mesma sugestão.
    await page.getByRole("button", { name: "Trocar itens ou montar do zero" }).click();
    // O editor agrupa por tipo (módulos antes do inversor): a linha nova é a segunda de módulo, não a última da tela.
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    await page.getByLabel("Potência (W)").nth(1).fill("620");
    await expect(page.getByLabel("Qtd.").nth(1)).toHaveValue("17");
  });
});
