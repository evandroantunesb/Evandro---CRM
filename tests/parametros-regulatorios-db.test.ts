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
      icms: "19",
      pis_cofins: "7,63",
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

  // Tributos da conta de luz (método v2, PR 2b-2): o admin informa em %; gravados como fração, nos limites do banco.
  const formulario = (tributos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ produtividade_kwh_kwp_mes: "118,5", comissao_percentual: "5", ...tributos })) f.append(k, v);
    return f;
  };
  const tributosGravados = async () =>
    (await servico.from("parametros_calculadora").select("icms, pis_cofins").eq("empresa_id", empresa).single()).data;

  it("grava ICMS e PIS/Cofins informados em % como fração", async () => {
    expect(await editarParametros(null, formulario({ icms: "18", pis_cofins: "8,12" }))).toEqual({ ok: true, mensagem: "Parâmetros salvos." });
    expect(await tributosGravados()).toEqual({ icms: 0.18, pis_cofins: 0.0812 });
  });

  it("recusa tributo vazio, fora do limite do banco ou com soma de 60% ou mais, sem gravar nada", async () => {
    const antes = await tributosGravados();
    for (const [tributos, mensagem] of [
      [{ icms: "", pis_cofins: "7,63" }, "Informe o ICMS."],
      [{ icms: "19" }, "Informe o PIS/Cofins."],
      [{ icms: "50", pis_cofins: "7,63" }, "O ICMS precisa ficar abaixo de 50%."],
      [{ icms: "19", pis_cofins: "30" }, "O PIS/Cofins precisa ficar abaixo de 30%."],
      [{ icms: "-1", pis_cofins: "7,63" }, "ICMS inválido."],
      [{ icms: "45", pis_cofins: "20" }, "ICMS e PIS/Cofins somados precisam ficar abaixo de 60%."],
    ] as const) {
      expect(await editarParametros(null, formulario(tributos))).toEqual({ ok: false, mensagem });
    }
    expect(await tributosGravados()).toEqual(antes);
  });
});
