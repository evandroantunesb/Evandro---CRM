/**
 * /auth/confirmar (links de convite e de recuperação de senha): depois de validar o token, só redireciona para
 * caminho do próprio site. Barra invertida, tab ou URL absoluta no `next` não podem levar para outro domínio.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let erroVerificacao: { message: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({ auth: { verifyOtp: async () => ({ error: erroVerificacao }) } }),
}));

const { GET } = await import("@/app/auth/confirmar/route");

const SITE = "https://raion.exemplo";
const BS = "\\";

async function destino(next: string | null) {
  const url = new URL("/auth/confirmar?token_hash=abc&type=recovery", SITE);
  if (next !== null) url.searchParams.set("next", next);
  const resposta = await GET(new NextRequest(url));
  return resposta.headers.get("location");
}

beforeEach(() => {
  erroVerificacao = null;
});

describe("/auth/confirmar: destino do redirecionamento", () => {
  it("caminho interno é mantido, com query", async () => {
    expect(await destino("/definir-senha")).toBe(`${SITE}/definir-senha`);
    expect(await destino("/negocios?aba=1")).toBe(`${SITE}/negocios?aba=1`);
  });

  it("sem next, vai para /inicio", async () => {
    expect(await destino(null)).toBe(`${SITE}/inicio`);
  });

  it.each([
    "//evil.example",
    `/${BS}evil.example`,
    `/${BS}/evil.example`,
    `/${BS}${BS}evil.example`,
    "/\t/evil.example",
    "/\n/evil.example",
    "https://evil.example/x",
    "javascript:alert(1)",
    "evil.example",
    "http://[",
  ])("next %j não sai do site: vai para /inicio", async (next) => {
    expect(await destino(next)).toBe(`${SITE}/inicio`);
  });

  it("token inválido continua indo para o login com erro", async () => {
    erroVerificacao = { message: "expirado" };
    expect(await destino("/definir-senha")).toBe(`${SITE}/login?erro=link-invalido`);
  });
});
