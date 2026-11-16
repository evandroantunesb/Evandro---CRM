/**
 * Ficha da obra do Solo cancelada: o banco só deixa apagar foto (20261208100000_obra_solo_trocas_plano.sql), então a
 * etapa aberta não oferece as demais ações. Renderização apenas; nada aqui toca o banco.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// As ações são Server Actions que puxam Supabase e env; aqui só importa a renderização.
vi.mock("@/lib/acoes/obra-solo", () => ({
  anotarEtapa: vi.fn(),
  apagarFotoEtapa: vi.fn(),
  etapaNaoSeAplica: vi.fn(),
  gerarNovoLink: vi.fn(),
  marcarEtapa: vi.fn(),
  preverEtapa: vi.fn(),
  registrarFotoEtapa: vi.fn(),
}));
import { ChecklistSolo } from "@/app/(app)/obras/[id]/_solo/checklist";
import { LinkCliente } from "@/app/(app)/obras/[id]/_solo/link-cliente";
import { ETAPAS_CHECKLIST } from "@/lib/obras/checklist";
import type { EtapaSoloVM } from "@/lib/obras/solo-dados";

const etapas: EtapaSoloVM[] = ETAPAS_CHECKLIST.map((etapa, i) => ({
  etapa,
  feitaEm: i < 2 ? "2026-11-01" : null,
  naoSeAplica: false,
  previstaPara: null,
  motivo: null,
  anotacao: i === 2 ? "Falta o laudo" : null,
  fotos: i === 2 ? [{ id: "f1", url: null }] : [],
}));
const atual = ETAPAS_CHECKLIST[2];
const contexto = { obraId: "o1", empresaId: "e1", clienteNome: "Maria", link: null, telefone: null };
const html = (somenteLeitura: boolean) => renderToStaticMarkup(createElement(ChecklistSolo, { etapas, atual, contexto, somenteLeitura }));

describe("checklist da obra do Solo cancelada", () => {
  it("em andamento oferece marcar, prever, anotar e enviar foto", () => {
    const h = html(false);
    expect(h).toContain("Marcar como feita");
    expect(h).toContain("Adicionar foto");
    expect(h).toContain("Salvar anotação");
  });

  it("cancelada deixa só apagar foto e mostra a anotação como texto", () => {
    const h = html(true);
    expect(h).toContain("Apagar foto");
    expect(h).toContain("Falta o laudo");
    expect(h).toContain("Obra cancelada");
    for (const acao of ["Marcar como feita", "Adicionar foto", "Salvar anotação", "Salvar data", "Não se aplica</button>"]) expect(h).not.toContain(acao);
  });
});

describe("link do cliente da obra cancelada", () => {
  const link = (somenteLeitura: boolean, url: string | null) => renderToStaticMarkup(createElement(LinkCliente, { obraId: "o1", link: url, primeiroNome: "Maria", somenteLeitura }));

  it("não oferece gerar novo link, mas continua mostrando o atual", () => {
    expect(link(false, "https://x/obra/t")).toContain("Gerar novo link");
    const h = link(true, "https://x/obra/t");
    expect(h).not.toContain("Gerar novo link");
    expect(h).toContain("https://x/obra/t");
  });

  it("sem link, não manda gerar", () => {
    expect(link(true, null)).toContain("Esta obra não tem link.");
  });
});
