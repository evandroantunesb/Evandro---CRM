import { describe, expect, it } from "vitest";
import { ETAPAS_CHECKLIST, ROTULO_ETAPA, andamentoChecklist, linkWhatsApp, mensagemWhatsApp, type LinhaChecklist } from "@/lib/obras/checklist";

const linhas = (feitas: string[] = [], naoSeAplica: string[] = []): LinhaChecklist[] =>
  ETAPAS_CHECKLIST.map((etapa) => ({
    etapa,
    feitaEm: feitas.includes(etapa) ? "2026-11-10" : null,
    naoSeAplica: naoSeAplica.includes(etapa),
    previstaPara: null,
  }));

describe("checklist da obra do Solo", () => {
  it("as 10 etapas na ordem e com os rótulos da spec", () => {
    expect(ETAPAS_CHECKLIST.map((e) => ROTULO_ETAPA[e])).toEqual([
      "Contrato assinado",
      "Entrada recebida",
      "Projeto e ART",
      "Material comprado",
      "Protocolo na distribuidora",
      "Material entregue",
      "Instalação",
      "Vistoria",
      "Conexão e medidor",
      "Entrega ao cliente",
    ]);
  });

  it("etapa atual é a primeira não resolvida, em qualquer ordem de marcação", () => {
    const a = andamentoChecklist(linhas(["contrato", "entrada", "instalacao"]));
    expect(a).toEqual({ resolvidas: 3, total: 10, atual: "projeto_art", concluida: false });
  });

  it("não se aplica conta como resolvida", () => {
    const a = andamentoChecklist(linhas(["contrato", "entrada"], ["projeto_art"]));
    expect(a.resolvidas).toBe(3);
    expect(a.atual).toBe("material_comprado");
  });

  it("concluída só com as 10 resolvidas", () => {
    const todas = [...ETAPAS_CHECKLIST];
    expect(andamentoChecklist(linhas(todas))).toEqual({ resolvidas: 10, total: 10, atual: null, concluida: true });
    expect(andamentoChecklist(linhas(todas.filter((e) => e !== "vistoria"), ["vistoria"])).concluida).toBe(true);
    expect(andamentoChecklist(linhas(todas.slice(0, 9))).concluida).toBe(false);
  });

  it("entrega em \"não se aplica\" não conclui", () => {
    const a = andamentoChecklist(linhas(ETAPAS_CHECKLIST.slice(0, 9), ["entrega"]));
    expect(a.concluida).toBe(false);
    expect(a.atual).toBe("entrega");
  });

  it("mensagem usa o primeiro nome e o rótulo entre asteriscos", () => {
    expect(mensagemWhatsApp({ clienteNome: "Maria Souza Lima", etapa: "instalacao", link: "https://x/obra/t" })).toBe(
      "Olá, Maria! A etapa *Instalação* da sua obra foi concluída. Acompanhe por aqui: https://x/obra/t",
    );
    expect(mensagemWhatsApp({ clienteNome: "  ", etapa: "entrega", link: "https://x/obra/t" })).toBe(
      "Olá! A etapa *Entrega ao cliente* da sua obra foi concluída. Acompanhe por aqui: https://x/obra/t",
    );
  });

  it("link do WhatsApp com e sem 55 e sem telefone", () => {
    expect(linkWhatsApp("(45) 99999-0000", "Oi, tudo?")).toBe("https://wa.me/5545999990000?text=Oi%2C%20tudo%3F");
    expect(linkWhatsApp("+55 45 99999-0000", "Oi")).toBe("https://wa.me/5545999990000?text=Oi");
    expect(linkWhatsApp(null, "Oi")).toBeNull();
    expect(linkWhatsApp("123", "Oi")).toBeNull();
  });
});
