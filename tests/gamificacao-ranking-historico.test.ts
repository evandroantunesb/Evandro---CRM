/**
 * Variação histórica de posição no ranking (Evandro, 2026-10-04) — novo parâmetro
 * `p_ate` em `ranking_gamificacao`, com reconstrução causal pura a partir do
 * `point_ledger` imutável (sem snapshot).
 *
 * Cenário obrigatório (Evandro): um lançamento criado antes do corte `p_ate` e só
 * estornado DEPOIS do corte estava válido naquele instante — a consulta histórica
 * (`p_ate`) deve continuar vendo esse XP, enquanto a consulta ao vivo (`p_ate` null,
 * `not estornado`) já não o vê, revelando a queda real de posição.
 *
 * Lançamentos são inseridos direto no `point_ledger` (via `servico`, sem RLS) para
 * controlar `created_at`/`estornado`/`estornado_em` com precisão — nenhum destes
 * testes depende do pipeline de eventos/regras.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let membroA: Usuario;
let membroB: Usuario;
let empresa: string;
const membro: Record<string, string> = {};

beforeAll(async () => {
  [admin, membroA, membroB] = await Promise.all(["rh-admin", "rh-a", "rh-b"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Ranking histórico ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: membroA.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: membroB.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;
});

async function lancar(opts: {
  membroId: string;
  xp: number;
  createdAt: string;
  estornado?: boolean;
  estornadoEm?: string;
  perfil?: "sdr" | "closer" | "cs_farmer";
}) {
  const { error } = await servico.from("point_ledger").insert({
    empresa_id: empresa,
    membro_id: opts.membroId,
    xp: opts.xp,
    moedas: 0,
    referencia_tipo: "teste",
    profile_at_event: opts.perfil ?? "closer",
    created_at: opts.createdAt,
    estornado: opts.estornado ?? false,
    estornado_em: opts.estornadoEm ?? null,
  });
  if (error) throw error;
}

async function ranking(pAte?: string, perfil: "sdr" | "closer" | "cs_farmer" = "closer") {
  const { data, error } = await admin.cliente.rpc("ranking_gamificacao", {
    p_empresa_id: empresa,
    p_perfil: perfil,
    ...(pAte ? { p_ate: pAte } : {}),
  });
  if (error) throw error;
  return data!;
}

function totalDe(linhas: { membro_id: string; total_xp: number }[], membroId: string) {
  return linhas.find((l) => l.membro_id === membroId)?.total_xp ?? 0;
}

describe("ranking_gamificacao: p_ate — reconstrução causal do ledger num instante passado", () => {
  it("cenário obrigatório: XP válido no corte e estornado depois do corte — histórico vê o XP, ao vivo vê o estorno (queda real de posição)", async () => {
    const inicioSemana = "2026-10-01T00:00:00Z";
    const duranteASemana = "2026-10-03T00:00:00Z";

    // A ganha 100 XP antes do início da semana — fica acima de B no corte.
    await lancar({ membroId: membro[membroA.id], xp: 100, createdAt: "2026-09-25T00:00:00Z" });
    // B ganha 40 XP, também antes do corte.
    await lancar({ membroId: membro[membroB.id], xp: 40, createdAt: "2026-09-26T00:00:00Z" });

    // Durante a semana, o XP de A é estornado (estornado_em depois do corte).
    await servico
      .from("point_ledger")
      .update({ estornado: true, estornado_em: duranteASemana })
      .eq("membro_id", membro[membroA.id])
      .eq("empresa_id", empresa);

    const historico = await ranking(inicioSemana);
    expect(totalDe(historico, membro[membroA.id])).toBe(100); // válido no corte: created_at < p_ate, estornado_em > p_ate
    expect(totalDe(historico, membro[membroB.id])).toBe(40);
    expect(totalDe(historico, membro[membroA.id])).toBeGreaterThan(totalDe(historico, membro[membroB.id])); // A acima de B no corte

    const aoVivo = await ranking();
    expect(totalDe(aoVivo, membro[membroA.id])).toBe(0); // estornado agora: not estornado é falso
    expect(totalDe(aoVivo, membro[membroB.id])).toBe(40);
    expect(totalDe(aoVivo, membro[membroA.id])).toBeLessThan(totalDe(aoVivo, membro[membroB.id])); // A cai abaixo de B — queda real
  });

  it("XP já estornado antes do corte não conta nem no histórico nem no vivo", async () => {
    const corte = "2026-10-01T00:00:00Z";
    await lancar({
      membroId: membro[membroA.id],
      xp: 30,
      createdAt: "2026-09-20T00:00:00Z",
      estornado: true,
      estornadoEm: "2026-09-22T00:00:00Z", // antes do corte
    });

    const historico = await ranking(corte);
    const aoVivo = await ranking();
    expect(historico.find((l) => l.membro_id === membro[membroA.id] && l.total_xp === 30)).toBeUndefined();
    expect(aoVivo.find((l) => l.membro_id === membro[membroA.id] && l.total_xp === 30)).toBeUndefined();
  });

  it("XP criado depois do corte não conta no histórico, mas conta ao vivo", async () => {
    const corte = "2026-10-01T00:00:00Z";

    const historicoAntes = totalDe(await ranking(corte), membro[membroB.id]);
    const aoVivoAntes = totalDe(await ranking(), membro[membroB.id]);

    await lancar({ membroId: membro[membroB.id], xp: 15, createdAt: "2026-10-02T00:00:00Z" }); // depois do corte

    const historicoDepois = totalDe(await ranking(corte), membro[membroB.id]);
    const aoVivoDepois = totalDe(await ranking(), membro[membroB.id]);

    expect(historicoDepois).toBe(historicoAntes); // created_at >= p_ate: não entra no histórico
    expect(aoVivoDepois).toBe(aoVivoAntes + 15); // entra normalmente no estado ao vivo
  });

  it("ausência de corte (p_ate null) preserva exatamente o comportamento atual (not estornado)", async () => {
    const semCorte = await ranking();
    const { data: ativos } = await servico
      .from("point_ledger")
      .select("xp")
      .eq("membro_id", membro[membroA.id])
      .eq("empresa_id", empresa)
      .eq("estornado", false);
    const somaAtiva = (ativos ?? []).reduce((acc, l) => acc + l.xp, 0);
    expect(totalDe(semCorte, membro[membroA.id])).toBe(somaAtiva);
  });

  it("isolamento por empresa: lançamento de outra empresa nunca aparece no histórico desta", async () => {
    const outroAdmin = await criarUsuario("rh-outra-empresa-admin");
    const { data: outraEmpresa } = await servico.from("empresas").insert({ nome: `Ranking histórico outra empresa ${sufixo}` }).select("id").single();
    await servico.from("empresa_membros").insert({ empresa_id: outraEmpresa!.id, user_id: outroAdmin.id, papel: "admin" });
    const { data: vinculoOutra } = await servico
      .from("empresa_membros")
      .insert({ empresa_id: outraEmpresa!.id, user_id: membroA.id, papel: "vendedor", perfil_gamificacao: "closer" })
      .select("id")
      .single();

    await lancar({ membroId: vinculoOutra!.id, xp: 999, createdAt: "2026-09-20T00:00:00Z" });

    const { data, error } = await outroAdmin.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "closer", p_ate: "2026-10-01T00:00:00Z" });
    expect(error).toBeNull();
    expect(data!.find((l) => l.total_xp === 999)).toBeUndefined();
  });

  it("isolamento por perfil (SDR/Closer): XP lançado com profile_at_event diferente não entra no histórico do outro perfil", async () => {
    const corte = "2026-10-01T00:00:00Z";
    await lancar({ membroId: membro[membroB.id], xp: 777, createdAt: "2026-09-20T00:00:00Z", perfil: "sdr" });

    const historicoCloser = await ranking(corte, "closer");
    const historicoSdr = await ranking(corte, "sdr");
    expect(historicoCloser.find((l) => l.total_xp === 777)).toBeUndefined();
    expect(historicoSdr.find((l) => l.membro_id === membro[membroB.id] && l.total_xp === 777)).toBeDefined();
  });

  it("admin/gestor seguem excluídos do histórico, mesmo com XP lançado no período", async () => {
    const corte = "2026-10-01T00:00:00Z";
    await lancar({ membroId: membro[admin.id], xp: 500, createdAt: "2026-09-20T00:00:00Z" });

    const historico = await ranking(corte);
    expect(historico.find((l) => l.membro_id === membro[admin.id])).toBeUndefined();
  });
});
