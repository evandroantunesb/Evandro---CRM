import { describe, expect, it } from "vitest";
import { ambienteEfetivo, verificarAmbienteLocal } from "./guard-supabase-local";

// Testes puros: só analisam objetos de ambiente; nenhuma conexão é aberta.
const local = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("trava fail-closed de Supabase local", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])("aceita %s", (url) => {
    expect(() => verificarAmbienteLocal({ ...local, NEXT_PUBLIC_SUPABASE_URL: url })).not.toThrow();
  });

  it.each([
    "https://abcdefgh.supabase.co",
    "https://raion-crm-roan.vercel.app",
    "http://localhost.evil.com:54321",
    "http://127.0.0.1.evil.com",
    "http://127.0.0.1@evil.com",
    "http://10.0.0.5:54321",
  ])("recusa URL remota %s", (url) => {
    expect(() => verificarAmbienteLocal({ ...local, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(/não é local/);
  });

  it("recusa URL ausente, vazia ou sem credenciais", () => {
    for (const nome of Object.keys(local)) {
      expect(() => verificarAmbienteLocal({ ...local, [nome]: undefined })).toThrow(/ausente/);
      expect(() => verificarAmbienteLocal({ ...local, [nome]: "  " })).toThrow(/ausente/);
    }
    expect(() => verificarAmbienteLocal({})).toThrow(/ausente/);
  });

  it("recusa URL inválida ou protocolo inesperado", () => {
    expect(() => verificarAmbienteLocal({ ...local, NEXT_PUBLIC_SUPABASE_URL: "nao-e-url" })).toThrow(/URL válida/);
    expect(() => verificarAmbienteLocal({ ...local, NEXT_PUBLIC_SUPABASE_URL: "ftp://127.0.0.1" })).toThrow(/protocolo/);
  });

  it("valida SUPABASE_DB_URL quando definida", () => {
    const base = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(() => verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: base })).not.toThrow();
    expect(() => verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: "" })).not.toThrow();
    expect(() =>
      verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" }),
    ).toThrow();
    expect(() => verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: "postgresql://u:p@10.1.1.1:5432/db" })).toThrow(/não é local/);
    expect(() => verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: "postgresql://u:p@127.0.0.1/db?host=db.remoto.com" })).toThrow(/host/);
    expect(() => verificarAmbienteLocal({ ...local, SUPABASE_DB_URL: "lixo" })).toThrow(/URL válida/);
  });

  it("recusa qualquer outra variável que cite domínio remoto do Supabase", () => {
    expect(() => verificarAmbienteLocal({ ...local, OUTRA_URL: "https://x.supabase.co" })).toThrow(/remoto/);
    expect(() => verificarAmbienteLocal({ ...local, DATABASE_URL: "postgres://u:p@aws-0.pooler.supabase.com:6543/postgres" })).toThrow(/remoto/);
  });

  it("variável do processo prevalece sobre o arquivo .env", () => {
    const remotoNoArquivo = { ...local, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" };
    // processo local sobrescreve arquivo remoto: efetivo é local
    expect(() =>
      verificarAmbienteLocal(ambienteEfetivo(remotoNoArquivo, { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })),
    ).not.toThrow();
    // processo remoto sobrescreve arquivo local: efetivo é remoto
    expect(() =>
      verificarAmbienteLocal(ambienteEfetivo(local, { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" })),
    ).toThrow(/não é local/);
    // só o arquivo remoto, sem sobrescrita: recusa
    expect(() => verificarAmbienteLocal(ambienteEfetivo(remotoNoArquivo, {}))).toThrow();
  });
});
