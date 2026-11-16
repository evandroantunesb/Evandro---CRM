import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Setores da obra (Onboarding, subprojeto 4a; 20261206100000_setores_da_obra.sql): o admin desliga o setor Engenharia
// em Configurações › Telas da empresa, no cartão "Setores da obra"; a tela Engenharia some do menu e os endereços dela
// mostram o aviso. Desligar o Administrativo tira o perfil dele do cadastro de pessoas. O teste religa no fim (os arquivos rodam em sequência na mesma base).

const menu = (page: Page) => page.getByRole("navigation", { name: "Menu principal" }).first();
const chaveSetor = (page: Page, nome: string) => page.getByRole("switch", { name: `Setor ${nome}`, exact: true });

async function salvarSetores(page: Page, ligados: Record<string, boolean>) {
  await page.goto("/configuracoes/telas");
  await expect(page.getByRole("heading", { name: "Setores da obra" })).toBeVisible();
  for (const [nome, ligado] of Object.entries(ligados)) {
    if ((await chaveSetor(page, nome).getAttribute("aria-checked")) !== String(ligado)) await chaveSetor(page, nome).click();
  }
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Telas salvas.")).toBeVisible();
}

test.describe("setores da obra", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.afterEach(async ({ page }) => {
    await salvarSetores(page, { Engenharia: true, Administrativo: true });
  });

  test("Engenharia desligada some do menu e as telas dela mostram o aviso; religada, voltam", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);

    await salvarSetores(page, { Engenharia: false });
    await expect(chaveSetor(page, "Engenharia")).toHaveAttribute("aria-checked", "false");
    await expect(menu(page).getByRole("link", { name: "Engenharia", exact: true })).toHaveCount(0);

    for (const endereco of ["/engenharia", "/configuracoes/engenharia"]) {
      await page.goto(endereco);
      await expect(page.getByText("Esta tela está desligada na sua empresa")).toBeVisible();
    }

    await salvarSetores(page, { Engenharia: true });
    await expect(menu(page).getByRole("link", { name: "Engenharia", exact: true })).toBeVisible();
    for (const endereco of ["/engenharia", "/configuracoes/engenharia"]) {
      await page.goto(endereco);
      await expect(page.getByText("Esta tela está desligada na sua empresa")).toHaveCount(0);
    }
  });

  test("Administrativo desligado some do cadastro de pessoas; religado, volta", async ({ page }) => {
    const { usuarios, senha } = lerBase();
    await entrarComo(page, usuarios.admin, senha);
    const perfilAdministrativo = async () => {
      await page.goto("/configuracoes/usuarios");
      await page.getByRole("link", { name: "Convidar pessoa" }).click();
      return page.getByRole("complementary", { name: "Convidar pessoa" }).getByRole("radio", { name: /^Administrativo/ });
    };

    await salvarSetores(page, { Administrativo: false });
    await expect(chaveSetor(page, "Administrativo")).toHaveAttribute("aria-checked", "false");
    await expect(await perfilAdministrativo()).toHaveCount(0);

    await salvarSetores(page, { Administrativo: true });
    await expect(await perfilAdministrativo()).toBeVisible();
  });
});
