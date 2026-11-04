import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Engenharia (P5): o admin ajusta um prazo interno e cadastra/remove um feriado da empresa; a Central mostra os prazos
// vencidos no topo e o cartão de desempenho com troca de período.
test("prazos configuráveis, feriado da empresa e desempenho na Central", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);

  await page.goto("/configuracoes/engenharia");
  const aIniciar = page.getByLabel("A iniciar: dias", { exact: true });
  await expect(aIniciar).toHaveValue("2");
  // Copel (04/11/2026): aprovação do projeto em 15 dias corridos; na zona rural, 30.
  await expect(page.getByLabel("Aprovação do projeto pela distribuidora: dias", { exact: true })).toHaveValue("15");
  await expect(page.getByLabel("Aprovação do projeto pela distribuidora: contagem", { exact: true })).toHaveValue("corridos");
  await expect(page.getByLabel("Aprovação do projeto pela distribuidora, zona rural: dias", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("A iniciar: contagem", { exact: true })).toHaveValue("uteis");
  await aIniciar.fill("3");
  await page.getByRole("button", { name: "Salvar prazos" }).click();
  await expect(page.getByText("Prazos salvos.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("A iniciar: dias", { exact: true })).toHaveValue("3");
  // Volta ao padrão para não mudar o que outros testes veem.
  await page.getByLabel("A iniciar: dias", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Salvar prazos" }).click();
  await expect(page.getByText("Prazos salvos.")).toBeVisible();

  await page.getByLabel("Data do feriado").fill("2030-03-19");
  await page.getByLabel("Nome do feriado").fill("Feriado E2E");
  await page.getByRole("button", { name: "Adicionar feriado" }).click();
  const linha = page.locator("form").filter({ hasText: "Feriado E2E" });
  await expect(linha).toContainText("19/03/2030");
  await linha.getByRole("button", { name: "Remover" }).click();
  await expect(page.locator("form").filter({ hasText: "Feriado E2E" })).toHaveCount(0);

  // Marcos da trajetória: nascem em 25 obras / 250 kWp; o admin muda e volta ao padrão.
  const marcoObras = page.getByLabel("Marco: a cada quantas obras concluídas");
  await expect(marcoObras).toHaveValue("25");
  await expect(page.getByLabel("Marco: a cada quantos kWp concluídos")).toHaveValue("250");
  await marcoObras.fill("10");
  await page.getByRole("button", { name: "Salvar marcos" }).click();
  await expect(page.getByText("Marcos salvos.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Marco: a cada quantas obras concluídas")).toHaveValue("10");
  await page.getByLabel("Marco: a cada quantas obras concluídas").fill("25");
  await page.getByRole("button", { name: "Salvar marcos" }).click();
  await expect(page.getByText("Marcos salvos.")).toBeVisible();

  await page.goto("/engenharia");
  await expect(page.getByText("Prazos vencidos")).toBeVisible();
  const desempenho = page.locator("section").filter({ has: page.getByRole("heading", { name: "Desempenho", level: 2 }) });
  // Desempenho é secundário: vem fechado e abre com um toque.
  await expect(desempenho.getByText("Do protocolo à aprovação")).toBeHidden();
  await desempenho.locator("summary").click();
  await expect(desempenho.getByText("Do protocolo à aprovação")).toBeVisible();
  await desempenho.getByRole("link", { name: "90 dias" }).click();
  await expect(page).toHaveURL(/periodo=90/);
  await expect(desempenho.getByRole("link", { name: "90 dias" })).toHaveAttribute("aria-current", "page");
});
