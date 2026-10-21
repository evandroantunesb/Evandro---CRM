import { expect, test, type Page } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Assistente de novo negócio (interface real + Supabase LOCAL, base fictícia): valor da conta em R$ pede a
 * tarifa na Etapa 1 e o consumo vira estimativa identificada; consumo em kWh dimensiona sem tarifa; o kit manual
 * vem antes do valor; não existe kit pronto (nada é apresentado como tal); o tipo de ligação é editável sem
 * kit; a produtividade só aparece nos detalhes; o aviso de compatibilidade abre por clique e teclado.
 * Padrão da empresa fictícia: produtividade 120 kWh/kWp/mês.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

async function preencherEtapa1(page: Page, nome: string, whatsapp: string, energia: { consumo?: string; conta?: string; tarifaEfetiva?: string }) {
  await page.goto("/negocios/novo");
  await page.getByRole("textbox", { name: "Nome do negócio" }).fill(nome);
  await page.getByRole("combobox", { name: /^Origem/ }).selectOption({ index: 1 });
  await page.getByRole("textbox", { name: /^Nome \/ Razão social/ }).fill(nome);
  await page.getByRole("textbox", { name: /^WhatsApp/ }).fill(whatsapp);
  await page.getByRole("textbox", { name: /^Cidade/ }).fill("Cascavel");
  await page.getByRole("combobox", { name: /^Estado/ }).selectOption("PR");
  if (energia.consumo) await page.getByRole("textbox", { name: "Consumo médio mensal (kWh)" }).fill(energia.consumo);
  if (energia.conta) await page.getByRole("textbox", { name: /^Ou valor médio da conta/ }).fill(energia.conta);
  if (energia.tarifaEfetiva) await page.getByRole("textbox", { name: /^Tarifa efetiva estimada/ }).fill(energia.tarifaEfetiva);
}

const avancar = (page: Page) => page.getByRole("button", { name: /^Avançar/ }).click();
const tarifaEtapa1 = (page: Page) => page.getByRole("textbox", { name: /^Tarifa efetiva estimada/ });

test.describe("novo negócio: fluxo de cálculo", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("valor da conta em R$ sem tarifa: pede a tarifa e não passa para a Etapa 2", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente conta sem tarifa (fictício)", "45900000020", { conta: "650,00" });
    await expect(tarifaEtapa1(page)).toBeVisible();

    await avancar(page);
    // A mensagem do passo é renderizada nos três passos (dois escondidos): confere a visível.
    await expect(page.getByText(/Informe a tarifa efetiva estimada \(R\$\/kWh\)/).first()).toBeVisible();
    await expect(page.getByText("Resumo do sistema")).toBeHidden();
    await expect(tarifaEtapa1(page)).toBeFocused();
  });

  test("valor da conta com tarifa: o consumo aparece como estimado, com a tarifa usada", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente conta com tarifa (fictício)", "45900000021", { conta: "650,00", tarifaEfetiva: "0,95" });
    await avancar(page);

    await expect(page.getByText("Resumo do sistema")).toBeVisible();
    await expect(page.getByText("Consumo mensal (estimado)")).toBeVisible();
    await expect(page.getByText("684,21 kWh")).toBeVisible();
    await expect(page.getByText(/650,00 ÷ .*0,95\/kWh/)).toBeVisible();
    await expect(page.getByText("Tarifa efetiva (consumo)")).toBeVisible();
  });

  test("consumo em kWh informado direto: dimensiona sem exigir tarifa", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente kWh direto (fictício)", "45900000022", { consumo: "1200" });
    await expect(tarifaEtapa1(page)).toHaveCount(0);
    await avancar(page);

    await expect(page.getByText("Resumo do sistema")).toBeVisible();
    await expect(page.getByText("Consumo mensal", { exact: true })).toBeVisible();
    await expect(page.getByText("17 × 620 W")).toBeVisible();
    await expect(page.getByText("o consumo foi informado em kWh")).toBeVisible();
  });

  test("sem busca de kit pronto: a tela diz o que consultou, não chama a estimativa de kit e oferece a montagem manual", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente sem kit pronto (fictício)", "45900000023", { consumo: "780" });
    await avancar(page);

    await expect(page.getByText(/O assistente não consulta kits prontos nem catálogo de equipamentos/)).toBeVisible();
    await expect(page.getByText(/isso não indica se existe ou não um kit para ela/)).toBeVisible();
    await expect(page.getByText("Kit recomendado")).toHaveCount(0);
    await expect(page.getByText(/não (há|existe|temos) kit/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Montar kit manualmente" })).toBeVisible();
  });

  test("o kit manual vem antes do valor do negócio", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente ordem (fictício)", "45900000024", { consumo: "780" });
    await avancar(page);

    const botao = await page.getByRole("button", { name: "Montar kit manualmente" }).boundingBox();
    const valor = await page.getByText("Valor do negócio (R$)").boundingBox();
    expect(botao!.y).toBeLessThan(valor!.y);

    await page.getByRole("button", { name: "Montar kit manualmente" }).click();
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    const editor = await page.getByLabel("Potência (W)").last().boundingBox();
    expect((await page.getByText("Valor do negócio (R$)").boundingBox())!.y).toBeGreaterThan(editor!.y);
  });

  test("tipo de ligação pode ser alterado sem nenhum kit", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente ligação (fictício)", "45900000025", { consumo: "780" });
    await avancar(page);
    // O valor do negócio é obrigatório na Etapa 2, com ou sem kit.
    await page.getByRole("textbox", { name: /^Valor do negócio/ }).fill("30000");
    await page.getByRole("button", { name: "Continuar sem kit" }).click();

    const ligacao = page.getByRole("combobox", { name: "Tipo de ligação" });
    await expect(ligacao).toBeEnabled();
    await ligacao.selectOption({ index: 0 });
    const primeiro = await ligacao.inputValue();
    await ligacao.selectOption({ index: 1 });
    expect(await ligacao.inputValue()).not.toBe(primeiro);
    await expect(page.getByRole("textbox", { name: "Tarifa base (TE + TUSD) (R$/kWh)" })).toBeEnabled();
  });

  test("tarifa base da Etapa 3 não muda o consumo estimado nem o dimensionamento da Etapa 2", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente tarifas separadas (fictício)", "45900000028", { conta: "650,00", tarifaEfetiva: "0,95" });
    await avancar(page);

    // 650 ÷ 0,95 = 684,21 kWh; 684,21 ÷ 120 = 5,70 kWp → 10 módulos de 620 W → 6,2 kWp.
    await expect(page.getByText("684,21 kWh")).toBeVisible();
    const referencia = page.getByText(/× 620 W/).first();
    const modulos = await referencia.textContent();
    // O valor do negócio é obrigatório na Etapa 2, com ou sem kit.
    await page.getByRole("textbox", { name: /^Valor do negócio/ }).fill("30000");
    await page.getByRole("button", { name: "Continuar sem kit" }).click();

    // Etapa 3: tarifa base bem diferente da efetiva.
    const base3 = page.getByRole("textbox", { name: "Tarifa base (TE + TUSD) (R$/kWh)" });
    await base3.fill("0,40");
    await expect(page.getByRole("textbox", { name: /^Tarifa efetiva estimada/ })).toHaveCount(0);

    // Volta à Etapa 2: nada mudou.
    await page.getByRole("button", { name: /Voltar/ }).click();
    await expect(page.getByText("684,21 kWh")).toBeVisible();
    await expect(page.getByText(/650,00 ÷ .*0,95\/kWh/)).toBeVisible();
    expect(await page.getByText(/× 620 W/).first().textContent()).toBe(modulos);

    // Volta à Etapa 1: a tarifa efetiva continua a digitada, sem receber o valor da base.
    await page.getByRole("button", { name: /Voltar/ }).click();
    await expect(tarifaEtapa1(page)).toHaveValue("0,95");
  });

  test("salvar e reabrir: o consumo vindo da fatura aparece como estimado, nunca como kWh informado", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente reabrir estimado (fictício)", "45900000029", { conta: "650,00", tarifaEfetiva: "0,95" });
    await avancar(page);

    await page.getByRole("button", { name: "Montar kit manualmente" }).click();
    await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
    await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 620 W");
    await page.getByLabel("Potência (W)").last().fill("620");
    await page.getByRole("textbox", { name: /^Valor do negócio/ }).fill("30000");
    await avancar(page);

    await page.getByRole("textbox", { name: "Tarifa base (TE + TUSD) (R$/kWh)" }).fill("0,80");
    await page.getByRole("button", { name: "Salvar negócio" }).click();

    await expect(page).toHaveURL(/\/negocios\/[0-9a-f-]{36}/);
    // 650 ÷ 0,95 = 684,21 kWh (a tarifa base 0,80 não entra na conversão).
    await expect(page.getByText("Consumo médio (estimado pela fatura)")).toBeVisible();
    await expect(page.getByText("684,21 kWh/mês")).toBeVisible();
    await expect(page.getByText("não foi informado em kWh")).toBeVisible();

    await page.getByRole("button", { name: /Editar kit/ }).click();
    await expect(page.getByText(/O consumo gravado foi estimado a partir do valor da fatura e da tarifa efetiva; não foi informado em kWh pelo cliente\./)).toBeVisible();
  });

  test("produtividade fica nos detalhes do cálculo, fora do resumo", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente detalhes (fictício)", "45900000026", { consumo: "780" });
    await avancar(page);

    await expect(page.getByText("Produtividade (premissa)")).toBeHidden();
    await expect(page.getByText(/kWh\/kWp\/mês/)).toBeHidden();
    await page.getByText("Detalhes do cálculo").click();
    await expect(page.getByText("Produtividade (premissa)")).toBeVisible();
    await expect(page.getByText(/120 kWh\/kWp\/mês/)).toBeVisible();
  });

  test("aviso de compatibilidade: compacto, abre e fecha por clique e por teclado", async ({ page }) => {
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await preencherEtapa1(page, "Cliente aviso (fictício)", "45900000027", { consumo: "780" });
    await avancar(page);

    const botao = page.getByRole("button", { name: /Compatibilidade técnica não verificada/ });
    const detalhe = page.getByText(/O Raion ainda não confere módulo, inversor, tensão e faixa MPPT/);
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await expect(detalhe).toBeHidden();

    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(detalhe).toBeVisible();
    await botao.click();
    await expect(detalhe).toBeHidden();

    await botao.focus();
    await page.keyboard.press("Enter");
    await expect(detalhe).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detalhe).toBeHidden();
    await page.keyboard.press("Space");
    await expect(detalhe).toBeVisible();
    await expect(page.getByText(/MPPT validado|Voc validado|Combinação compatível/i)).toHaveCount(0);
  });
});
