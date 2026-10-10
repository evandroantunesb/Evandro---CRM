import { describe, expect, it } from "vitest";
import { ambienteEfetivo, verificarAmbienteLocal } from "./guard-supabase-local";
import { jwtDemo, jwtFicticio, jwtRemoto } from "./jwt-ficticio";

// Testes puros: só analisam objetos de ambiente; nenhuma conexão é aberta. As chaves são JWTs
// fictícios no formato do Supabase local (emissor supabase-demo).
const local = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwtDemo("anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwtDemo("service_role"),
};

/** Mensagem do erro lançado (falha o teste se não lançar). */
function mensagem(env: Record<string, string | undefined>) {
  try {
    verificarAmbienteLocal(env);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("esperava recusa");
}

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
describe("chaves do Supabase local (leitura do payload; não verifica assinatura)", () => {
  const CHAVES = [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service_role"],
  ] as const;

  it("aceita as chaves no formato do Supabase local", () => {
    expect(() => verificarAmbienteLocal(local)).not.toThrow();
  });

  it.each(CHAVES)("%s de projeto remoto (iss supabase + ref) é recusada", (nome, papel) => {
    expect(mensagem({ ...local, [nome]: jwtRemoto(papel) })).toMatch(/projeto Supabase remoto \(claim "ref"\)/);
  });

  it.each(CHAVES)("%s com claim ref é recusada mesmo com emissor supabase-demo", (nome, papel) => {
    expect(mensagem({ ...local, [nome]: jwtFicticio({ iss: "supabase-demo", ref: "x", role: papel }) })).toMatch(/claim "ref"/);
  });

  it.each(CHAVES)("%s com outro emissor (ou sem emissor) é recusada", (nome, papel) => {
    expect(mensagem({ ...local, [nome]: jwtFicticio({ iss: "supabase", role: papel }) })).toMatch(/emissor diferente/);
    expect(mensagem({ ...local, [nome]: jwtFicticio({ role: papel }) })).toMatch(/emissor diferente/);
  });

  it("papel trocado é recusado (service_role na anon e vice-versa)", () => {
    expect(mensagem({ ...local, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwtDemo("service_role") })).toMatch(/papel "anon"/);
    expect(mensagem({ ...local, SUPABASE_SERVICE_ROLE_KEY: jwtDemo("anon") })).toMatch(/papel "service_role"/);
  });

  it.each(CHAVES)("%s nos formatos de chave de API sb_ é recusada", (nome) => {
    expect(mensagem({ ...local, [nome]: "sb_publishable_ficticia123" })).toMatch(/formato de chave de API/);
    expect(mensagem({ ...local, [nome]: "sb_secret_ficticia456" })).toMatch(/formato de chave de API/);
  });

  it.each(CHAVES)("%s que não é JWT válido é recusada", (nome) => {
    const cab = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const invalidas = [
      "anon",
      "a.b",
      "a.b.c.d",
      `${cab}.nao-e-json-valido.x`,
      `${cab}.${Buffer.from("[1,2]").toString("base64url")}.x`,
      `${cab}.${Buffer.from('"texto"').toString("base64url")}.x`,
      jwtFicticio({ iss: "supabase-demo", role: "anon" }, "x", { typ: "JWT" }),
      `${cab}.e30=.x`,
    ];
    for (const v of invalidas) expect(mensagem({ ...local, [nome]: v }), v).toMatch(/não é um JWT válido/);
  });

  it("túnel/proxy em host local com chave remota é recusado (a URL local não basta)", () => {
    const tunel = { ...local, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9999", SUPABASE_SERVICE_ROLE_KEY: jwtRemoto("service_role") };
    expect(mensagem(tunel)).toMatch(/remoto/);
  });

  it("variável do processo com chave remota prevalece sobre o arquivo local", () => {
    const efetivo = ambienteEfetivo(local, { SUPABASE_SERVICE_ROLE_KEY: jwtRemoto("service_role") });
    expect(() => verificarAmbienteLocal(efetivo)).toThrow(/ref/);
  });

  it("nenhuma mensagem cita o token, o payload ou a assinatura", () => {
    for (const [nome, papel] of CHAVES) {
      const outroPapel = papel === "anon" ? "service_role" : "anon";
      const tokens = [jwtRemoto(papel, "SEGREDOREMOTO"), jwtFicticio({ iss: "x", role: papel }, "SEGREDOX"), jwtDemo(outroPapel, "SEGREDOPAPEL")];
      for (const token of tokens) {
        const m = mensagem({ ...local, [nome]: token });
        expect(m).not.toContain(token);
        expect(m).not.toContain(token.split(".")[1]);
        expect(m).not.toMatch(/SEGREDO/);
      }
    }
  });
});
