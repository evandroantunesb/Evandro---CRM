import { describe, expect, it } from "vitest";
import { acoesItem, agruparItens, resumoChecklist, statusItem, type ItemEngenhariaVM } from "@/lib/engenharia-checklist-regras";
import { montarHistorico } from "@/lib/obras/historico";

const doc = { id: "d1", nome: "a.pdf", versao: 1, enviadoPor: null, quando: "2026-10-30T12:00:00Z" };
const item = (extra: Partial<ItemEngenhariaVM> = {}): ItemEngenhariaVM => ({
  id: "i",
  grupo: "G",
  titulo: "T",
  descricao: null,
  obrigatorio: true,
  status: "pendente",
  motivo: null,
  atualizadoPor: null,
  atualizadoEm: null,
  documentos: [],
  ...extra,
});

describe("resumoChecklist", () => {
  it("resolvido é válido ou não se aplica; conta obrigatórios à parte", () => {
    const r = resumoChecklist([
      item({ status: "valido" }),
      item({ status: "dispensado", obrigatorio: false }),
      item({ status: "em_conferencia" }),
      item({ status: "invalido" }),
      item(),
    ]);
    expect(r).toEqual({ total: 5, resolvidos: 2, obrigatorios: 4, obrigatoriosResolvidos: 1, emConferencia: 1, invalidos: 1 });
  });

  it("status desconhecido vira pendente", () => {
    expect(statusItem("novo")).toBe("pendente");
    expect(statusItem("valido")).toBe("valido");
  });
});

describe("agruparItens", () => {
  it("mantém a ordem de chegada dos grupos e dos itens", () => {
    const g = agruparItens([item({ id: "1", grupo: "B" }), item({ id: "2", grupo: "A" }), item({ id: "3", grupo: "B" })]);
    expect(g.map((x) => [x.grupo, x.itens.map((i) => i.id)])).toEqual([
      ["B", ["1", "3"]],
      ["A", ["2"]],
    ]);
  });
});

describe("acoesItem", () => {
  it("sem autorização ou com a obra cancelada, nenhum botão", () => {
    const tudo = { anexar: false, validar: false, invalidar: false, dispensar: false, reabrir: false };
    expect(acoesItem(item({ documentos: [doc] }), null, false)).toEqual(tudo);
    expect(acoesItem(item({ documentos: [doc] }), "admin", true)).toEqual(tudo);
  });

  it("válido e inválido só com arquivo; em conferência não reabre", () => {
    expect(acoesItem(item(), "executar", false)).toMatchObject({ anexar: true, validar: false, invalidar: false, reabrir: false });
    expect(acoesItem(item({ status: "em_conferencia", documentos: [doc] }), "executar", false)).toMatchObject({
      validar: true,
      invalidar: true,
      reabrir: false,
    });
    expect(acoesItem(item({ status: "valido", documentos: [doc] }), "executar", false)).toMatchObject({ validar: false, invalidar: true, reabrir: true });
  });

  it("obrigatório só admin ou coordenador dispensa; opcional, qualquer um da Engenharia", () => {
    expect(acoesItem(item(), "executar", false).dispensar).toBe(false);
    expect(acoesItem(item(), "coordenar", false).dispensar).toBe(true);
    expect(acoesItem(item({ obrigatorio: false }), "executar", false).dispensar).toBe(true);
    expect(acoesItem(item({ status: "dispensado", motivo: "x" }), "admin", false)).toMatchObject({ anexar: false, dispensar: false, reabrir: true });
  });
});

describe("histórico do checklist", () => {
  const linha = (tipo: string, dados: unknown) => ({ created_at: "2026-10-30T12:00:00Z", tipo, setor: "engenharia", dados, autor_membro_id: null });

  it("mostra item, versão e status, nunca o nome do arquivo nem o motivo", () => {
    const h = montarHistorico(
      [
        linha("checklist_engenharia_aplicado", { itens: 11 }),
        linha("documento_engenharia_enviado", { item: "ART", arquivo: "RG Fulano.pdf", versao: 2 }),
        linha("item_engenharia_alterado", { item: "ART", de: "em_conferencia", para: "invalido", motivo: "CPF 123" }),
      ],
      new Map(),
    );
    const textos = h.map((i) => `${i.tipoRotulo}: ${i.descricao}`);
    expect(textos).toEqual(
      expect.arrayContaining(["Checklist aplicado: 11 itens", "Documento anexado: ART: versão 2", "Item do checklist: ART: Em conferência → Inválido"]),
    );
    expect(textos.join(" ")).not.toMatch(/Fulano|CPF/);
  });
});
