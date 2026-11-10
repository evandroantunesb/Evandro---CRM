import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Marca da empresa (Onboarding, subprojeto 2): as cores da identidade da proposta pintam a barra lateral e os botões de
// destaque do app; cor de barra clara demais não salva. O teste volta ao padrão no fim (base única, arquivos em ordem).

const IDENTIDADE = "/configuracoes/propostas/identidade";
const barra = (page: Page) => page.locator("aside.barra-lateral");
const fundo = (l: ReturnType<Page["locator"]>) => l.evaluate((el) => getComputedStyle(el).backgroundColor);

async function salvarCores(page: Page, primaria: string, destaque: string) {
  await page.goto(IDENTIDADE);
  await page.locator('input[name="cor_primaria"]').fill(primaria);
  await page.locator('input[name="cor_destaque"]').fill(destaque);
  await page.getByRole("button", { name: "Salvar identidade" }).click();
}

test.describe("marca e cores", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.afterEach(async ({ page }) => {
    await salvarCores(page, "", "");
    await expect(page.getByText("Identidade visual salva.")).toBeVisible();
  });

  test("as cores da empresa pintam a barra e os botões; a barra clara não salva", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);

    await salvarCores(page, "#123C45", "#0E9F8A");
    await expect(page.getByText("Identidade visual salva.")).toBeVisible();
    await expect(page.getByText("✓ Contraste bom")).toBeVisible();

    await page.goto("/inicio");
    await expect.poll(() => fundo(barra(page))).toBe("rgb(18, 60, 69)");
    const novo = page.getByRole("main").getByRole("link", { name: "Novo negócio" }).first();
    await expect.poll(() => fundo(novo)).toBe("rgb(14, 159, 138)");

    // Dentro da Gamificação o destaque continua dourado; a barra segue a empresa.
    await page.goto("/gamificacao");
    await expect.poll(() => fundo(barra(page))).toBe("rgb(18, 60, 69)");

    await page.goto(IDENTIDADE);
    await page.locator('input[name="cor_primaria"]').fill("#EDDB9F");
    await expect(page.getByText("A cor da barra é clara demais")).toBeVisible();
    await page.getByRole("button", { name: "Salvar identidade" }).click();
    await expect(page.getByText("A cor da barra é clara demais").last()).toBeVisible();
    await page.goto("/inicio");
    await expect.poll(() => fundo(barra(page))).toBe("rgb(18, 60, 69)");
  });
});
