import { expect, test, type Page } from "@playwright/test";
import { RESOLUCOES, capturar, entrarComo, lerBase, semRolagemHorizontal, type Resolucao } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * OPR 3B — modo Apresentação, contra o app real e o Supabase LOCAL, com a demonstração local
 * ligada (dados fictícios de cronograma/custos para 3 obras; as demais mostram estados vazios).
 */

let usuarios: BaseFicticia["usuarios"];
let obras: BaseFicticia["obras"];
let senha: string;
test.beforeAll(() => {
  ({ usuarios, obras, senha } = lerBase());
});

const FAZENDA = "Usina Solar Fazenda Modelo (fictícia)";
const nav = (page: Page) => page.getByRole("navigation", { name: "Navegação entre obras" });
const idAtual = (page: Page) => new URL(page.url()).pathname.split("/").pop();
const titulo = (page: Page) => page.getByRole("heading", { level: 1 });

for (const [resolucao, tamanho] of Object.entries(RESOLUCOES) as [Resolucao, { width: number; height: number }][]) {
  test.describe(`apresentação — capturas ${resolucao} (${tamanho.width}×${tamanho.height})`, () => {
    test.use({ viewport: tamanho });

    test("Fazenda Modelo, outras obras demonstrativas, obra sem dados e navegação", async ({ page }) => {
      await entrarComo(page, usuarios.admin, senha);

      await page.goto(`/obras/apresentacao/${obras.o06}`);
      await expect(titulo(page)).toHaveText(FAZENDA);
      await expect(page.getByText("Dados fictícios")).toBeVisible();
      await expect(page.getByText("68%").first()).toBeVisible();
      await semRolagemHorizontal(page, "apresentação Fazenda");
      await capturar(page, resolucao, "20-apresentacao-fazenda-modelo");

      // O Gantt rola por dentro no celular/tablet; a página não.
      const gantt = page.getByRole("region", { name: /Cronograma da obra/ });
      await expect(gantt).toBeVisible();
      if (tamanho.width < 1000) {
        const { rola } = await gantt.evaluate((el) => ({ rola: el.scrollWidth > el.clientWidth }));
        expect(rola, "o Gantt deveria ter rolagem horizontal interna").toBe(true);
        await gantt.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
        await semRolagemHorizontal(page, "Gantt rolado até o fim");
      }

      await page.goto(`/obras/apresentacao/${obras.o02}`);
      await expect(titulo(page)).toHaveText("Mercado Bom Preço (fictício)");
      await semRolagemHorizontal(page, "apresentação Mercado");
      await capturar(page, resolucao, "21-apresentacao-mercado-atividade-atrasada");

      await page.goto(`/obras/apresentacao/${obras.o04}`);
      await expect(titulo(page)).toHaveText("Clínica Vida (fictícia)");
      await capturar(page, resolucao, "22-apresentacao-clinica-quase-concluida");

      // Obra sem planejamento: estados vazios, nada inventado (avanço não vem do status).
      await page.goto(`/obras/apresentacao/${obras.o01}`);
      await expect(page.getByText("Dados fictícios")).toHaveCount(0);
      await expect(page.getByText("Sem medição registrada")).toBeVisible();
      await expect(page.getByText("Cronograma ainda não cadastrado para esta obra.")).toBeVisible();
      await expect(page.getByText("Orçamento e custos ainda não cadastrados.")).toBeVisible();
      await semRolagemHorizontal(page, "apresentação sem dados");
      await capturar(page, resolucao, "23-apresentacao-obra-sem-planejamento");

      // Navegação como slides a partir da Fazenda.
      await page.goto(`/obras/apresentacao/${obras.o06}`);
      await nav(page).getByRole("link", { name: "Próxima obra" }).click();
      await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o05}`));
      await capturar(page, resolucao, "24-apresentacao-proxima-obra");
    });

    test("visão de quem não vê dinheiro (Operação) e do vendedor da venda", async ({ page }) => {
      await entrarComo(page, usuarios.execOp, senha);
      await page.goto(`/obras/apresentacao/${obras.o06}`);
      await expect(titulo(page)).toHaveText(FAZENDA);
      await expect(page.getByRole("heading", { name: "Resultado financeiro" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Custos por categoria" })).toHaveCount(0);
      await semRolagemHorizontal(page, "apresentação Operação");
      await capturar(page, resolucao, "25-apresentacao-visao-operacao-sem-financeiro");

      await entrarComo(page, usuarios.vendedor, senha);
      await page.goto(`/obras/apresentacao/${obras.o06}`);
      await expect(page.getByRole("heading", { name: "Resultado financeiro" })).toBeVisible();
      await capturar(page, resolucao, "26-apresentacao-visao-vendedor");
    });
  });
}

test.describe("apresentação — funcionamento", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("entra pelo modo Apresentação da listagem e percorre como slides (botões, teclado, seletor)", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto("/obras");
    await page.getByRole("navigation", { name: "Modo de visualização" }).getByRole("link", { name: "Apresentação" }).click();
    await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o12}`));
    await expect(nav(page)).toContainText("Obra 1 de 12");

    await nav(page).getByRole("link", { name: "Próxima obra" }).click();
    await expect(nav(page)).toContainText("Obra 2 de 12");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await expect(nav(page)).toContainText("Obra 3 de 12");
    await page.keyboard.press("ArrowLeft");
    await expect(nav(page)).toContainText("Obra 2 de 12");

    await page.getByLabel("Ir para a obra").selectOption(obras.o06);
    await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o06}`));
    await expect(titulo(page)).toHaveText(FAZENDA);
    // Somente leitura: nenhum controle de edição.
    await expect(page.getByRole("button", { name: /Salvar|Atribuir|Encerrar|Marcar como parado/ })).toHaveCount(0);
    await expect(page.getByText(/Atualizar (Compras|Engenharia|Operacional)/)).toHaveCount(0);
  });

  test("filtros preservados entre Gestão e Apresentação", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto("/obras?situacao=pausada");
    await page.getByRole("navigation", { name: "Modo de visualização" }).getByRole("link", { name: "Apresentação" }).click();
    await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o07}\\?situacao=pausada`));
    await expect(nav(page)).toContainText("Obra 1 de 1");
    await page.getByRole("navigation", { name: "Modo de visualização" }).getByRole("link", { name: "Gestão" }).click();
    await expect(page).toHaveURL(new RegExp(`/obras/${obras.o07}\\?situacao=pausada`));
  });

  test("tela cheia no desktop", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto(`/obras/apresentacao/${obras.o06}`);
    const botao = page.getByRole("button", { name: "Tela cheia" });
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(page.getByRole("button", { name: "Sair da tela cheia" })).toBeVisible();
    await capturar(page, "desktop", "27-apresentacao-tela-cheia");
    await page.getByRole("button", { name: "Sair da tela cheia" }).click();
  });

  test("Operação: o HTML não traz nenhum valor em dinheiro", async ({ page }) => {
    await entrarComo(page, usuarios.execOp, senha);
    const resposta = await page.goto(`/obras/apresentacao/${obras.o06}`);
    const html = (await resposta?.text()) ?? "";
    for (const proibido of ["180.000", "135.000", "45.000", "Receita líquida", "Margem líquida", "Valor vendido"]) {
      expect(html, proibido).not.toContain(proibido);
    }
  });

  test("obra fora do acesso dá 404 (SDR sem venda nesta obra)", async ({ page }) => {
    await entrarComo(page, usuarios.sdr, senha);
    const resposta = await page.goto(`/obras/apresentacao/${obras.o06}`);
    expect(resposta?.status()).toBe(404);
  });
});

test.describe("apresentação — toque no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("deslizar troca de obra; deslizar dentro do Gantt não", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto(`/obras/apresentacao/${obras.o06}`);
    const deslizar = (seletor: string, de: number, para: number) =>
      page.evaluate(
        ({ seletor, de, para }) => {
          const el = document.querySelector(seletor)!;
          const toque = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
          el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [toque(de)], changedTouches: [toque(de)] }));
          el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [toque(para)] }));
        },
        { seletor, de, para },
      );

    // Dentro do Gantt: nada muda.
    await deslizar("[data-sem-gesto]", 300, 60);
    await page.waitForTimeout(800);
    expect(idAtual(page)).toBe(obras.o06);

    // Fora dele: próxima obra.
    await deslizar("article h1", 300, 60);
    await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o05}`));
    await deslizar("article h1", 60, 300);
    await expect(page).toHaveURL(new RegExp(`/obras/apresentacao/${obras.o06}`));
  });
});
