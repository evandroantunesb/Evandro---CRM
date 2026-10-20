import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exigirStackLocal, lerStatusEnv, resolverStackLocal } from "../scripts/lib/stack-supabase-local.mjs";
import { prepararBancoVerificado } from "./preparar-banco";
import { jwtDemo } from "./jwt-ficticio";

// Testes puros: fixtures fictícias, nenhuma conexão, nenhum processo do CLI (o status é injetado).
const SENHA = "SENHA-FICTICIA-QUE-NAO-PODE-VAZAR";
const ASSINATURA_A = "ASSINATURAFICTICIAstackA";
const ASSINATURA_B = "ASSINATURAFICTICIAstackB";

// `exigirStackLocal` sem `processo` explícito lê o `process.env` real: isola as variáveis que decidem o
// daemon do Docker para que o resultado não dependa da máquina de quem roda os testes.
const VARIAVEIS_DOCKER = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"];
beforeEach(() => {
  for (const nome of VARIAVEIS_DOCKER) vi.stubEnv(nome, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Stack fictícia: portas e chaves próprias (a chave carrega uma assinatura marcadora). */
function stack(portaApi: number, portaBanco: number, assinatura: string, senha = SENHA) {
  return {
    API_URL: `http://127.0.0.1:${portaApi}`,
    DB_URL: `postgresql://postgres:${senha}@127.0.0.1:${portaBanco}/postgres`,
    ANON_KEY: jwtDemo("anon", assinatura),
    SERVICE_ROLE_KEY: jwtDemo("service_role", assinatura),
  };
}
const A = stack(54321, 54322, ASSINATURA_A);
const B = stack(55421, 55422, ASSINATURA_B);

/** Ambiente que os testes enxergariam para uma stack (opcionalmente com a URL de banco explícita). */
function ambiente(s: ReturnType<typeof stack>, explicitarBanco = true): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    ...(explicitarBanco ? { SUPABASE_DB_URL: s.DB_URL } : {}),
  };
}

const textoStatus = (s: Record<string, string>) =>
  Object.entries(s)
    .map(([k, v]) => `${k}="${v}"`)
    .join("\n");

/** Docker simulado que confirma a stack (a verificação real do Docker tem testes próprios). */
const dockerOk = () => vi.fn();

const SEGREDOS = [SENHA, ASSINATURA_A, ASSINATURA_B, A.ANON_KEY, A.SERVICE_ROLE_KEY, B.ANON_KEY, B.SERVICE_ROLE_KEY, A.DB_URL, B.DB_URL];

function recusa(env: Record<string, string | undefined>, status: Record<string, string>) {
  try {
    resolverStackLocal(env, status);
  } catch (e) {
    const msg = (e as Error).message;
    for (const segredo of SEGREDOS) expect(msg).not.toContain(segredo);
    return msg;
  }
  throw new Error("esperava recusa");
}

describe("prova de identidade da stack Supabase local", () => {
  it("lê a saída `-o env` do CLI (com aspas, CRLF e ruído)", () => {
    const lido = lerStatusEnv('ruído\r\nAPI_URL="http://127.0.0.1:54321"\r\nOUTRA=valor\r\n');
    expect(lido).toEqual({ API_URL: "http://127.0.0.1:54321", OUTRA: "valor" });
  });

  it("permite API e Postgres da mesma stack (portas padrão)", () => {
    expect(resolverStackLocal(ambiente(A), A).urlBanco).toBe(A.DB_URL);
  });

  it("permite portas personalizadas quando a correspondência é verificável", () => {
    expect(resolverStackLocal(ambiente(B), B).urlBanco).toBe(B.DB_URL);
  });

  it("sem SUPABASE_DB_URL, usa o banco que o CLI reporta, nunca a porta padrão", () => {
    const { urlBanco } = resolverStackLocal(ambiente(B, false), B);
    expect(urlBanco).toBe(B.DB_URL);
    expect(urlBanco).not.toContain("54322");
  });

  it("recusa API de uma stack e Postgres de outra (nos dois sentidos)", () => {
    const apiA_bancoB = { ...ambiente(A), SUPABASE_DB_URL: B.DB_URL };
    expect(recusa(apiA_bancoB, A)).toMatch(/SUPABASE_DB_URL diverge/);
    expect(recusa(apiA_bancoB, B)).toMatch(/NEXT_PUBLIC_SUPABASE_URL não corresponde/);
    const apiB_bancoA = { ...ambiente(B), SUPABASE_DB_URL: A.DB_URL };
    expect(recusa(apiB_bancoA, B)).toMatch(/SUPABASE_DB_URL diverge/);
  });

  it("recusa API personalizada com Postgres padrão (54322) incorreto", () => {
    const env = { ...ambiente(B), SUPABASE_DB_URL: `postgresql://postgres:${SENHA}@127.0.0.1:54322/postgres` };
    expect(recusa(env, B)).toMatch(/SUPABASE_DB_URL diverge/);
  });

  it("não presume relação entre portas: o par padrão só vale se for a stack reportada pelo CLI", () => {
    expect(recusa(ambiente(A), B)).toMatch(/NEXT_PUBLIC_SUPABASE_URL não corresponde/);
  });

  it.each(["https://abcdefgh.supabase.co", "http://10.0.0.5:54321", "http://localhost.evil.com:54321"])(
    "recusa API remota %s",
    (url) => {
      recusa({ ...ambiente(A), NEXT_PUBLIC_SUPABASE_URL: url }, A);
    },
  );

  it.each([
    "postgresql://postgres:x@db.exemplofake.supabase.co:5432/postgres",
    "postgresql://postgres:x@10.0.0.5:54322/postgres",
    `postgresql://postgres:${SENHA}@127.0.0.1:54322/postgres?host=db.exemplo.com`,
    `postgresql://postgres:${SENHA}@127.0.0.1:54322/postgres?sslmode=disable`,
  ])("recusa banco remoto ou com parâmetros %#", (url) => {
    recusa({ ...ambiente(A), SUPABASE_DB_URL: url }, A);
  });

  it("recusa 'localhost' quando o CLI reporta 127.0.0.1 (host literal, sem aliases)", () => {
    expect(recusa({ ...ambiente(A), NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }, A)).toMatch(/não corresponde/);
    expect(recusa({ ...ambiente(A), SUPABASE_DB_URL: A.DB_URL.replace("127.0.0.1", "localhost") }, A)).toMatch(/diverge/);
  });

  it("recusa metadados da stack remotos ou incompletos", () => {
    for (const campo of Object.keys(A)) {
      const incompleto: Record<string, string> = { ...A };
      delete incompleto[campo];
      expect(recusa(ambiente(A), incompleto)).toContain(`falta ${campo}`);
    }
    recusa(ambiente(A), { ...A, DB_URL: "postgresql://postgres:x@db.exemplofake.supabase.co:5432/postgres" });
    recusa(ambiente(A), {});
  });

  it("recusa configuração ausente", () => {
    for (const nome of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const env: Record<string, string | undefined> = ambiente(A);
      delete env[nome];
      recusa(env, A);
    }
    recusa({}, A);
  });

  it("recusa credenciais divergentes (senha, usuário, banco e chaves)", () => {
    const comBanco = (url: string) => ({ ...ambiente(A), SUPABASE_DB_URL: url });
    expect(recusa(comBanco("postgresql://postgres:outra-senha@127.0.0.1:54322/postgres"), A)).toContain("(senha)");
    expect(recusa(comBanco(`postgresql://outro:${SENHA}@127.0.0.1:54322/postgres`), A)).toContain("(usuario)");
    expect(recusa(comBanco(`postgresql://postgres:${SENHA}@127.0.0.1:54322/outrobanco`), A)).toContain("(banco)");
    expect(recusa({ ...ambiente(A), NEXT_PUBLIC_SUPABASE_ANON_KEY: B.ANON_KEY }, A)).toMatch(/ANON_KEY não é a chave/);
    expect(recusa({ ...ambiente(A), SUPABASE_SERVICE_ROLE_KEY: B.SERVICE_ROLE_KEY }, A)).toMatch(/SERVICE_ROLE_KEY não é a chave/);
  });

  it.each(["PGHOST", "PGPORT", "PGHOSTADDR", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSERVICE", "DATABASE_URL"])(
    "recusa %s definida (poderia redirecionar o banco)",
    (nome) => {
      expect(recusa({ ...ambiente(A), [nome]: "qualquer" }, A)).toContain(nome);
    },
  );
});

describe("obtenção dos metadados e ordem da validação", () => {
  it("falha ao obter o status interrompe e não repassa a saída do CLI", () => {
    const executarStatus = vi.fn(() => {
      throw new Error(`docker caiu ${SENHA} ${A.SERVICE_ROLE_KEY}`);
    });
    let msg = "";
    try {
      exigirStackLocal({ env: ambiente(A), raiz: "/repo", executarStatus, consultarDocker: dockerOk() });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/Não foi possível obter os metadados/);
    expect(msg).not.toContain(SENHA);
    expect(msg).not.toContain(A.SERVICE_ROLE_KEY);
  });

  it("saída vazia ou sem as chaves necessárias interrompe", () => {
    expect(() => exigirStackLocal({ env: ambiente(A), raiz: "/repo", executarStatus: () => "", consultarDocker: dockerOk() })).toThrow(/incompletos/);
    expect(() =>
      exigirStackLocal({ env: ambiente(A), raiz: "/repo", executarStatus: () => 'API_URL="http://127.0.0.1:54321"', consultarDocker: dockerOk() }),
    ).toThrow(/incompletos/);
  });

  it("ambiente remoto é recusado ANTES de consultar o CLI", () => {
    const executarStatus = vi.fn(() => textoStatus(A));
    expect(() =>
      exigirStackLocal({
        env: { ...ambiente(A), NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" },
        raiz: "/repo",
        executarStatus,
        consultarDocker: dockerOk(),
      }),
    ).toThrow();
    expect(executarStatus).not.toHaveBeenCalled();
  });

  it("caminho completo: stack idêntica devolve a URL verificada", () => {
    const executarStatus = vi.fn((_raiz: string, _opcoes?: unknown) => textoStatus(B));
    expect(exigirStackLocal({ env: ambiente(B), raiz: "/repo", executarStatus, consultarDocker: dockerOk() }).urlBanco).toBe(B.DB_URL);
    // O CLI recebe a raiz e o ambiente explícito (o mesmo `processo` usado na checagem do Docker).
    expect(executarStatus.mock.calls[0][0]).toBe("/repo");
    expect(executarStatus.mock.calls[0]).toHaveLength(2);
  });
});

describe("trava global dos testes (prepararBancoVerificado)", () => {
  const projeto = (env: Record<string, string> = {}) => ({ config: { env, root: "/repo" }, provide: vi.fn() });

  it("só entrega o banco às suítes depois de comprovar a stack", () => {
    const p = projeto(ambiente(B));
    prepararBancoVerificado(p, {}, { executarStatus: () => textoStatus(B), consultarDocker: dockerOk() });
    expect(p.provide).toHaveBeenCalledWith("urlBancoVerificada", B.DB_URL);
  });

  it("stack divergente: aborta, nada é entregue (nenhuma suíte chega a escrever)", () => {
    const p = projeto({ ...ambiente(A), SUPABASE_DB_URL: B.DB_URL });
    expect(() => prepararBancoVerificado(p, {}, { executarStatus: () => textoStatus(A), consultarDocker: dockerOk() })).toThrow(/Testes abortados antes de rodar/);
    expect(p.provide).not.toHaveBeenCalled();
  });

  it("falha no status: aborta sem entregar nada", () => {
    const p = projeto(ambiente(A));
    expect(() =>
      prepararBancoVerificado(p, {}, {
        executarStatus: () => {
          throw new Error("sem docker");
        },
        consultarDocker: dockerOk(),
      }),
    ).toThrow(/Testes abortados antes de rodar/);
    expect(p.provide).not.toHaveBeenCalled();
  });

  it("precedência incorreta: processo e test.env divergentes são recusados sem consultar o CLI", () => {
    const p = projeto(ambiente(A));
    const executarStatus = vi.fn(() => textoStatus(A));
    expect(() => prepararBancoVerificado(p, { SUPABASE_DB_URL: B.DB_URL }, { executarStatus, consultarDocker: dockerOk() })).toThrow(/precedência ambígua/);
    expect(executarStatus).not.toHaveBeenCalled();
    expect(p.provide).not.toHaveBeenCalled();
  });

  it("variável PG* no processo é recusada mesmo com o resto correto", () => {
    const p = projeto(ambiente(A));
    expect(() => prepararBancoVerificado(p, { PGPORT: "55422" }, { executarStatus: () => textoStatus(A), consultarDocker: dockerOk() })).toThrow(/PGPORT/);
    expect(p.provide).not.toHaveBeenCalled();
  });

  it("a mensagem final não revela segredos", () => {
    const p = projeto({ ...ambiente(A), SUPABASE_DB_URL: B.DB_URL });
    try {
      prepararBancoVerificado(p, {}, { executarStatus: () => textoStatus(A), consultarDocker: dockerOk() });
    } catch (e) {
      for (const segredo of SEGREDOS) expect((e as Error).message).not.toContain(segredo);
      return;
    }
    throw new Error("esperava recusa");
  });
});

describe("A1: o que o CLI reporta é conferido com o Docker", () => {
  const projeto = (env: Record<string, string> = {}) => ({ config: { env, root: "/repo" }, provide: vi.fn() });

  it("o Docker é consultado com as portas reportadas pelo status (nunca portas presumidas)", () => {
    const consultarDocker = vi.fn();
    exigirStackLocal({ env: ambiente(B), raiz: "/repo", executarStatus: () => textoStatus(B), consultarDocker });
    expect(consultarDocker).toHaveBeenCalledWith(expect.objectContaining({ raiz: "/repo", apiPorta: "55421", dbPorta: "55422" }));
  });

  it("divergência entre CLI e Docker interrompe e nada é entregue às suítes", () => {
    const p = projeto(ambiente(A));
    const consultarDocker = vi.fn(() => {
      throw new Error("A porta do banco reportada pelo supabase status (54322) não é a que o Docker publica: recusado.");
    });
    let msg = "";
    try {
      prepararBancoVerificado(p, {}, { executarStatus: () => textoStatus(A), consultarDocker });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("Testes abortados antes de rodar");
    expect(msg).toContain("não é a que o Docker publica");
    expect(p.provide).not.toHaveBeenCalled();
  });

  it("o Docker só é consultado depois de o status bater com o ambiente", () => {
    const consultarDocker = vi.fn();
    expect(() =>
      exigirStackLocal({ env: { ...ambiente(A), SUPABASE_DB_URL: B.DB_URL }, raiz: "/repo", executarStatus: () => textoStatus(A), consultarDocker }),
    ).toThrow(/SUPABASE_DB_URL diverge/);
    expect(consultarDocker).not.toHaveBeenCalled();
  });
});

describe("M1: o host literal verificado segue para a checagem do Docker", () => {
  it("API e banco em 127.0.0.1 → consultarDocker recebe os hosts literais", () => {
    const consultarDocker = vi.fn();
    exigirStackLocal({ env: ambiente(A), raiz: "/repo", executarStatus: () => textoStatus(A), consultarDocker });
    expect(consultarDocker).toHaveBeenCalledWith(expect.objectContaining({ apiHost: "127.0.0.1", dbHost: "127.0.0.1" }));
  });

  it("API e banco em [::1] → consultarDocker recebe o host IPv6 literal", () => {
    const v6 = { ...A, API_URL: "http://[::1]:54321", DB_URL: `postgresql://postgres:${SENHA}@[::1]:54322/postgres` };
    const consultarDocker = vi.fn();
    exigirStackLocal({ env: ambiente(v6), raiz: "/repo", executarStatus: () => textoStatus(v6), consultarDocker });
    expect(consultarDocker).toHaveBeenCalledWith(expect.objectContaining({ apiHost: "[::1]", dbHost: "[::1]" }));
  });
});

describe("M2: o ambiente validado é o dos subprocessos (nenhum processo roda antes da prova)", () => {
  it("DOCKER_HOST só em arquivo .env* (ausente no processo) → recusado ANTES de executar CLI ou Docker", () => {
    const executarStatus = vi.fn(() => textoStatus(A));
    const consultarDocker = vi.fn();
    const env = { ...ambiente(A), DOCKER_HOST: "unix:///var/run/docker.sock" };
    expect(() => exigirStackLocal({ env, raiz: "/repo", processo: {}, executarStatus, consultarDocker })).toThrow(/DOCKER_HOST difere/);
    expect(executarStatus).not.toHaveBeenCalled();
    expect(consultarDocker).not.toHaveBeenCalled();
  });

  it("DOCKER_CONTEXT só em arquivo, ou com valor diferente no processo → recusado antes de qualquer processo", () => {
    const executarStatus = vi.fn(() => textoStatus(A));
    const consultarDocker = vi.fn();
    expect(() =>
      exigirStackLocal({ env: { ...ambiente(A), DOCKER_CONTEXT: "default" }, raiz: "/repo", processo: {}, executarStatus, consultarDocker }),
    ).toThrow(/DOCKER_CONTEXT difere/);
    expect(() =>
      exigirStackLocal({
        env: { ...ambiente(A), DOCKER_CONTEXT: "default" },
        raiz: "/repo",
        processo: { DOCKER_CONTEXT: "remoto" },
        executarStatus,
        consultarDocker,
      }),
    ).toThrow(/DOCKER_CONTEXT difere/);
    expect(executarStatus).not.toHaveBeenCalled();
    expect(consultarDocker).not.toHaveBeenCalled();
  });

  it("DOCKER_HOST e DOCKER_CONTEXT ao mesmo tempo → ambíguo, recusado antes de qualquer processo", () => {
    const executarStatus = vi.fn(() => textoStatus(A));
    const proc = { DOCKER_HOST: "unix:///var/run/docker.sock", DOCKER_CONTEXT: "default" };
    expect(() =>
      exigirStackLocal({ env: { ...ambiente(A), ...proc }, raiz: "/repo", processo: proc, executarStatus, consultarDocker: vi.fn() }),
    ).toThrow(/ao mesmo tempo/);
    expect(executarStatus).not.toHaveBeenCalled();
  });

  it("variáveis iguais no ambiente validado e no processo passam; o CLI e o Docker recebem o mesmo `processo`", () => {
    const proc = { DOCKER_HOST: "unix:///var/run/docker.sock" };
    const executarStatus = vi.fn(() => textoStatus(A));
    const consultarDocker = vi.fn();
    exigirStackLocal({ env: { ...ambiente(A), ...proc }, raiz: "/repo", processo: proc, executarStatus, consultarDocker });
    expect(executarStatus).toHaveBeenCalledWith("/repo", { processo: proc });
    expect(consultarDocker).toHaveBeenCalledWith(expect.objectContaining({ processo: proc }));
  });

  it("pela trava global dos testes: DOCKER_HOST só no test.env/.env.local aborta sem entregar o banco", () => {
    const provide = vi.fn();
    const executarStatus = vi.fn(() => textoStatus(A));
    const p = { config: { env: { ...ambiente(A), DOCKER_HOST: "unix:///var/run/docker.sock" }, root: "/repo" }, provide };
    expect(() => prepararBancoVerificado(p, {}, { executarStatus, consultarDocker: dockerOk() })).toThrow(/Testes abortados antes de rodar/);
    expect(executarStatus).not.toHaveBeenCalled();
    expect(provide).not.toHaveBeenCalled();
  });
});
