import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Telas por empresa (20261203100000_telas_empresa.sql): o admin desliga telas em Configurações › Telas da empresa;
// elas somem do menu, dos atalhos das outras telas, e o endereço mostra o aviso. O teste religa no fim (os arquivos
// rodam em sequência na mesma base).

const menu = (page: Page) => page.getByRole("navigation", { name: "Menu principal" }).first();
const chave = (page: Page, nome: string) => page.getByRole("switch", { name: nome, exact: true });

async function salvarTelas(page: Page, ligadas: Record<string, boolean>) {
  await page.goto("/configuracoes/telas");
  for (const [nome, ligado] of Object.entries(ligadas)) {
    if ((await chave(page, nome).getAttribute("aria-checked")) !== String(ligado)) await chave(page, nome).click();
  }
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Telas salvas.")).toBeVisible();
}

test.describe("telas da empresa", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.afterEach(async ({ page }) => {
    await salvarTelas(page, { Forecast: true, Gamificação: true });
  });

  test("Forecast desligado some do menu e de Negócios, e o endereço mostra o aviso", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);

    await salvarTelas(page, { Forecast: false });
    await expect(page.getByRole("heading", { name: "Telas da empresa", level: 1 })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Forecast", exact: true })).toHaveCount(0);

    await page.goto("/negocios");
    await expect(page.getByRole("heading", { name: "Negócios", level: 1 })).toBeVisible();
    // Nome exato: a base tem negócios "Cliente Forecast …".
    await expect(page.getByRole("main").getByRole("link", { name: "Forecast", exact: true })).toHaveCount(0);

    await page.goto("/forecast");
    await expect(page.getByText("Esta tela está desligada na sua empresa")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ligar em Configurações › Telas da empresa" })).toBeVisible();

    await salvarTelas(page, { Forecast: true });
    await expect(menu(page).getByRole("link", { name: "Forecast", exact: true })).toBeVisible();
  });

  test("Gamificação desligada some do Início", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);

    await salvarTelas(page, { Gamificação: false });
    for (const visao of ["/inicio", "/inicio?visao=equipe"]) {
      await page.goto(visao);
      await expect(page.getByText("Resumo do funil")).toBeVisible();
      await expect(page.getByText("Minha jornada no Raion")).toHaveCount(0);
      await expect(page.getByText("Ranking da equipe")).toHaveCount(0);
    }
  });
});
