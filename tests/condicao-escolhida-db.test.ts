/**
 * Condição escolhida no contrato (20261103100000_condicao_escolhida_contrato.sql, PR 4 das condições de pagamento),
 * contra o banco local e com o mesmo código das ações: a proposta é emitida de verdade (`gravarEmissaoSimples`) e o
 * contrato é gerado por `gerarContratoComCliente` sob a RLS de quem chama.
 * Cobre: escolha obrigatória com proposta por modalidade; contrato cita a condição e o valor do negócio segue a regra da
 * empresa (sem acumular desconto ao trocar); a condição trava fora do rascunho e quem registrou vem do banco; negócio
 * ganho só por admin ou gestor, como correção de valor, e nada muda quando o vendedor tenta.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { gerarContratoComCliente, atualizarStatusContratoComCliente } from "@/lib/contratos-geracao";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { gravarEmissaoSimples } from "@/lib/propostas/emissoes-gravacao";
import { montarDadosEmissaoSimples } from "@/lib/propostas/proposta-simples";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapa: string;

const MODELO = "CONTRATO de {{cliente_nome}}. Valor: {{negocio_valor}}. Pagamento: {{condicao_pagamento}}";
const NBSP = " ";

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["ce-admin", "ce-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Condição escolhida ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: v, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  if (error) throw error;
  for (const l of v!) membro[l.user_id] = l.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { error: erroModelo } = await admin.cliente.from("modelos_contrato").upsert({ empresa_id: empresa, conteudo: MODELO });
  if (erroModelo) throw erroModelo;
});

/** Negócio de R$ 30.000 com a proposta emitida: à vista 5%, cartão 10x e Personalizado em duas partes. */
async function negocioComProposta(titulo: string) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` })
    .select("id")
    .single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: empresa,
      titulo,
      contato_id: c!.id,
      funil_id: funil,
      etapa_id: etapa,
      responsavel_id: membro[vendedor.id],
      valor: 30000,
      consumo_medio_kwh: 450,
    })
    .select("id")
    .single();
  if (error) throw error;
  await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: n!.id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });

  const montagem = montarDadosEmissaoSimples({
    contatoNome: `Cliente ${titulo}`,
    contatoEndereco: null,
    valorNegocio: 30000,
    consumoMedioKwhNegocio: 450,
    componentes: [{ tipo: "modulo", descricao: "Módulo 550 W", quantidade: 10, potencia_w: 550 }],
    produtividadeConfirmada: null,
    validadeAte: "2099-12-31",
    condicoes: {
      entrada: {
        aVista: { desconto: "5" },
        parcelado: { meio: "cartao", parcelas: [10], repassarTaxas: false },
        financiamento: null,
        personalizado: {
          partes: [
            { valor: "10.000", forma: "pix", momento: "assinatura", data: "", observacao: "" },
            { valor: "18.000", forma: "dinheiro", momento: "fim_instalacao", data: "", observacao: "" },
          ],
        },
        observacao: "",
      },
      regras: { personalizadoAtivo: true, taxas: { cartao: [{ parcelas: 10, taxa: 8 }], boleto: [] }, limiteDesconto: 10, descontoAprovado: 0 },
    },
    conteudo: { incluso: null, exclusos: null, garantias: null, etapas: null },
    identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0F0F10", corDestaque: "#D4AF37", whatsapp: "45999990000" },
    versao: 1,
    emitidaEm: new Date().toISOString(),
    hoje: hojeEmSaoPaulo(),
  });
  if (!montagem.ok) throw new Error(montagem.pendencias.join(" "));
  const r = await gravarEmissaoSimples({
    supabase: vendedor.cliente,
    admin: servico,
    empresaId: empresa,
    negocioId: n!.id,
    membroId: membro[vendedor.id],
    dados: montagem.dados,
    imagens: { logoUrl: null, fotoCapaUrl: null },
  });
  if (!r.ok) throw new Error(r.mensagem);
  return n!.id;
}

const gerar = (u: Usuario, negocioId: string, condicao: string | null) =>
  gerarContratoComCliente(u.cliente as unknown as SupabaseServidor, { empresaId: empresa, membroId: membro[u.id], negocioId, condicao });
const valor = async (negocioId: string) => Number((await servico.from("negocios").select("valor").eq("id", negocioId).single()).data!.valor);
const contrato = async (negocioId: string) =>
  (
    await servico
      .from("contratos")
      .select("id, conteudo, status, condicao_pagamento, condicao_registrada_por, condicao_registrada_em")
      .eq("negocio_id", negocioId)
      .maybeSingle()
  ).data;

describe("condição escolhida no contrato", () => {
  it("com proposta por modalidade, o contrato exige a condição e recusa opção que não está na proposta", async () => {
    const id = await negocioComProposta("Exige condição");
    expect(await gerar(vendedor, id, null)).toEqual({ ok: false, mensagem: "Marque a condição de pagamento que o cliente escolheu." });
    expect((await gerar(vendedor, id, "financiamento:0")).ok).toBe(false);
    expect(await contrato(id)).toBeNull();
    expect(await valor(id)).toBe(30000);
  });

  it("à vista: o contrato cita a condição, o valor vira o com desconto e o banco grava quem registrou", async () => {
    const id = await negocioComProposta("À vista");
    expect(await gerar(vendedor, id, "aVista")).toEqual({ ok: true, mensagem: "Contrato pronto." });
    expect(await valor(id)).toBe(28500);
    const c = await contrato(id);
    expect(c!.conteudo).toBe(`CONTRATO de Cliente À vista. Valor: R$${NBSP}28.500,00. Pagamento: À vista: R$${NBSP}28.500,00 (5% de desconto).`);
    expect(c!.condicao_pagamento).toMatchObject({ opcao: "aVista", modalidade: "aVista", precoProposta: 30000, valorNegocio: 28500, base: "total_cliente" });
    expect(c!.condicao_registrada_por).toBe(membro[vendedor.id]);
    expect(c!.condicao_registrada_em).not.toBeNull();
  });

  it("trocar a condição parte sempre do preço da proposta: parcelado volta a 30.000 e Personalizado vira a soma", async () => {
    const id = await negocioComProposta("Troca");
    expect((await gerar(vendedor, id, "aVista")).ok).toBe(true);
    expect(await valor(id)).toBe(28500);
    expect((await gerar(vendedor, id, "parcelado:10")).ok).toBe(true);
    expect(await valor(id)).toBe(30000);
    expect((await contrato(id))!.conteudo).toContain(`Cartão em 10x de R$${NBSP}3.000,00.`);
    expect((await gerar(vendedor, id, "personalizado")).ok).toBe(true);
    expect(await valor(id)).toBe(28000);
  });

  it("a regra da empresa decide: com à vista = preço do sistema, o valor não muda", async () => {
    const { error } = await admin.cliente.from("condicoes_pagamento_preferencias").upsert({ empresa_id: empresa, valor_negocio_avista: "preco" }, { onConflict: "empresa_id" });
    if (error) throw error;
    try {
      const id = await negocioComProposta("Regra preço");
      expect((await gerar(vendedor, id, "aVista")).ok).toBe(true);
      expect(await valor(id)).toBe(30000);
      expect((await contrato(id))!.condicao_pagamento).toMatchObject({ base: "preco", valorNegocio: 30000 });
    } finally {
      await admin.cliente.from("condicoes_pagamento_preferencias").update({ valor_negocio_avista: "total_cliente" }).eq("empresa_id", empresa);
    }
  });

  it("quem registrou não é forjável, e fora do rascunho a condição trava", async () => {
    const id = await negocioComProposta("Trava");
    expect((await gerar(vendedor, id, "aVista")).ok).toBe(true);
    const c = await contrato(id);
    await vendedor.cliente.from("contratos").update({ condicao_registrada_por: membro[admin.id] }).eq("id", c!.id);
    expect((await contrato(id))!.condicao_registrada_por).toBe(membro[vendedor.id]);

    const r = await atualizarStatusContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, { membroId: membro[vendedor.id], negocioId: id, status: "aguardando_assinatura" });
    expect(r.ok).toBe(true);
    const { error } = await vendedor.cliente.from("contratos").update({ condicao_pagamento: { opcao: "personalizado" } }).eq("id", c!.id);
    expect(error?.message).toContain("só muda com o contrato em rascunho");
    expect((await gerar(vendedor, id, "personalizado")).ok).toBe(false);
    expect(await valor(id)).toBe(28500);
    expect((await contrato(id))!.condicao_pagamento).toMatchObject({ opcao: "aVista" });
  });

  it("negócio ganho: o vendedor não registra (nada muda); o admin registra como correção de valor, com o motivo", async () => {
    const id = await negocioComProposta("Ganho");
    const { error } = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", id);
    if (error) throw error;

    const doVendedor = await gerar(vendedor, id, "aVista");
    expect(doVendedor.ok).toBe(false);
    expect(doVendedor.mensagem).toContain("Só gestor ou admin");
    expect(await contrato(id)).toBeNull();
    expect(await valor(id)).toBe(30000);

    expect((await gerar(admin, id, "aVista")).ok).toBe(true);
    expect(await valor(id)).toBe(28500);
    const { data: eventos } = await servico.from("eventos").select("payload").eq("entidade_id", id).eq("tipo", "deal.value_corrected");
    expect(eventos).toHaveLength(1);
    expect(eventos![0].payload).toMatchObject({ de: 30000, para: 28500 });
    expect((eventos![0].payload as { motivo: string }).motivo).toContain("Condição escolhida pelo cliente: À vista");
  });
});
