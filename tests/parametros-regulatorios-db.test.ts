/**
 * Configuração da calculadora (M2 P0, revisão GD II): o Fio B e a disponibilidade da EMPRESA saíram da edição — a
 * estimativa usa a regra legal (Lei 14.300, art. 27; REN 1.000, art. 291). A Server Action real `editarParametros`
 * (só a sessão é substituída) grava a produtividade e os custos e IGNORA esses campos, mesmo num formulário forjado.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Usuario } from "./ajuda";

const sessao = vi.hoisted(() => ({
  usuario: null as unknown as { cliente: unknown },
  atual: null as unknown as { empresaId: string; membroId: string; papel: string },
}));
vi.mock("@/lib/sessao", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(sessao.atual.papel)) throw new Error("sem permissão");
    return { atual: sessao.atual };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => sessao.usuario.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { editarParametros } = await import("@/lib/acoes/calculadora");
const { criarUsuario, servico, sufixo } = await import("./ajuda");

let admin: Usuario;
let empresa: string;

beforeAll(async () => {
  admin = await criarUsuario("param-admin");
  const { data: e } = await servico.from("empresas").insert({ nome: `Parâmetros ${sufixo}` }).select("id").single();
  empresa = e!.id;
  const { data: m } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" }).select("id").single();
  sessao.usuario = admin;
  sessao.atual = { empresaId: empresa, membroId: m!.id, papel: "admin" };
});

describe("editarParametros", () => {
  it("grava produtividade e custos; Fio B e disponibilidade enviados à força são ignorados", async () => {
    const colunas = "produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_mono_kwh, disponibilidade_bi_kwh, disponibilidade_tri_kwh, custo_engenharia";
    const { data: antes } = await servico.from("parametros_calculadora").select(colunas).eq("empresa_id", empresa).single();
    const f = new FormData();
    for (const [k, v] of Object.entries({
      produtividade_kwh_kwp_mes: "118,5",
      percentual_fio_b: "99",
      disponibilidade_mono_kwh: "1",
      disponibilidade_bi_kwh: "2",
      disponibilidade_tri_kwh: "3",
      custo_engenharia: "1.500",
      comissao_percentual: "5",
    }))
      f.append(k, v);
    expect(await editarParametros(null, f)).toEqual({ ok: true, mensagem: "Parâmetros salvos." });
    const { data: depois } = await servico.from("parametros_calculadora").select(colunas).eq("empresa_id", empresa).single();
    expect(depois).toEqual({
      ...antes,
      produtividade_kwh_kwp_mes: 118.5,
      custo_engenharia: 1500,
    });
  });
});
