/**
 * Pontuação por tipo de negócio, com Supabase local (roda no CI): cada regra vale só para negócios do seu tipo
 * (`gamification_rules.tipo_negocio`, padrão solar), o evento grava o tipo do negócio no payload, e ligar o
 * eletroposto na empresa cria as regras padrão do eletroposto (cópia das regras ativas do solar) uma vez só.
 * Os lançamentos nascem do ganho real (`negocios.status = 'ganho'`), nunca de inserção manual no extrato.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let closer: Usuario;
let empresa: string;
let funil: string;
let etapa: string;
let contato: string;
const membro: Record<string, string> = {};

beforeAll(async () => {
  [admin, closer] = await Promise.all(["ep-admin", "ep-closer"].map(criarUsuario));
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Pontuação eletroposto ${sufixo}`, eletroposto_ativo: false }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapa = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente pontuação" }).select("id").single();
  contato = c!.id;
});

async function criarNegocio(tipo: "solar" | "eletroposto") {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, tipo, titulo: `Negócio ${tipo}`, contato_id: contato, funil_id: funil, etapa_id: etapa, responsavel_id: membro[closer.id] })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function ganhar(negocioId: string) {
  const { error } = await closer.cliente.from("negocios").update({ status: "ganho", valor: 50000 }).eq("id", negocioId);
  expect(error).toBeNull();
}

const lancamentos = async (negocioId: string) =>
  (await servico.from("point_ledger").select("regra_id, xp").eq("referencia_id", negocioId).eq("estornado", false)).data;

describe("regras por tipo de negócio", () => {
  let regraSolar: string;

  it("ligar o eletroposto copia as regras ativas do solar, uma vez só", async () => {
    const { data: regra, error } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "Negócio ganho", evento_tipo: "deal.won", xp: 30, moedas: 5, unica_por_negocio: true })
      .select("id, tipo_negocio")
      .single();
    expect(error).toBeNull();
    expect(regra!.tipo_negocio).toBe("solar");
    regraSolar = regra!.id;

    await servico.from("empresas").update({ eletroposto_ativo: true }).eq("id", empresa);
    const copias = async () =>
      (await servico.from("gamification_rules").select("nome, evento_tipo, xp, moedas, unica_por_negocio, ativa").eq("empresa_id", empresa).eq("tipo_negocio", "eletroposto")).data;
    expect(await copias()).toEqual([{ nome: "Negócio ganho (eletroposto)", evento_tipo: "deal.won", xp: 30, moedas: 5, unica_por_negocio: true, ativa: true }]);

    // Desligar e ligar de novo não duplica (nem desfaz o que o admin ajustou).
    await servico.from("empresas").update({ eletroposto_ativo: false }).eq("id", empresa);
    await servico.from("empresas").update({ eletroposto_ativo: true }).eq("id", empresa);
    expect(await copias()).toHaveLength(1);
  });

  it("negócio de eletroposto pontua só pela regra do eletroposto; o solar, só pela do solar", async () => {
    const { data: regraEletro } = await admin.cliente
      .from("gamification_rules")
      .update({ xp: 70 })
      .eq("empresa_id", empresa)
      .eq("tipo_negocio", "eletroposto")
      .select("id")
      .single();

    const eletroposto = await criarNegocio("eletroposto");
    await ganhar(eletroposto);
    const { data: evento } = await servico.from("eventos").select("payload").eq("entidade_id", eletroposto).eq("tipo", "deal.won").single();
    expect((evento!.payload as { tipo_negocio?: string }).tipo_negocio).toBe("eletroposto");
    expect(await lancamentos(eletroposto)).toEqual([{ regra_id: regraEletro!.id, xp: 70 }]);

    const solar = await criarNegocio("solar");
    await ganhar(solar);
    expect(await lancamentos(solar)).toEqual([{ regra_id: regraSolar, xp: 30 }]);
  });

  it("o admin escolhe o tipo ao criar a regra", async () => {
    const { data, error } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "Eletroposto ganho extra", evento_tipo: "deal.won", xp: 5, moedas: 0, tipo_negocio: "eletroposto" })
      .select("tipo_negocio")
      .single();
    expect(error).toBeNull();
    expect(data!.tipo_negocio).toBe("eletroposto");
  });
});
