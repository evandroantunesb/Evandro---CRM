import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Financeiro da obra (A2a): na o03, o admin lança um pagamento a fornecedor, registra o pagamento com o comprovante e
// vê a conta paga, o documento e o custo real na mesma categoria. Depois anexa a NF do cliente: o marco conclui.
// Valores baixos e vencimento hoje para não mexer na margem nem no semáforo usados por outros testes.
test("admin lança e paga um fornecedor e anexa a NF do cliente na ficha da obra", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto(`/obras/${obras.o03}`);

  const cartao = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pagamentos a fornecedores", level: 2 }) });
  await cartao.locator("summary", { hasText: "+ Lançar pagamento" }).click();
  await cartao.getByRole("combobox", { name: "Fornecedor" }).fill("Transportadora Rápida (fictícia)");
  await cartao.getByRole("combobox", { name: "Categoria" }).selectOption("frete");
  await cartao.getByRole("textbox", { name: "Valor (R$)" }).fill("45,50");
  await cartao.getByRole("textbox", { name: "Descrição (opcional)" }).fill("Frete do kit");
  await cartao.getByRole("button", { name: "Lançar pagamento" }).click();
  await expect(cartao.getByText("Pagamento lançado.")).toBeVisible();

  const linha = cartao.getByRole("listitem").filter({ hasText: "Transportadora Rápida (fictícia)" });
  await expect(linha.getByText("A pagar · vence hoje")).toBeVisible();
  await linha.locator("summary", { hasText: "Registrar pagamento" }).click();
  await linha.getByLabel("Comprovante").setInputFiles({ name: "comprovante.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await linha.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(linha.getByText(/^Pago \d{2}\/\d{2}$/)).toBeVisible();
  await expect(linha.getByRole("link", { name: "✓ comprovante" })).toBeVisible();
  await expect(linha.getByText("NF pendente")).toBeVisible();

  // O pagamento entrou como custo real, na mesma categoria.
  const custos = page.locator("section").filter({ has: page.getByRole("heading", { name: "Custos da obra", level: 2 }) });
  await expect(custos.getByText(/Frete · Transportadora Rápida \(fictícia\) · Frete do kit/)).toBeVisible();

  const nfCliente = page.locator("section").filter({ has: page.getByRole("heading", { name: "Nota fiscal do cliente", level: 2 }) });
  await expect(nfCliente.getByText("Pendente", { exact: true })).toBeVisible();
  await nfCliente.getByLabel("Nota fiscal do cliente").setInputFiles({ name: "nf-cliente.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 nf") });
  await nfCliente.getByRole("button", { name: "Anexar nota fiscal" }).click();
  await expect(nfCliente.getByText("Anexada", { exact: true })).toBeVisible();
  await expect(nfCliente.getByRole("link", { name: "nf-cliente.pdf" })).toBeVisible();

  const marcos = page.locator("section").filter({ has: page.getByRole("heading", { name: "Marcos", level: 2 }) });
  // O primeiro "Concluído" do item é o status; o outro é a opção do seletor de quem pode alterar o marco.
  await expect(marcos.getByRole("listitem").filter({ hasText: "NF do cliente" }).getByText("Concluído", { exact: true }).first()).toBeVisible();
});
