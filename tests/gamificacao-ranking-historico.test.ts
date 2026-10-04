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
 * `point_ledger` só pode ser escrito pelas próprias funções do motor (insert/update
 * revogados até de `service_role` em `20260926100000_gamificacao_pontos.sql`) — por
 * isso todo XP aqui é gerado pelo pipeline real (`eventos` → `aplicar_regras_gamificacao`,
 * ou negócio ganho/reaberto → `estornar_lancamentos_evento`), nunca por insert direto.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let membroA: Usuario;
let membroB: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let contato: string;
const membro: Record<string, string> = {};

beforeAll(async () => {
  [admin, membroA, membroB] = await Promise.all(["rh-admin", "rh-a", "rh-b"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Ranking histórico ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: membroA.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: membroB.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente ranking histórico", telefone: "45999992222" }).select("id").single();
  contato = c!.id;

  // Regra padrão de deal.won usada pelos cenários que precisam de estorno real
  // (reabrir um negócio ganho estorna automaticamente o XP daquele negócio).
  await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome: "Venda (ranking histórico)", evento_tipo: "deal.won", xp: 100, moedas: 0 });
});

async function criarEGanharNegocio(titulo: string, responsavelUsuario: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro[responsavelUsuario.id] })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await responsavelUsuario.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id as string;
}

async function reabrirNegocio(negocioId: string, responsavelUsuario: Usuario) {
  const { error } = await responsavelUsuario.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
  if (error) throw error;
}

async function criarRegraGenerica(nome: string, tipo: string, xp: number) {
  const { error } = await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome, evento_tipo: tipo, xp, moedas: 0 });
  if (error) throw error;
}

async function emitirEventoGenerico(tipo: string, atorUserId: string) {
  const { error } = await servico.from("eventos").insert({ empresa_id: empresa, tipo, ator_id: atorUserId, entidade: "teste", entidade_id: randomUUID() });
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
    // A ganha 2 negócios (200 XP) antes do corte — fica acima de B, que ganhou 1 (100 XP).
    const negocioA1 = await criarEGanharNegocio("Venda A1", membroA);
    const negocioA2 = await criarEGanharNegocio("Venda A2", membroA);
    await criarEGanharNegocio("Venda B1", membroB);

    const corte = new Date().toISOString();

    // Depois do corte, A reabre os 2 negócios — o estorno automático (deal.won) zera o
    // XP ao vivo de A, mas created_at (antes do corte) e estornado_em (depois) preservam
    // a validade histórica no instante do corte.
    await reabrirNegocio(negocioA1, membroA);
    await reabrirNegocio(negocioA2, membroA);

    const historico = await ranking(corte);
    expect(totalDe(historico, membro[membroA.id])).toBe(200); // válido no corte
    expect(totalDe(historico, membro[membroB.id])).toBe(100);
    expect(totalDe(historico, membro[membroA.id])).toBeGreaterThan(totalDe(historico, membro[membroB.id])); // A acima de B no corte

    const aoVivo = await ranking();
    expect(totalDe(aoVivo, membro[membroA.id])).toBe(0); // estornado agora: not estornado é falso
    expect(totalDe(aoVivo, membro[membroB.id])).toBe(100);
    expect(totalDe(aoVivo, membro[membroA.id])).toBeLessThan(totalDe(aoVivo, membro[membroB.id])); // queda real de posição
  });

  it("XP já estornado antes do corte não conta nem no histórico nem no vivo", async () => {
    // Membro novo e isolado: o teste anterior já estorna negócios de A depois do corte
    // dele, então o `estornado_em` daquele estorno já existe no passado relativo a UM
    // NOVO corte capturado aqui — reaproveitar A/B mediria também aquele estorno antigo,
    // não só o lançamento deste teste. Com um membro novo, o único lançamento possível
    // é o criado e estornado abaixo, ambos antes deste corte.
    const membroC = await criarUsuario("rh-c");
    const { data: vinculo } = await servico
      .from("empresa_membros")
      .insert({ empresa_id: empresa, user_id: membroC.id, papel: "vendedor", perfil_gamificacao: "closer" })
      .select("id")
      .single();
    membro[membroC.id] = vinculo!.id as string;

    const negocio = await criarEGanharNegocio("Venda estornada antes do corte", membroC);
    await reabrirNegocio(negocio, membroC); // estorno antes do corte abaixo

    const corte = new Date().toISOString();

    const historico = await ranking(corte);
    const aoVivo = await ranking();
    expect(totalDe(historico, membro[membroC.id])).toBe(0); // estornado_em < corte: não conta nem no histórico
    expect(totalDe(aoVivo, membro[membroC.id])).toBe(0);
  });

  it("XP criado depois do corte não conta no histórico, mas conta ao vivo", async () => {
    const corte = new Date().toISOString();
    const historicoAntes = totalDe(await ranking(corte), membro[membroB.id]);
    const aoVivoAntes = totalDe(await ranking(), membro[membroB.id]);

    await criarEGanharNegocio("Venda B2 (depois do corte)", membroB); // created_at > corte

    const historicoDepois = totalDe(await ranking(corte), membro[membroB.id]);
    const aoVivoDepois = totalDe(await ranking(), membro[membroB.id]);

    expect(historicoDepois).toBe(historicoAntes); // created_at >= p_ate: não entra no histórico
    expect(aoVivoDepois).toBe(aoVivoAntes + 100); // entra normalmente no estado ao vivo
  });

  it("ausência de corte (p_ate null) preserva exatamente o comportamento atual (not estornado)", async () => {
    const semCorte = await ranking();
    const { data: ativos } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[membroA.id]).eq("empresa_id", empresa).eq("estornado", false);
    const somaAtiva = (ativos ?? []).reduce((acc, l) => acc + l.xp, 0);
    expect(totalDe(semCorte, membro[membroA.id])).toBe(somaAtiva);
  });

  it("isolamento por empresa: lançamento de outra empresa nunca aparece no histórico desta", async () => {
    const outroAdmin = await criarUsuario("rh-outra-empresa-admin");
    const { data: outraEmpresa } = await servico.from("empresas").insert({ nome: `Ranking histórico outra empresa ${sufixo}` }).select("id").single();
    await servico.from("empresa_membros").insert({ empresa_id: outraEmpresa!.id, user_id: outroAdmin.id, papel: "vendedor", perfil_gamificacao: "closer" });
    await outroAdmin.cliente.from("gamification_rules").insert({ empresa_id: outraEmpresa!.id, nome: "Regra outra empresa", evento_tipo: "rh.outra-empresa", xp: 999, moedas: 0 });
    await servico.from("eventos").insert({ empresa_id: outraEmpresa!.id, tipo: "rh.outra-empresa", ator_id: outroAdmin.id, entidade: "teste", entidade_id: randomUUID() });

    const corteFuturo = new Date(Date.now() + 86_400_000).toISOString();
    const { data, error } = await admin.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "closer", p_ate: corteFuturo });
    expect(error).toBeNull();
    expect(data!.find((l) => l.total_xp === 999)).toBeUndefined();
  });

  it("isolamento por perfil (SDR/Closer): XP lançado com profile_at_event diferente não entra no histórico do outro perfil", async () => {
    await servico.from("empresa_membros").update({ perfil_gamificacao: "sdr" }).eq("id", membro[membroB.id]);
    await criarRegraGenerica("Regra genérica SDR", "rh.evento-sdr", 777);
    await emitirEventoGenerico("rh.evento-sdr", membroB.id); // profile_at_event = 'sdr' (perfil atual de B no momento)
    await servico.from("empresa_membros").update({ perfil_gamificacao: "closer" }).eq("id", membro[membroB.id]); // restaura

    const corteFuturo = new Date(Date.now() + 86_400_000).toISOString();
    const historicoCloser = await ranking(corteFuturo, "closer");
    const historicoSdr = await ranking(corteFuturo, "sdr");
    expect(historicoCloser.find((l) => l.total_xp === 777)).toBeUndefined();
    expect(historicoSdr.find((l) => l.membro_id === membro[membroB.id] && l.total_xp === 777)).toBeDefined();
  });

  it("admin/gestor seguem excluídos do histórico, mesmo com XP lançado no período", async () => {
    await criarRegraGenerica("Regra genérica admin", "rh.evento-admin", 500);
    await emitirEventoGenerico("rh.evento-admin", admin.id); // admin tem perfil_gamificacao='closer', papel='admin'

    const corteFuturo = new Date(Date.now() + 86_400_000).toISOString();
    const historico = await ranking(corteFuturo);
    expect(historico.find((l) => l.membro_id === membro[admin.id])).toBeUndefined();
  });
});
