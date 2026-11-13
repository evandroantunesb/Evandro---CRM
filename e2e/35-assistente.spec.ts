import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../src/lib/supabase/database.types";

// Assistente de primeiro acesso (Onboarding, subprojeto 3): empresa nova (com o estado do assistente, como o
// super-admin cria) leva o admin ao assistente até concluir; o vendedor nunca; a foto da faixa da empresa aparece no
// cabeçalho. A empresa é criada aqui, à parte da base fictícia (que não tem assistente pendente).

const SENHA = "senha-e2e-assistente-123";
const sufixo = Date.now().toString(36);

function servico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

let empresaId = "";
const admin = { email: `e2e-ass-admin-${sufixo}@teste.raion` };
const vendedor = { email: `e2e-ass-vendedor-${sufixo}@teste.raion` };

test.beforeAll(async () => {
  const s = servico();
  const ids: string[] = [];
  for (const [email, nome] of [
    [admin.email, "Ana Assistente"],
    [vendedor.email, "Vitor Assistente"],
  ]) {
    const { data, error } = await s.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome } });
    if (error || !data.user) throw error ?? new Error("usuário");
    ids.push(data.user.id);
  }
  const { data: empresa, error } = await s.from("empresas").insert({ nome: `Solar Assistente (E2E ${sufixo})` }).select("id").single();
  if (error || !empresa) throw error ?? new Error("empresa");
  empresaId = empresa.id;
  const { error: e } = await s.from("empresa_membros").insert([
    { empresa_id: empresaId, user_id: ids[0], papel: "admin" },
    { empresa_id: empresaId, user_id: ids[1], papel: "vendedor", perfil_gamificacao: "closer" },
  ] as never);
  if (e) throw e;
  const { error: eo } = await s.from("empresa_onboarding").insert({ empresa_id: empresaId });
  if (eo) throw eo;
});

async function entrar(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("assistente de primeiro acesso", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("o vendedor da empresa nova não é levado ao assistente", async ({ page }) => {
    await entrar(page, vendedor.email);
    await page.waitForURL("**/inicio", { timeout: 30_000 });
    await page.goto("/primeiro-acesso");
    await expect(page).not.toHaveURL(/primeiro-acesso/);
  });

  test("o admin cai no assistente, grava o passo 1, pula o resto, conclui e não volta mais", async ({ page }) => {
    await entrar(page, admin.email);
    await page.waitForURL("**/primeiro-acesso**", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Como a sua empresa aparece" })).toBeVisible();
    await expect(page.getByText("Passo 1 de 7")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    await page.getByLabel("Nome de exibição").fill("Solar Assistente");
    await page.getByLabel("CNPJ").fill("12.345.678/0001-90");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Passo 2 de 7")).toBeVisible();

    // Um passo à frente pela URL não abre (nem marcaria os do meio como feitos): fica no passo onde parou.
    await page.goto("/primeiro-acesso?passo=equipe");
    await expect(page.getByText("Passo 2 de 7")).toBeVisible();

    for (let passo = 2; passo <= 6; passo++) {
      if (passo === 6) {
        // Passo Equipe: a pessoa cadastrada aparece em "Na equipe" sem recarregar.
        const painel = page.getByRole("complementary", { name: "Convidar pessoa" });
        await painel.getByRole("textbox", { name: "Nome" }).fill("Vera Equipe");
        await painel.getByRole("textbox", { name: "E-mail" }).fill(`e2e-ass-equipe-${sufixo}@teste.raion`);
        await painel.getByRole("radio", { name: /^Vendedor/ }).check();
        await painel.getByRole("button", { name: "Criar usuário" }).click();
        await expect(painel.getByText("Usuário criado.", { exact: false })).toBeVisible();
        await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Na equipe" }) })).toContainText("Vera Equipe");
      }
      await page.getByRole("button", { name: "Pular por agora" }).click();
      await expect(page.getByText(`Passo ${passo + 1} de 7`)).toBeVisible();
    }
    await expect(page.getByTestId("revisar-empresa")).toContainText("Solar Assistente · CNPJ 12.345.678/0001-90");
    await expect(page.getByTestId("revisar-imagens")).toContainText("Pulado: fica a paisagem do Raion.");

    await page.getByRole("button", { name: "Começar a usar o Raion" }).click();
    await page.waitForURL("**/inicio", { timeout: 30_000 });

    await entrar(page, admin.email);
    await page.waitForURL("**/inicio", { timeout: 30_000 });
  });

  test("a foto da faixa da empresa aparece no cabeçalho", async ({ page }) => {
    const caminho = `${empresaId}/00000000-0000-4000-8000-000000000000.jpg`;
    const { error } = await servico()
      .from("empresa_tela_entrada")
      .upsert({ empresa_id: empresaId, faixa_caminho: caminho, faixa_usa_entrada: false }, { onConflict: "empresa_id" });
    expect(error).toBeNull();
    await entrar(page, vendedor.email);
    await page.waitForURL("**/inicio", { timeout: 30_000 });
    const fundo = await page.locator("section.faixa-marca > div").first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(fundo).toContain(caminho);
  });
});
