import { expect, test } from "@playwright/test";
import { clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";

// Pedido feito no negócio para a Engenharia, com foto anexada: quem pediu vê no negócio; a Engenharia vê o pedido e o anexo
// na tela Tarefas; Compras, não.
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
  await pedido.locator('input[type="file"]').setInputFiles({ name: "foto-telhado.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(256, 1) });
  await expect(pedido.getByText("1 arquivo para anexar")).toBeVisible();
  await pedido.getByRole("button", { name: "Enviar ao setor" }).click();
  await expect(pedido.getByText("Tarefa enviada ao setor.")).toBeVisible();
  await expect(page.getByText(titulo, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "foto-telhado.jpg" }).first()).toBeVisible();

  for (const chave of ["coordEng", "execEng"]) {
    await entrarComo(page, usuarios[chave], senha);
    await page.getByRole("link", { name: "Tarefas", exact: true }).first().click();
    await page.waitForURL("**/tarefas/setores");
    await expect(page.getByText(titulo, { exact: true }), chave).toBeVisible();
    await expect(page.getByRole("link", { name: "foto-telhado.jpg" }).first(), `${chave} vê o anexo`).toBeVisible();
    await page.getByRole("link", { name: "Na fila do setor" }).click();
    await expect(page.getByText(titulo, { exact: true }), `${chave} na fila`).toBeVisible();
  }

  await entrarComo(page, usuarios.execCompras, senha);
  await page.goto("/tarefas/setores");
  await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
  await expect(page.getByText(titulo, { exact: true })).toHaveCount(0);
});
