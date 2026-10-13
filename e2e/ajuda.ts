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

/** Texto do indicador "Obra X de N". */
export const indicador = (page: Page) => page.getByRole("navigation", { name: "Navegação entre obras" }).locator("p[aria-live]");
