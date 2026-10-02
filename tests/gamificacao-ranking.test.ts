/**
 * Fecha o bloco "Ranking por perfil" (Evandro, 2026-10-02) com escopo mínimo, depois da
 * auditoria read-only que encontrou a separação por perfil já construída na #116
 * (`ranking_gamificacao` filtra por `point_ledger.profile_at_event`), mas duas lacunas
 * reais: nenhum teste exercitando a troca de perfil no meio do período através da própria
 * função de ranking, e nenhum teste direto da autorização cross-empresa/membro inativo
 * (a auditoria não achou falha no código — `membro_ativo(p_empresa_id)` já checa o membro
 * que está chamando a função contra a empresa recebida como parâmetro — mas sem cobertura).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let colab: Usuario;
let empresa: string;
const membro: Record<string, string> = {};

beforeAll(async () => {
  [admin, colab] = await Promise.all(["rk-admin", "rk-colab"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Ranking perfil ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: colab.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;
});

async function criarRegra(eventoTipo: string, xp: number) {
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({ empresa_id: empresa, nome: eventoTipo, evento_tipo: eventoTipo, xp, moedas: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function emitirEvento(tipo: string) {
  const { data, error } = await servico
    .from("eventos")
    .insert({ empresa_id: empresa, tipo, ator_id: colab.id, entidade: "negocio", entidade_id: randomUUID() })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

describe("ranking_gamificacao: troca de perfil no meio do período", () => {
  it("XP ganho como SDR fica só no ranking de SDR; XP ganho depois como Closer fica só no de Closer", async () => {
    // Colab começa como sdr (criado no beforeAll) e ganha XP nesse perfil.
    await criarRegra("rk.evento-sdr", 50);
    await emitirEvento("rk.evento-sdr");

    // Promovido a closer no meio do período — eventos antigos não são reinterpretados
    // (profile_at_event já está congelado no lançamento anterior).
    await servico.from("empresa_membros").update({ perfil_gamificacao: "closer" }).eq("id", membro[colab.id]);

    await criarRegra("rk.evento-closer", 70);
    await emitirEvento("rk.evento-closer");

    const { data: rankingSdr, error: erroSdr } = await colab.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    const { data: rankingCloser, error: erroCloser } = await colab.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "closer" });
    expect(erroSdr).toBeNull();
    expect(erroCloser).toBeNull();

    const linhaSdr = rankingSdr!.find((r) => r.membro_id === membro[colab.id]);
    const linhaCloser = rankingCloser!.find((r) => r.membro_id === membro[colab.id]);

    // Cada ranking só soma o que foi ganho naquele perfil — sem o XP do outro perfil
    // misturado, e sem o XP somado em dobro em nenhum dos dois.
    expect(linhaSdr!.total_xp).toBe(50);
    expect(linhaCloser!.total_xp).toBe(70);
  });
});

describe("ranking_gamificacao: autorização", () => {
  let outraEmpresa: string;
  let membroOutraEmpresa: Usuario;

  beforeAll(async () => {
    membroOutraEmpresa = await criarUsuario("rk-outra-empresa");
    const { data: emp } = await servico.from("empresas").insert({ nome: `Ranking perfil outra empresa ${sufixo}` }).select("id").single();
    outraEmpresa = emp!.id;
    await servico.from("empresa_membros").insert({ empresa_id: outraEmpresa, user_id: membroOutraEmpresa.id, papel: "admin" });
  });

  it("membro de outra empresa não consegue ler o ranking desta empresa (lista vazia, sem erro)", async () => {
    const { data, error } = await membroOutraEmpresa.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("quem não é membro de nenhuma empresa não lê ranking de ninguém", async () => {
    const semEmpresa = await criarUsuario("rk-sem-empresa");
    const { data, error } = await semEmpresa.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("membro desativado desta empresa deixa de conseguir ler o próprio ranking", async () => {
    await servico.from("empresa_membros").update({ status: "inativo" }).eq("id", membro[colab.id]);

    const { data, error } = await colab.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "closer" });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Restaura — status fica lido por `membro_ativo` em qualquer chamada futura
    // dentro deste arquivo (apesar de nenhum outro teste depender disso hoje).
    await servico.from("empresa_membros").update({ status: "ativo" }).eq("id", membro[colab.id]);
  });
});
