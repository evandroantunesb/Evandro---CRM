import { expect, test } from "@playwright/test";
import { RESOLUCOES, capturar, entrarComo, lerBase, semRolagemHorizontal, type Resolucao } from "./ajuda";

/**
 * Evidência visual (artefato do workflow): as 8 telas prioritárias em 4 resoluções, com a base
 * fictícia intacta. Cada tela também confere que não há rolagem horizontal.
 * Roda primeiro: os arquivos seguintes alteram dados.
 */

// A base só existe depois do global-setup: lida dentro dos testes, nunca no carregamento do arquivo.

for (const [resolucao, tamanho] of Object.entries(RESOLUCOES) as [Resolucao, { width: number; height: number }][]) {
  test.describe(`capturas — ${resolucao} (${tamanho.width}×${tamanho.height})`, () => {
    test.use({ viewport: tamanho });

    test("admin: listagem, gestão, formulários, pausada, cancelada e navegação", async ({ page }) => {
      const { usuarios, obras, senha } = lerBase();
      await entrarComo(page, usuarios.admin, senha);

      await page.goto("/obras");
      await expect(page.getByText("12 de 12 obras")).toBeVisible();
      await semRolagemHorizontal(page, "listagem");
      await capturar(page, resolucao, "01-listagem-12-obras");

      await page.goto(`/obras/${obras.o01}`);
      await expect(page.getByRole("heading", { name: "Família Almeida (fictícia)" })).toBeVisible();
      await semRolagemHorizontal(page, "gestão em andamento");
      await capturar(page, resolucao, "02-gestao-obra-em-andamento");

      // Formulários abertos: os três setores e o "Adicionar participante" da Engenharia.
      for (const setor of ["Compras", "Engenharia", "Operacional"]) await page.getByText(`Atualizar ${setor}`).click();
      await page.getByRole("button", { name: "Adicionar participante" }).nth(1).click();
      await semRolagemHorizontal(page, "formulários abertos");
      await capturar(page, resolucao, "03-formularios-operacionais-abertos");

      await page.goto(`/obras/${obras.o07}`);
      await expect(page.getByText(/Obra pausada: status/)).toBeVisible();
      await semRolagemHorizontal(page, "obra pausada");
      await capturar(page, resolucao, "04-gestao-obra-pausada");

      await page.goto(`/obras/${obras.o08}`);
      await expect(page.getByText("Obra cancelada: não aceita alterações.")).toBeVisible();
      await semRolagemHorizontal(page, "obra cancelada");
      await capturar(page, resolucao, "05-gestao-obra-cancelada");

      // Navegação: entra pela listagem (filtros vazios) e avança uma obra.
      await page.goto("/obras");
      await page.getByRole("link", { name: /Percorrer as 12 obras/ }).click();
      await page.getByRole("link", { name: "Próxima obra" }).click();
      await expect(page.getByRole("navigation", { name: "Navegação entre obras" })).toContainText("Obra 2 de 12");
      await semRolagemHorizontal(page, "navegação");
      await capturar(page, resolucao, "06-navegacao-entre-obras");
    });

    test("coordenador de Engenharia e usuário somente leitura (gestor)", async ({ page }) => {
      const { usuarios, obras, senha } = lerBase();
      await entrarComo(page, usuarios.coordEng, senha);
      await page.goto(`/obras/${obras.o01}`);
      await page.getByText("Atualizar Engenharia").click();
      await semRolagemHorizontal(page, "coordenador");
      await capturar(page, resolucao, "07-visao-coordenador");

      await entrarComo(page, usuarios.gestor, senha);
      await page.goto(`/obras/${obras.o01}`);
      await expect(page.getByRole("heading", { name: "Família Almeida (fictícia)" })).toBeVisible();
      await semRolagemHorizontal(page, "somente leitura");
      await capturar(page, resolucao, "08-visao-somente-leitura-gestor");
    });
  });
}
