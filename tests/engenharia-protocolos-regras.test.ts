import { describe, expect, it } from "vitest";
import { exigeDescricao, protocoloEncerrado, respostasPossiveis, statusProtocolo } from "@/lib/engenharia-protocolos-regras";
import { montarHistorico } from "@/lib/obras/historico";

describe("respostas do protocolo (espelho da RPC)", () => {
  it("cada situação aceita só os registros da regra; encerrados não aceitam nada", () => {
    expect(respostasPossiveis("protocolado")).toEqual(["em_analise", "exigencia", "aprovado", "orcamento_emitido", "indeferido", "cancelado"]);
    expect(respostasPossiveis("com_exigencia")).toEqual(["exigencia", "reenvio", "indeferido", "cancelado"]);
    expect(respostasPossiveis("aprovado")).toEqual(["encerrado", "cancelado"]);
    for (const s of ["indeferido", "cancelado", "encerrado"] as const) {
      expect(respostasPossiveis(s)).toEqual([]);
      expect(protocoloEncerrado(s)).toBe(true);
    }
    expect(protocoloEncerrado("em_analise")).toBe(false);
  });

  it("exigência, indeferido e cancelado pedem texto; status desconhecido vira protocolado", () => {
    expect(["exigencia", "indeferido", "cancelado", "aprovado", "reenvio"].map((t) => exigeDescricao(t as never))).toEqual([true, true, true, false, false]);
    expect(statusProtocolo("novo")).toBe("protocolado");
  });
});

describe("histórico do protocolo", () => {
  const linha = (tipo: string, dados: unknown) => ({ created_at: "2026-10-30T12:00:00Z", tipo, setor: "engenharia", dados, autor_membro_id: null });

  it("mostra distribuidora, canal e situação; nunca número nem texto da distribuidora", () => {
    const h = montarHistorico(
      [
        linha("protocolo_engenharia_registrado", { distribuidora: "Copel", canal: "pew", numero: "123456" }),
        linha("protocolo_engenharia_atualizado", { tipo: "exigencia", de: "protocolado", para: "com_exigencia", descricao: "CPF 999" }),
        linha("protocolo_engenharia_atualizado", { tipo: "reenvio", de: "com_exigencia", para: "em_analise" }),
      ],
      new Map(),
    );
    const textos = h.map((i) => `${i.tipoRotulo}: ${i.descricao}`);
    expect(textos).toEqual(
      expect.arrayContaining([
        "Protocolo registrado: Copel, via PEW",
        "Protocolo atualizado: Protocolado → Com exigência",
        "Protocolo atualizado: Reenviado com correções",
      ]),
    );
    expect(textos.join(" ")).not.toMatch(/123456|CPF/);
  });
});
