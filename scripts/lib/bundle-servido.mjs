/**
 * Prova de identidade do bundle do Next.js que o e2e realmente serve. O Next embute
 * `NEXT_PUBLIC_SUPABASE_URL` e a chave anon no JavaScript no momento do BUILD: o ambiente do
 * processo que inicia o servidor não muda o que o navegador recebe. Um `.next` antigo (ou feito para
 * outra stack) faria o navegador gravar numa API diferente da que o e2e verificou.
 *
 * Estratégia (fail-closed), em duas partes:
 * 1. `scripts/e2e-servidor.mjs` verifica a stack, APAGA `.next`, reconstrói com o ambiente verificado
 *    e grava um marcador (`.next/identidade-e2e.json`) com a identidade e o BUILD_ID gerado. Nenhum
 *    build anterior é reaproveitado.
 * 2. Antes de qualquer escrita, `exigirBundleServido` confere o marcador contra o BUILD_ID em disco e
 *    baixa do SERVIDOR EM EXECUÇÃO todos os scripts de `.next/static` (o cliente Supabase só aparece
 *    em telas autenticadas, então a página de login sozinha não prova nada). Cada script servido
 *    precisa ser IDÊNTICO ao do build em disco (liga o servidor ao build marcado) e o par (URL da
 *    API, chave anon) embutido neles precisa ser o da stack verificada. Sem nenhum par, recusa.
 *
 * Funções puras (HTTP e disco injetáveis). Mensagens citam só URLs locais e contagens; nunca chaves.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

export const ARQUIVO_MARCADOR = join(".next", "identidade-e2e.json");

const PAR_URL_CHAVE = /"(https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)","(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)"/g;
const CAMINHO_SCRIPT = /\/_next\/static\/[^"'\\\s<>()]+?\.js/g;
const LIMITE_SCRIPTS = 2000;

/** @param {string} texto */
export const sha256 = (texto) => createHash("sha256").update(texto).digest("hex");

/** URL sem barra final (`http://h:1` e `http://h:1/` são o mesmo destino). @param {string} url */
const semBarraFinal = (url) => url.trim().replace(/[/]+$/, "");

/**
 * Caminhos `/_next/static/**.js` citados no HTML (tags e payload RSC), sem repetição.
 * @param {string} html
 * @returns {string[]}
 */
export function extrairScripts(html) {
  const unicos = new Set();
  for (const m of html.matchAll(CAMINHO_SCRIPT)) unicos.add(m[0]);
  return [...unicos].slice(0, LIMITE_SCRIPTS);
}

/**
 * Pares (URL da API, chave anon) embutidos em um trecho de JavaScript.
 * @param {string} js
 * @returns {{ url: string, chave: string }[]}
 */
export function extrairParesEmbutidos(js) {
  return [...js.matchAll(PAR_URL_CHAVE)].map((m) => ({ url: m[1], chave: m[2] }));
}

/**
 * Compara os pares embutidos com a stack verificada. Lança erro se não houver prova ou se divergir.
 * @param {{ url: string, chave: string }[]} pares
 * @param {{ apiUrl: string, anonKey: string }} esperado
 */
export function exigirParesDaStack(pares, esperado) {
  if (pares.length === 0) {
    throw new Error(
      "Nenhuma URL/chave do Supabase foi encontrada nos scripts servidos: não é possível comprovar a stack do bundle. Recusado.",
    );
  }
  const urlsDiferentes = [...new Set(pares.filter((p) => semBarraFinal(p.url) !== semBarraFinal(esperado.apiUrl)).map((p) => p.url))];
  if (urlsDiferentes.length > 0) {
    throw new Error(
      `O bundle servido foi construído para outra API (${urlsDiferentes.join(", ")}), não para ${semBarraFinal(esperado.apiUrl)}: recusado.`,
    );
  }
  if (pares.some((p) => p.chave !== esperado.anonKey.trim())) {
    throw new Error("A chave anon embutida no bundle servido não é a da stack verificada: recusado.");
  }
}

/**
 * Scripts de `.next/static` do build em disco, como caminhos servidos (`/_next/static/...`).
 * @param {string} raiz
 * @param {(dir: string) => string[]} [listar] lista recursiva (caminhos relativos) de um diretório
 * @returns {string[]}
 */
export function listarScriptsEmDisco(raiz, listar = (dir) => readdirSync(dir, { recursive: true }).map(String)) {
  const diretorio = join(raiz, ".next", "static");
  return listar(diretorio)
    .filter((c) => c.endsWith(".js"))
    .map((c) => `/_next/static/${c.split(sep).join("/")}`)
    .sort();
}

/**
 * Baixa do servidor em execução os scripts do build e prova a identidade do bundle: o conteúdo
 * servido é o do build em disco e o par URL/chave embutido é o da stack verificada.
 * @param {{ baseUrl: string, apiUrl: string, anonKey: string, raiz: string,
 *           buscar?: (url: string) => Promise<{ ok: boolean, status: number, text: () => Promise<string> }>,
 *           scriptsEmDisco?: () => string[],
 *           lerScript?: (caminhoServido: string) => string }} o
 * @returns {Promise<{ scripts: number, pares: number }>}
 */
export async function provarBundleServido({
  baseUrl,
  apiUrl,
  anonKey,
  raiz,
  buscar = (u) => fetch(u, { redirect: "follow" }),
  scriptsEmDisco = () => listarScriptsEmDisco(raiz),
  lerScript = (c) => readFileSync(join(raiz, ".next", c.replace("/_next/", "")), "utf8"),
}) {
  const origem = new URL(baseUrl).origin;
  const pagina = await buscar(`${origem}/login`).catch(() => null);
  if (!pagina?.ok) throw new Error("Não foi possível baixar a página de login do app de teste: recusado.");
  const doHtml = extrairScripts(await pagina.text());
  if (doHtml.length === 0) throw new Error("A página de login servida não referencia scripts do Next.js: recusado.");
  const doDisco = scriptsEmDisco();
  if (doDisco.length === 0) throw new Error("Nenhum script em .next/static: não há build para comparar com o servidor. Recusado.");
  // Tudo o que a página cita tem de existir no build em disco (um servidor de outro build cita outros arquivos).
  const emDisco = new Set(doDisco);
  if (doHtml.some((c) => !emDisco.has(c))) {
    throw new Error("A página servida referencia scripts que não estão no build em disco: o servidor não serve este build. Recusado.");
  }
  /** @type {{ url: string, chave: string }[]} */
  const pares = [];
  for (const caminho of doDisco.slice(0, LIMITE_SCRIPTS)) {
    const resposta = await buscar(`${origem}${caminho}`).catch(() => null);
    // Só o que o servidor entrega vale: um script que não baixa não prova nada (e não é ignorado em silêncio).
    if (!resposta?.ok) throw new Error("Falha ao baixar um script do bundle servido: recusado.");
    const servido = await resposta.text();
    if (servido !== lerScript(caminho)) {
      throw new Error("Um script servido difere do build em disco: o servidor não serve este build. Recusado.");
    }
    pares.push(...extrairParesEmbutidos(servido));
  }
  exigirParesDaStack(pares, { apiUrl, anonKey });
  return { scripts: Math.min(doDisco.length, LIMITE_SCRIPTS), pares: pares.length };
}

/**
 * Marcador gravado logo após o build verificado.
 * @param {{ apiUrl: string, anonKey: string, buildId: string }} d
 */
export function montarMarcador({ apiUrl, anonKey, buildId }) {
  return { apiUrl, anonSha256: sha256(anonKey), buildId };
}

/**
 * Confere o marcador em disco contra a stack verificada e o BUILD_ID atual.
 * @param {{ raiz: string, apiUrl: string, anonKey: string,
 *           ler?: (caminho: string) => string }} o
 */
export function exigirMarcador({ raiz, apiUrl, anonKey, ler = (c) => readFileSync(c, "utf8") }) {
  let marcador;
  let buildId;
  try {
    marcador = JSON.parse(ler(join(raiz, ARQUIVO_MARCADOR)));
    buildId = ler(join(raiz, ".next", "BUILD_ID")).trim();
  } catch {
    throw new Error("Marcador de build do e2e ausente: o app não foi construído pela trava (scripts/e2e-servidor.mjs). Recusado.");
  }
  if (semBarraFinal(String(marcador?.apiUrl ?? "")) !== semBarraFinal(apiUrl) || marcador?.anonSha256 !== sha256(anonKey)) {
    throw new Error("O build em disco foi feito para outra stack, não para a verificada: recusado.");
  }
  if (!buildId || marcador?.buildId !== buildId) {
    throw new Error("O BUILD_ID em disco difere do marcador: o build foi alterado depois da verificação. Recusado.");
  }
}

/**
 * Prova completa (marcador + bundle servido). Ponto de entrada do e2e.
 * @param {Parameters<typeof provarBundleServido>[0] & { ler?: (c: string) => string }} o
 */
export async function exigirBundleServido(o) {
  exigirMarcador({ raiz: o.raiz, apiUrl: o.apiUrl, anonKey: o.anonKey, ler: o.ler });
  return provarBundleServido(o);
}
