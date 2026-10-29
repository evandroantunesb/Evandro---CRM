/**
 * Interface do pagamento do Solo (issue #187) contra o banco local: `situacao_registro_pagamento`
 * (o que a ficha mostra) segue exatamente a regra da RPC de registro, e a visão de vendas lê o
 * registro manual sob RLS.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { carregarLinhasVenda } from "@/lib/venda";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; funil: string; etapa: string; contato: string };
const membro: Record<string, string> = {};

async function criarEmpresa(nome: string, produto: "solo" | null, vinculos: { u: Usuario; papel: "admin" | "gestor" | "vendedor" }[]): Promise<Empresa> {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  if (produto) await servico.from("planos_empresa").insert({ empresa_id: emp!.id, produto });
  const { data: vs, error: e2 } = await servico
    .from("empresa_membros")
    .insert(vinculos.map((v) => ({ empresa_id: emp!.id, user_id: v.u.id, papel: v.papel })))
    .select("id, user_id");
  if (e2) throw e2;
  for (const v of vs!) membro[`${emp!.id}:${v.user_id}`] = v.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp!.id, nome: `Cliente ${nome}` }).select("id").single();
  return { id: emp!.id, funil: f!.id, etapa: et!.id, contato: c!.id };
}

async function criarNegocio(e: Empresa, titulo: string, responsavel: Usuario) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: e.id, titulo, contato_id: e.contato, funil_id: e.funil, etapa_id: e.etapa, responsavel_id: membro[`${e.id}:${responsavel.id}`], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

const situacao = async (u: Usuario, negocioId: string) => (await u.cliente.rpc("situacao_registro_pagamento", { p_negocio_id: negocioId })).data;

let soloAdmin: Usuario;
let duploAdmin: Usuario;
let duploVendedor: Usuario;
let proAdmin: Usuario;
let solo: Empresa;
let duplo: Empresa;
let pro: Empresa;

beforeAll(async () => {
  [soloAdmin, duploAdmin, duploVendedor, proAdmin] = await Promise.all(["ui-solo", "ui-duplo-admin", "ui-duplo-vend", "ui-pro"].map(criarUsuario));
  [solo, duplo, pro] = await Promise.all([
    criarEmpresa("UI Solo", "solo", [{ u: soloAdmin, papel: "admin" }]),
    criarEmpresa("UI Solo dois", "solo", [{ u: duploAdmin, papel: "admin" }, { u: duploVendedor, papel: "vendedor" }]),
    criarEmpresa("UI Pro", null, [{ u: proAdmin, papel: "admin" }]),
  ]);
});

describe("situacao_registro_pagamento", () => {
  it("admin único do Solo: permitido (igual à RPC de registro)", async () => {
    const negocioId = await criarNegocio(solo, "Permitido", soloAdmin);
    expect(await situacao(soloAdmin, negocioId)).toBe("permitido");
    expect((await soloAdmin.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioId })).error).toBeNull();
  });

  it("Solo com dois ativos: admin recebe 'varios_usuarios'; vendedor recebe 'indisponivel' (não descobre o plano)", async () => {
    const negocioId = await criarNegocio(duplo, "Dois ativos", duploVendedor);
    expect(await situacao(duploAdmin, negocioId)).toBe("varios_usuarios");
    expect(await situacao(duploVendedor, negocioId)).toBe("indisponivel");
    expect((await duploAdmin.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioId })).error).not.toBeNull();
  });

  it("Pro e outra empresa: indisponível", async () => {
    const negocioPro = await criarNegocio(pro, "Pro", proAdmin);
    expect(await situacao(proAdmin, negocioPro)).toBe("indisponivel");
    const negocioSolo = await criarNegocio(solo, "Outra empresa", soloAdmin);
    expect(await situacao(proAdmin, negocioSolo)).toBe("indisponivel");
    expect(await situacao(proAdmin, "00000000-0000-0000-0000-000000000000")).toBe("indisponivel");
  });
});

describe("visão de vendas lê o registro manual", () => {
  it("negócio com contrato e pagamento registrado aparece como 'registrado'; estornado volta ao status do contrato", async () => {
    const negocioId = await criarNegocio(solo, "Visão de vendas", soloAdmin);
    await soloAdmin.cliente.from("contratos").insert({ empresa_id: solo.id, negocio_id: negocioId, conteudo: "Contrato" });
    await soloAdmin.cliente.rpc("registrar_pagamento_negocio", { p_negocio_id: negocioId });

    const cliente = soloAdmin.cliente as unknown as SupabaseServidor;
    const linha = (await carregarLinhasVenda(cliente, solo.id)).linhas.find((l) => l.negocioId === negocioId)!;
    expect(linha.contrato).toBe("rascunho");
    expect(linha.pagamento).toBe("registrado");

    await soloAdmin.cliente.rpc("estornar_registro_pagamento", { p_negocio_id: negocioId, p_motivo: "teste" });
    const depois = (await carregarLinhasVenda(cliente, solo.id)).linhas.find((l) => l.negocioId === negocioId)!;
    expect(depois.pagamento).toBeNull();
  });
});
