/** Vistoria solar: isolamento por empresa, confirmação do vendedor e trava de ganho. Usa Supabase local. */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario;
let outro: Usuario;
let adminOutra: Usuario;
let empresa: string;
let empresaOutra: string;
let negocio: string;
let membroVendedor: string;

beforeAll(async () => {
  [vendedor, outro, adminOutra] = await Promise.all(["vist-vendedor", "vist-outro", "vist-admin-b"].map(criarUsuario));
  const { data: empresas, error: erroEmpresas } = await servico.from("empresas")
    .insert([
      { nome: `Vistoria A ${sufixo}`, vistoria_solar_obrigatoria: true },
      { nome: `Vistoria B ${sufixo}`, vistoria_solar_obrigatoria: true },
    ]).select("id, nome");
  if (erroEmpresas) throw erroEmpresas;
  empresa = empresas!.find((e) => e.nome.startsWith("Vistoria A"))!.id;
  empresaOutra = empresas!.find((e) => e.nome.startsWith("Vistoria B"))!.id;

  const { data: membros, error: erroMembros } = await servico.from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: outro.id, papel: "vendedor" },
      { empresa_id: empresaOutra, user_id: adminOutra.id, papel: "admin" },
    ]).select("id, user_id");
  if (erroMembros) throw erroMembros;
  membroVendedor = membros!.find((m) => m.user_id === vendedor.id)!.id;

  const { data: funil } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: etapa } = await servico.from("etapas").select("id").eq("funil_id", funil!.id).eq("inicial", true).single();
  const { data: contato, error: erroContato } = await servico.from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente vistoria ${sufixo}` }).select("id").single();
  if (erroContato) throw erroContato;
  const { data: criado, error: erroNegocio } = await servico.from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina para vistoria", contato_id: contato!.id,
      funil_id: funil!.id, etapa_id: etapa!.id, responsavel_id: membroVendedor, valor: 10000,
      fechamento_previsto: "2026-11-01" })
    .select("id").single();
  if (erroNegocio) throw erroNegocio;
  negocio = criado!.id;
});

const salvar = (ator: Usuario, confirmar: boolean) => ator.cliente.rpc("salvar_vistoria_tecnica", {
  p_negocio_id: negocio,
  p_visita_realizada: true,
  p_medidor_inspecionado: true,
  p_telhado_inspecionado: true,
  p_observacoes: "Medidor e telhado conferidos",
  p_confirmar: confirmar,
});

// Um PNG mínimo; o teste verifica a existência e os metadados do objeto no Storage.
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64"));
async function foto(nome: string, categoria: "vistoria_medidor" | "vistoria_telhado") {
  const caminho = `${empresa}/${negocio}/${nome}-${sufixo}.png`;
  const envio = await vendedor.cliente.storage.from("anexos").upload(caminho, png, { contentType: "image/png" });
  expect(envio.error).toBeNull();
  return vendedor.cliente.from("anexos").insert({
    empresa_id: empresa, negocio_id: negocio, nome: `${nome}-${sufixo}.png`,
    caminho, tamanho: png.length, tipo_mime: "image/png", categoria,
  }).select("id").single();
}

describe("vistoria técnica solar", () => {
  it("impede o ganho quando a empresa exige vistoria e só o responsável salva", async () => {
    const antes = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio);
    expect(antes.error?.message).toContain("vistoria técnica");
    expect((await salvar(outro, true)).error).toBeTruthy();
    expect((await salvar(adminOutra, true)).error).toBeTruthy();
    expect((await salvar(vendedor, false)).error).toBeNull();
    const { data: rascunho } = await vendedor.cliente.from("vistorias_tecnicas")
      .select("confirmada_em").eq("negocio_id", negocio).single();
    expect(rascunho?.confirmada_em).toBeNull();
  });

  it("exige foto do medidor e do telhado e preserva as evidências confirmadas", async () => {
    const semObjeto = await vendedor.cliente.from("anexos").insert({
      empresa_id: empresa, negocio_id: negocio, nome: "ausente.png",
      caminho: `${empresa}/${negocio}/ausente-${sufixo}.png`, tamanho: 8,
      tipo_mime: "image/png", categoria: "vistoria_medidor",
    });
    expect(semObjeto.error?.message).toContain("Envie uma foto válida");
    const medidor = await foto("medidor", "vistoria_medidor");
    expect(medidor.error).toBeNull();
    expect((await salvar(vendedor, true)).error?.message).toContain("fotos do medidor e do telhado");

    const telhado = await foto("telhado", "vistoria_telhado");
    expect(telhado.error).toBeNull();
    expect((await salvar(vendedor, true)).error).toBeNull();
    expect((await adminOutra.cliente.from("vistorias_tecnicas").select("negocio_id").eq("negocio_id", negocio)).data).toEqual([]);
    expect((await vendedor.cliente.from("anexos").delete().eq("id", medidor.data!.id)).error).toBeTruthy();
    expect((await vendedor.cliente.from("anexos").delete().eq("id", telhado.data!.id)).error).toBeTruthy();
  });

  it("libera o ganho depois da confirmação e não permite voltar a rascunho", async () => {
    expect((await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio)).error).toBeNull();
    expect((await salvar(vendedor, false)).error).toBeTruthy();
    const { data: vistoria } = await vendedor.cliente.from("vistorias_tecnicas")
      .select("confirmada_em, confirmada_por").eq("negocio_id", negocio).single();
    expect(vistoria?.confirmada_em).toBeTruthy();
    expect(vistoria?.confirmada_por).toBe(membroVendedor);
  });
});
