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

  // Curva de geração por mês (proposta completa, PR 4): 12 ou nenhuma; formulário sem os campos não mexe nela.
  describe("curva de geração por mês", () => {
    const CURVA = ["5,9", "5,7", "5,3", "4,6", "3,8", "3,4", "3,6", "4,5", "4,7", "5,4", "6", "6,1"];
    const form = (curva: string[] | null) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ produtividade_kwh_kwp_mes: "120", comissao_percentual: "0", icms: "19", pis_cofins: "7,63" })) f.append(k, v);
      curva?.forEach((v, i) => f.append(`curva_mes_${String(i + 1).padStart(2, "0")}`, v));
      return f;
    };
    const curvaGravada = async () =>
      (await servico.from("parametros_calculadora").select("curva_geracao_mensal").eq("empresa_id", empresa).single()).data!.curva_geracao_mensal?.map(Number) ?? null;

    it("grava os 12, mantém sem os campos e apaga com os 12 vazios", async () => {
      expect(await editarParametros(null, form(CURVA))).toEqual({ ok: true, mensagem: "Parâmetros salvos." });
      expect(await curvaGravada()).toEqual([5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1]);
      expect((await editarParametros(null, form(null)))?.ok).toBe(true);
      expect(await curvaGravada()).toHaveLength(12);
      expect((await editarParametros(null, form(Array(12).fill(""))))?.ok).toBe(true);
      expect(await curvaGravada()).toBeNull();
    });

    it("curva pela metade ou fora do intervalo: recusa com o motivo e não grava nada", async () => {
      await editarParametros(null, form(CURVA));
      expect(await editarParametros(null, form([...CURVA.slice(0, 11), ""]))).toEqual({
        ok: false,
        mensagem: "Falta 1 mês de curva de geração (Dez). Preencha os 12 ou deixe todos vazios.",
      });
      const grande = await editarParametros(null, form(["150.000", ...CURVA.slice(1)]));
      expect(grande).toMatchObject({ ok: false, mensagem: expect.stringContaining("Janeiro") });
      expect(await curvaGravada()).toEqual([5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1]);
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
