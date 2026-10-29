import { expect, test } from "@playwright/test";
import { clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";

// Pedido feito no negócio para a Engenharia: quem pediu vê no negócio; a Engenharia vê na tela Tarefas; Compras, não.
test("admin pede à Engenharia no negócio e o coordenador e o executor da Engenharia veem em Tarefas", async ({ page }) => {
  const { usuarios, senha, obras } = lerBase();
  const { data: obra } = await clienteServico().from("obras").select("negocio_id").eq("id", obras.o01).single();
  const negocioId = obra!.negocio_id!;
  const titulo = `Projeto 3D do telhado ${Date.now()}`;

  await entrarComo(page, usuarios.admin, senha);
  await page.goto(fichaNaAba(negocioId, "Atividades"));
  const pedido = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar ao setor" }) });
  await pedido.getByPlaceholder(/O que você precisa/).fill(titulo);
  await pedido.getByRole("combobox", { name: "Setor" }).selectOption("engenharia");
  await pedido.getByRole("button", { name: "Enviar ao setor" }).click();
  await expect(pedido.getByText("Tarefa enviada ao setor.")).toBeVisible();
  await expect(page.getByText(titulo, { exact: true })).toBeVisible();

  for (const chave of ["coordEng", "execEng"]) {
    await entrarComo(page, usuarios[chave], senha);
    await page.getByRole("link", { name: "Tarefas", exact: true }).first().click();
    await page.waitForURL("**/tarefas/setores");
    await expect(page.getByText(titulo, { exact: true }), chave).toBeVisible();
    await page.getByRole("link", { name: "Na fila do setor" }).click();
    await expect(page.getByText(titulo, { exact: true }), `${chave} na fila`).toBeVisible();
  }

  await entrarComo(page, usuarios.execCompras, senha);
  await page.goto("/tarefas/setores");
  await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
  await expect(page.getByText(titulo, { exact: true })).toHaveCount(0);
});
