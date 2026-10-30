import { describe, expect, it } from "vitest";
import { montarHistorico } from "@/lib/obras/historico";
import { acaoVistoria, bloqueioPedidoVistoria, podeRegistrar, registroExigeDescricao, registrosPossiveis, vistoriaAtiva } from "@/lib/engenharia-vistoria-regras";

const v = (status: Parameters<typeof registrosPossiveis>[0]["status"], medidorAdequadoEm: string | null = null, conexaoConfirmadaEm: string | null = null) => ({
  status,
  medidorAdequadoEm,
  conexaoConfirmadaEm,
});

const eng = { engenharia: true, operacional: false };
const op = { engenharia: false, operacional: true };
const ambos = { engenharia: true, operacional: true };

describe("registrosPossiveis (espelha a RPC e quem registra cada parte)", () => {
  it("pedida ou agendada: a Engenharia agenda, registra a vistoria feita, o resultado ou cancela", () => {
    for (const s of ["solicitada", "agendada"] as const) {
      expect(registrosPossiveis(v(s), eng)).toEqual(["agendada", "realizada", "aprovada", "nao_conformidade", "cancelada"]);
    }
  });

  it("o Operacional só agenda e registra a vistoria feita em campo; o resultado formal é da Engenharia", () => {
    expect(registrosPossiveis(v("agendada"), op)).toEqual(["agendada", "realizada"]);
    expect(registrosPossiveis(v("realizada"), op)).toEqual([]);
    expect(registrosPossiveis(v("realizada"), eng)).toEqual(["aprovada", "nao_conformidade", "cancelada"]);
    expect(registrosPossiveis(v("aprovada"), op)).toEqual([]);
  });

  it("aprovada: medidor, depois conexão, uma vez cada (Engenharia)", () => {
    expect(registrosPossiveis(v("aprovada"), eng)).toEqual(["medidor_adequado"]);
    expect(registrosPossiveis(v("aprovada", "2026-10-30"), eng)).toEqual(["conexao_confirmada"]);
    expect(registrosPossiveis(v("aprovada", "2026-10-30", "2026-10-30"), eng)).toEqual([]);
  });

  it("não conformidade: só o Operacional registra a correção de campo; cancelada encerra", () => {
    expect(registrosPossiveis(v("com_nao_conformidade"), op)).toEqual(["correcao_campo"]);
    expect(registrosPossiveis(v("com_nao_conformidade"), eng)).toEqual([]);
    expect(registrosPossiveis(v("com_nao_conformidade"), ambos)).toEqual(["correcao_campo"]);
    expect(registrosPossiveis(v("cancelada"), ambos)).toEqual([]);
    expect(vistoriaAtiva("com_nao_conformidade")).toBe(false);
    expect(vistoriaAtiva("realizada")).toBe(true);
    expect(vistoriaAtiva("aprovada")).toBe(true);
  });

  it("quem registra cada parte", () => {
    expect(podeRegistrar("realizada", op)).toBe(true);
    expect(podeRegistrar("agendada", eng)).toBe(true);
    expect(podeRegistrar("correcao_campo", eng)).toBe(false);
    for (const t of ["aprovada", "nao_conformidade", "cancelada", "medidor_adequado", "conexao_confirmada"] as const) expect(podeRegistrar(t, op), t).toBe(false);
  });

  it("não conformidade, correção de campo e cancelamento pedem descrição", () => {
    expect(registroExigeDescricao("nao_conformidade")).toBe(true);
    expect(registroExigeDescricao("correcao_campo")).toBe(true);
    expect(registroExigeDescricao("cancelada")).toBe(true);
    expect(registroExigeDescricao("aprovada")).toBe(false);
    expect(registroExigeDescricao("realizada")).toBe(false);
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
  it("realizada, não conformidade e conexão confirmada pedem ação da Engenharia", () => {
    expect(acaoVistoria({ status: "realizada", conexaoConfirmadaEm: null })).toBe("Registrar o resultado da vistoria");
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
