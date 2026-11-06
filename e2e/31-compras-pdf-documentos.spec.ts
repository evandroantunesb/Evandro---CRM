import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Compras (P2b): na o10 (depois do 29 e do 30; sozinho, este inicia a compra), quem atua em Compras vê os dados e os
// documentos do cliente (vindos do negócio), faz um pedido FOB faturado para a empresa com outro endereço de entrega e
// observações, e abre o PDF do pedido.
test("Compras: documentos do cliente, pedido FOB com entrega e o PDF", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.execCompras, senha);

  await page.goto(`/obras/${obras.o10}`);
  const iniciar = page.getByRole("button", { name: "Iniciar compra" });
  if (await iniciar.isVisible()) await iniciar.click();

  await page.goto(`/obras/${obras.o10}/compras`);
  const documentos = page.locator("section").filter({ has: page.getByRole("heading", { name: "Documentos do cliente" }) });
  await expect(documentos.getByText("Comprovante de residência")).toBeVisible();
  await expect(documentos.getByText("Do negócio").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dados para o faturamento" })).toBeVisible();

  await page.goto(`/compras/pedido?obra=${obras.o10}`);
  await expect(page.getByRole("heading", { name: "Pedido de compra", level: 1 })).toBeVisible();
  await page.getByRole("combobox", { name: "Fornecedor" }).fill("Transportes e Kits (fictícia)");
  await page.getByRole("textbox", { name: /Observações para o fornecedor/ }).fill("Entregar pela manhã.");
  await page.getByRole("radio", { name: /^Empresa/ }).check();
  await page.getByRole("textbox", { name: "Endereço de entrega" }).fill("Depósito fictício, Rua das Flores, 10");
  await page.getByRole("textbox", { name: "Quem recebe", exact: true }).fill("Marcos");
  while ((await page.getByRole("button", { name: "Tirar" }).count()) > 0) await page.getByRole("button", { name: "Tirar" }).first().click();
  await page.getByRole("button", { name: "+ Item fora do kit" }).click();
  await page.getByRole("textbox", { name: "Descrição do item 1" }).fill("Cabo solar 6 mm²");
  await page.getByRole("textbox", { name: /^Quantidade de/ }).fill("1");
  await page.getByRole("textbox", { name: /^Valor unitário de/ }).fill("100,00");
  await page.getByRole("combobox", { name: "Frete" }).selectOption("fob");
  await page.getByRole("textbox", { name: "Valor do frete (R$)" }).fill("50,00");
  await expect(page.getByText("R$ 150,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Fazer pedido" }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${obras.o10}`));

  const linha = page.locator("#pedidos-compra li").filter({ hasText: "Transportes e Kits (fictícia)" });
  const href = await linha.getByRole("link", { name: "PDF do pedido" }).getAttribute("href");
  expect(href).toMatch(/^\/compras\/pedido\/[0-9a-f-]{36}\/pdf$/);
  const resposta = await page.request.get(href!);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("application/pdf");
  expect((await resposta.body()).subarray(0, 4).toString()).toBe("%PDF");
});
