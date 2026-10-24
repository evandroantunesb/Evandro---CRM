import { expect, test, type Page } from "@playwright/test";
import { capturar, clienteServico, entrarComo, escolher, lerBase, preencherNovoNegocio, RESOLUCOES, semRolagemHorizontal } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Novo negócio "Horizonte": três passos, kit sugerido pelo consumo e resultado ao vivo (o mesmo `calcular()` que a
 * criação grava). Mais módulos → mais autonomia; ligação nunca presumida; criar leva à ficha com o cálculo completo
 * quando tipo de cliente, distribuidora e tarifa oficial fecham. Celular: um passo por vez, sem rolagem horizontal.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const autonomia = (page: Page) => page.getByRole("region", { name: "Resultado" }).locator("[aria-live] p").first();

test.describe("Novo negócio — computador", () => {
  test.use({ viewport: RESOLUCOES.desktop });

  test("mais módulos aumentam a autonomia; sem ligação não cria; criar grava o cálculo completo", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente Horizonte (fictício)", "45900000020", "1.200");
    await escolher(page, "Tipo de cliente", "Residencial");
    await escolher(page, "Distribuidora", "Copel");

    // 1.200 kWh → 17 módulos (1.264,8 kWh/mês) = 100%. Dois a menos: 15 × 620 W × 120 = 1.116 kWh = 93%.
    await expect(autonomia(page)).toHaveText("100%");
    await page.getByRole("button", { name: "Menos módulos" }).click();
    await page.getByRole("button", { name: "Menos módulos" }).click();
    await expect(autonomia(page)).toHaveText("93%");
    await page.getByRole("button", { name: "Mais módulos" }).click();
    await expect(autonomia(page)).toHaveText("99%");
    await expect(page.getByText("ajustado", { exact: true })).toBeVisible();

    // Sem ligação: a prévia não fecha a conta e o envio para no passo 2 com a mensagem.
    await expect(page.getByRole("region", { name: "Resultado" }).getByText("Escolha a ligação (mono, bi ou trifásica).")).toBeVisible();
    await page.getByRole("textbox", { name: "Valor do negócio" }).fill("3000000");
    await page.getByRole("button", { name: "Criar negócio" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Escolha a ligação: ela muda o cálculo." })).toBeVisible();

    await escolher(page, "Ligação", /Bif/);
    await expect(page.getByText("Tarifa oficial aplicada:")).toBeVisible();
    await expect(page.getByRole("region", { name: "Resultado" }).getByText("Economia por mês")).toBeVisible();
    await page.getByRole("button", { name: "Criar negócio" }).click();
    await page.waitForURL(/\/negocios\/[0-9a-f-]{36}$/);

    const negocioId = page.url().split("/").pop()!;
    const servico = clienteServico();
    const { data: negocio } = await servico.from("negocios").select("titulo, qualif_tipo_cliente, qualif_distribuidora").eq("id", negocioId).single();
    expect(negocio).toEqual({ titulo: "Residencial — Cliente Horizonte (fictício)", qualif_tipo_cliente: "residencial", qualif_distribuidora: "COPEL-DIS" });
    const { data: calculo } = await servico.from("calculos_solares").select("estado_financeiro, tarifa_origem, kit_potencia_kwp").eq("negocio_id", negocioId).single();
    expect(calculo).toEqual({ estado_financeiro: "completo", tarifa_origem: "oficial_aneel", kit_potencia_kwp: 9.92 });
  });

  test("comercial: cria, mas a prévia diz o que falta em vez de mostrar economia", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherNovoNegocio(page, "Cliente Horizonte comercial (fictício)", "45900000021", "800");
    await escolher(page, "Tipo de cliente", "Comercial");
    await escolher(page, "Distribuidora", "Copel");
    await escolher(page, "Ligação", /Trif/);
    const resultado = page.getByRole("region", { name: "Resultado" });
    await expect(resultado.getByText("Para calcular conta e economia, falta:")).toBeVisible();
    await expect(resultado.getByText(/^R\$/)).toHaveCount(0);
  });
});

test.describe("Novo negócio — celular, tema escuro", () => {
  test.use({ viewport: RESOLUCOES.celular });

  test("um passo por vez, resultado no passo 3, sem rolagem horizontal", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.context().addCookies([{ name: "raion_tema", value: "escuro", url: new URL(page.url()).origin }]);
    await page.goto("/negocios/novo");
    await expect(page.getByRole("region", { name: "Conta de luz" })).toBeHidden();

    await page.getByRole("button", { name: /^Avançar/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Informe o nome do cliente|Preencha corretamente/ })).toBeVisible();

    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Cliente Horizonte celular (fictício)");
    await page.getByRole("textbox", { name: "WhatsApp" }).fill("45900000022");
    await page.getByRole("textbox", { name: "Cidade" }).fill("Cascavel");
    await page.getByRole("combobox", { name: "UF" }).selectOption("PR");
    const origem = page.getByRole("combobox", { name: "Origem" });
    if (await origem.count()) await origem.selectOption({ index: 1 });
    else await page.getByRole("group", { name: "Origem" }).getByRole("button").first().click();
    await semRolagemHorizontal(page, "passo 1");
    await page.getByRole("button", { name: /^Avançar/ }).click();

    await page.getByRole("textbox", { name: "Consumo médio mensal (kWh)" }).fill("500");
    await escolher(page, "Tipo de cliente", "Residencial");
    await escolher(page, "Distribuidora", "Copel");
    await escolher(page, "Ligação", /Mono/);
    await semRolagemHorizontal(page, "passo 2");
    await page.getByRole("button", { name: /^Avançar/ }).click();

    await expect(page.getByRole("region", { name: "Resultado" })).toBeVisible();
    await expect(autonomia(page)).toHaveText("100%");
    await expect(page.getByRole("button", { name: "Criar negócio" })).toBeVisible();
    await semRolagemHorizontal(page, "passo 3");
    await capturar(page, "celular", "novo-negocio-escuro-passo-3");
  });
});
