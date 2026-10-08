import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(join(process.cwd(), "src", "app", "(app)", "painel", "page.tsx"), "utf-8");

describe("Painel: oportunidades aguardando aceite", () => {
  it("falha na consulta aparece como aviso, não como ausência de pendências", () => {
    expect(pagina).toContain('supabase.rpc("oportunidades_pendentes_equipe"');
    expect(pagina).toContain("{pendentes.error && (");
    expect(pagina).toContain("Não foi possível carregar as oportunidades aguardando aceite agora.");
    // Sem detalhes internos na tela: a mensagem do erro não é renderizada.
    expect(pagina).not.toMatch(/pendentes\.error\.message/);
  });
});
