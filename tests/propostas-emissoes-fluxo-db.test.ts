/**
 * Fluxo da emissão preservada contra o banco local, com o MESMO código da ação e da rota pública
 * (`gravarEmissaoSimples` e `lerEmissaoPorToken`): emitir -> baixar -> reabrir -> mudar negócio, kit, parâmetro e
 * modelo -> o link e o PDF continuam byte a byte iguais. Não passa pelo Next (cookies/sessão): a ação em si fica
 * para o e2e.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { gravarEmissaoSimples, lerEmissaoPorToken } from "@/lib/propostas/emissoes-gravacao";
import { ultimaVersaoDoNegocio } from "@/lib/propostas/emissoes-dados";
import { extrairConteudoDoModelo, montarDadosEmissaoSimples, produtividadeConfirmada, sha256Hex } from "@/lib/propostas/proposta-simples";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario, adminUser: Usuario;
let empresaId: string, negocioId: string, membroId: string, modeloId: string;

async function dadosAtuais(versao: number) {
  const [{ data: n }, { data: comps }, { data: par }, { data: modelo }] = await Promise.all([
    servico.from("negocios").select("valor, consumo_medio_kwh, contatos(nome, endereco, cidade, uf)").eq("id", negocioId).single(),
    servico.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", negocioId).order("ordem"),
    servico
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes, produtividade_confirmada_valor, produtividade_confirmada_em, produtividade_confirmada_fonte, produtividade_confirmada_responsavel")
      .eq("empresa_id", empresaId)
      .single(),
    servico.from("proposta_modelos").select("proposta_modelo_blocos(tipo, ativo, config)").eq("id", modeloId).single(),
  ]);
  const contato = n!.contatos as unknown as { nome: string; endereco: string | null; cidade: string | null; uf: string | null };
  const conteudo = extrairConteudoDoModelo(modelo!.proposta_modelo_blocos);
  const r = montarDadosEmissaoSimples({
    contatoNome: contato.nome,
    contatoEndereco: [contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ") || null,
    valorNegocio: n!.valor,
    consumoMedioKwhNegocio: n!.consumo_medio_kwh,
    componentes: comps ?? [],
    produtividadeConfirmada: produtividadeConfirmada(par),
    validadeAte: "2099-12-31",
    condicoesPagamento: conteudo.condicoes || "À vista por Pix ou transferência\nCartão em até 12x",
    conteudo,
    identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0F0F10", corDestaque: "#D4AF37", whatsapp: "45999990000" },
    versao,
    emitidaEm: new Date().toISOString(),
    hoje: "2026-10-22",
  });
  if (!r.ok) throw new Error(r.pendencias.join(" "));
  return r.dados;
}

async function emitir() {
  const { versao } = await ultimaVersaoDoNegocio(vendedor.cliente, negocioId);
  const dados = await dadosAtuais(versao + 1);
  const r = await gravarEmissaoSimples({
    supabase: vendedor.cliente,
    admin: servico,
    empresaId,
    negocioId,
    membroId,
    dados,
    imagens: { logoUrl: null, fotoCapaUrl: null },
  });
  if (!r.ok) throw new Error(r.mensagem);
  const { data } = await servico.from("propostas_emissoes").select("token").eq("id", r.id).single();
  return { id: r.id, versao: r.versao, token: data!.token, dados };
}

beforeAll(async () => {
  [vendedor, adminUser] = await Promise.all([criarUsuario("fluxo-vend"), criarUsuario("fluxo-admin")]);
  const { data: emp } = await servico.from("empresas").insert({ nome: `Fluxo emissão ${sufixo}` }).select("id").single();
  empresaId = emp!.id;
  const { data: m } = await servico.from("empresa_membros").insert({ empresa_id: empresaId, user_id: vendedor.id, papel: "vendedor" }).select("id").single();
  membroId = m!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresaId, user_id: adminUser.id, papel: "admin" });
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresaId).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresaId, nome: "Cliente Fluxo", cidade: "Cascavel", uf: "PR" }).select("id").single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresaId, titulo: "Fluxo", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membroId, valor: 24500, consumo_medio_kwh: 450 })
    .select("id")
    .single();
  if (error) throw error;
  negocioId = n!.id;
  await servico.from("kit_componentes").insert([
    { empresa_id: empresaId, negocio_id: negocioId, tipo: "modulo", descricao: "Módulo 540 W", potencia_w: 540, quantidade: 10, ordem: 0 },
    { empresa_id: empresaId, negocio_id: negocioId, tipo: "inversor", descricao: "Inversor 5 kW", potencia_w: null, quantidade: 1, ordem: 1 },
  ]);
  await servico.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 120 }).eq("empresa_id", empresaId);
  // O admin confirma a produtividade (sem isso a proposta sai sem geração).
  const { error: erroConfirmar } = await adminUser.cliente.rpc("confirmar_produtividade_calculadora", {
    p_empresa_id: empresaId,
    p_valor: 120,
    p_fonte: "Relatório de geração real das usinas da região",
    p_responsavel: "Eng. Ana Prado (CREA 12345)",
  });
  if (erroConfirmar) throw erroConfirmar;
  const { data: mod, error: erroModelo } = await servico
    .from("proposta_modelos")
    .insert({ empresa_id: empresaId, nome: "Padrão", status: "publicado", padrao: true })
    .select("id")
    .single();
  if (erroModelo) throw erroModelo;
  modeloId = mod!.id;
  await servico.from("proposta_modelo_blocos").insert([
    { modelo_id: modeloId, tipo: "included_services", ordem: 1, config: { itens: ["Projeto e homologação", "Instalação"] } },
    { modelo_id: modeloId, tipo: "warranties", ordem: 2, config: { itens: ["Módulos: 12 anos"] } },
    { modelo_id: modeloId, tipo: "commercial_conditions", ordem: 3, config: { texto: "Entrada de 50% e saldo na instalação" } },
  ]);
});

describe("emissão preservada: emitir, baixar, reabrir", () => {
  let v1: Awaited<ReturnType<typeof emitir>>;
  let bytesV1: Uint8Array;
  let hashV1: string;

  it("emite a versão 1 e o link devolve exatamente o PDF gravado", async () => {
    v1 = await emitir();
    expect(v1.versao).toBe(1);
    const lida = await lerEmissaoPorToken(servico, v1.token);
    expect(lida.ok).toBe(true);
    if (!lida.ok) return;
    expect(Buffer.from(lida.pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(sha256Hex(lida.pdf)).toBe(lida.emissao.pdf_sha256);
    expect(lida.dados.sistema.potenciaKwp).toBe(5.4);
    expect(lida.dados.sistema.geracao?.kwhMes).toBe(648);
    bytesV1 = lida.pdf;
    hashV1 = sha256Hex(lida.pdf);
  });

  it("depois de mudar preço, consumo, kit, produtividade e modelo, o mesmo link entrega o mesmo PDF e os mesmos dados", async () => {
    await servico.from("negocios").update({ valor: 99999, consumo_medio_kwh: 10 }).eq("id", negocioId);
    await servico.from("kit_componentes").update({ quantidade: 40 }).eq("negocio_id", negocioId).eq("tipo", "modulo");
    await servico.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 200 }).eq("empresa_id", empresaId);
    await servico.from("proposta_modelo_blocos").update({ config: { itens: ["OUTRO TEXTO"] } }).eq("modelo_id", modeloId).eq("tipo", "warranties");
    await servico.from("proposta_modelo_blocos").delete().eq("modelo_id", modeloId).eq("tipo", "included_services");
    await servico.from("proposta_modelos").update({ status: "arquivado" }).eq("id", modeloId);

    const lida = await lerEmissaoPorToken(servico, v1.token);
    expect(lida.ok).toBe(true);
    if (!lida.ok) return;
    expect(sha256Hex(lida.pdf)).toBe(hashV1);
    expect(Buffer.from(lida.pdf).equals(Buffer.from(bytesV1))).toBe(true);
    expect(lida.dados.preco.valor).toBe(24500);
    expect(lida.dados.sistema.consumoMedioKwh).toBe(450);
    expect(lida.dados.sistema.potenciaKwp).toBe(5.4);
    expect(lida.dados.comercial.garantias).toEqual(["Módulos: 12 anos"]);
    expect(lida.dados.comercial.incluso).toEqual(["Projeto e homologação", "Instalação"]);
  });

  it("a nova emissão (v2) usa os dados atuais e tem link e arquivo próprios; a v1 não muda", async () => {
    const v2 = await emitir().catch((e: Error) => e);
    // O modelo foi arquivado e o kit mudou: a v2 sai com os dados de agora (sem Incluso/Garantias do modelo antigo).
    expect(v2 instanceof Error).toBe(false);
    if (v2 instanceof Error) return;
    expect(v2.versao).toBe(2);
    expect(v2.token).not.toBe(v1.token);
    const lida2 = await lerEmissaoPorToken(servico, v2.token);
    expect(lida2.ok).toBe(true);
    if (!lida2.ok) return;
    expect(lida2.dados.preco.valor).toBe(99999);
    expect(lida2.dados.sistema.potenciaKwp).toBe(21.6);
    // A produtividade mudou para 200: a confirmação foi apagada, então a v2 sai SEM o número de geração.
    expect(lida2.dados.sistema.geracao).toBeNull();
    expect(sha256Hex(lida2.pdf)).not.toBe(hashV1);
    const lida1 = await lerEmissaoPorToken(servico, v1.token);
    expect(lida1.ok && sha256Hex(lida1.pdf)).toBe(hashV1);
    expect(lida2.emissao.pdf_caminho).not.toBe(lida1.ok ? lida1.emissao.pdf_caminho : "");
  });

  it("arquivo trocado no bucket depois da emissão: a leitura recusa (integridade), não entrega", async () => {
    const lida = await lerEmissaoPorToken(servico, v1.token);
    if (!lida.ok) throw new Error("v1 deveria estar íntegra");
    const troca = await servico.storage
      .from("propostas-emitidas")
      .upload(lida.emissao.pdf_caminho, new Uint8Array([37, 80, 68, 70, 45, 49]), { contentType: "application/pdf", upsert: true });
    expect(troca.error).toBeNull();
    expect(await lerEmissaoPorToken(servico, v1.token)).toEqual({ ok: false, motivo: "integridade" });
  });

  it("token inexistente (link antigo de `propostas`) não é emissão", async () => {
    expect(await lerEmissaoPorToken(servico, crypto.randomUUID())).toEqual({ ok: false, motivo: "inexistente" });
  });
});
