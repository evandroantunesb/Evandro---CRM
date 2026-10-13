import { expect, test, type Page } from "@playwright/test";
import { capturar, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/** Modo Gestão pela interface, como admin, na obra o01 (Família Almeida), contra o Supabase local. */

// A base só existe depois do global-setup: lida no beforeAll, nunca no carregamento do arquivo.
let usuarios: BaseFicticia["usuarios"];
let obras: BaseFicticia["obras"];
let senha: string;
test.beforeAll(() => {
  ({ usuarios, obras, senha } = lerBase());
});

/** Cartão de um setor (o <section> mais interno com aquele título). */
const cartao = (page: Page, titulo: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: titulo, exact: true }) }).last();
const nav = (page: Page) => page.getByRole("navigation", { name: "Navegação entre obras" });

test.describe("Gestão da obra (admin)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto(`/obras/${obras.o01}`);
  });

  test("cabeçalho, resumo, setores e participantes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Família Almeida (fictícia)" })).toBeVisible();
    await expect(page.getByText("Em andamento").first()).toBeVisible();
    await expect(cartao(page, "Resumo")).toContainText("Cascavel/PR");
    await expect(cartao(page, "Compras")).toContainText("Cotando");
    await expect(cartao(page, "Engenharia")).toContainText("Projeto em elaboração");
    await expect(cartao(page, "Engenharia")).toContainText("Eduardo Executor Eng. (fictício)");
    await expect(cartao(page, "Engenharia")).toContainText("Responsável principal");
    await expect(cartao(page, "Operacional")).toContainText("Olívia Executora Op. (fictícia)");
  });

  test("status, parada (registrar e encerrar) e aguardando terceiros", async ({ page }) => {
    const compras = cartao(page, "Compras");
    await compras.getByText("Atualizar Compras").click();
    await compras.getByLabel("Status de Compras").selectOption("pedido_realizado");
    await compras.getByRole("button", { name: "Salvar status" }).click();
    await expect(compras.getByText("Status atualizado.")).toBeVisible();
    await expect(compras.getByText("Pedido realizado").first()).toBeVisible();

    // Voltar uma etapa pede confirmação.
    await compras.getByLabel("Status de Compras").selectOption("cotando");
    await expect(compras.getByText(/volta o setor para uma etapa anterior/)).toBeVisible();
    await compras.getByRole("button", { name: "Entendi, quero voltar" }).click();
    await compras.getByRole("button", { name: "Salvar status" }).click();
    await expect(compras.getByLabel("Status de Compras")).toHaveValue("cotando");

    // Parada: motivo obrigatório (validação do navegador), registra e encerra.
    await compras.getByRole("button", { name: "Marcar como parado" }).click();
    await expect(compras.getByText("Setor marcado como parado.")).toHaveCount(0);
    await compras.getByLabel("Motivo da parada").fill("Fornecedor sem estoque (fictício)");
    await compras.getByRole("button", { name: "Marcar como parado" }).click();
    await expect(compras.getByText("Setor marcado como parado.")).toBeVisible();
    await expect(compras.getByText("Motivo da parada: Fornecedor sem estoque (fictício)")).toBeVisible();
    await capturar(page, "desktop", "10-setor-parado");
    await compras.getByRole("button", { name: "Retomar setor" }).click();
    await expect(compras.getByText("Setor retomado.")).toBeVisible();

    // Aguardando terceiros: registra e remove.
    await compras.getByLabel("Aguardando quem").selectOption("transportadora");
    await compras.getByRole("button", { name: "Salvar pendência" }).click();
    await expect(compras.getByText("Pendência registrada.")).toBeVisible();
    await expect(compras.getByText("Aguardando transportadora").first()).toBeVisible();
    await compras.getByLabel("Aguardando quem").selectOption("");
    await compras.getByRole("button", { name: "Salvar pendência" }).click();
    await expect(compras.getByText("Pendência removida.")).toBeVisible();
  });

  test("marcos: concluir e 'não se aplica' com motivo", async ({ page }) => {
    const marcos = cartao(page, "Marcos");
    const nf = marcos.locator("li").filter({ hasText: "NF do cliente" });
    await nf.getByLabel("Status de NF do cliente").selectOption("concluido");
    await nf.getByRole("button", { name: "Salvar" }).click();
    await expect(nf.getByText("Marco atualizado.")).toBeVisible();

    const garantia = marcos.locator("li").filter({ hasText: "Garantia" });
    await garantia.getByLabel("Status de Garantia").selectOption("nao_se_aplica");
    await garantia.getByLabel("Motivo de Garantia não se aplicar").fill("Cliente optou por garantia do fabricante (fictício)");
    await garantia.getByRole("button", { name: "Salvar" }).click();
    await expect(garantia.getByText("Marco atualizado.")).toBeVisible();
    await expect(garantia.getByText("Cliente optou por garantia do fabricante (fictício)").first()).toBeVisible();
  });

  test("participantes: incluir, encerrar e substituir o responsável principal", async ({ page }) => {
    const eng = cartao(page, "Engenharia");
    await eng.getByText("Atualizar Engenharia").click();

    // Incluir como apoio.
    await eng.getByRole("button", { name: "Adicionar participante" }).click();
    await eng.getByLabel("Colaborador").selectOption({ label: "Paulo Apoio Eng. (fictício) · Executa no setor" });
    await eng.getByLabel("Função").selectOption("apoio");
    await eng.getByRole("button", { name: "Atribuir" }).click();
    await expect(eng.getByText("Participante atribuído.")).toBeVisible();
    const itemPaulo = eng.locator("details li").filter({ hasText: "Paulo Apoio Eng." });
    await expect(itemPaulo).toHaveCount(1);

    // Encerrar: pede motivo e confirmação.
    await itemPaulo.getByRole("button", { name: "Encerrar participação" }).click();
    await itemPaulo.getByLabel("Motivo do encerramento").fill("Remanejado para outra obra (fictício)");
    await itemPaulo.getByRole("button", { name: /Confirmar encerramento de Paulo/ }).click();
    await expect(eng.locator("details li").filter({ hasText: "Paulo Apoio Eng." })).toHaveCount(0);

    // Substituir o principal (Eduardo → Paulo).
    await eng.getByLabel("Colaborador").selectOption({ label: "Paulo Apoio Eng. (fictício) · Executa no setor" });
    await eng.getByLabel("Função").selectOption("responsavel");
    await eng.getByLabel("Responsável principal do setor").check();
    await expect(eng.getByText(/Eduardo Executor Eng\. \(fictício\) deixa de ser o responsável principal/)).toBeVisible();
    await capturar(page, "desktop", "11-substituicao-de-principal");
    await eng.getByRole("button", { name: "Confirmar substituição" }).click();
    await expect(eng.getByText("Participante substituído.")).toBeVisible();
    const principal = eng.locator("details li").filter({ hasText: "Responsável principal" });
    await expect(principal).toContainText("Paulo Apoio Eng.");
    await expect(eng.locator("details li").filter({ hasText: "Eduardo Executor Eng." })).toHaveCount(0);
  });

  test("histórico registra as alterações", async ({ page }) => {
    const historico = cartao(page, "Histórico");
    for (const tipo of ["Setor alterado", "Marco alterado", "Participante atribuído", "Participante encerrado"]) {
      await expect(historico.getByText(tipo).first(), tipo).toBeVisible();
    }
    await expect(historico).toContainText("Marcado como parado");
    await expect(historico).toContainText("Retomado");
    await expect(historico).toContainText("Ana Admin (fictícia)");
    // Motivos livres nunca aparecem no histórico.
    await expect(historico).not.toContainText("Fornecedor sem estoque");
    await capturar(page, "desktop", "12-historico-apos-alteracoes");
  });
});

test.describe("formulários depois de navegar (correção do commit 66e430a)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => entrarComo(page, usuarios.admin, senha));

  test("escolha não salva na obra A não aparece como pendente na obra B (botão Próxima)", async ({ page }) => {
    // o10 (Compras: A comprar) → Próxima → o09 (Compras: Cotando).
    await page.goto(`/obras/${obras.o10}`);
    let compras = cartao(page, "Compras");
    await compras.getByText("Atualizar Compras").click();
    await compras.getByLabel("Status de Compras").selectOption("pedido_realizado");
    await expect(compras.getByRole("button", { name: "Salvar status" })).toBeEnabled();

    await nav(page).getByRole("link", { name: "Próxima obra" }).click();
    await expect(page).toHaveURL(new RegExp(obras.o09));
    compras = cartao(page, "Compras");
    // O painel volta fechado e, aberto, mostra o status da obra B, sem alteração pendente.
    await expect(compras.getByLabel("Status de Compras")).toBeHidden();
    await compras.getByText("Atualizar Compras").click();
    await expect(compras.getByLabel("Status de Compras")).toHaveValue("cotando");
    await expect(compras.getByRole("button", { name: "Salvar status" })).toBeDisabled();
    await capturar(page, "desktop", "13-formulario-limpo-apos-navegar");

    // Nada foi gravado na obra A.
    await page.goto(`/obras/${obras.o10}`);
    await expect(cartao(page, "Compras")).toContainText("A comprar");
  });

  test("o mesmo pela seta do teclado e pelo seletor", async ({ page }) => {
    await page.goto(`/obras/${obras.o11}`);
    let eng = cartao(page, "Engenharia");
    await eng.getByText("Atualizar Engenharia").click();
    await eng.getByLabel("Status de Engenharia").selectOption("aprovado");
    await eng.getByLabel("Aguardando quem").selectOption("cliente");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(obras.o10));
    eng = cartao(page, "Engenharia");
    await eng.getByText("Atualizar Engenharia").click();
    await expect(eng.getByLabel("Status de Engenharia")).toHaveValue("a_iniciar");
    await expect(eng.getByLabel("Aguardando quem")).toHaveValue("");
    await expect(eng.getByRole("button", { name: "Salvar status" })).toBeDisabled();
    await expect(eng.getByRole("button", { name: "Salvar pendência" })).toBeDisabled();

    await eng.getByLabel("Status de Engenharia").selectOption("aprovado");
    await page.getByLabel("Ir para a obra").selectOption(obras.o12);
    await expect(page).toHaveURL(new RegExp(obras.o12));
    eng = cartao(page, "Engenharia");
    await eng.getByText("Atualizar Engenharia").click();
    await expect(eng.getByLabel("Status de Engenharia")).toHaveValue("a_iniciar");
    await expect(eng.getByRole("button", { name: "Salvar status" })).toBeDisabled();
  });
});
