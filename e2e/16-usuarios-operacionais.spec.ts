import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase, semRolagemHorizontal } from "./ajuda";

const linhaOperacional = (page: Page) =>
  page.getByText("Olívia Executora Op. (fictícia)", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'border-t')][1]");

test("admin escolhe os setores ao criar a pessoa e não altera os de outra", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");

  const nome = "Pessoa Operação Cadastro (fictícia)";
  const cadastro = page.locator("form").filter({ has: page.getByRole("button", { name: "Criar usuário" }) });
  await cadastro.getByRole("textbox", { name: "Nome" }).fill(nome);
  await cadastro.getByRole("textbox", { name: "E-mail" }).fill(`operacao.cadastro.${Date.now()}@example.test`);
  await cadastro.getByRole("combobox", { name: "Perfil" }).selectOption("operacao");
  const setores = cadastro.getByRole("group", { name: "Setores desta pessoa" });
  await setores.getByRole("combobox", { name: "Compras" }).selectOption("executar");
  await setores.getByRole("combobox", { name: "Engenharia" }).selectOption("coordenar");
  await cadastro.getByRole("button", { name: "Criar usuário" }).click();
  await expect(cadastro.getByText("Usuário criado.", { exact: false })).toBeVisible();

  const linhaCriada = page.getByText(nome, { exact: true }).locator("xpath=ancestor::div[contains(@class, 'border-t')][1]");
  await expect(linhaCriada.getByText(`Setores de ${nome}`)).toBeVisible();
  await expect(linhaCriada.getByRole("combobox", { name: "Compras" })).toHaveValue("executar");
  await expect(linhaCriada.getByRole("combobox", { name: "Engenharia" })).toHaveValue("coordenar");
  await expect(linhaCriada.getByRole("combobox", { name: "Operacional" })).toHaveValue("sem_acesso");
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Compras" })).toHaveValue("sem_acesso");
});

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
  await expect(linha.getByText("Setores atualizados.")).toBeVisible();

  await page.reload();
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Compras" })).toHaveValue("coordenar");
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Engenharia" })).toHaveValue("executar");
  await expect(linhaOperacional(page).getByRole("combobox", { name: "Operacional" })).toHaveValue("executar");
});
