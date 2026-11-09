/**
 * Compras, P3 (20261129100000_compras_tabela_precos.sql): tabela de preços de material. Veem admin, gestor, quem atua
 * em Compras (ou no setor que atende no lugar dele) e o Administrativo; alteram admin, gestor e quem atua em Compras.
 * Preços só se acrescentam; a importação é tudo ou nada. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Preços A/B" + sufixo, usuários "cpr-*" + sufixo). Os testes seguem em ordem.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "compras-precos";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let admin: Usuario;
let gestor: Usuario;
let comprador: Usuario;
let administrativo: Usuario;
let operacional: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let administrativoB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let modulo: string;
let inversor: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const dia = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + n * 86400000));

async function enviar(quem: Usuario, emp = empresa) {
  const caminho = `${emp}/${randomUUID()}-tabela.xlsx`;
  const { error } = await quem.cliente.storage.from(BUCKET).upload(caminho, new Blob(["planilha de teste"], { type: XLSX }), { contentType: XLSX });
  return { caminho, error };
}

const MAPA = { cabecalho: 0, material: 1, codigo: 0, unidade: 2, preco: 3 };
const importar = (quem: Usuario, caminho: string, itens: unknown[], extra: Partial<Record<string, unknown>> = {}) =>
  quem.cliente.rpc("importar_tabela_precos", {
    p_empresa_id: empresa,
    p_fornecedor: "Distribuidora  Solar Sul",
    p_data_tabela: dia(-6),
    p_valido_ate: dia(20),
    p_caminho: caminho,
    p_nome_arquivo: "tabela-solar-sul.xlsx",
    p_linhas_lidas: itens.length + 1,
    p_ignoradas: 1,
    p_mapa: MAPA,
    p_itens: itens,
    ...extra,
  } as never);

const atuais = async (quem: Usuario) => ok(await quem.cliente.rpc("precos_atuais_compra", { p_empresa_id: empresa }), "atuais").data ?? [];

describe("Compras: tabela de preços (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, comprador, administrativo, operacional, vendedor, adminB, administrativoB] = await Promise.all(
      ["cpr-admin", "cpr-gestor", "cpr-comprador", "cpr-administrativo", "cpr-operacional", "cpr-vendedor", "cpr-admin-b", "cpr-administrativo-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Preços A ${sufixo}` }, { nome: `Preços B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [comprador, empresa, { papel: "operacao" }],
      [administrativo, empresa, { papel: "operacao" }],
      [operacional, empresa, { papel: "operacao" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [adminB, empresaB, { papel: "admin" }],
      [administrativoB, empresaB, { papel: "operacao" }],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, setor] of [
      [comprador, "compras"],
      [administrativo, "administrativo"],
      [operacional, "operacional"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade: "executar" }] as never }), "setor");
    }
    ok(
      await adminB.cliente.rpc("definir_setores_membro", {
        p_membro_id: membro[administrativoB.id],
        p_setores: [{ setor: "administrativo", capacidade: "executar" }] as never,
      }),
      "setor B",
    );
  });

  it("Compras, gestor e admin criam material; o nome não se repete", async () => {
    modulo = ok(
      await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: " Módulo  550 W ", p_categoria: "modulos", p_unidade: "un" }),
      "módulo",
    ).data as string;
    inversor = ok(
      await gestor.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Inversor 5 kW", p_categoria: "inversores", p_unidade: "un" }),
      "inversor",
    ).data as string;
    ok(await admin.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Cabo solar 6 mm²", p_categoria: "cabos_protecao", p_unidade: "m" }), "cabo");
    const { data: m } = await servico.from("compras_materiais").select("nome, categoria, unidade").eq("id", modulo).single();
    expect(m).toEqual({ nome: "Módulo 550 W", categoria: "modulos", unidade: "un" });

    const repetido = await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "módulo 550 w", p_categoria: "modulos", p_unidade: "un" });
    expect(repetido.error?.message).toContain("Já existe um material");
    const semCategoria = await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Outro", p_categoria: "kits", p_unidade: "un" });
    expect(semCategoria.error?.message).toContain("categoria");
  });

  it("Administrativo só vê; Operacional, vendedor e a outra empresa não veem nem alteram", async () => {
    const lidos = async (quem: Usuario) => (await quem.cliente.from("compras_materiais").select("id").eq("empresa_id", empresa)).data?.length ?? 0;
    expect(await lidos(administrativo)).toBe(3);
    expect(await lidos(operacional)).toBe(0);
    expect(await lidos(vendedor)).toBe(0);
    expect(await lidos(adminB)).toBe(0);
    for (const quem of [administrativo, operacional, vendedor, adminB]) {
      const r = await quem.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Proibido", p_categoria: "outros", p_unidade: "un" });
      expect(r.error?.message).toContain("Só quem atua em Compras");
      const e = await quem.cliente.rpc("editar_material_compra", { p_material_id: modulo, p_nome: "X", p_categoria: "outros", p_unidade: "un" });
      expect(e.error?.message).toContain("Só quem atua em Compras");
    }
    // Ninguém escreve direto nas tabelas.
    const direto = await admin.cliente.from("compras_precos").insert({ empresa_id: empresa, material_id: modulo, fornecedor: "X", preco: 1, data_preco: dia(0) } as never);
    expect(direto.error).not.toBeNull();
  });

  it("bucket: envia quem altera, na pasta da própria empresa", async () => {
    expect((await enviar(administrativo)).error).not.toBeNull();
    expect((await enviar(comprador, empresaB)).error).not.toBeNull();
    expect((await enviar(comprador)).error).toBeNull();
  });

  it("importa a tabela: materiais existentes e novos, contagens, mapa e planilha", async () => {
    const { caminho } = await enviar(comprador);
    const itens = [
      { material_id: modulo, codigo: "44102", descricao: "MOD 550W MONO", preco: 780 },
      { material_id: inversor, codigo: "51007", descricao: "INV 5K MONOF", preco: 5900 },
      { novo: { nome: "String box", categoria: "cabos_protecao", unidade: "un" }, codigo: "60211", descricao: "STR BOX 2E/2S", preco: 620 },
      // Nome já cadastrado: usa o material existente.
      { novo: { nome: "CABO SOLAR 6 MM²", categoria: "outros", unidade: "m" }, codigo: "70016", descricao: "CABO SOLAR 6MM PT", preco: 9.8 },
    ];
    expect((await importar(comprador, caminho, itens, { p_data_tabela: dia(1) })).error?.message).toContain("futura");
    expect((await importar(comprador, caminho, itens, { p_valido_ate: dia(-10) })).error?.message).toContain("validade");
    expect((await importar(comprador, `${empresa}/${randomUUID()}-nao-existe.xlsx`, itens)).error?.message).toContain("Envie a planilha");
    expect((await importar(administrativo, caminho, itens)).error?.message).toContain("Só quem atua em Compras");

    const r = ok(await importar(comprador, caminho, itens), "importar").data as Record<string, unknown>;
    expect(r).toMatchObject({ novos: 4, subiram: 0, baixaram: 0, iguais: 0 });
    const { data: materiais } = await servico.from("compras_materiais").select("nome").eq("empresa_id", empresa).order("nome");
    expect(materiais!.map((m) => m.nome)).toEqual(["Cabo solar 6 mm²", "Inversor 5 kW", "Módulo 550 W", "String box"]);
    const { data: t } = await servico.from("compras_tabelas_preco").select("fornecedor, fornecedor_chave, linhas_lidas, ignoradas, novos, enviado_por").eq("caminho", caminho).single();
    expect(t).toEqual({
      fornecedor: "Distribuidora Solar Sul",
      fornecedor_chave: "distribuidora solar sul",
      linhas_lidas: 5,
      ignoradas: 1,
      novos: 4,
      enviado_por: membro[comprador.id],
    });
    const { data: mapa } = await comprador.cliente.from("compras_mapas_colunas").select("fornecedor_chave, mapa").eq("empresa_id", empresa).single();
    expect(mapa).toEqual({ fornecedor_chave: "distribuidora solar sul", mapa: MAPA });
    // O Administrativo vê preços, mas não o mapa de colunas.
    expect((await administrativo.cliente.from("compras_mapas_colunas").select("fornecedor_chave").eq("empresa_id", empresa)).data).toEqual([]);
    expect((await atuais(administrativo)).length).toBe(4);
    // A função confere quem vê (não depende da RLS por linha).
    for (const quem of [operacional, vendedor, adminB]) expect(await atuais(quem)).toEqual([]);
    // A mesma planilha não serve a duas tabelas.
    expect((await importar(comprador, caminho, itens)).error?.message).toContain("Envie a planilha");
  });

  it("tudo ou nada: material repetido ou de outra empresa recusa a tabela inteira", async () => {
    const antes = (await servico.from("compras_precos").select("id").eq("empresa_id", empresa)).data!.length;
    const { caminho } = await enviar(comprador);
    const repetido = await importar(comprador, caminho, [
      { material_id: modulo, codigo: "1", descricao: "A", preco: 1 },
      { novo: { nome: "módulo 550 w", categoria: "modulos", unidade: "un" }, codigo: "2", descricao: "B", preco: 2 },
    ]);
    expect(repetido.error?.message).toContain("aparece mais de uma vez");
    const { data: materialB } = ok(
      await adminB.cliente.rpc("criar_material_compra", { p_empresa_id: empresaB, p_nome: "Módulo B", p_categoria: "modulos", p_unidade: "un" }),
      "material B",
    );
    const deOutra = await importar(comprador, caminho, [{ material_id: materialB, codigo: null, descricao: "Módulo B", preco: 10 }]);
    expect(deOutra.error?.message).toContain("não encontrado");
    expect((await servico.from("compras_precos").select("id").eq("empresa_id", empresa)).data!.length).toBe(antes);
    expect((await servico.from("compras_tabelas_preco").select("id").eq("caminho", caminho)).data).toEqual([]);
  });

  it("nova tabela: subiu, baixou e igual; o preço atual é o de data mais recente", async () => {
    const { caminho } = await enviar(gestor);
    const r = ok(
      await importar(gestor, caminho, [
        { material_id: modulo, codigo: "44102", descricao: "MOD 550W MONO", preco: 800 },
        { material_id: inversor, codigo: "51007", descricao: "INV 5K MONOF", preco: 5820 },
        { novo: { nome: "String box", categoria: "cabos_protecao", unidade: "un" }, codigo: "60211", descricao: "STR BOX 2E/2S", preco: 620 },
      ], { p_data_tabela: dia(0), p_valido_ate: null }),
      "segunda tabela",
    ).data as Record<string, unknown>;
    expect(r).toMatchObject({ novos: 0, subiram: 1, baixaram: 1, iguais: 1 });

    // Tabela antiga chegando depois vai para o histórico sem virar o preço atual.
    const { caminho: velha } = await enviar(comprador);
    ok(await importar(comprador, velha, [{ material_id: modulo, codigo: "44102", descricao: "MOD 550W MONO", preco: 700 }], { p_data_tabela: dia(-30), p_valido_ate: null }), "velha");
    const precoModulo = (await atuais(comprador)).find((p) => p.material_id === modulo);
    expect(Number(precoModulo!.preco)).toBe(800);
    expect(precoModulo!.data_preco).toBe(dia(0));
  });

  it("preço lançado à mão: outro fornecedor, sem tabela", async () => {
    expect((await administrativo.cliente.rpc("lancar_preco_compra", { p_material_id: modulo, p_fornecedor: "Atacado Energia", p_preco: 795, p_data: dia(0) })).error?.message).toContain(
      "Só quem atua em Compras",
    );
    expect((await comprador.cliente.rpc("lancar_preco_compra", { p_material_id: modulo, p_fornecedor: "Atacado Energia", p_preco: 0, p_data: dia(0) })).error?.message).toContain("preço");
    ok(await comprador.cliente.rpc("lancar_preco_compra", { p_material_id: modulo, p_fornecedor: "Atacado Energia", p_preco: 795, p_data: dia(0), p_codigo: "AT-1" }), "manual");
    const doModulo = (await atuais(comprador)).filter((p) => p.material_id === modulo);
    expect(doModulo.map((p) => [p.fornecedor, Number(p.preco), p.tabela_id]).sort()).toEqual([
      ["Atacado Energia", 795, null],
      ["Distribuidora Solar Sul", 800, expect.any(String)],
    ]);
  });

  it("empresa sem Compras: o setor que atende no lugar dele altera a tabela", async () => {
    const antes = await administrativoB.cliente.rpc("criar_material_compra", { p_empresa_id: empresaB, p_nome: "Inversor B", p_categoria: "inversores", p_unidade: "un" });
    expect(antes.error?.message).toContain("Só quem atua em Compras");
    ok(await adminB.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresaB, p_setor: "administrativo" }), "atendimento");
    ok(await administrativoB.cliente.rpc("criar_material_compra", { p_empresa_id: empresaB, p_nome: "Inversor B", p_categoria: "inversores", p_unidade: "un" }), "material B");
  });
});
