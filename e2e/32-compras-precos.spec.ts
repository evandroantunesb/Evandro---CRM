import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";
import { xlsxMinimo } from "./xlsx-minimo";

// Compras (P3): quem atua em Compras envia a tabela de um fornecedor em .csv (cabeçalho depois de uma linha de título,
// linha sem preço fica de fora), cria o material novo na prévia e importa; a segunda tabela, em .xlsx, lembra as
// colunas, reconhece o material pelo código e mostra o preço que subiu; o histórico guarda a mudança; no pedido de
// compra da o10 (já em cotação pelo 29), "Preço da tabela" preenche o valor com o melhor preço.
test("Compras: tabela de preços, prévia, histórico e preço no pedido", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  const fornecedor = "Distribuidora Solar Sul (fictícia)";
  await entrarComo(page, usuarios.execCompras, senha);

  await page.goto("/compras");
  await page.getByRole("navigation", { name: "Compras" }).getByRole("link", { name: "Tabela de preços" }).click();
  await expect(page.getByRole("heading", { name: "Preços de material", level: 1 })).toBeVisible();

  // 1ª tabela, .csv.
  await page.getByRole("link", { name: "Enviar tabela de preços" }).click();
  await expect(page.getByRole("heading", { name: "Enviar tabela de preços", level: 1 })).toBeVisible();
  await page.getByRole("combobox", { name: "Fornecedor" }).fill(fornecedor);
  await page.getByRole("combobox", { name: "Fornecedor" }).blur();
  const csv = ["Tabela Solar Sul — novembro", "Cód.;Descrição;Un;Preço c/ IPI", "44102;MOD 550W MONO;UN;780,00", "51007;INV 5K MONOF;UN;5.900,00", "70016;CABO SOLAR 6MM PT;M;"].join("\r\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "tabela-solar-sul.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });

  await expect(page.getByRole("spinbutton", { name: "Linha do cabeçalho" })).toHaveValue("2");
  await expect(page.getByRole("combobox", { name: "Preço de custo" })).toHaveValue("3");
  await expect(page.getByRole("button", { name: "Novos (2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Com problema (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Novos (2)" }).click();
  await page.getByRole("textbox", { name: "Nome do material novo da linha 3" }).fill("Módulo 550 W (e2e)");
  await page.getByRole("combobox", { name: "Categoria do material novo da linha 3" }).selectOption("modulos");
  await page.getByRole("button", { name: "Com problema (1)" }).click();
  await expect(page.getByText("Sem preço", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 preços" }).click();

  await expect(page).toHaveURL(/\/compras\/precos$/);
  const linhaModulo = page.getByRole("row").filter({ hasText: "Módulo 550 W (e2e)" });
  await expect(linhaModulo.getByText("R$ 780,00")).toBeVisible();
  await expect(page.getByRole("link", { name: fornecedor })).toBeVisible();

  // 2ª tabela, .xlsx: colunas lembradas, material reconhecido pelo código.
  await page.getByRole("link", { name: "Enviar tabela de preços" }).click();
  await page.getByRole("combobox", { name: "Fornecedor" }).fill(fornecedor);
  await page.getByRole("combobox", { name: "Fornecedor" }).blur();
  const planilha = xlsxMinimo([["Tabela Solar Sul — dezembro"], ["Cód.", "Descrição", "Un", "Preço c/ IPI"], ["44102", "MOD 550W MONO", "UN", 800], ["51007", "INV 5K MONOF", "UN", 5900]]);
  await page.locator('input[type="file"]').setInputFiles({
    name: "tabela-solar-sul.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: planilha,
  });
  await expect(page.getByText("Lembrado para este fornecedor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudaram (1)" })).toBeVisible();
  await expect(page.getByText("Subiu 2,6%")).toBeVisible();
  await page.getByRole("button", { name: "Iguais (1)" }).click();
  await expect(page.getByRole("row").filter({ hasText: "INV 5K MONOF" })).toContainText("Igual");
  await page.getByRole("button", { name: "Importar 2 preços" }).click();
  await expect(page).toHaveURL(/\/compras\/precos$/);
  await expect(linhaModulo.getByText("R$ 800,00")).toBeVisible();

  await linhaModulo.getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByRole("heading", { name: "Módulo 550 W (e2e)", level: 1 })).toBeVisible();
  const historico = page.locator("section").filter({ has: page.getByRole("heading", { name: "Histórico" }) });
  await expect(historico.getByRole("row").filter({ hasText: "+2,6%" })).toContainText("R$ 800,00");

  // Pedido de compra: o preço da tabela entra no valor unitário (outro fornecedor: o melhor preço).
  await page.goto(`/compras/pedido?obra=${obras.o10}`);
  await expect(page.getByRole("heading", { name: "Pedido de compra", level: 1 })).toBeVisible();
  await page.getByRole("combobox", { name: "Fornecedor" }).fill("Outro fornecedor (fictício)");
  while ((await page.getByRole("button", { name: "Tirar" }).count()) > 0) await page.getByRole("button", { name: "Tirar" }).first().click();
  await page.getByRole("button", { name: "+ Item fora do kit" }).click();
  await page.getByRole("combobox", { name: "Preço da tabela para item 1" }).selectOption({ label: "Módulo 550 W (e2e)" });
  await expect(page.getByRole("textbox", { name: "Valor unitário de Módulo 550 W (e2e)" })).toHaveValue("800,00");
  await expect(page.getByText(`Tabela: ${fornecedor}`)).toContainText("melhor preço; este fornecedor não tem");
});
