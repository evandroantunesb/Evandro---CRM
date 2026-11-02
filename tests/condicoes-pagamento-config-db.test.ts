/**
 * Condições de pagamento — configuração da empresa (20261102180000_condicoes_pagamento_config.sql): admin e gestor
 * gravam descontos, Personalizado e parcelas/taxas; vendedor só lê; outra empresa não vê; a troca da tabela de um meio
 * é tudo ou nada e vazia deixa o meio indisponível; limites de percentual e de parcelas valem no banco.
 * Precisa do Supabase local (roda no CI).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { lerTaxasDoFormulario, preferenciasDaEmpresa } from "@/lib/condicoes-pagamento";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let empresa: string;

beforeAll(async () => {
  [admin, gestor, vendedor, adminB] = await Promise.all(["cp-admin", "cp-gestor", "cp-vendedor", "cp-admin-b"].map(criarUsuario));
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Condições A ${sufixo}` }, { nome: `Condições B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    { empresa_id: emps![1].id, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
});

const salvarTaxas = (u: Usuario, meio: string, taxas: unknown) =>
  u.cliente.rpc("salvar_taxas_parcelamento", { p_empresa_id: empresa, p_meio: meio, p_taxas: taxas as never });
const taxasDe = async (u: Usuario, meio: string) => {
  const { data } = await u.cliente.from("taxas_parcelamento").select("parcelas, taxa_percentual").eq("empresa_id", empresa).eq("meio", meio).order("parcelas");
  return (data ?? []).map((t) => [t.parcelas, Number(t.taxa_percentual)]);
};

describe("condições de pagamento: preferências", { concurrent: false, shuffle: false }, () => {
  it("sem linha: padrão de 0% sem aprovação e Personalizado disponível", () => {
    expect(preferenciasDaEmpresa(null)).toEqual({ descontoMaxVendedor: 0, descontoMaxGestor: 0, personalizadoAtivo: true });
  });

  it("gestor grava; vendedor lê mas não altera; outra empresa não vê", async () => {
    const { error } = await gestor.cliente
      .from("condicoes_pagamento_preferencias")
      .upsert({ empresa_id: empresa, desconto_max_vendedor: 5, desconto_max_gestor: 10, personalizado_ativo: false }, { onConflict: "empresa_id" });
    expect(error).toBeNull();

    const { data: lido } = await vendedor.cliente.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor, atualizado_por").eq("empresa_id", empresa).single();
    expect(Number(lido!.desconto_max_vendedor)).toBe(5);

    const tentativa = await vendedor.cliente.from("condicoes_pagamento_preferencias").update({ desconto_max_vendedor: 50 }).eq("empresa_id", empresa).select("id");
    expect(tentativa.data ?? []).toHaveLength(0);
    const { data: depois } = await servico.from("condicoes_pagamento_preferencias").select("desconto_max_vendedor").eq("empresa_id", empresa).single();
    expect(Number(depois!.desconto_max_vendedor)).toBe(5);

    const { data: deOutra } = await adminB.cliente.from("condicoes_pagamento_preferencias").select("id").eq("empresa_id", empresa);
    expect(deOutra).toEqual([]);
  });

  it("percentual fora de 0 a 100 é recusado pelo banco", async () => {
    const { error } = await admin.cliente.from("condicoes_pagamento_preferencias").update({ desconto_max_gestor: 120 }).eq("empresa_id", empresa);
    expect(error?.code).toBe("23514");
  });
});

describe("condições de pagamento: parcelas e taxas", { concurrent: false, shuffle: false }, () => {
  it("admin salva o cartão; salvar de novo troca a tabela inteira", async () => {
    expect((await salvarTaxas(admin, "cartao", [{ parcelas: 1, taxa: 3.2 }, { parcelas: 12, taxa: 14.5 }])).error).toBeNull();
    expect(await taxasDe(vendedor, "cartao")).toEqual([[1, 3.2], [12, 14.5]]);
    expect((await salvarTaxas(gestor, "cartao", [{ parcelas: 2, taxa: 4 }])).error).toBeNull();
    expect(await taxasDe(vendedor, "cartao")).toEqual([[2, 4]]);
  });

  it("lista vazia deixa o meio indisponível, sem mexer no outro", async () => {
    expect((await salvarTaxas(admin, "boleto", [{ parcelas: 3, taxa: 0 }])).error).toBeNull();
    expect((await salvarTaxas(admin, "boleto", [])).error).toBeNull();
    expect(await taxasDe(admin, "boleto")).toEqual([]);
    expect(await taxasDe(admin, "cartao")).toEqual([[2, 4]]);
  });

  it("parcela fora de 1 a 24 ou repetida: nada muda (tudo ou nada)", async () => {
    expect((await salvarTaxas(admin, "cartao", [{ parcelas: 1, taxa: 2 }, { parcelas: 25, taxa: 2 }])).error).not.toBeNull();
    expect((await salvarTaxas(admin, "cartao", [{ parcelas: 3, taxa: 2 }, { parcelas: 3, taxa: 5 }])).error).not.toBeNull();
    expect(await taxasDe(admin, "cartao")).toEqual([[2, 4]]);
  });

  it("vendedor e admin de outra empresa não salvam", async () => {
    for (const u of [vendedor, adminB]) {
      const { error } = await salvarTaxas(u, "cartao", []);
      expect(error?.message).toMatch(/Só admin ou gestor/);
    }
    expect(await taxasDe(admin, "cartao")).toEqual([[2, 4]]);
  });
});

describe("leitura do formulário de taxas", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("só as parcelas marcadas, com vírgula ou ponto", () => {
    expect(lerTaxasDoFormulario(formulario({ disponivel_1: "on", taxa_1: "3,5", taxa_2: "9", disponivel_10: "on", taxa_10: "12.25" }))).toEqual({
      ok: true,
      taxas: [{ parcelas: 1, taxa: 3.5 }, { parcelas: 10, taxa: 12.25 }],
    });
  });

  it("taxa vazia é 0; taxa inválida aponta a parcela", () => {
    expect(lerTaxasDoFormulario(formulario({ disponivel_1: "on", taxa_1: "" }))).toEqual({ ok: true, taxas: [{ parcelas: 1, taxa: 0 }] });
    const r = lerTaxasDoFormulario(formulario({ disponivel_6: "on", taxa_6: "abc" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.mensagem).toMatch(/^6x/);
  });
});
