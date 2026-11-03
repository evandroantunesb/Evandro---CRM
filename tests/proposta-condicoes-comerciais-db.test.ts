/**
 * Condições comerciais da proposta simples (D1/D2) contra o banco local: quem configura (admin e gestor), quem só lê
 * (vendedor) e quem não enxerga nada (outra empresa). Limites do banco: prazo só 7, 15 ou 30 dias; cada condição até
 * 80 caracteres; sem DELETE.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario, gestor: Usuario, vendedor: Usuario, adminOutra: Usuario;
let empresaId: string;

const tabela = (u: Usuario) => u.cliente.from("proposta_condicoes_comerciais");
const COMPLETA = { validade_dias: 15, pagamento_avista: "Pix ou transferência", pagamento_cartao: "Em até 12x", pagamento_financiamento: "Bancário" };

beforeAll(async () => {
  [admin, gestor, vendedor, adminOutra] = await Promise.all([
    criarUsuario("cond-admin"),
    criarUsuario("cond-gestor"),
    criarUsuario("cond-vend"),
    criarUsuario("cond-outra"),
  ]);
  const { data: e1 } = await servico.from("empresas").insert({ nome: `Condições ${sufixo}` }).select("id").single();
  const { data: e2 } = await servico.from("empresas").insert({ nome: `Condições outra ${sufixo}` }).select("id").single();
  empresaId = e1!.id;
  const { error } = await servico.from("empresa_membros").insert([
    { empresa_id: empresaId, user_id: admin.id, papel: "admin" },
    { empresa_id: empresaId, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresaId, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: e2!.id, user_id: adminOutra.id, papel: "admin" },
  ]);
  if (error) throw error;
});

describe("proposta_condicoes_comerciais: quem configura", () => {
  it("vendedor não cria nem altera; gestor cria; admin altera", async () => {
    expect((await tabela(vendedor).insert({ empresa_id: empresaId, ...COMPLETA })).error).not.toBeNull();

    expect((await tabela(gestor).insert({ empresa_id: empresaId, ...COMPLETA })).error).toBeNull();

    const tentativa = await tabela(vendedor).update({ pagamento_cartao: "Vendedor mudou" }).eq("empresa_id", empresaId).select("empresa_id");
    expect(tentativa.data ?? []).toHaveLength(0);

    const pelaAdmin = await tabela(admin).update({ validade_dias: 30 }).eq("empresa_id", empresaId).select("validade_dias, pagamento_cartao");
    expect(pelaAdmin.error).toBeNull();
    expect(pelaAdmin.data).toEqual([{ validade_dias: 30, pagamento_cartao: "Em até 12x" }]);
  });

  it("vendedor lê (prévia antes de emitir); outra empresa não lê nem altera", async () => {
    const lido = await tabela(vendedor).select("validade_dias").eq("empresa_id", empresaId);
    expect(lido.data).toEqual([{ validade_dias: 30 }]);

    expect((await tabela(adminOutra).select("empresa_id").eq("empresa_id", empresaId)).data ?? []).toHaveLength(0);
    const alheio = await tabela(adminOutra).update({ validade_dias: 7 }).eq("empresa_id", empresaId).select("empresa_id");
    expect(alheio.data ?? []).toHaveLength(0);
    expect((await tabela(adminOutra).insert({ empresa_id: empresaId, ...COMPLETA })).error).not.toBeNull();
  });

  it("o banco só aceita 7, 15 ou 30 dias e condições de até 80 caracteres", async () => {
    for (const validade_dias of [0, 10, 31]) {
      expect((await tabela(admin).update({ validade_dias }).eq("empresa_id", empresaId)).error, String(validade_dias)).not.toBeNull();
    }
    expect((await tabela(admin).update({ pagamento_avista: "x".repeat(81) }).eq("empresa_id", empresaId)).error).not.toBeNull();
    expect((await tabela(admin).update({ pagamento_avista: "   " }).eq("empresa_id", empresaId)).error).not.toBeNull();
    // Nulo é permitido: limpa o campo e a emissão fica bloqueada até completar.
    expect((await tabela(admin).update({ pagamento_avista: null }).eq("empresa_id", empresaId)).error).toBeNull();
  });

  it("ninguém apaga a configuração (sem política de DELETE)", async () => {
    const apagado = await tabela(admin).delete().eq("empresa_id", empresaId).select("empresa_id");
    expect(apagado.data ?? []).toHaveLength(0);
    expect((await servico.from("proposta_condicoes_comerciais").select("empresa_id").eq("empresa_id", empresaId)).data).toHaveLength(1);
  });
});
