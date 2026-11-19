/**
 * Item 5, opção A (20261218100000_potencia_equipamentos.sql) com Supabase local: a tabela de preços e a lista de
 * equipamentos gravam a potência. Material novo nasce com ela; o que já existe só é completado se estiver sem (a
 * cadastrada fica). A lista não mexe em preço. Mesmas pessoas da tabela de preços.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "compras-precos";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let admin: Usuario, vendedor: Usuario, adminB: Usuario;
let empresa: string, empresaB: string;
let semPotencia: string, comPotencia: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function enviar(quem: Usuario) {
  const caminho = `${empresa}/${randomUUID()}-tabela.xlsx`;
  ok(await quem.cliente.storage.from(BUCKET).upload(caminho, new Blob(["planilha"], { type: XLSX }), { contentType: XLSX }), "upload");
  return caminho;
}

const importar = (quem: Usuario, caminho: string, itens: unknown[]) =>
  quem.cliente.rpc("importar_tabela_precos", {
    p_empresa_id: empresa,
    p_fornecedor: "Solar Potência",
    p_data_tabela: hoje(),
    p_caminho: caminho,
    p_nome_arquivo: "tabela.xlsx",
    p_linhas_lidas: itens.length + 1,
    p_ignoradas: 1,
    p_mapa: { cabecalho: 0, material: 1, codigo: null, unidade: null, preco: 2, potencia: 3 },
    p_itens: itens,
  } as never);

const lista = (quem: Usuario, itens: unknown[], emp = empresa) =>
  quem.cliente.rpc("importar_lista_equipamentos", { p_empresa_id: emp, p_itens: itens } as never);

const potencia = async (id: string) => (await servico.from("compras_materiais").select("potencia_w").eq("id", id).single()).data!.potencia_w;
const porNome = async (nome: string) =>
  (await servico.from("compras_materiais").select("id, categoria, potencia_w").eq("empresa_id", empresa).ilike("nome", nome).maybeSingle()).data;

beforeAll(async () => {
  [admin, vendedor, adminB] = await Promise.all(["pot-admin", "pot-vend", "pot-adminb"].map(criarUsuario));
  const { data: e } = await servico.from("empresas").insert({ nome: `Potência ${sufixo}` }).select("id").single();
  empresa = e!.id;
  const { data: eB } = await servico.from("empresas").insert({ nome: `Potência B ${sufixo}` }).select("id").single();
  empresaB = eB!.id;
  ok(
    await servico.from("empresa_membros").insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
      { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
    ]),
    "membros",
  );
  semPotencia = ok(await admin.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Módulo Jinko 620W", p_categoria: "modulos", p_unidade: "un" }), "m1").data as string;
  comPotencia = ok(
    await admin.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Módulo Canadian 575W", p_categoria: "modulos", p_unidade: "un", p_potencia_w: 575 }),
    "m2",
  ).data as string;
});

describe("tabela de preços com potência", () => {
  it("completa quem está sem, mantém a cadastrada, cria o novo com potência e conta as potências", async () => {
    const r = await importar(admin, await enviar(admin), [
      { material_id: semPotencia, codigo: null, descricao: "Módulo Jinko 620W", preco: 612, potencia_w: 620 },
      { material_id: comPotencia, codigo: null, descricao: "Módulo Canadian 575W", preco: 590, potencia_w: 580 },
      { novo: { nome: "Microinversor HMS-2000", categoria: "inversores", unidade: "un" }, codigo: null, descricao: "Microinversor HMS-2000", preco: 2450, potencia_w: 2000 },
      { novo: { nome: "Perfil 4,2 m", categoria: "estrutura", unidade: "un" }, codigo: null, descricao: "Perfil 4,2 m", preco: 96 },
    ]);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ novos: 4, potencias: 2 });
    expect(await potencia(semPotencia)).toBe(620);
    expect(await potencia(comPotencia)).toBe(575);
    expect(await porNome("Microinversor HMS-2000")).toMatchObject({ categoria: "inversores", potencia_w: 2000 });
    expect(await porNome("Perfil 4,2 m")).toMatchObject({ potencia_w: null });
  });

  it("potência inválida derruba a importação inteira (tudo ou nada)", async () => {
    const r = await importar(admin, await enviar(admin), [
      { novo: { nome: "Bateria X", categoria: "baterias", unidade: "un" }, codigo: null, descricao: "Bateria X", preco: 100, potencia_w: -1 },
    ]);
    expect(r.error?.message).toContain("Potência inválida");
    expect(await porNome("Bateria X")).toBeNull();
  });
});

describe("lista de equipamentos", () => {
  it("cria os novos, completa a potência de quem está sem e não muda preço", async () => {
    const semPot2 = ok(await admin.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "String box 2E", p_categoria: "cabos_protecao", p_unidade: "un" }), "m3").data as string;
    const precosAntes = (await servico.from("compras_precos").select("id").eq("empresa_id", empresa)).data!.length;
    const r = await lista(admin, [
      { material_id: comPotencia, descricao: "Módulo Canadian 575W", potencia_w: 580 },
      { novo: { nome: "Inversor Deye SUN-8K", categoria: "inversores", unidade: "un" }, descricao: "Inversor Deye SUN-8K", potencia_w: 8000 },
      { novo: { nome: "string box 2e", categoria: "cabos_protecao", unidade: "un" }, descricao: "string box 2e", potencia_w: 1 },
    ]);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ criados: 1, completados: 1 });
    expect(await potencia(comPotencia)).toBe(575);
    expect(await porNome("Inversor Deye SUN-8K")).toMatchObject({ categoria: "inversores", potencia_w: 8000 });
    // Mesmo nome (sem diferenciar maiúsculas): não duplica, só completa.
    expect(await potencia(semPot2)).toBe(1);
    expect((await servico.from("compras_precos").select("id").eq("empresa_id", empresa)).data!.length).toBe(precosAntes);
  });

  it("vendedor e outra empresa não importam; material de outra empresa é recusado", async () => {
    const item = [{ novo: { nome: "Equipamento do vendedor", categoria: "outros", unidade: "un" }, descricao: "x" }];
    expect((await lista(vendedor, item)).error).not.toBeNull();
    expect((await lista(adminB, item)).error).not.toBeNull();
    expect((await lista(adminB, [{ material_id: semPotencia, descricao: "x", potencia_w: 1 }], empresaB)).error?.message).toContain("não encontrado");
    expect(await porNome("Equipamento do vendedor")).toBeNull();
  });

  it("o mesmo equipamento duas vezes na lista é recusado", async () => {
    const r = await lista(admin, [
      { material_id: semPotencia, descricao: "a" },
      { novo: { nome: "Módulo Jinko 620W", categoria: "modulos", unidade: "un" }, descricao: "b" },
    ]);
    expect(r.error?.message).toContain("mais de uma vez");
  });
});
