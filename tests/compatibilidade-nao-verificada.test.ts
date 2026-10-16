// E0 — a interface nunca afirma compatibilidade técnica sem uma validação real.
// Antes: o assistente de novo negócio exibia sempre "Combinação compatível · MPPT validado · Voc validado"
// e um botão que mostrava alertas de exemplo, sem nenhuma conferência por trás. Enquanto não houver
// catálogo com ficha técnica e regras de compatibilidade, a tela diz "Compatibilidade técnica não verificada".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function arquivosFonte(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosFonte(caminho);
    return /\.(ts|tsx)$/.test(nome) && !caminho.includes("database.types") ? [caminho] : [];
  });
}

const fontes = arquivosFonte("src").map((caminho) => ({ caminho, texto: readFileSync(caminho, "utf8") }));
const FORMULARIO = join("src", "app", "(app)", "negocios", "novo", "formulario.tsx");

// Afirmações de validação ou compatibilidade que só podem existir quando calculadas de verdade.
const AFIRMACOES_FIXAS = [
  /MPPT validado/i,
  /Voc validado/i,
  /Combinação compatível/i,
  /Combinação incompatível/i,
  /Overload acima do recomendado/i,
  /exemplos? de alerta técnico/i,
];

describe("compatibilidade técnica: nenhum texto fixo de validação", () => {
  it("nenhum arquivo de src afirma compatibilidade, MPPT ou Voc validados", () => {
    const achados = fontes.flatMap(({ caminho, texto }) => AFIRMACOES_FIXAS.filter((re) => re.test(texto)).map((re) => `${caminho}: ${re}`));
    expect(achados).toEqual([]);
  });

  it("o assistente de novo negócio avisa 'Compatibilidade técnica não verificada'", () => {
    const formulario = readFileSync(FORMULARIO, "utf8");
    expect(formulario).toContain("Compatibilidade técnica não verificada");
    // O aviso é um status acessível e não depende de botão nem de estado de exemplo.
    expect(formulario).toContain('role="status"');
    expect(formulario).not.toContain("mostrarAlertasExemplo");
  });

  it("o inversor não aparece como 'exemplo de catálogo'", () => {
    expect(readFileSync(FORMULARIO, "utf8")).not.toContain("exemplo de catálogo");
  });
});
