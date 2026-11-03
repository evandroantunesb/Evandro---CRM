/**
 * Configurações da empresa pelo admin (20261111100000_configuracoes_empresa_admin.sql). A RLS de `empresas` só deixa o
 * super-admin alterar; o admin muda dias para considerar parado, horas sem contato e a distribuição de leads pela função
 * `salvar_configuracoes_empresa`, só na própria empresa e só nessas colunas. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Config A/B" + sufixo, usuários "ce-*" + sufixo).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;

const COLUNAS = "nome, situacao, dias_considerado_parado, horas_considerado_sem_contato, modo_distribuicao_leads, percentual_leads_sdr";
const ler = async (emp: string) => (await servico.from("empresas").select(COLUNAS).eq("id", emp).single()).data!;

beforeAll(async () => {
  [admin, gestor, adminB] = await Promise.all(["ce-admin", "ce-gestor", "ce-admin-b"].map(criarUsuario));
  const { data: empresas, error } = await servico
    .from("empresas")
    .insert([{ nome: `Config A ${sufixo}` }, { nome: `Config B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = empresas![0].id;
  empresaB = empresas![1].id;
  const { error: erroVinculos } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ]);
  if (erroVinculos) throw erroVinculos;
});

describe("salvar_configuracoes_empresa", () => {
  it("o UPDATE direto do admin em empresas continua sem efeito (a RLS é só do super-admin)", async () => {
    const { data } = await admin.cliente.from("empresas").update({ dias_considerado_parado: 12 }).eq("id", empresa).select("id");
    expect(data ?? []).toHaveLength(0);
    expect((await ler(empresa)).dias_considerado_parado).toBe(7);
  });

  it("o admin salva cada configuração; o que não foi enviado não muda", async () => {
    const antes = await ler(empresa);
    expect((await admin.cliente.rpc("salvar_configuracoes_empresa", { p_empresa_id: empresa, p_dias_considerado_parado: 12 })).error).toBeNull();
    expect((await admin.cliente.rpc("salvar_configuracoes_empresa", { p_empresa_id: empresa, p_horas_considerado_sem_contato: 5 })).error).toBeNull();
    const { error } = await admin.cliente.rpc("salvar_configuracoes_empresa", { p_empresa_id: empresa, p_modo_distribuicao_leads: "parcial", p_percentual_leads_sdr: 30 });
    expect(error).toBeNull();
    expect(await ler(empresa)).toEqual({
      ...antes,
      dias_considerado_parado: 12,
      horas_considerado_sem_contato: 5,
      modo_distribuicao_leads: "parcial",
      percentual_leads_sdr: 30,
    });
  });

  it("gestor e admin de outra empresa não mudam; nada muda", async () => {
    const antes = await ler(empresa);
    for (const quem of [gestor, adminB]) {
      const { error } = await quem.cliente.rpc("salvar_configuracoes_empresa", { p_empresa_id: empresa, p_dias_considerado_parado: 30 });
      expect(error?.message).toContain("Só o admin");
    }
    expect(await ler(empresa)).toEqual(antes);
  });

  it("valor fora do limite é recusado pelo banco", async () => {
    const antes = await ler(empresa);
    for (const valores of [{ p_dias_considerado_parado: 0 }, { p_horas_considerado_sem_contato: 0 }, { p_percentual_leads_sdr: 101 }]) {
      const { error } = await admin.cliente.rpc("salvar_configuracoes_empresa", { p_empresa_id: empresa, ...valores });
      expect(error, JSON.stringify(valores)).not.toBeNull();
    }
    expect(await ler(empresa)).toEqual(antes);
  });

  it("a outra empresa segue com os padrões", async () => {
    expect(await ler(empresaB)).toMatchObject({ dias_considerado_parado: 7, horas_considerado_sem_contato: 3, modo_distribuicao_leads: "somente_vendedores", percentual_leads_sdr: 50 });
  });
});
