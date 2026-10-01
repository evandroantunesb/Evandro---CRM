/** Gatilho do status técnico do catálogo (migration 20261001050000) e RLS da coluna nova. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;

const MODULO_COMPLETO = { voc_v: 48.96, vmp_v: 40.74, isc_a: 16.12, imp_a: 15.22, coef_temp_voc_pct_c: -0.25 };

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["status-adm", "status-vend"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Status técnico ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
  ]);
});

async function inserir(modelo: string, extra: Partial<Database["public"]["Tables"]["equipamentos_empresa"]["Insert"]>) {
  const { data, error } = await admin.cliente
    .from("equipamentos_empresa")
    .insert({ empresa_id: empresa, tipo: "modulo", fabricante: "Teste", modelo, potencia_w: 600, ...extra })
    .select("id, status_tecnico")
    .single();
  expect(error).toBeNull();
  return data!;
}

describe("status_tecnico de equipamentos_empresa", () => {
  it("sem dados técnicos fica incompleto; com dados completos vira completo", async () => {
    expect((await inserir("SEM-DADOS", {})).status_tecnico).toBe("incompleto");
    expect((await inserir("COMPLETO", MODULO_COMPLETO)).status_tecnico).toBe("completo");
  });

  it("verificado sem dados completos volta pra incompleto; descontinuado vale sempre", async () => {
    expect((await inserir("VERIF-SEM", { status_tecnico: "verificado" })).status_tecnico).toBe("incompleto");
    expect((await inserir("DESC", { status_tecnico: "descontinuado" })).status_tecnico).toBe("descontinuado");
  });

  it("preencher os dados depois promove incompleto pra completo e preserva verificado", async () => {
    const { id } = await inserir("PROMOVE", {});
    const { data } = await admin.cliente
      .from("equipamentos_empresa")
      .update(MODULO_COMPLETO)
      .eq("id", id)
      .select("status_tecnico")
      .single();
    expect(data!.status_tecnico).toBe("completo");

    await admin.cliente.from("equipamentos_empresa").update({ status_tecnico: "verificado" }).eq("id", id);
    const { data: depois } = await admin.cliente
      .from("equipamentos_empresa")
      .update({ prioridade: 5 })
      .eq("id", id)
      .select("status_tecnico")
      .single();
    expect(depois!.status_tecnico).toBe("verificado");
  });

  it("vendedor vê o status mas não consegue alterar", async () => {
    const { id } = await inserir("RLS", MODULO_COMPLETO);
    const { data: visto } = await vendedor.cliente.from("equipamentos_empresa").select("status_tecnico").eq("id", id).single();
    expect(visto!.status_tecnico).toBe("completo");

    await vendedor.cliente.from("equipamentos_empresa").update({ status_tecnico: "descontinuado" }).eq("id", id);
    const { data } = await servico.from("equipamentos_empresa").select("status_tecnico").eq("id", id).single();
    expect(data!.status_tecnico).toBe("completo");
  });
});
