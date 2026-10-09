/**
 * Permissões do app (PR 3a — blindagem): cada recurso tem uma lista positiva de papéis
 * (`src/lib/permissoes.ts`). Cobre a matriz atual (qualquer mudança de permissão aparece
 * aqui), que um papel desconhecido não herda nada, e uma varredura de `src/` contra os
 * padrões que concedem acesso por exclusão.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InicioBasico } from "@/app/(app)/inicio/inicio-basico";
import * as permissoes from "@/lib/permissoes";
import { escopoPendencias, pode, type ListaPapeis } from "@/lib/permissoes";
import type { Papel } from "@/lib/tipos";

const MATRIZ: Record<string, string[]> = {
  NEGOCIOS: ["admin", "gestor", "vendedor", "sdr"],
  FICHA_CONTATO: ["admin", "gestor", "vendedor", "sdr"],
  CARTEIRA_CONTATOS: ["admin", "gestor", "vendedor"],
  FECHAR_NEGOCIO: ["admin", "gestor", "vendedor"],
  EDITAR_VALOR_NEGOCIO: ["admin", "gestor", "vendedor"],
  ESCOLHER_RESPONSAVEL_NEGOCIO: ["admin", "gestor"],
  FILTRAR_NEGOCIOS_POR_RESPONSAVEL: ["admin", "gestor"],
  PROPOSTA_E_CONTRATO: ["admin", "gestor", "vendedor"],
  CONFIRMAR_PAGAMENTO: ["admin", "gestor"],
  EDITAR_MODELO_CONTRATO: ["admin"],
  CALCULADORA: ["admin", "gestor", "vendedor", "sdr"],
  ANEXOS_E_NOTAS: ["admin", "gestor", "vendedor", "sdr"],
  RESPONSAVEL_COMERCIAL: ["admin", "gestor", "vendedor", "sdr"],
  TAREFAS: ["admin", "gestor", "vendedor", "sdr"],
  VER_TAREFAS_DE_OUTROS: ["admin", "gestor"],
  ATRIBUIR_TAREFA_A_OUTROS: ["admin", "gestor"],
  GOOGLE_AGENDA: ["admin", "gestor", "vendedor", "sdr"],
  GESTAO_COMERCIAL: ["admin", "gestor"],
  GAMIFICACAO: ["admin", "gestor", "vendedor", "sdr"],
  PARTICIPANTES_GAMIFICACAO: ["vendedor", "sdr"],
  OBRAS: ["admin", "gestor", "vendedor", "sdr", "operacao"],
  VER_NEGOCIO_DA_OBRA: ["admin", "gestor", "vendedor"],
};

const listas = Object.entries(permissoes).filter(([, v]) => Array.isArray(v)) as [string, ListaPapeis][];

describe("listas de permissão", () => {
  it("a matriz cobre exatamente as listas exportadas", () => {
    expect(listas.map(([nome]) => nome).sort()).toEqual(Object.keys(MATRIZ).sort());
  });

  it.each(Object.entries(MATRIZ))("%s", (nome, esperado) => {
    const lista = listas.find(([n]) => n === nome)![1];
    expect([...lista]).toEqual(esperado);
  });

  it("SDR não tem poder de gestão", () => {
    for (const lista of [
      permissoes.ESCOLHER_RESPONSAVEL_NEGOCIO,
      permissoes.FILTRAR_NEGOCIOS_POR_RESPONSAVEL,
      permissoes.VER_TAREFAS_DE_OUTROS,
      permissoes.ATRIBUIR_TAREFA_A_OUTROS,
      permissoes.GESTAO_COMERCIAL,
    ]) {
      expect(pode("sdr", lista)).toBe(false);
    }
  });

  it("papel desconhecido ou ausente não herda nenhum acesso", () => {
    for (const [, lista] of listas) {
      expect(pode("visitante", lista)).toBe(false);
      expect(pode(undefined, lista)).toBe(false);
      expect(pode(null, lista)).toBe(false);
    }
  });
});

describe("pendências do sininho (contarPendencias)", () => {
  it("gestão comercial conta a empresa toda e a fila de distribuição", () => {
    for (const papel of ["admin", "gestor"]) {
      expect(escopoPendencias(papel)).toEqual({ negocios: "empresa", tarefas: "empresa", leadsADistribuir: true });
    }
  });

  it("vendedor e SDR contam só a própria carteira, sem fila de distribuição", () => {
    for (const papel of ["vendedor", "sdr"]) {
      expect(escopoPendencias(papel)).toEqual({ negocios: "propria", tarefas: "propria", leadsADistribuir: false });
    }
  });

  it("papel desconhecido ou ausente não cai no escopo amplo: nada é contado", () => {
    for (const papel of ["operacao", undefined, null]) {
      expect(escopoPendencias(papel)).toEqual({ negocios: null, tarefas: null, leadsADistribuir: false });
    }
  });

  it("contarPendencias retorna zero antes de consultar o banco quando não há escopo", () => {
    const fonte = readFileSync(join(__dirname, "..", "src", "lib", "notificacoes.ts"), "utf8");
    const corpo = fonte.slice(fonte.indexOf("export async function contarPendencias"));
    const retornoZero = corpo.indexOf("return { leadsADistribuir: 0, demais: 0 }");
    expect(retornoZero).toBeGreaterThan(-1);
    expect(retornoZero).toBeLessThan(corpo.indexOf("criarClienteServidor()"));
  });
});

describe("Início para papel sem acesso comercial", () => {
  const fonte = readFileSync(join(__dirname, "..", "src", "app", "(app)", "inicio", "page.tsx"), "utf8");

  it("a página retorna a Início básica antes de qualquer consulta comercial", () => {
    const retornoBasico = fonte.indexOf("if (!pode(atual.papel, NEGOCIOS))");
    expect(retornoBasico).toBeGreaterThan(-1);
    for (const consulta of ["criarClienteServidor()", "carregarConfiguracao(", ".from("]) {
      expect(retornoBasico).toBeLessThan(fonte.indexOf(consulta));
    }
  });

  it("a Início básica não tem KPI, funil, proposta, meta, negócio nem atalho comercial", () => {
    const html = renderToStaticMarkup(
      createElement(InicioBasico, { nome: "Ana", saudacao: "Bom dia", empresaNome: "Raion", papel: "operacao" as Papel }),
    );
    expect(html).toContain("Bom dia, Ana.");
    expect(html).toContain("Raion");
    expect(html).not.toMatch(/href=/);
    expect(html).not.toMatch(/neg[oó]cio|proposta|meta|funil|tarefa|lead|R\$/i);
  });
});

// --- Varredura de src/ ---------------------------------------------------------

const RAIZ = join(__dirname, "..");
const arquivos = (readdirSync(join(RAIZ, "src"), { recursive: true }) as string[])
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("database.types.ts"))
  .map((f) => join(RAIZ, "src", f));

function ocorrencias(padrao: RegExp) {
  const achados: string[] = [];
  for (const arquivo of arquivos) {
    readFileSync(arquivo, "utf8")
      .split("\n")
      .forEach((linha, i) => {
        if (padrao.test(linha)) achados.push(`${relative(RAIZ, arquivo).replaceAll("\\", "/")}:${i + 1}: ${linha.trim()}`);
      });
  }
  return achados;
}

/**
 * Comparações negativas legítimas: não concedem acesso, só ajustam um campo de cadastro.
 * Para incluir uma nova, justifique aqui por que ela não dá poder a quem não está na lista.
 */
const NEGATIVAS_PERMITIDAS = [
  // Cadastro de usuário: o campo "Tipo de vendedor" só vale para o papel vendedor.
  /^src\/app\/\(app\)\/configuracoes\/usuarios\/formularios\.tsx:\d+: .*papel !== "vendedor"/,
];

describe("varredura: nenhum acesso concedido por exclusão", () => {
  it("nenhuma guarda sem papel (exigirPapel())", () => {
    expect(ocorrencias(/exigirPapel\(\s*\)/)).toEqual([]);
  });

  it("comparações negativas de papel só na allowlist", () => {
    const achados = ocorrencias(/\bpapel\s*!==?\s*["']/).filter((a) => !NEGATIVAS_PERMITIDAS.some((p) => p.test(a)));
    expect(achados).toEqual([]);
  });

  it("nenhum bloqueio por papel específico que libera os demais", () => {
    // if (papel === "sdr") return/redirect  →  todo papel novo passaria.
    expect(ocorrencias(/if\s*\(\s*\w*\.?papel\s*===\s*["'](sdr|vendedor)["']\s*\)/)).toEqual([]);
    // papel === "vendedor" ? [] : <acesso>  →  idem.
    expect(ocorrencias(/\bpapel\s*===\s*["']\w+["']\s*\?\s*(\[\]|null|false|undefined)\s*:/)).toEqual([]);
  });
});
