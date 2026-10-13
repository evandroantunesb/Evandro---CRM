import { expect, test, type Page } from "@playwright/test";
import { capturar, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/** Navegação sequencial entre as 12 obras fictícias da empresa A (admin). */

const nav = (page: Page) => page.getByRole("navigation", { name: "Navegação entre obras" });
const seletor = (page: Page) => page.getByLabel("Ir para a obra");
const idAtual = (page: Page) => new URL(page.url()).pathname.split("/").pop();

// A base só existe depois do global-setup: lida no beforeAll, nunca no carregamento do arquivo.
let usuarios: BaseFicticia["usuarios"];
let obras: BaseFicticia["obras"];
let obrasB: BaseFicticia["obrasB"];
let clientesB: BaseFicticia["clientesB"];
let senha: string;
// Ordem da lista: número decrescente → a obra criada por último (o12) é a 1ª.
let ORDEM: string[];
test.beforeAll(() => {
  ({ usuarios, obras, obrasB, clientesB, senha } = lerBase());
  ORDEM = Array.from({ length: 12 }, (_, i) => obras[`o${String(12 - i).padStart(2, "0")}`]);
});

test.describe("navegação entre obras", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => entrarComo(page, usuarios.admin, senha));

  test("Próxima percorre as 12 em ordem estável; Anterior volta; nas pontas os botões ficam desativados", async ({ page }) => {
    await page.goto("/obras");
    await page.getByRole("link", { name: /Percorrer as 12 obras/ }).click();
    await expect(nav(page)).toContainText("Obra 1 de 12");
    await expect(nav(page).getByLabel("Obra anterior")).toHaveCount(0);

    const visitadas: string[] = [];
    for (let i = 1; i <= 12; i++) {
      await expect(nav(page)).toContainText(`Obra ${i} de 12`);
      visitadas.push(idAtual(page)!);
      if (i < 12) await nav(page).getByRole("link", { name: "Próxima obra" }).click();
    }
    expect(visitadas).toEqual(ORDEM);
    await expect(nav(page).getByRole("link", { name: "Próxima obra" })).toHaveCount(0);

    await nav(page).getByRole("link", { name: "Obra anterior" }).click();
    await expect(nav(page)).toContainText("Obra 11 de 12");
    expect(idAtual(page)).toBe(ORDEM[10]);

    // A mesma ordem numa segunda carga do seletor.
    const rotulos = await seletor(page).locator("option").allTextContents();
    await page.reload();
    expect(await seletor(page).locator("option").allTextContents()).toEqual(rotulos);
  });

  test("seletor salta direto para a obra; setas do teclado navegam (e não com o foco num campo)", async ({ page }) => {
    await page.goto(`/obras/${ORDEM[0]}`);
    await seletor(page).selectOption(ORDEM[5]);
    await expect(nav(page)).toContainText("Obra 6 de 12");
    expect(idAtual(page)).toBe(ORDEM[5]);

    // Tira o foco do seletor (a seta só navega com o foco fora de campos).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await expect(nav(page)).toContainText("Obra 7 de 12");
    await page.keyboard.press("ArrowLeft");
    await expect(nav(page)).toContainText("Obra 6 de 12");
    await page.keyboard.press("ArrowLeft");
    await expect(nav(page)).toContainText("Obra 5 de 12");

    // Com o foco no seletor, a seta é do seletor, não da navegação de páginas.
    await seletor(page).focus();
    const antes = idAtual(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    expect(idAtual(page)).toBe(antes);
  });

  test("filtros preservados; obra que sai do filtro fica 'fora da lista filtrada'", async ({ page }) => {
    // Setor parado: o03 (Engenharia) e o09 (Operacional).
    await page.goto("/obras?estado=parado");
    await expect(page.getByText("2 de 12 obras")).toBeVisible();
    await page.getByRole("link", { name: /Percorrer as 2 obras/ }).click();
    await expect(nav(page)).toContainText("Obra 1 de 2");
    expect(page.url()).toContain("estado=parado");
    expect(idAtual(page)).toBe(obras.o09);
    await nav(page).getByRole("link", { name: "Próxima obra" }).click();
    await expect(nav(page)).toContainText("Obra 2 de 2");
    expect(page.url()).toContain("estado=parado");
    expect(idAtual(page)).toBe(obras.o03);
    expect(await seletor(page).locator("option").count()).toBe(2);

    // Retomar a Engenharia da o03: ela deixa de bater com o filtro.
    await page.getByText("Atualizar Engenharia").click();
    await page.getByRole("button", { name: "Retomar setor" }).click();
    await expect(page.getByText("Setor retomado.")).toBeVisible();
    await expect(nav(page)).toContainText("Fora da lista filtrada (1)");
    await capturar(page, "desktop", "09-obra-fora-da-lista-filtrada");
    // Próxima leva de volta ao início da lista filtrada.
    await nav(page).getByRole("link", { name: "Próxima obra" }).click();
    await expect(nav(page)).toContainText("Obra 1 de 1");
    expect(idAtual(page)).toBe(obras.o09);

    // Restaura a parada (as próximas suítes contam com ela).
    await page.goto(`/obras/${obras.o03}`);
    await page.getByText("Atualizar Engenharia").click();
    await page.getByLabel("Motivo da parada").fill("Documentação do cliente incompleta (fictício)");
    await page.getByRole("button", { name: "Marcar como parado" }).click();
    await expect(page.getByText("Setor marcado como parado.")).toBeVisible();
  });

  test("isolamento: nada da empresa B na lista nem na navegação; obra de B dá 404", async ({ page }) => {
    await page.goto("/obras");
    for (const cliente of clientesB) await expect(page.getByText(cliente)).toHaveCount(0);
    await page.goto(`/obras/${ORDEM[0]}`);
    const opcoes = await seletor(page).locator("option").allTextContents();
    expect(opcoes).toHaveLength(12);
    for (const cliente of clientesB) expect(opcoes.join(" ")).not.toContain(cliente);

    const resposta = await page.goto(`/obras/${obrasB.b1}`);
    expect(resposta?.status()).toBe(404);
    for (const cliente of clientesB) await expect(page.getByText(cliente)).toHaveCount(0);
  });
});
