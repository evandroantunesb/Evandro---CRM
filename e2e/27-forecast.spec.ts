import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Forecast: a base cria, para a vendedora da empresa A, Alfa (proposta, R$ 80 mil, previsto para hoje: 60% → Provável),
// Beta (visita, R$ 40 mil, dia 10 do mês seguinte: 40% → Provável) e Gama (sem valor → fora do forecast), e a meta de receita
// de R$ 100 mil no mês atual. Outros testes criam negócios abertos sem data: as conferências não contam o total.
test("admin vê o previsto, filtra o mês e a vendedora vê só a carteira dela", async ({ page }) => {
  const { usuarios, senha } = lerBase();

  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/forecast");
  await expect(page.getByRole("heading", { name: "Forecast", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Carteira" })).toBeVisible();

  const lista = page.getByRole("table");
  const alfa = lista.getByRole("row").filter({ hasText: "Cliente Forecast Alfa" });
  await expect(alfa).toContainText("Provável");
  await expect(alfa).toContainText("60%");
  await expect(alfa).toContainText("R$ 48.000,00"); // ponderado: 80 mil × 60%
  await expect(lista).not.toContainText("Cliente Forecast Beta"); // é do mês seguinte

  const meta = page.getByRole("term").filter({ hasText: /^Meta de / }).locator("xpath=..");
  await expect(meta).toContainText("R$ 100 mil");

  const fora = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Fora do forecast/ }) });
  await fora.getByText("sem valor").click();
  await expect(fora.getByRole("link", { name: /Cliente Forecast Gama/ })).toBeVisible();

  // Esta semana: Alfa (previsto para hoje, com o dia na coluna "Previsto"); Beta é do mês seguinte.
  const periodo = page.getByRole("navigation", { name: "Período" });
  await periodo.getByRole("link", { name: "Esta semana" }).click();
  await expect(alfa).toBeVisible();
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  await expect(alfa).toContainText(hoje);
  await expect(lista).not.toContainText("Cliente Forecast Beta");

  await periodo.getByRole("link").nth(3).click(); // mês seguinte
  await expect(lista.getByRole("row").filter({ hasText: "Cliente Forecast Beta" })).toContainText("40%");
  await expect(lista).not.toContainText("Cliente Forecast Alfa");

  // Minha carteira do admin: os negócios são da vendedora, então nada dela aparece.
  await page.getByRole("navigation", { name: "Carteira" }).getByRole("link", { name: "Minha carteira" }).click();
  await expect(page.getByText("Nenhum negócio no forecast com esses filtros.")).toBeVisible();

  // Configurações › Funis e etapas: a chance da etapa aparece e é editável.
  await page.goto("/configuracoes/funil");
  const proposta = page.getByRole("listitem").filter({ has: page.locator('input[value="Proposta enviada"]') }).first();
  await expect(proposta.getByLabel("Chance")).toHaveValue("60");

  await entrarComo(page, usuarios.vendedor, senha);
  await page.goto("/forecast");
  await expect(page.getByRole("navigation", { name: "Carteira" })).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Cliente Forecast Alfa" })).toBeVisible();
});
