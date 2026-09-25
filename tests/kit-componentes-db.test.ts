/** Regras de banco do kit personalizado: componentes presos ao negócio, visíveis a quem o vê. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor1: Usuario;
let adminOutra: Usuario;
let empresa: string;
let negocio: string;

beforeAll(async () => {
  [vendedor1, adminOutra] = await Promise.all(["kitc-v1", "kitc-outra"].map(criarUsuario));
  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Kit componentes ${sufixo}` }, { nome: `Kit componentes outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  const outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" },
    { empresa_id: outra, user_id: adminOutra.id, papel: "admin" },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Kit", telefone: "44 90000-0003" })
    .select("id")
    .single();
  const { data: n } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina kit personalizado", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id })
    .select("id")
    .single();
  negocio = n!.id;
});

describe("kit_componentes", () => {
  it("vendedor monta o kit do próprio negócio (módulos, inversor, baterias)", async () => {
    const { error } = await vendedor1.cliente.from("kit_componentes").insert([
      { empresa_id: empresa, negocio_id: negocio, tipo: "modulo", descricao: "Canadian 550W", potencia_w: 550, quantidade: 10, ordem: 0 },
      { empresa_id: empresa, negocio_id: negocio, tipo: "inversor", descricao: "Growatt 5kW", potencia_w: 5000, quantidade: 1, ordem: 1 },
      { empresa_id: empresa, negocio_id: negocio, tipo: "bateria", descricao: "Bateria 5kWh", potencia_w: null, quantidade: 2, ordem: 2 },
    ]);
    expect(error).toBeNull();

    const { data } = await vendedor1.cliente.from("kit_componentes").select("tipo, descricao").eq("negocio_id", negocio).order("ordem");
    expect(data!.map((c) => c.tipo)).toEqual(["modulo", "inversor", "bateria"]);
  });

  it("empresa de fora não vê os componentes do negócio alheio", async () => {
    const { data } = await adminOutra.cliente.from("kit_componentes").select("id").eq("negocio_id", negocio);
    expect(data).toEqual([]);
  });

  it("descrição vazia é recusada (check de banco)", async () => {
    const { error } = await vendedor1.cliente
      .from("kit_componentes")
      .insert({ empresa_id: empresa, negocio_id: negocio, tipo: "outro", descricao: "   ", quantidade: 1 });
    expect(error).not.toBeNull();
  });
});
