import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Compras (P2): na o10 (depois do 29, que já iniciou a compra; sozinho, este inicia), quem atua em Compras anexa um
// orçamento com planilha, gera o pedido a partir dele (fornecedor e entrega já preenchidos) e anexa a confirmação do
// pedido: o orçamento fica "Escolhido" e os arquivos aparecem na lista.
test("Compras: orçamento, gerar pedido deste e arquivos da obra", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.execCompras, senha);

  await page.goto(`/obras/${obras.o10}`);
  const iniciar = page.getByRole("button", { name: "Iniciar compra" });
  if (await iniciar.isVisible()) await iniciar.click();
  await page.locator("#pedidos-compra").getByRole("link", { name: /^Orçamentos e arquivos/ }).click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const novo = page.getByRole("form", { name: "Anexar orçamento" });
  await novo.getByRole("combobox", { name: "Fornecedor" }).fill("Atacado Energia (fictício)");
  await novo.getByRole("textbox", { name: "Valor total (R$)" }).fill("13.590,00");
  await novo.getByLabel("Entrega prometida").fill("2030-01-15");
  await novo.getByLabel("Válido até").fill("2030-01-10");
  await novo.getByRole("textbox", { name: "Condição de pagamento (opcional)" }).fill("À vista");
  await novo.getByLabel("Arquivo (PDF, imagem ou planilha)").setInputFiles({
    name: "orcamento-atacado.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("planilha de teste"),
  });
  await novo.getByRole("button", { name: "Anexar orçamento" }).click();

  const cartao = page.getByRole("listitem").filter({ hasText: "Atacado Energia (fictício)" }).first();
  await expect(cartao.getByText("R$ 13.590,00")).toBeVisible();
  await expect(cartao.getByRole("link", { name: "orcamento-atacado.xlsx" })).toBeVisible();
  await cartao.getByRole("link", { name: "Gerar pedido deste" }).click();

  await expect(page.getByRole("heading", { name: "Pedido de compra", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Fornecedor" })).toHaveValue("Atacado Energia (fictício)");
  await expect(page.getByText("Orçamento de Atacado Energia (fictício)")).toBeVisible();
  while ((await page.getByRole("button", { name: "Tirar" }).count()) > 0) await page.getByRole("button", { name: "Tirar" }).first().click();
  await page.getByRole("button", { name: "+ Item fora do kit" }).click();
  await page.getByRole("textbox", { name: "Descrição do item 1" }).fill("Kit fotovoltaico");
  await page.getByRole("textbox", { name: /^Quantidade de/ }).fill("1");
  await page.getByRole("textbox", { name: /^Valor unitário de/ }).fill("13.590,00");
  await page.getByRole("button", { name: "Fazer pedido" }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${obras.o10}`));

  await page.goto(`/obras/${obras.o10}/compras`);
  const escolhido = page.getByRole("listitem").filter({ hasText: "Atacado Energia (fictício)" }).first();
  await expect(escolhido.getByText("Escolhido")).toBeVisible();
  await expect(escolhido.getByText(/Virou o pedido P-\d{4}/)).toBeVisible();

  await page.locator("summary", { hasText: "+ Anexar arquivo" }).click();
  const anexar = page.getByRole("form", { name: "Anexar arquivo de compra" });
  await anexar.getByRole("combobox", { name: "Tipo" }).selectOption("confirmacao");
  await anexar.getByRole("combobox", { name: "Pedido" }).selectOption({ label: (await anexar.getByRole("option", { name: /Atacado Energia/ }).textContent())! });
  await anexar.getByLabel("Arquivo").setInputFiles({ name: "confirmacao.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 confirmação") });
  await anexar.getByRole("button", { name: "Anexar arquivo" }).click();
  await expect(page.getByRole("link", { name: "confirmacao.pdf" }).filter({ visible: true })).toBeVisible();
});
