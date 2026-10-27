import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase, semRolagemHorizontal } from "./ajuda";

const linhaOperacional = (page: Page) =>
  page.getByText("Olívia Executora Op. (fictícia)", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'border-t')][1]");

test("admin configura atuação só no Operacional, inclusive no celular", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await page.setViewportSize({ width: 390, height: 844 });
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");

  const linha = linhaOperacional(page);
  await expect(linha.getByRole("combobox", { name: "Engenharia" })).toHaveValue("sem_acesso");
  await expect(linha.getByRole("combobox", { name: "Compras" })).toHaveValue("sem_acesso");
  await expect(linha.getByRole("combobox", { name: "Operacional" })).toHaveValue("executar");
  await expect(linha.getByText("A pessoa pode consultar o andamento de outros setores na mesma obra, sem poder alterá-los.")).toBeVisible();
  await semRolagemHorizontal(page, "usuários operacionais no celular");
});

test("admin atribui vários setores à mesma pessoa e mantém a configuração após recarregar", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");

  const linha = linhaOperacional(page);
  await linha.getByRole("combobox", { name: "Compras" }).selectOption("coordenar");
  await linha.getByRole("combobox", { name: "Engenharia" }).selectOption("executar");
  await Promise.all([
    page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().includes("/configuracoes/usuarios")),
    linha.getByRole("button", { name: "Salvar setores" }).click(),
  ]);

  await page.reload();
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Compras" })).toHaveValue("coordenar");
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Engenharia" })).toHaveValue("executar");
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Operacional" })).toHaveValue("executar");
});
