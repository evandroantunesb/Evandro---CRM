/**
 * Contrato com Supabase local (roda no CI): geração e mudança de status pelo mesmo núcleo das
 * ações (`@/lib/contratos-geracao`), com o cliente autenticado do vendedor (RLS real).
 * Cobre: geração completa, bloqueio de campo usado sem dado (não essencial incluído), bloqueio
 * de status com texto incompleto (contrato antigo) e de modelo antigo inválido.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { atualizarStatusContratoComCliente, gerarContratoComCliente } from "@/lib/contratos-geracao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapa: string;

const MODELO =
  "CONTRATO entre {{empresa_nome}} e {{cliente_nome}}, CPF {{cliente_documento}}.\nValor: {{negocio_valor}}.\nItens:\n{{kit_itens}}\nVendedor: {{vendedor_nome}}.";

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["ct-admin", "ct-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Contrato ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: v, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  if (error) throw error;
  for (const l of v!) membro[l.user_id] = l.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;

  const { error: erroModelo } = await admin.cliente.from("modelos_contrato").upsert({ empresa_id: empresa, conteudo: MODELO });
  if (erroModelo) throw erroModelo;
});

async function negocio(titulo: string, contato: Record<string, string | null> = {}) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente ${titulo}`, documento: "123.456.789-09", ...contato })
    .select("id")
    .single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membro[vendedor.id], valor: 25000 })
    .select("id")
    .single();
  if (error) throw error;
  await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: n!.id, tipo: "modulo", descricao: "Módulo 550 W", quantidade: 10, ordem: 0 });
  return n!.id;
}

const gerar = (negocioId: string) =>
  gerarContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, { empresaId: empresa, membroId: membro[vendedor.id], negocioId });
const status = (negocioId: string, novo: "rascunho" | "aguardando_assinatura" | "assinado") =>
  atualizarStatusContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, { membroId: membro[vendedor.id], negocioId, status: novo });
const contrato = async (negocioId: string) =>
  (await servico.from("contratos").select("conteudo, status").eq("negocio_id", negocioId).maybeSingle()).data;

describe("contrato com RLS real", () => {
  it("gera com todos os campos preenchidos e envia para assinatura", async () => {
    const id = await negocio("Completo");
    expect(await gerar(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
    const c = await contrato(id);
    expect(c!.conteudo).toContain("Cliente Completo");
    expect(c!.conteudo).toContain("10 × Módulo 550 W");
    expect(c!.conteudo).not.toContain("{{");
    expect(c!.conteudo).not.toContain("—");

    expect((await status(id, "aguardando_assinatura")).ok).toBe(true);
    expect((await contrato(id))!.status).toBe("aguardando_assinatura");
  });

  it("campo usado no modelo e sem dado bloqueia a geração (inclusive não essencial) e diz qual falta", async () => {
    const id = await negocio("Sem CPF", { documento: null });
    const r = await gerar(id);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("CPF/CNPJ do cliente");
    expect(await contrato(id)).toBeNull();
  });

  it("contrato antigo com campo sem resolver ou chave isolada não vai para assinatura", async () => {
    for (const sobra of ["{{cliente_nom}}", "texto }}"]) {
      const id = await negocio(`Antigo ${sobra}`);
      expect((await gerar(id)).ok).toBe(true);
      // Simula contrato gerado antes da validação (texto gravado direto, só no banco local).
      await servico.from("contratos").update({ conteudo: `Contrato antigo ${sobra}` }).eq("negocio_id", id);
      const r = await status(id, "aguardando_assinatura");
      expect(r.ok, sobra).toBe(false);
      expect((await contrato(id))!.status).toBe("rascunho");
    }
  });

  it("modelo antigo inválido (salvo antes da validação) não gera contrato", async () => {
    const id = await negocio("Modelo antigo");
    await servico.from("modelos_contrato").update({ conteudo: "Cliente {{cliente_nom}}" }).eq("empresa_id", empresa);
    const r = await gerar(id);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("campos inválidos");
    expect(await contrato(id)).toBeNull();
  });
});
