import { join, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  exigirBundleServido,
  exigirMarcador,
  exigirParesDaStack,
  extrairParesEmbutidos,
  extrairScripts,
  listarScriptsEmDisco,
  montarMarcador,
  provarBundleServido,
  sha256,
} from "../scripts/lib/bundle-servido.mjs";
import { jwtDemo } from "./jwt-ficticio";

// M2: testes puros (HTTP e disco simulados). Nenhum servidor, build ou conexão real.
const ANON_A = jwtDemo("anon", "ASSINATURAFICTICIAstackA");
const ANON_B = jwtDemo("anon", "ASSINATURAFICTICIAstackB");
const API_A = "http://127.0.0.1:56321";
const API_B = "http://127.0.0.1:57321";
const SEGREDOS = [ANON_A, ANON_B, "ASSINATURAFICTICIAstackA", "ASSINATURAFICTICIAstackB"];

/** JavaScript de cliente no formato que o Next/Turbopack gera: URL e chave anon consecutivas. */
const chunkSupabase = (url: string, chave: string) =>
  `function(){return createBrowserClient("${url}","${chave}",{cookies:{}})}();var x=1;`;

const HTML_LOGIN = `<html><head><script src="/_next/static/chunks/aaa.js" async></script>
<script src="/_next/static/chunks/bbb.js" async></script></head><body>
<script>self.__next_f.push([1,"static/chunks/ccc.js"]);self.__next_f.push([1,"\\"/_next/static/chunks/ccc.js\\""])</script>
<link rel="icon" href="/favicon.ico"/><script src="https://cdn.exemplo.com/x.js"></script></body></html>`;

type Resposta = { ok: boolean; status: number; text: () => Promise<string> };
const resposta = (corpo: string, ok = true): Resposta => ({ ok, status: ok ? 200 : 500, text: async () => corpo });

/** Servidor fictício: mapa de caminho → corpo; caminho ausente = erro de rede. */
function servidor(paginas: Record<string, string | null>) {
  return vi.fn(async (url: string) => {
    const caminho = new URL(url).pathname;
    if (!(caminho in paginas)) throw new Error("ECONNREFUSED");
    const corpo = paginas[caminho];
    return corpo === null ? resposta("", false) : resposta(corpo);
  });
}
const bundle = (url: string, chave: string) => ({
  "/login": HTML_LOGIN,
  "/_next/static/chunks/aaa.js": "console.log('sem supabase');",
  "/_next/static/chunks/bbb.js": chunkSupabase(url, chave),
  "/_next/static/chunks/ccc.js": "var y=2;",
});

function mensagem(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    const msg = (e as Error).message;
    for (const s of SEGREDOS) expect(msg).not.toContain(s);
    return msg;
  }
  throw new Error("esperava recusa");
}
async function mensagemAsync(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    for (const s of SEGREDOS) expect(msg).not.toContain(s);
    return msg;
  }
  throw new Error("esperava recusa");
}

describe("M2: leitura do HTML e dos scripts", () => {
  it("extrai só scripts /_next/static/**.js, sem repetição", () => {
    expect(extrairScripts(HTML_LOGIN)).toEqual(["/_next/static/chunks/aaa.js", "/_next/static/chunks/bbb.js", "/_next/static/chunks/ccc.js"]);
    expect(extrairScripts("<html></html>")).toEqual([]);
  });

  it("extrai o par URL/chave embutido e ignora outras strings", () => {
    expect(extrairParesEmbutidos(chunkSupabase(API_A, ANON_A))).toEqual([{ url: API_A, chave: ANON_A }]);
    expect(extrairParesEmbutidos(`var a="http://127.0.0.1:3100";var b="eyJabc.def.ghi";`)).toEqual([]);
    expect(extrairParesEmbutidos(`f("http://localhost:56321","${ANON_A}")`)).toHaveLength(1);
  });
});

describe("M2: o par embutido tem de ser o da stack verificada", () => {
  const esperado = { apiUrl: API_A, anonKey: ANON_A };

  it("aceita o par idêntico (com ou sem barra final)", () => {
    expect(() => exigirParesDaStack([{ url: API_A, chave: ANON_A }], esperado)).not.toThrow();
    expect(() => exigirParesDaStack([{ url: `${API_A}/`, chave: ANON_A }], esperado)).not.toThrow();
    expect(() => exigirParesDaStack([{ url: API_A, chave: ANON_A }], { apiUrl: `${API_A}/`, anonKey: ANON_A })).not.toThrow();
  });

  it("recusa sem nenhum par (não há prova) ", () => {
    expect(mensagem(() => exigirParesDaStack([], esperado))).toMatch(/não é possível comprovar/);
  });

  it("recusa bundle de OUTRA API, citando as URLs (não as chaves)", () => {
    const msg = mensagem(() => exigirParesDaStack([{ url: API_B, chave: ANON_A }], esperado));
    expect(msg).toContain(API_B);
    expect(msg).toContain(API_A);
  });

  it("recusa um par correto misturado com outro de outra stack", () => {
    expect(() =>
      exigirParesDaStack(
        [
          { url: API_A, chave: ANON_A },
          { url: API_B, chave: ANON_B },
        ],
        esperado,
      ),
    ).toThrow(/outra API/);
  });

  it("recusa chave anon diferente mesmo com a URL correta", () => {
    expect(mensagem(() => exigirParesDaStack([{ url: API_A, chave: ANON_B }], esperado))).toMatch(/chave anon/);
  });
});

describe("M2: prova no servidor em execução", () => {
  /** Build em disco fictício: por padrão idêntico ao que o servidor entrega. */
  const prova = (paginas: Record<string, string | null>, api = API_A, anon = ANON_A, disco: Record<string, string> | null = null) => {
    const emDisco = disco ?? Object.fromEntries(Object.entries(paginas).filter(([c, v]) => c.startsWith("/_next/static/") && v !== null)) as Record<string, string>;
    return provarBundleServido({
      baseUrl: "http://localhost:3100",
      apiUrl: api,
      anonKey: anon,
      raiz: "/repo",
      buscar: servidor(paginas) as never,
      scriptsEmDisco: () => Object.keys(emDisco),
      lerScript: (c) => emDisco[c],
    });
  };

  it("bundle construído para a stack verificada é aceito", async () => {
    await expect(prova(bundle(API_A, ANON_A))).resolves.toEqual({ scripts: 3, pares: 1 });
    // O par pode estar em um script que a página de login NÃO carrega (o cliente só existe em telas autenticadas).
    const soNoDisco = { ...bundle(API_A, ANON_A), "/_next/static/chunks/zzz.js": chunkSupabase(API_A, ANON_A) };
    soNoDisco["/_next/static/chunks/bbb.js"] = "var sem=1;";
    await expect(prova(soNoDisco)).resolves.toEqual({ scripts: 4, pares: 1 });
  });

  it("CENÁRIO NEGATIVO: base na stack A (verificada) e app construído para a stack B → recusado", async () => {
    const msg = await mensagemAsync(prova(bundle(API_B, ANON_A)));
    expect(msg).toMatch(/construído para outra API/);
    expect(msg).toContain(API_B);
  });

  it("só consulta a origem do app de teste e só baixa scripts do Next", async () => {
    const paginas = bundle(API_A, ANON_A);
    const buscar = servidor(paginas);
    await provarBundleServido({
      baseUrl: "http://localhost:3100/qualquer/coisa",
      apiUrl: API_A,
      anonKey: ANON_A,
      raiz: "/repo",
      buscar: buscar as never,
      scriptsEmDisco: () => Object.keys(paginas).filter((c) => c.startsWith("/_next/")),
      lerScript: (c) => paginas[c as keyof typeof paginas],
    });
    const urls = buscar.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.startsWith("http://localhost:3100/"))).toBe(true);
    expect(urls.some((u) => u.includes("cdn.exemplo.com"))).toBe(false);
  });

  it("página de login indisponível, sem scripts ou script que não baixa → recusado (nada é ignorado em silêncio)", async () => {
    await expect(prova({})).rejects.toThrow(/página de login/);
    await expect(prova({ "/login": null })).rejects.toThrow(/página de login/);
    await expect(prova({ "/login": "<html></html>" })).rejects.toThrow(/não referencia scripts/);
    const disco = Object.fromEntries(Object.entries(bundle(API_A, ANON_A)).filter(([c]) => c.startsWith("/_next/")));
    await expect(prova({ ...bundle(API_A, ANON_A), "/_next/static/chunks/aaa.js": null }, API_A, ANON_A, disco)).rejects.toThrow(/Falha ao baixar/);
    const semUm = bundle(API_A, ANON_A) as Record<string, string | null>;
    delete semUm["/_next/static/chunks/ccc.js"];
    await expect(prova(semUm, API_A, ANON_A, disco)).rejects.toThrow(/Falha ao baixar/);
  });

  it("servidor que NÃO serve o build em disco → recusado (conteúdo diferente, script extra ou build vazio)", async () => {
    const servido = bundle(API_B, ANON_B); // o servidor entrega o bundle de B
    const discoA = Object.fromEntries(Object.entries(bundle(API_A, ANON_A)).filter(([c]) => c.startsWith("/_next/"))); // o disco tem o de A
    await expect(prova(servido, API_A, ANON_A, discoA)).rejects.toThrow(/difere do build em disco/);
    // A página cita um script que o build em disco não tem (outro build no servidor).
    const outroBuild = { ...bundle(API_A, ANON_A), "/login": HTML_LOGIN.replace("aaa.js", "outro.js"), "/_next/static/chunks/outro.js": "x" };
    const discoComAaa = Object.fromEntries(Object.entries(bundle(API_A, ANON_A)).filter(([c]) => c.startsWith("/_next/")));
    await expect(prova(outroBuild, API_A, ANON_A, discoComAaa)).rejects.toThrow(/não estão no build em disco/);
    await expect(prova(bundle(API_A, ANON_A), API_A, ANON_A, {})).rejects.toThrow("Nenhum script em .next/static");
  });

  it("lista os scripts do build em disco como caminhos servidos, com o separador do sistema", () => {
    const listar = () => ["chunks/a.js".split("/").join(sep), join("chunks", "b.js"), join("css", "x.css"), join("id-do-build", "_buildManifest.js"), "chunks"];
    expect(listarScriptsEmDisco("/repo", listar)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
      "/_next/static/id-do-build/_buildManifest.js",
    ]);
  });

  it("bundle sem cliente Supabase (formato mudou) → recusado: sem prova não há aceitação", async () => {
    await expect(prova({ ...bundle(API_A, ANON_A), "/_next/static/chunks/bbb.js": "var z=1;" })).rejects.toThrow(/não é possível comprovar/);
  });
});

describe("M2: marcador gravado pelo servidor verificado", () => {
  const lerDe = (marcador: unknown, buildId = "build-123") => (caminho: string) => {
    if (caminho.endsWith("identidade-e2e.json")) {
      if (marcador === undefined) throw new Error("ENOENT");
      return JSON.stringify(marcador);
    }
    if (caminho.endsWith("BUILD_ID")) {
      if (buildId === "") throw new Error("ENOENT");
      return `${buildId}\n`;
    }
    throw new Error("arquivo inesperado");
  };
  const marcadorOk = montarMarcador({ apiUrl: API_A, anonKey: ANON_A, buildId: "build-123" });
  const confere = (marcador: unknown, buildId?: string, api = API_A, anon = ANON_A) =>
    exigirMarcador({ raiz: "/repo", apiUrl: api, anonKey: anon, ler: lerDe(marcador, buildId) });

  it("o marcador guarda só o hash da chave", () => {
    expect(marcadorOk).toEqual({ apiUrl: API_A, anonSha256: sha256(ANON_A), buildId: "build-123" });
    expect(JSON.stringify(marcadorOk)).not.toContain(ANON_A);
  });

  it("aceita marcador da stack verificada e do BUILD_ID atual", () => {
    expect(() => confere(marcadorOk)).not.toThrow();
  });

  it("recusa marcador ausente, de outra stack, de outra chave ou de outro BUILD_ID (build alterado depois)", () => {
    expect(mensagem(() => confere(undefined))).toMatch(/Marcador de build do e2e ausente/);
    expect(mensagem(() => confere(montarMarcador({ apiUrl: API_B, anonKey: ANON_A, buildId: "build-123" })))).toMatch(/outra stack/);
    expect(mensagem(() => confere(montarMarcador({ apiUrl: API_A, anonKey: ANON_B, buildId: "build-123" })))).toMatch(/outra stack/);
    expect(mensagem(() => confere(marcadorOk, "build-OUTRO"))).toMatch(/BUILD_ID/);
    expect(mensagem(() => confere(marcadorOk, ""))).toMatch(/ausente/);
    expect(() => confere({ lixo: true })).toThrow(/outra stack/);
  });

  it("exigirBundleServido: o marcador é conferido ANTES de qualquer requisição HTTP", async () => {
    const buscar = servidor(bundle(API_A, ANON_A));
    await expect(
      exigirBundleServido({
        raiz: "/repo",
        baseUrl: "http://localhost:3100",
        apiUrl: API_A,
        anonKey: ANON_A,
        ler: lerDe(undefined),
        buscar: buscar as never,
      }),
    ).rejects.toThrow(/Marcador/);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("exigirBundleServido: marcador e bundle corretos → aceito; bundle de B → recusado", async () => {
    const comum = { raiz: "/repo", baseUrl: "http://localhost:3100", apiUrl: API_A, anonKey: ANON_A, ler: lerDe(marcadorOk) };
    const noDisco = (b: Record<string, string>) => ({
      scriptsEmDisco: () => Object.keys(b).filter((c) => c.startsWith("/_next/")),
      lerScript: (c: string) => b[c],
    });
    await expect(exigirBundleServido({ ...comum, buscar: servidor(bundle(API_A, ANON_A)) as never, ...noDisco(bundle(API_A, ANON_A)) })).resolves.toBeTruthy();
    await expect(exigirBundleServido({ ...comum, buscar: servidor(bundle(API_B, ANON_A)) as never, ...noDisco(bundle(API_B, ANON_A)) })).rejects.toThrow(/outra API/);
  });
});
