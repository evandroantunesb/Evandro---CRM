/**
 * Edição do texto do contrato (18/11/2026) com Supabase local e RLS real: `editar_texto_contrato` só para admin,
 * gestor que vê o negócio e o responsável (vendedor); só em rascunho; texto válido; marca "editado à mão" mantida
 * pelo banco (liga na edição, some ao gerar de novo) e atividade no negócio. Também a trava do texto fora do
 * rascunho para qualquer `update` direto e o limite do endereço da instalação.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { gerarContratoComCliente } from "@/lib/contratos-geracao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CLIENTE_CONTRATO, anexarDocumentosContrato, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let gestorFora: Usuario;
let vendedor: Usuario;
let outroVendedor: Usuario;
let sdr: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapa: string;

const MODELO = "## CONTRATO\n**CONTRATANTE:** {{cliente_nome}}\nValor: {{negocio_valor}}.";

beforeAll(async () => {
  [admin, gestor, gestorFora, vendedor, outroVendedor, sdr] = await Promise.all(
    ["te-admin", "te-gestor", "te-gestor-fora", "te-vendedor", "te-outro", "te-sdr"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Texto editado ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: v, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorFora.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: outroVendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id");
  if (error) throw error;
  for (const l of v!) membro[l.user_id] = l.id;
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe texto" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { error: erroModelo } = await admin.cliente.from("modelos_contrato").upsert({ empresa_id: empresa, conteudo: MODELO });
  if (erroModelo) throw erroModelo;
});

/** Negócio do vendedor com contrato gerado (rascunho). */
async function negocioComContrato(titulo: string) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}`, documento: "123.456.789-09" })
    .select("id")
    .single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membro[vendedor.id], valor: 25000 })
    .select("id")
    .single();
  if (error) throw error;
  await anexarDocumentosContrato(n!.id);
  const r = await gerarContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, { empresaId: empresa, membroId: membro[vendedor.id], negocioId: n!.id });
  expect(r).toEqual({ ok: true, mensagem: "Contrato pronto." });
  return n!.id;
}

const editar = (u: Usuario, negocioId: string, conteudo: string) =>
  u.cliente.rpc("editar_texto_contrato" as never, { p_negocio_id: negocioId, p_conteudo: conteudo } as never);

const lerContrato = async (negocioId: string) =>
  (await servico.from("contratos").select("id, conteudo, status, texto_editado_em, texto_editado_por").eq("negocio_id", negocioId).single()).data as unknown as {
    id: string;
    conteudo: string;
    status: string;
    texto_editado_em: string | null;
    texto_editado_por: string | null;
  };

const atividadesEdicao = async (negocioId: string) =>
  (await servico.from("atividades").select("tipo, ator_id, dados").eq("negocio_id", negocioId).eq("tipo", "contrato_texto_editado")).data ?? [];

describe("editar_texto_contrato", () => {
  it("o responsável edita: texto novo, marca com o membro dele e uma atividade", async () => {
    const id = await negocioComContrato("Responsável edita");
    const { error } = await editar(vendedor, id, "## CONTRATO\nTexto ajustado à mão.");
    expect(error).toBeNull();
    const c = await lerContrato(id);
    expect(c.conteudo).toBe("## CONTRATO\nTexto ajustado à mão.");
    expect(c.texto_editado_por).toBe(membro[vendedor.id]);
    expect(c.texto_editado_em).not.toBeNull();
    const ativ = await atividadesEdicao(id);
    expect(ativ).toHaveLength(1);
    expect(ativ[0]).toMatchObject({ ator_id: vendedor.id, dados: { contrato_id: c.id } });
  });

  it("admin e gestor da equipe editam", async () => {
    const id = await negocioComContrato("Admin e gestor editam");
    expect((await editar(admin, id, "Texto do admin.")).error).toBeNull();
    expect((await editar(gestor, id, "Texto do gestor.")).error).toBeNull();
    const c = await lerContrato(id);
    expect(c.conteudo).toBe("Texto do gestor.");
    expect(c.texto_editado_por).toBe(membro[gestor.id]);
  });

  it("gestor de fora da equipe, outro vendedor e SDR não editam; o texto não muda", async () => {
    const id = await negocioComContrato("Sem permissão");
    const antes = (await lerContrato(id)).conteudo;
    for (const u of [gestorFora, outroVendedor, sdr]) {
      const { error } = await editar(u, id, "Tentativa.");
      expect(error, u.id).not.toBeNull();
    }
    const c = await lerContrato(id);
    expect(c.conteudo).toBe(antes);
    expect(c.texto_editado_em).toBeNull();
    expect(await atividadesEdicao(id)).toHaveLength(0);
  });

  it("fora do rascunho: recusa pela função e também no update direto", async () => {
    const id = await negocioComContrato("Fora do rascunho");
    await servico.from("contratos").update({ status: "aguardando_assinatura" }).eq("negocio_id", id);
    const antes = (await lerContrato(id)).conteudo;
    const { error } = await editar(vendedor, id, "Depois de enviado.");
    expect(error?.message).toBe("O texto só muda com o contrato em rascunho.");
    const { error: direto } = await vendedor.cliente.from("contratos").update({ conteudo: "Direto." }).eq("negocio_id", id);
    expect(direto?.message).toBe("O texto só muda com o contrato em rascunho.");
    expect((await lerContrato(id)).conteudo).toBe(antes);
  });

  it.each([
    ["", "O texto do contrato não pode ficar vazio."],
    ["   \n  ", "O texto do contrato não pode ficar vazio."],
    ["Contratante: {{cliente_nome}}", "Tire as chaves {{ ou }} do texto antes de salvar."],
    ["fim }}", "Tire as chaves {{ ou }} do texto antes de salvar."],
    ["a".repeat(60001), "O texto do contrato passou do limite de 60.000 caracteres."],
  ])("texto inválido é recusado (%#)", async (texto, mensagem) => {
    const id = await negocioComContrato(`Inválido ${mensagem.slice(0, 12)} ${texto.length}`);
    const { error } = await editar(vendedor, id, texto);
    expect(error?.message).toBe(mensagem);
    expect((await lerContrato(id)).texto_editado_em).toBeNull();
  });

  it("texto igual ao atual não registra edição", async () => {
    const id = await negocioComContrato("Texto igual");
    const atual = (await lerContrato(id)).conteudo;
    expect((await editar(vendedor, id, atual)).error).toBeNull();
    expect((await lerContrato(id)).texto_editado_em).toBeNull();
    expect(await atividadesEdicao(id)).toHaveLength(0);
  });

  it("gerar de novo depois da edição apaga a marca", async () => {
    const id = await negocioComContrato("Gerar de novo");
    expect((await editar(vendedor, id, "Editado.")).error).toBeNull();
    expect((await lerContrato(id)).texto_editado_em).not.toBeNull();
    const r = await gerarContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, { empresaId: empresa, membroId: membro[vendedor.id], negocioId: id });
    expect(r.ok).toBe(true);
    const c = await lerContrato(id);
    expect(c.conteudo).not.toBe("Editado.");
    expect(c.texto_editado_em).toBeNull();
    expect(c.texto_editado_por).toBeNull();
  });

  it("ninguém muda a marca por update direto", async () => {
    const id = await negocioComContrato("Marca à mão");
    await vendedor.cliente
      .from("contratos")
      .update({ texto_editado_em: new Date().toISOString(), texto_editado_por: membro[vendedor.id] } as never)
      .eq("negocio_id", id);
    const c = await lerContrato(id);
    expect(c.texto_editado_em).toBeNull();
    expect(c.texto_editado_por).toBeNull();
  });
});

describe("negocios.endereco_instalacao", () => {
  it("aceita até 300 caracteres e recusa mais", async () => {
    const id = await negocioComContrato("Endereço instalação");
    const ok = await servico.from("negocios").update({ endereco_instalacao: "x".repeat(300) } as never).eq("id", id);
    expect(ok.error).toBeNull();
    const longo = await servico.from("negocios").update({ endereco_instalacao: "x".repeat(301) } as never).eq("id", id);
    expect(longo.error).not.toBeNull();
  });
});
