import { expect, test } from "@playwright/test";
import { clienteServico, entrarComo, lerBase } from "./ajuda";

// Engenharia: a lista mostra a obra na etapa certa, o card abre e aceita uma tarefa do setor; quem não atua em Engenharia
// não entra nem na lista nem no card.
test("executor de Engenharia abre o card da obra e cria tarefa; Compras não entra", async ({ page }) => {
  const { usuarios, senha, obras } = lerBase();
  const { data: obra } = await clienteServico().from("obras").select("numero, cliente_nome").eq("id", obras.o01).single();
  const titulo = `Pedir vistoria ${Date.now()}`;

  await entrarComo(page, usuarios.execEng, senha);
  await page.getByRole("link", { name: "Engenharia", exact: true }).first().click();
  await page.waitForURL("**/engenharia");
  await expect(page.getByRole("heading", { name: "Engenharia", level: 1 })).toBeVisible();
  const etapa = page.getByRole("region", { name: "Projeto em elaboração" });
  await etapa.getByRole("link", { name: new RegExp(`Obra #${obra!.numero} `) }).click();

  await page.waitForURL(`**/engenharia/${obras.o01}`);
  await expect(page.getByRole("heading", { name: obra!.cliente_nome, level: 1 })).toBeVisible();
  await expect(page.getByText("Projeto em elaboração").first()).toBeVisible();

  const novo = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar ao setor" }) });
  await novo.getByPlaceholder(/O que a Engenharia precisa fazer/).fill(titulo);
  await expect(novo.getByRole("combobox", { name: "Setor" })).toHaveValue("engenharia");
  await novo.getByRole("button", { name: "Enviar ao setor" }).click();
  await expect(page.getByText(titulo, { exact: true })).toBeVisible();

  // Na Central, a tarefa da fila que o executor pode assumir aparece em "Precisa de você", com o link para o card.
  await page.goto("/engenharia");
  const tarefasMinhas = page.getByRole("region", { name: "Tarefas" });
  await expect(tarefasMinhas.getByText(titulo, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`^Obra #${obra!.numero} `) }).first()).toHaveAttribute("href", `/engenharia/${obras.o01}`);

  await entrarComo(page, usuarios.execCompras, senha);
  await page.goto("/engenharia");
  await expect(page.getByText("Você não atua em Engenharia nesta empresa.")).toBeVisible();
  const resposta = await page.goto(`/engenharia/${obras.o01}`);
  expect(resposta?.status()).toBe(404);
});
