import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Compras (P1): na o10 (o Compras dela só é lido pelo 03, que roda antes), quem atua em Compras vê a obra na fila,
// inicia a compra, faz o pedido com um item fora do kit, registra a nota fiscal (a conta a pagar nasce no Financeiro) e
// o recebimento: o status de Compras anda sozinho até "Material entregue".
test("Compras: fila, iniciar, pedido, nota fiscal e recebimento", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.execCompras, senha);

  await page.goto("/compras?aba=a-comprar");
  await expect(page.getByRole("heading", { name: "Compras", level: 1 })).toBeVisible();
  const fila = page.getByRole("region", { name: "A comprar" });
  const linhaObra = fila.getByRole("listitem").filter({ has: page.locator(`a[href="/obras/${obras.o10}"]`) });
  await expect(linhaObra.getByText(/Aguardando Compras/)).toBeVisible();

  await page.goto(`/obras/${obras.o10}`);
  await page.getByRole("button", { name: "Iniciar compra" }).click();
  const pedidos = page.locator("#pedidos-compra");
  await expect(pedidos.getByRole("link", { name: "+ Pedido de compra" })).toBeVisible();
  await pedidos.getByRole("link", { name: "+ Pedido de compra" }).click();

  await expect(page.getByRole("heading", { name: "Pedido de compra", level: 1 })).toBeVisible();
  await page.getByRole("combobox", { name: "Fornecedor" }).fill("Ferragens Campinas (fictícia)");
  await page.getByRole("combobox", { name: "Categoria do custo" }).selectOption("estrutura_materiais");
  // Tira os itens do kit (se houver) e pede só um item fora do kit.
  while ((await page.getByRole("button", { name: "Tirar" }).count()) > 0) await page.getByRole("button", { name: "Tirar" }).first().click();
  await page.getByRole("button", { name: "+ Item fora do kit" }).click();
  await page.getByRole("textbox", { name: "Descrição do item 1" }).fill("Estrutura para telhado cerâmico");
  await page.getByRole("textbox", { name: /^Quantidade de/ }).fill("2");
  await page.getByRole("textbox", { name: /^Valor unitário de/ }).fill("10,00");
  await expect(page.getByText("R$ 20,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Fazer pedido" }).click();

  await expect(page).toHaveURL(new RegExp(`/obras/${obras.o10}`));
  const linhaPedido = page.locator("#pedidos-compra li").filter({ hasText: "Ferragens Campinas (fictícia)" });
  await expect(linhaPedido.getByText("Aguardando NF")).toBeVisible();

  await linhaPedido.locator("summary", { hasText: "Registrar nota fiscal" }).click();
  await linhaPedido.getByRole("textbox", { name: "Número da nota" }).fill("7.731");
  await linhaPedido.getByLabel("Arquivo da nota").setInputFiles({ name: "nota.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 nota") });
  await linhaPedido.getByRole("button", { name: "Registrar nota fiscal" }).click();
  await expect(linhaPedido.getByText("Faturado", { exact: true })).toBeVisible();

  await linhaPedido.locator("summary", { hasText: "Registrar recebimento" }).click();
  await linhaPedido.getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(linhaPedido.getByText("Recebido", { exact: true })).toBeVisible();
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Compras", exact: true }) }).last()).toContainText("Material entregue");
});
