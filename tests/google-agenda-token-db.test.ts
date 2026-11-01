/**
 * refresh_token do Google Agenda cifrado (AES-256-GCM, chave GOOGLE_AGENDA_CHAVE só no servidor): o banco nunca guarda
 * o token em claro, o valor cifrado de um membro não serve para outro, valor adulterado ou sem chave não decifra, sem a
 * chave a integração nem aparece, e o token antigo (texto puro) continua funcionando e é cifrado no primeiro uso.
 * O teste com banco precisa do Supabase local (roda no CI).
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cifrarRefreshToken,
  decifrarRefreshToken,
  integracaoConfigurada,
  refreshTokenDoMembro,
} from "@/lib/google-agenda";
import { criarUsuario, servico, sufixo } from "./ajuda";

const CHAVE = randomBytes(32).toString("base64");
const TOKEN = "1//0gToken-de-teste_ABCdef123";
const MEMBRO = "11111111-1111-4111-8111-111111111111";
const OUTRO_MEMBRO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
  vi.stubEnv("GOOGLE_AGENDA_CHAVE", CHAVE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cifra do refresh_token", () => {
  it("cifra e decifra; o valor gravado não contém o token e muda a cada vez", () => {
    const a = cifrarRefreshToken(TOKEN, MEMBRO);
    const b = cifrarRefreshToken(TOKEN, MEMBRO);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain(TOKEN);
    expect(a).not.toBe(b);
    expect(decifrarRefreshToken(a, MEMBRO)).toEqual({ token: TOKEN, legado: false });
  });

  it("o valor de um membro não decifra para outro, e valor adulterado não decifra", () => {
    const valor = cifrarRefreshToken(TOKEN, MEMBRO);
    expect(decifrarRefreshToken(valor, OUTRO_MEMBRO)).toBeNull();
    const bruto = Buffer.from(valor.slice(3), "base64");
    bruto[bruto.length - 1] ^= 1;
    expect(decifrarRefreshToken(`v1:${bruto.toString("base64")}`, MEMBRO)).toBeNull();
  });

  it("outra chave não decifra", () => {
    const valor = cifrarRefreshToken(TOKEN, MEMBRO);
    vi.stubEnv("GOOGLE_AGENDA_CHAVE", randomBytes(32).toString("base64"));
    expect(decifrarRefreshToken(valor, MEMBRO)).toBeNull();
  });

  it("token antigo em texto puro passa como legado", () => {
    expect(decifrarRefreshToken(TOKEN, MEMBRO)).toEqual({ token: TOKEN, legado: true });
  });

  it("sem chave (ou chave com tamanho errado) a integração não aparece, não cifra e não decifra valor cifrado", () => {
    const valor = cifrarRefreshToken(TOKEN, MEMBRO);
    expect(integracaoConfigurada()).toBe(true);
    for (const chave of ["", randomBytes(16).toString("base64")]) {
      vi.stubEnv("GOOGLE_AGENDA_CHAVE", chave);
      expect(integracaoConfigurada()).toBe(false);
      expect(() => cifrarRefreshToken(TOKEN, MEMBRO)).toThrow();
      expect(decifrarRefreshToken(valor, MEMBRO)).toBeNull();
    }
  });
});

describe("conexão gravada no banco", () => {
  let membro: string;
  let empresa: string;

  beforeAll(async () => {
    const usuario = await criarUsuario("ga-token");
    const { data: emp, error } = await servico.from("empresas").insert({ nome: `Google token ${sufixo}` }).select("id").single();
    if (error) throw error;
    empresa = emp!.id;
    const { data: m } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor" }).select("id").single();
    membro = m!.id;
  });

  const gravado = async () => {
    const { data } = await servico.from("google_agenda_conexoes").select("refresh_token").eq("membro_id", membro).single();
    return data!.refresh_token;
  };

  it("token antigo em texto puro continua funcionando e é cifrado no primeiro uso", async () => {
    const { error } = await servico.from("google_agenda_conexoes").insert({ membro_id: membro, empresa_id: empresa, refresh_token: TOKEN });
    if (error) throw error;

    expect(await refreshTokenDoMembro(servico, membro)).toBe(TOKEN);
    const depois = await gravado();
    expect(depois.startsWith("v1:")).toBe(true);
    expect(depois).not.toContain(TOKEN);

    expect(await refreshTokenDoMembro(servico, membro)).toBe(TOKEN);
    expect(await gravado()).toBe(depois);
  });

  it("sem conexão, ou sem a chave para decifrar, não há token", async () => {
    expect(await refreshTokenDoMembro(servico, OUTRO_MEMBRO)).toBeNull();
    vi.stubEnv("GOOGLE_AGENDA_CHAVE", "");
    expect(await refreshTokenDoMembro(servico, membro)).toBeNull();
  });
});
