import { describe, expect, it } from "vitest";
import {
  acoesPasso,
  montarPassosEngenharia,
  passoAtual,
  proximaAcaoPasso,
  revisaoDesatualizada,
  type FatosPassos,
  type RegistroPassoVM,
} from "@/lib/engenharia-passos-regras";

const reg = (passo: 2 | 3 | 5 | 7, acao: RegistroPassoVM["acao"], quando = "2026-10-20T12:00:00Z", observacao: string | null = null): RegistroPassoVM => ({
  id: `r${passo}`,
  passo,
  acao,
  observacao,
  autor: "Ana",
  quando,
});

const item = (obrigatorio: boolean, status: FatosPassos["checklist"][number]["status"], atualizadoEm: string | null = null) => ({
  obrigatorio,
  status,
  atualizadoEm,
  documentos: [],
});

const base: FatosPassos = {
  temResponsavel: false,
  registros: {},
  checklist: [],
  protocolos: [],
  vistoria: null,
  etapa: "a_iniciar",
  engenhariaConcluida: false,
};

const status = (f: Partial<FatosPassos>) => montarPassosEngenharia({ ...base, ...f }).map((p) => p.status);

describe("montarPassosEngenharia (P6b)", () => {
  it("obra nova: tudo a fazer, começa pelo passo 1", () => {
    const passos = montarPassosEngenharia(base);
    expect(passos.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(passos.every((p) => p.status === "a_fazer")).toBe(true);
    expect(passoAtual(passos)?.numero).toBe(1);
    expect(proximaAcaoPasso(passoAtual(passos)!)).toBe("Definir o responsável principal");
  });

  it("passos com registro: confirmado conclui, reaberto vira pendência com o motivo, 'não se aplica' fecha o 7", () => {
    const passos = montarPassosEngenharia({
      ...base,
      temResponsavel: true,
      registros: { 2: reg(2, "confirmado"), 3: reg(3, "reaberto", undefined, "UC divergente"), 7: reg(7, "nao_se_aplica", undefined, "Sem orçamento") },
    });
    expect(passos[1].status).toBe("concluido");
    expect(passos[2]).toMatchObject({ status: "com_pendencia", detalhe: "Reaberto: UC divergente" });
    expect(passos[6]).toMatchObject({ status: "nao_se_aplica" });
    expect(passoAtual(passos)?.numero).toBe(3);
  });

  it("passo 4 pelo checklist: aplicado, obrigatórios resolvidos, inválido como pendência", () => {
    expect(status({ checklist: [] })[3]).toBe("a_fazer");
    expect(status({ checklist: [item(true, "pendente"), item(false, "pendente")] })[3]).toBe("em_andamento");
    expect(status({ checklist: [item(true, "invalido"), item(true, "valido")] })[3]).toBe("com_pendencia");
    const pronto = montarPassosEngenharia({ ...base, checklist: [item(true, "valido"), item(true, "dispensado"), item(false, "pendente")] })[3];
    expect(pronto).toMatchObject({ status: "concluido", detalhe: "2 de 2 obrigatórios resolvidos" });
  });

  it("passo 5 volta a pendente quando o checklist muda depois da revisão", () => {
    const revisao = reg(5, "confirmado", "2026-10-20T12:00:00Z");
    const antes = [item(true, "valido", "2026-10-19T12:00:00Z")];
    const depois = [item(true, "valido", "2026-10-21T12:00:00Z")];
    expect(revisaoDesatualizada(revisao, antes)).toBe(false);
    expect(revisaoDesatualizada(revisao, depois)).toBe(true);
    expect(status({ registros: { 5: revisao }, checklist: antes })[4]).toBe("concluido");
    expect(montarPassosEngenharia({ ...base, registros: { 5: revisao }, checklist: depois })[4]).toMatchObject({
      status: "com_pendencia",
      detalhe: "Necessita revisão: o checklist mudou depois da revisão",
    });
    // Documento novo também conta.
    const comDocumento = [{ ...item(true, "valido", "2026-10-19T12:00:00Z"), documentos: [{ id: "d", nome: "a.pdf", versao: 2, enviadoPor: null, quando: "2026-10-22T00:00:00Z" }] }];
    expect(revisaoDesatualizada(revisao, comDocumento)).toBe(true);
  });

  it("passo 6 pelo protocolo válido mais recente; cancelado não conta; exigência aberta é pendência", () => {
    const p = (s: string, abertas = 0) => ({ status: s as never, exigencias: Array.from({ length: abertas }, (_, i) => ({ id: `${i}`, categoria: "x", descricao: "x", prazoInterno: null, status: "aberta" as const })) });
    expect(status({ protocolos: [p("cancelado")] })[5]).toBe("a_fazer");
    expect(status({ protocolos: [p("em_analise")] })[5]).toBe("em_andamento");
    expect(status({ protocolos: [p("com_exigencia", 2)] })[5]).toBe("com_pendencia");
    expect(status({ protocolos: [p("aprovado")] })[5]).toBe("concluido");
    expect(status({ protocolos: [p("cancelado"), p("encerrado")] })[5]).toBe("concluido");
  });

  it("sem acesso a protocolo e vistoria, os passos 6 e 8 seguem a etapa", () => {
    expect(status({ etapa: "enviado_concessionaria" })[5]).toBe("em_andamento");
    expect(status({ etapa: "aprovado" })[5]).toBe("concluido");
    expect(status({ etapa: "aguardando_vistoria" })[7]).toBe("em_andamento");
  });

  it("passo 8 pela vistoria; Engenharia concluída fecha", () => {
    expect(status({ vistoria: { status: "solicitada", conexaoConfirmadaEm: null } })[7]).toBe("em_andamento");
    expect(status({ vistoria: { status: "com_nao_conformidade", conexaoConfirmadaEm: null } })[7]).toBe("com_pendencia");
    expect(status({ vistoria: { status: "cancelada", conexaoConfirmadaEm: null } })[7]).toBe("a_fazer");
    expect(status({ engenhariaConcluida: true })[7]).toBe("concluido");
  });

  it("tudo fechado: sem passo atual", () => {
    const passos = montarPassosEngenharia({
      temResponsavel: true,
      registros: { 2: reg(2, "confirmado"), 3: reg(3, "confirmado"), 5: reg(5, "confirmado"), 7: reg(7, "nao_se_aplica", undefined, "x") },
      checklist: [item(true, "valido")],
      protocolos: [{ status: "aprovado", exigencias: [] }],
      vistoria: { status: "aprovada", conexaoConfirmadaEm: "2026-10-25" },
      etapa: "concluido",
      engenhariaConcluida: true,
    });
    expect(passoAtual(passos)).toBeNull();
  });
});

describe("acoesPasso (P6b)", () => {
  const ctx = { status: "a_fazer" as const, autorizacao: "executar" as const, cancelada: false, checklistApto: true, protocoloAprovado: true };

  it("sem autorização ou obra cancelada: nenhum botão", () => {
    expect(acoesPasso(2, { ...ctx, autorizacao: null })).toEqual({ confirmar: false, reabrir: false, naoSeAplica: false, bloqueio: null });
    expect(acoesPasso(2, { ...ctx, cancelada: true }).confirmar).toBe(false);
  });

  it("concluído só reabre; pendência confirma de novo", () => {
    expect(acoesPasso(3, { ...ctx, status: "concluido" })).toEqual({ confirmar: false, reabrir: true, naoSeAplica: false, bloqueio: null });
    expect(acoesPasso(5, { ...ctx, status: "com_pendencia" })).toMatchObject({ confirmar: true, reabrir: false });
  });

  it("passo 5 sem checklist apto e passo 7 sem protocolo aprovado explicam o bloqueio", () => {
    expect(acoesPasso(5, { ...ctx, checklistApto: false })).toMatchObject({ confirmar: false, bloqueio: expect.stringMatching(/Aplique o checklist/) });
    expect(acoesPasso(7, { ...ctx, protocoloAprovado: false })).toMatchObject({ confirmar: false, naoSeAplica: false, bloqueio: expect.stringMatching(/aprovação/) });
  });

  it("'não se aplica' só no passo 7", () => {
    expect(acoesPasso(7, ctx).naoSeAplica).toBe(true);
    expect(acoesPasso(2, ctx).naoSeAplica).toBe(false);
    expect(acoesPasso(7, { ...ctx, status: "nao_se_aplica" })).toMatchObject({ confirmar: true, reabrir: true, naoSeAplica: false });
  });
});
