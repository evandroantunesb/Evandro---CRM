import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Telas por empresa (20261203100000_telas_empresa.sql): o admin desliga o Forecast em Configurações › Telas da empresa;
// some do menu e o endereço mostra o aviso. O teste religa no fim (os arquivos rodam em sequência na mesma base).

const menu = (page: Page) => page.getByRole("navigation", { name: "Menu principal" }).first();
const chaveForecast = (page: Page) => page.getByRole("switch", { name: "Forecast" });

async function salvarForecast(page: Page, ligado: boolean) {
  await page.goto("/configuracoes/telas");
  if ((await chaveForecast(page).getAttribute("aria-checked")) !== String(ligado)) await chaveForecast(page).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Telas salvas.")).toBeVisible();
}

test.describe("telas da empresa", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.afterEach(async ({ page }) => {
    await salvarForecast(page, true);
  });

  test("Forecast desligado some do menu e o endereço mostra o aviso", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);

    await salvarForecast(page, false);
    await expect(page.getByRole("heading", { name: "Telas da empresa", level: 1 })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Forecast" })).toHaveCount(0);

    await page.goto("/forecast");
    await expect(page.getByText("Esta tela está desligada na sua empresa")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ligar em Configurações › Telas da empresa" })).toBeVisible();

    await salvarForecast(page, true);
    await expect(menu(page).getByRole("link", { name: "Forecast" })).toBeVisible();
  });
});
