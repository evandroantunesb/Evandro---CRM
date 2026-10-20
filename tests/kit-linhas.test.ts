import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { potenciaKitPersonalizadoKwp } from "@/lib/calculadora";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";
import {
  analisarLinhas,
  linhasParaComponentes,
  MAX_COMPONENTES_KIT,
  MAX_QUANTIDADE_COMPONENTE,
  resumoProblemasKit,
  type LinhaComponente,
} from "@/lib/kit-linhas";

// Testes puros: nenhuma conexão, nenhum banco. Cobrem o que o editor do kit exibe, calcula e envia.

const linha = (p: Partial<LinhaComponente> = {}): LinhaComponente => ({
  tipo: "modulo",
  descricao: "Módulo fictício 550 W",
  potenciaW: "550",
  quantidade: "10",
  ...p,
});

describe("quantidade: o número digitado é o número usado, ou o envio é bloqueado", () => {
  it.each([
    ["10", 10],
    ["1", 1],
    ["1.200", 1200],
    ["  25  ", 25],
    ["12.345", 12345],
    ["1.200,0", 1200],
  ])("aceita %j → %d (sem arredondar nem trocar)", (texto, esperado) => {
    const a = analisarLinhas([linha({ quantidade: texto })]);
    expect(a.problemas).toEqual([]);
    expect(a.componentes[0].quantidade).toBe(esperado);
  });

  it("1.200 são 1.200 unidades na potência, no payload e no preço (nunca 1,2)", () => {
    const a = analisarLinhas([linha({ quantidade: "1.200", potenciaW: "550" })]);
    expect(a.componentes[0].quantidade).toBe(1200);
    // 1.200 módulos × 550 W = 660 kWp (e não 0,66 kWp, que seria 1,2 módulo).
    expect(potenciaKitPersonalizadoKwp(a.componentes)).toBe(660);
    // O payload enviado ao servidor leva exatamente o mesmo número.
    expect(JSON.parse(JSON.stringify(a.componentes))[0].quantidade).toBe(1200);
    // O item "válido" é o mesmo que alimenta o preço sugerido (mesma quantidade).
    expect(a.itens[0].componente.quantidade).toBe(1200);
  });

  it.each([
    ["", /Informe a quantidade/],
    ["   ", /Informe a quantidade/],
    ["0", /inteiro maior que zero/],
    ["-2", /inteiro maior que zero/],
    ["1,5", /inteiro maior que zero/],
    ["0,5", /inteiro maior que zero/],
    ["abc", /Quantidade inválida/],
    ["1.2", /Quantidade inválida/],
    ["1200.5", /Quantidade inválida/],
    ["1e3", /Quantidade inválida/],
    ["R$ 10", /Quantidade inválida/],
    ["10 un", /Quantidade inválida/],
    [String(MAX_QUANTIDADE_COMPONENTE + 1).replace(/\B(?=(\d{3})+(?!\d))/g, "."), /limite/],
  ])("recusa %j (antes virava 1 ou era arredondada)", (texto, mensagem) => {
    const a = analisarLinhas([linha({ quantidade: texto })]);
    expect(a.problemas).toHaveLength(1);
    expect(a.problemas[0]).toMatchObject({ indice: 0, campo: "quantidade" });
    expect(a.problemas[0].mensagem).toMatch(mensagem);
    // A linha inválida não vira um item com outra quantidade.
    expect(a.componentes).toEqual([]);
    expect(a.itens).toEqual([]);
  });

  it("2,5 não vira 3 e 0 não vira 1: nenhum valor é substituído", () => {
    for (const q of ["2,5", "0", "-1", "abc", ""]) {
      expect(linhasParaComponentes([linha({ quantidade: q })])).toEqual([]);
    }
  });

  it("o limite da coluna integer do banco é aceito e o seguinte é recusado", () => {
    const limite = String(MAX_QUANTIDADE_COMPONENTE).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    expect(analisarLinhas([linha({ quantidade: limite })]).problemas).toEqual([]);
  });
});

describe("linhas sem descrição exigem preenchimento ou remoção explícita", () => {
  it.each(["", "   "])("descrição %j com potência e quantidade preenchidas → problema (antes sumia do envio)", (descricao) => {
    const a = analisarLinhas([linha({ descricao, potenciaW: "550", quantidade: "10" })]);
    expect(a.problemas).toEqual([
      { indice: 0, campo: "descricao", mensagem: "Preencha o modelo / descrição ou remova esta linha." },
    ]);
    expect(a.componentes).toEqual([]);
  });

  it("linha recém-adicionada e intacta (descrição vazia, qtd. 1) também exige preencher ou remover", () => {
    const a = analisarLinhas([linha({ descricao: "", potenciaW: "", quantidade: "1" })]);
    expect(a.problemas.map((p) => p.campo)).toEqual(["descricao"]);
  });

  it("descrição acima de 120 caracteres é recusada (limite do servidor)", () => {
    expect(analisarLinhas([linha({ descricao: "x".repeat(121) })]).problemas[0].campo).toBe("descricao");
    expect(analisarLinhas([linha({ descricao: "x".repeat(120) })]).problemas).toEqual([]);
  });

  it("o texto da descrição é guardado sem os espaços das pontas, nada mais", () => {
    expect(analisarLinhas([linha({ descricao: "  Canadian 550 W  " })]).componentes[0].descricao).toBe("Canadian 550 W");
  });
});

describe("potência: opcional, mas nunca descartada em silêncio", () => {
  it.each([
    ["", null],
    ["550", 550],
    ["550,5", 550.5],
    ["1.200", 1200],
  ])("aceita %j → %s", (texto, esperado) => {
    const a = analisarLinhas([linha({ potenciaW: texto })]);
    expect(a.problemas).toEqual([]);
    expect(a.componentes[0].potenciaW).toBe(esperado);
  });

  it.each(["abc", "0", "-550", "550.5", "1,2,3", "550 W"])("recusa %j (antes virava 'sem potência' e o kWp saía menor)", (texto) => {
    const a = analisarLinhas([linha({ potenciaW: texto })]);
    expect(a.problemas).toHaveLength(1);
    expect(a.problemas[0]).toMatchObject({ indice: 0, campo: "potenciaW" });
    expect(a.componentes).toEqual([]);
  });
});

describe("várias linhas", () => {
  it("só as linhas sem problema viram itens e os índices apontam para a linha certa", () => {
    const linhas = [
      linha({ descricao: "Módulo A", quantidade: "10" }),
      linha({ descricao: "", quantidade: "5" }), // sem descrição
      linha({ tipo: "inversor", descricao: "Inversor B", potenciaW: "5000", quantidade: "1" }),
      linha({ descricao: "Módulo C", quantidade: "2,5" }), // fração
    ];
    const a = analisarLinhas(linhas);
    expect(a.itens.map((i) => i.indice)).toEqual([0, 2]);
    expect(a.problemas.map((p) => [p.indice, p.campo])).toEqual([
      [1, "descricao"],
      [3, "quantidade"],
    ]);
  });

  it("uma linha com problemas em dois campos informa os dois", () => {
    const a = analisarLinhas([linha({ descricao: "", quantidade: "abc" })]);
    expect(a.problemas.map((p) => p.campo)).toEqual(["descricao", "quantidade"]);
  });

  it("lista vazia não tem problemas nem itens (remover o kit é a ação explícita de tirar todas as linhas)", () => {
    expect(analisarLinhas([])).toEqual({ itens: [], componentes: [], problemas: [] });
  });

  it(`aceita até ${MAX_COMPONENTES_KIT} itens e recusa a linha seguinte`, () => {
    const cheio = Array.from({ length: MAX_COMPONENTES_KIT }, (_, i) => linha({ descricao: `Item ${i}` }));
    expect(analisarLinhas(cheio).problemas).toEqual([]);
    const a = analisarLinhas([...cheio, linha({ descricao: "Item extra" })]);
    expect(a.problemas).toHaveLength(1);
    expect(a.problemas[0].indice).toBe(MAX_COMPONENTES_KIT);
  });

  it("não altera as linhas recebidas: o que foi digitado continua na tela", () => {
    const linhas = [linha({ descricao: "", quantidade: "1,5", potenciaW: "abc" })];
    const antes = JSON.stringify(linhas);
    analisarLinhas(linhas);
    expect(JSON.stringify(linhas)).toBe(antes);
  });
});

describe("resumoProblemasKit (mensagem do bloqueio)", () => {
  it("sem problemas não há mensagem", () => {
    expect(resumoProblemasKit([], [])).toBeNull();
  });

  it("cita o primeiro problema, o tipo do item e quantos mais existem", () => {
    const linhas = [linha({ tipo: "inversor", descricao: "", quantidade: "abc" }), linha({ quantidade: "0" })];
    const { problemas } = analisarLinhas(linhas);
    const msg = resumoProblemasKit(problemas, linhas)!;
    expect(msg).toContain("Inversor");
    expect(msg).toContain("Preencha o modelo / descrição");
    expect(msg).toContain("mais 2 problemas");
  });

  it("um problema a mais usa o singular", () => {
    const linhas = [linha({ descricao: "", quantidade: "0" })];
    const { problemas } = analisarLinhas(linhas);
    expect(resumoProblemasKit(problemas, linhas)).toContain("mais 1 problema no kit");
  });
});

describe("reabrir o kit salvo: o que foi gravado volta igual", () => {
  it("quantidade 1200 e potência 550,5 sobrevivem ao ciclo salvar → reabrir → enviar", () => {
    const salvo = [
      { tipo: "modulo" as const, descricao: "Módulo A", potenciaW: 550.5, quantidade: 1200 },
      { tipo: "inversor" as const, descricao: "Inversor B", potenciaW: null, quantidade: 1 },
    ];
    const estado = estadoSalvoDoKit({
      componentesSalvos: salvo,
      calculo: null,
      estruturaTelhado: null,
      consumoMedioKwhPadrao: null,
      valorFaturaMedioPadrao: null,
    });
    const a = analisarLinhas(estado.linhas);
    expect(a.problemas).toEqual([]);
    expect(a.componentes).toEqual(salvo);
  });
});

describe("o editor e os formulários usam a análise única (nada de conversão própria)", () => {
  const ler = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), "utf8");
  const editor = ler("src", "components", "kit-componentes.tsx");
  const ficha = ler("src", "app", "(app)", "negocios", "[id]", "kit-personalizado.tsx");
  const cadastro = ler("src", "app", "(app)", "negocios", "novo", "formulario.tsx");

  it("nenhum arredondamento nem conversão paralela da quantidade", () => {
    for (const [nome, fonte] of [
      ["kit-componentes.tsx", editor],
      ["kit-personalizado.tsx", ficha],
      ["novo/formulario.tsx", cadastro],
    ] as const) {
      expect(fonte, nome).not.toMatch(/Number\(\s*l\.quantidade\s*\)/);
      expect(fonte, nome).not.toMatch(/Math\.round\(\s*numero\(\s*l\.quantidade/);
    }
    // O `Math.max(1, Math.round(...))` do editor era o que trocava a quantidade por 1 ou a arredondava.
    expect(editor).not.toMatch(/Math\.max\(\s*1\s*,\s*Math\.round/);
  });

  it("os dois formulários analisam as linhas com `analisarLinhas` e somam o preço só das linhas válidas", () => {
    for (const fonte of [ficha, cadastro]) {
      expect(fonte).toContain("analisarLinhas(linhas)");
      expect(fonte).toContain("itens.reduce(");
      expect(fonte).toContain("componente.quantidade");
    }
  });

  it("ficha: o envio é bloqueado com problema, antes de chamar a ação, e remover o kit exige tirar todas as linhas", () => {
    const envio = ficha.slice(ficha.indexOf("function enviar("), ficha.indexOf("// Consumo médio em kWh"));
    expect(envio.indexOf("problemas.length > 0")).toBeGreaterThan(-1);
    expect(envio.indexOf("evento.preventDefault()")).toBeLessThan(envio.indexOf("enviarBase(evento)"));
    expect(ficha).toContain("const removendoKitSalvo = componentesSalvos.length > 0 && linhas.length === 0;");
    expect(ficha).not.toMatch(/removendoKitSalvo\s*=\s*[^;]*componentes\.length\s*===\s*0/);
  });

  it("cadastro: o passo 2 só avança sem problemas no kit, e a mensagem e os campos aparecem depois da tentativa", () => {
    const passo = cadastro.slice(cadastro.indexOf("function problemaDaEtapa("), cadastro.indexOf("function mostrarProblema("));
    expect(passo).toContain("if (etapa === 2)");
    expect(passo).toContain("resumoProblemasKit(problemasKit, linhas)");
    expect(cadastro).toContain("if (etapa === 2) setMostrarProblemasKit(true);");
    expect(cadastro).toContain("problemas={mostrarProblemasKit ? problemasKit : undefined}");
  });

  it("a linha mostra a mensagem do problema e marca o campo", () => {
    expect(editor).toContain('role="alert"');
    expect(editor).toContain("aria-invalid");
  });
});
