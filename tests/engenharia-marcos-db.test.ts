/**
 * Engenharia — marcos da trajetória (20261110100000_engenharia_marcos.sql): uma linha por empresa, que nasce com ela
 * no padrão (25 obras / 250 kWp). Quem é da empresa lê; só o admin muda os números; ninguém cria, apaga ou mexe na
 * linha de outra empresa. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Marcos A/B" + sufixo, usuários "em-*" + sufixo).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let operacao: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;

const marcosDe = async (emp: string) => (await servico.from("engenharia_marcos").select("obras, kwp").eq("empresa_id", emp).single()).data;

beforeAll(async () => {
  [admin, gestor, operacao, adminB] = await Promise.all(["em-admin", "em-gestor", "em-operacao", "em-admin-b"].map(criarUsuario));
  const { data: empresas, error } = await servico
    .from("empresas")
    .insert([{ nome: `Marcos A ${sufixo}` }, { nome: `Marcos B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = empresas![0].id;
  empresaB = empresas![1].id;
  const { error: erroVinculos } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: operacao.id, papel: "operacao" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (erroVinculos) throw erroVinculos;
});

describe("engenharia_marcos", () => {
  it("empresa nova nasce com o padrão, 25 obras e 250 kWp", async () => {
    expect(await marcosDe(empresa)).toEqual({ obras: 25, kwp: 250 });
    expect(await marcosDe(empresaB)).toEqual({ obras: 25, kwp: 250 });
  });

  it("quem é da empresa lê os marcos dela, e só os dela", async () => {
    for (const quem of [admin, gestor, operacao]) {
      const { data } = await quem.cliente.from("engenharia_marcos").select("empresa_id, obras, kwp");
      expect(data).toEqual([{ empresa_id: empresa, obras: 25, kwp: 250 }]);
    }
  });

  it("o admin muda os números", async () => {
    const { data, error } = await admin.cliente.from("engenharia_marcos").update({ obras: 10, kwp: 100 }).eq("empresa_id", empresa).select("obras, kwp");
    expect(error).toBeNull();
    expect(data).toEqual([{ obras: 10, kwp: 100 }]);
  });

  it("gestor e Operação não mudam; o admin de outra empresa também não", async () => {
    for (const quem of [gestor, operacao, adminB]) {
      const { data } = await quem.cliente.from("engenharia_marcos").update({ obras: 1, kwp: 1 }).eq("empresa_id", empresa).select("obras");
      expect(data ?? []).toHaveLength(0);
    }
    expect(await marcosDe(empresa)).toEqual({ obras: 10, kwp: 100 });
  });

  it("valor fora do intervalo é recusado pelo banco", async () => {
    for (const valores of [{ obras: 0 }, { kwp: 0 }, { obras: 10001 }, { kwp: 100001 }]) {
      const { error } = await admin.cliente.from("engenharia_marcos").update(valores).eq("empresa_id", empresa);
      expect(error, JSON.stringify(valores)).not.toBeNull();
    }
    expect(await marcosDe(empresa)).toEqual({ obras: 10, kwp: 100 });
  });

  it("ninguém cria, apaga nem troca a empresa da linha", async () => {
    expect((await admin.cliente.from("engenharia_marcos").insert({ empresa_id: empresa })).error).not.toBeNull();
    expect((await admin.cliente.from("engenharia_marcos").update({ empresa_id: empresaB }).eq("empresa_id", empresa)).error).not.toBeNull();
    await admin.cliente.from("engenharia_marcos").delete().eq("empresa_id", empresa);
    expect(await marcosDe(empresa)).toEqual({ obras: 10, kwp: 100 });
  });
});
