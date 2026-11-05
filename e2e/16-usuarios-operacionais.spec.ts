import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrarComo, lerBase, semRolagemHorizontal } from "./ajuda";

const OLIVIA = "Olívia Executora Op. (fictícia)";

/** Abre o painel da pessoa pela lista (tabela no computador, lista no celular). */
async function abrirPessoa(page: Page, nome: string): Promise<Locator> {
  await page.getByRole("region", { name: "Pessoas" }).getByRole("link", { name: new RegExp(nome.replace(/[().]/g, "\\$&")) }).filter({ visible: true }).first().click();
  const painel = page.getByRole("complementary", { name: `Editar ${nome}` });
  await expect(painel).toBeVisible();
  return painel;
}

/** Marca uma pílula (Não atua / Executa / Coordena) dentro de um grupo. */
const escolher = (grupo: Locator, opcao: string) => grupo.locator("label").filter({ hasText: new RegExp(`^${opcao}$`) }).click();
const pilula = (grupo: Locator, opcao: string) => grupo.getByRole("radio", { name: opcao, exact: true });

async function abrirOutrosSetores(painel: Locator) {
  const resumo = painel.getByText(/^Também atua em outros setores/);
  if (!(await painel.locator("details").evaluate((d) => (d as HTMLDetailsElement).open))) await resumo.click();
}

test("admin cria a pessoa com perfil, capacidade e outros setores, sem mexer nos de outra", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");

  const nome = "Pessoa Operação Cadastro (fictícia)";
  await page.getByRole("link", { name: "Convidar pessoa" }).click();
  const painel = page.getByRole("complementary", { name: "Convidar pessoa" });
  await painel.getByRole("textbox", { name: "Nome" }).fill(nome);
  await painel.getByRole("textbox", { name: "E-mail" }).fill(`operacao.cadastro.${Date.now()}@example.test`);
  await painel.getByRole("radio", { name: /^Engenharia/ }).check();
  await escolher(painel.getByRole("group", { name: "No Engenharia, esta pessoa" }), "Coordena");
  await abrirOutrosSetores(painel);
  await escolher(painel.getByRole("group", { name: "Compras", exact: true }), "Executa");
  await painel.getByRole("button", { name: "Criar usuário" }).click();
  await expect(painel.getByText("Usuário criado.", { exact: false })).toBeVisible();

  await page.reload();
  const criada = await abrirPessoa(page, nome);
  await expect(criada.getByRole("radio", { name: /^Engenharia/ })).toBeChecked();
  await expect(pilula(criada.getByRole("group", { name: "No Engenharia, esta pessoa" }), "Coordena")).toBeChecked();
  await abrirOutrosSetores(criada);
  await expect(pilula(criada.getByRole("group", { name: "Compras", exact: true }), "Executa")).toBeChecked();
  await expect(pilula(criada.getByRole("group", { name: "Operacional", exact: true }), "Não atua")).toBeChecked();

  const olivia = await abrirPessoa(page, OLIVIA);
  await expect(olivia.getByRole("radio", { name: /^Operacional/ })).toBeChecked();
  await abrirOutrosSetores(olivia);
  await expect(pilula(olivia.getByRole("group", { name: "Compras", exact: true }), "Não atua")).toBeChecked();
});

test("no celular, o painel da pessoa ocupa a tela, sem rolagem lateral", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await page.setViewportSize({ width: 390, height: 844 });
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");
  await semRolagemHorizontal(page, "lista de usuários no celular");

  const painel = await abrirPessoa(page, OLIVIA);
  await expect(page.getByRole("region", { name: "Pessoas" })).toBeHidden();
  await expect(painel.getByRole("radio", { name: /^Operacional/ })).toBeChecked();
  await expect(pilula(painel.getByRole("group", { name: "No Operacional, esta pessoa" }), "Executa")).toBeChecked();
  await semRolagemHorizontal(page, "painel da pessoa no celular");
});

test("admin dá outros setores à mesma pessoa e o perfil continua após recarregar", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/usuarios");

  const painel = await abrirPessoa(page, OLIVIA);
  await abrirOutrosSetores(painel);
  await escolher(painel.getByRole("group", { name: "Compras", exact: true }), "Coordena");
  await escolher(painel.getByRole("group", { name: "Engenharia", exact: true }), "Executa");
  await Promise.all([
    page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().includes("/configuracoes/usuarios")),
    painel.getByRole("button", { name: "Salvar" }).click(),
  ]);
  await expect(painel.getByText("Salvo.")).toBeVisible();

  await page.reload();
  const depois = await abrirPessoa(page, OLIVIA);
  // Coordenar Compras não troca o perfil: o setor principal continua o Operacional.
  await expect(depois.getByRole("radio", { name: /^Operacional/ })).toBeChecked();
  await abrirOutrosSetores(depois);
  await expect(pilula(depois.getByRole("group", { name: "Compras", exact: true }), "Coordena")).toBeChecked();
  await expect(pilula(depois.getByRole("group", { name: "Engenharia", exact: true }), "Executa")).toBeChecked();
});
