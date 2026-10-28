import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import type { BaseFicticia, UsuarioE2E } from "./base-ficticia";

/** Estado gerado no global-setup (ids e e-mails fictícios; nenhuma chave). Ignorado pelo git. */
export const ARQUIVO_BASE = join(__dirname, ".estado", "base.json");
/** Capturas de tela publicadas como artefato do workflow. */
export const PASTA_CAPTURAS = join(__dirname, "..", "e2e-capturas");

export const lerBase = (): BaseFicticia => JSON.parse(readFileSync(ARQUIVO_BASE, "utf8"));

export const RESOLUCOES = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  celular: { width: 390, height: 844 },
  "celular-estreito": { width: 320, height: 720 },
} as const;
export type Resolucao = keyof typeof RESOLUCOES;

/** Login pela tela real (/login), começando sem nenhuma sessão anterior. */
export async function entrarComo(page: Page, usuario: UsuarioE2E, senha: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(usuario.email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/inicio", { timeout: 30_000 });
}

/** Captura a página inteira em e2e-capturas/<resolução>/<nome>.png. */
export async function capturar(page: Page, resolucao: Resolucao, nome: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(PASTA_CAPTURAS, resolucao, `${nome}.png`), fullPage: true });
}

/** A página não pode rolar na horizontal (nada cortado nem vazando da tela). */
export async function semRolagemHorizontal(page: Page, contexto: string) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }));
  expect.soft(largura, `${contexto}: rolagem horizontal (${largura}px > ${visivel}px)`).toBeLessThanOrEqual(visivel);
}

/** Cliente Supabase LOCAL com a sessão de um usuário fictício (para testar as RPCs de verdade). */
export async function clienteDe(usuario: UsuarioE2E, senha: string) {
  const cliente = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email: usuario.email, password: senha });
  if (error) throw error;
  return cliente;
}

/**
 * Cliente LOCAL com a service role, só para FIXTURES que o app não cria mais (ex.: linha legada de `calculos_solares`,
 * que o cliente autenticado não grava desde a migration 20261023220000). A chave vem do ambiente já validado como
 * local pela trava do playwright.config.ts.
 */
export function clienteServico() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

type AbaFicha = "Visão geral" | "Sistema" | "Proposta e contrato" | "Atividades" | "Arquivos";
const PARAMETRO_ABA: Record<AbaFicha, string> = {
  "Visão geral": "visao",
  Sistema: "sistema",
  "Proposta e contrato": "proposta",
  Atividades: "atividades",
  Arquivos: "arquivos",
};

/** Endereço da ficha do negócio já numa aba (para entrar direto no kit, na proposta etc.). */
export const fichaNaAba = (negocioId: string, aba: AbaFicha) => `/negocios/${negocioId}?aba=${PARAMETRO_ABA[aba]}`;

/** Ficha do negócio: troca de aba como a pessoa faz, pelo link da navegação "Seções do negócio". */
export async function abrirAba(page: Page, aba: AbaFicha) {
  const link = page.getByRole("navigation", { name: "Seções do negócio" }).getByRole("link", { name: new RegExp(`^${aba}`) });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
}

/** Confirma o cartão da ficha pelo título e o abre quando este papel o vê recolhido. */
export async function abrirCartao(page: Page, titulo: string) {
  const tituloCartao = page.getByRole("heading", { name: titulo, exact: true }).first();
  await expect(tituloCartao).toBeVisible();
  const cartao = page.locator("details").filter({ has: tituloCartao }).first();
  // Alguns cartões são sempre visíveis para este papel; só o cartão recolhível precisa ser aberto.
  if (await cartao.count() === 0) return;
  if (!(await cartao.evaluate((d) => (d as HTMLDetailsElement).open))) await cartao.locator("summary").first().click();
  await expect(cartao).toHaveAttribute("open", "");
}

/** Texto do indicador "Obra X de N". */
export const indicador = (page: Page) => page.getByRole("navigation", { name: "Navegação entre obras" }).locator("p[aria-live]");

/**
 * Passos 1 e 2 do Novo negócio no computador (as três seções ficam na mesma página): cliente novo, Cascavel/PR, a
 * primeira origem e o consumo. Tipo de cliente, distribuidora e ligação ficam com quem chama (`escolher`).
 */
export async function preencherNovoNegocio(page: Page, nome: string, whatsapp: string, consumoKwh: string) {
  await page.goto("/negocios/novo");
  await page.getByRole("textbox", { name: "Nome", exact: true }).fill(nome);
  await page.getByRole("textbox", { name: "WhatsApp" }).fill(whatsapp);
  await page.getByRole("textbox", { name: "Cidade" }).fill("Cascavel");
  await page.getByRole("combobox", { name: "UF" }).selectOption("PR");
  const origem = page.getByRole("combobox", { name: "Origem" });
  if (await origem.count()) await origem.selectOption({ index: 1 });
  else await page.getByRole("group", { name: "Origem" }).getByRole("button").first().click();
  await page.getByRole("textbox", { name: "Consumo médio mensal (kWh)" }).fill(consumoKwh);
}

/** Escolhe um botão de um grupo de opções do Novo negócio (tipo de cliente, distribuidora, ligação...). */
export const escolher = (page: Page, grupo: string, opcao: string | RegExp) =>
  page.getByRole("group", { name: grupo, exact: true }).getByRole("button", { name: opcao }).click();
