import { describe, expect, it } from "vitest";
import { montarHistorico } from "@/lib/obras/historico";
import { acaoVistoria, bloqueioPedidoVistoria, registroExigeDescricao, registrosPossiveis, vistoriaAtiva } from "@/lib/engenharia-vistoria-regras";

const v = (status: Parameters<typeof registrosPossiveis>[0]["status"], medidorAdequadoEm: string | null = null, conexaoConfirmadaEm: string | null = null) => ({
  status,
  medidorAdequadoEm,
  conexaoConfirmadaEm,
});

describe("registrosPossiveis (espelha a RPC)", () => {
  it("pedida ou agendada: agendar, resultado ou cancelar", () => {
    for (const s of ["solicitada", "agendada"] as const) {
      expect(registrosPossiveis(v(s))).toEqual(["agendada", "aprovada", "nao_conformidade", "cancelada"]);
    }
  });

  it("aprovada: medidor, depois conexão, uma vez cada", () => {
    expect(registrosPossiveis(v("aprovada"))).toEqual(["medidor_adequado"]);
    expect(registrosPossiveis(v("aprovada", "2026-10-30"))).toEqual(["conexao_confirmada"]);
    expect(registrosPossiveis(v("aprovada", "2026-10-30", "2026-10-30"))).toEqual([]);
  });

  it("não conformidade e cancelada encerram o pedido", () => {
    expect(registrosPossiveis(v("com_nao_conformidade"))).toEqual([]);
    expect(registrosPossiveis(v("cancelada"))).toEqual([]);
    expect(vistoriaAtiva("com_nao_conformidade")).toBe(false);
    expect(vistoriaAtiva("aprovada")).toBe(true);
  });

  it("não conformidade e cancelamento pedem descrição", () => {
    expect(registroExigeDescricao("nao_conformidade")).toBe(true);
    expect(registroExigeDescricao("cancelada")).toBe(true);
    expect(registroExigeDescricao("aprovada")).toBe(false);
  });
});

describe("bloqueioPedidoVistoria (gate G5)", () => {
  it("explica o que falta: protocolo aprovado antes, depois a instalação", () => {
    expect(bloqueioPedidoVistoria({ protocoloAprovado: false, instalacaoConcluida: true })).toContain("protocolo for aprovado");
    expect(bloqueioPedidoVistoria({ protocoloAprovado: true, instalacaoConcluida: false })).toContain("Operacional concluir a instalação");
    expect(bloqueioPedidoVistoria({ protocoloAprovado: true, instalacaoConcluida: true })).toBeNull();
  });
});

describe("acaoVistoria (central)", () => {
  it("só não conformidade e conexão confirmada pedem ação da Engenharia", () => {
    expect(acaoVistoria({ status: "com_nao_conformidade", conexaoConfirmadaEm: null })).toBe("Corrigir a não conformidade e pedir nova vistoria");
    expect(acaoVistoria({ status: "aprovada", conexaoConfirmadaEm: "2026-10-30" })).toBe("Concluir a Engenharia");
    expect(acaoVistoria({ status: "aprovada", conexaoConfirmadaEm: null })).toBeNull();
    expect(acaoVistoria({ status: "agendada", conexaoConfirmadaEm: null })).toBeNull();
  });
});

describe("histórico da vistoria", () => {
  const linha = (tipo: string, dados: unknown) => ({ created_at: "2026-10-30T12:00:00Z", tipo, setor: "engenharia", dados, autor_membro_id: null });

  it("mostra o registro; nunca o apontamento nem o motivo da exceção", () => {
    const h = montarHistorico(
      [
        linha("vistoria_engenharia_solicitada", { autorizacao: "executar" }),
        linha("vistoria_engenharia_atualizada", { tipo: "nao_conformidade", de: "agendada", para: "com_nao_conformidade", descricao: "Placa ausente" }),
        linha("vistoria_engenharia_atualizada", { tipo: "conexao_confirmada", de: "aprovada", para: "aprovada" }),
        linha("engenharia_concluida_excecao", { motivo: "Cliente João sem conexão" }),
      ],
      new Map(),
    );
    const textos = h.map((i) => `${i.tipoRotulo}: ${i.descricao}`);
    expect(textos).toEqual(
      expect.arrayContaining([
        "Vistoria solicitada: ",
        "Vistoria atualizada: Não conformidade apontada",
        "Vistoria atualizada: Conexão confirmada",
        "Engenharia concluída sem conexão: Concluída pelo administrador sem a conexão confirmada",
      ]),
    );
    expect(textos.join(" ")).not.toMatch(/Placa|João/);
  });
});
