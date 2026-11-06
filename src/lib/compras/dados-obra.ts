import "server-only";
import { documentosExigidos, type DocumentoCliente } from "@/lib/documentos-cliente";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import { assinar } from "@/lib/obras/financeiro";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { clienteFaturamento, type FaturamentoPedidoVM } from "./faturamento";
import { BUCKET_COMPRAS_OBRA, type ArquivoCompraVM, type OrcamentoVM } from "./orcamentos-regras";
import type { PedidoVM } from "./regras";

/**
 * Dados de Compras de uma obra (orçamentos, arquivos, faturamento e documentos do cliente): 20261126100000 e
 * 20261127100000. A RLS e as funções do banco decidem quem lê o quê; aqui só se monta a tela.
 */

const LIMITE_LINHAS = 1000;

export type OrcamentosObraVM = { orcamentos: OrcamentoVM[]; arquivos: ArquivoCompraVM[] };

/**
 * Orçamentos e arquivos de compra da obra (20261126100000_compras_orcamentos.sql), com os links assinados. A RLS devolve
 * vazio a quem não vê os pedidos. `pedidos` são os da obra (para o número e o fornecedor); `nomes`, membro → nome.
 */
export async function carregarOrcamentosObra(
  supabase: SupabaseServidor,
  { obraId, pedidos, nomes }: { obraId: string; pedidos: readonly PedidoVM[]; nomes: ReadonlyMap<string, string> },
): Promise<OrcamentosObraVM> {
  const [orcRes, arqRes] = await Promise.all([
    supabase
      .from("compras_orcamentos")
      .select(
        "id, fornecedor, valor_total, cobertura, itens_descricao, entrega_prevista, valido_ate, condicao_pagamento, observacao, arquivo_id, pedido_id, descartado_em, motivo_descarte, created_at, frete_modalidade, frete",
      )
      .eq("obra_id", obraId)
      .order("created_at")
      .limit(LIMITE_LINHAS),
    supabase.from("compras_arquivos").select("id, tipo, pedido_id, fornecedor, caminho, nome, enviado_por, created_at, documento, descricao").eq("obra_id", obraId).order("created_at", { ascending: false }).limit(LIMITE_LINHAS),
  ]);
  if (orcRes.error) throw orcRes.error;
  if (arqRes.error) throw arqRes.error;
  const linhasArq = arqRes.data ?? [];
  const urls = await assinar(supabase, BUCKET_COMPRAS_OBRA, linhasArq.map((a) => a.caminho));
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));
  const arquivoPorId = new Map(linhasArq.map((a) => [a.id, a]));

  const orcamentos = (orcRes.data ?? []).flatMap((o): OrcamentoVM[] => {
    if (o.cobertura !== "kit_completo" && o.cobertura !== "parte") return [];
    const arq = arquivoPorId.get(o.arquivo_id);
    const pedido = o.pedido_id ? pedidoPorId.get(o.pedido_id) : undefined;
    return [
      {
        id: o.id,
        fornecedor: o.fornecedor,
        valorTotal: Number(o.valor_total),
        freteModalidade: o.frete_modalidade === "fob" ? "fob" : "cif",
        frete: Number(o.frete),
        cobertura: o.cobertura,
        itensDescricao: o.itens_descricao,
        entregaPrevista: o.entrega_prevista,
        validoAte: o.valido_ate,
        condicaoPagamento: o.condicao_pagamento,
        observacao: o.observacao,
        arquivo: { nome: arq?.nome ?? "arquivo", url: arq ? (urls.get(arq.caminho) ?? null) : null },
        pedido: pedido && !pedido.cancelado ? { id: pedido.id, numero: pedido.numero, criadoEm: pedido.criadoEm } : null,
        descartado: o.descartado_em != null,
        motivoDescarte: o.motivo_descarte,
        criadoEm: o.created_at,
      },
    ];
  });

  const orcamentoDoArquivo = new Map((orcRes.data ?? []).map((o) => [o.arquivo_id, o]));
  const arquivos = linhasArq.flatMap((a): ArquivoCompraVM[] => {
    if (a.tipo !== "orcamento" && a.tipo !== "confirmacao" && a.tipo !== "outro" && a.tipo !== "documento_cliente") return [];
    const orc = orcamentoDoArquivo.get(a.id);
    const pedido = a.pedido_id ? pedidoPorId.get(a.pedido_id) : undefined;
    return [
      {
        id: a.id,
        tipo: a.tipo,
        documento: a.documento,
        descricao: a.descricao,
        fornecedor: orc?.fornecedor ?? pedido?.fornecedor ?? a.fornecedor,
        pedidoNumero: pedido?.numero ?? null,
        nome: a.nome,
        url: urls.get(a.caminho) ?? null,
        enviadoPor: a.enviado_por ? (nomes.get(a.enviado_por) ?? null) : null,
        enviadoEm: a.created_at,
        descartado: orc?.descartado_em != null,
      },
    ];
  });
  return { orcamentos, arquivos };
}

/** Faturamento do pedido: o cliente da obra (só para quem escreve em Compras nela) e a empresa. */
export async function carregarFaturamentoObra(
  supabase: SupabaseServidor,
  { obraId, empresaId }: { obraId: string; empresaId: string },
): Promise<FaturamentoPedidoVM> {
  const [clienteRes, empresaRes] = await Promise.all([
    supabase.rpc("dados_faturamento_obra", { p_obra_id: obraId }),
    supabase.from("empresas").select("nome, cnpj").eq("id", empresaId).single(),
  ]);
  if (clienteRes.error) throw clienteRes.error;
  if (empresaRes.error) throw empresaRes.error;
  return {
    cliente: clienteFaturamento(clienteRes.data?.[0]),
    empresa: { nome: empresaRes.data.nome, cnpj: empresaRes.data.cnpj },
  };
}

export type DocumentoClienteObraVM = {
  documento: DocumentoCliente;
  arquivo: { nome: string; url: string | null; origem: "negocio" | "engenharia" | "compras"; enviadoEm: string } | null;
};
export type DocumentosClienteObraVM = { exigidos: DocumentoClienteObraVM[]; outros: { descricao: string; nome: string; url: string | null; enviadoEm: string }[] };

/**
 * Documentos do cliente para a distribuidora (Compras) e para a NF do cliente (Administrativo), com o arquivo mais
 * recente da primeira origem que tiver: negócio, Engenharia, Compras. Vazio para quem não escreve em Compras nem atua
 * no Administrativo da obra (o banco devolve vazio; 20261128100000 incluiu o Administrativo).
 */
export async function carregarDocumentosClienteObra(
  supabase: SupabaseServidor,
  { obraId, pj }: { obraId: string; pj: boolean },
): Promise<DocumentosClienteObraVM> {
  const [rpcRes, comprasRes] = await Promise.all([
    supabase.rpc("documentos_cliente_obra", { p_obra_id: obraId }),
    supabase.rpc("documentos_cliente_compras_obra", { p_obra_id: obraId }),
  ]);
  if (rpcRes.error) throw rpcRes.error;
  if (comprasRes.error) throw comprasRes.error;
  const linhas = rpcRes.data ?? [];
  const docsCompras = (comprasRes.data ?? []).map((a) => ({ documento: a.documento, descricao: a.descricao, nome: a.nome, caminho: a.caminho, enviadoEm: a.enviado_em }));
  const [urlsNegocio, urlsEngenharia, urlsCompras] = await Promise.all([
    assinar(supabase, "anexos", linhas.filter((l) => l.origem === "negocio").map((l) => l.caminho)),
    assinar(supabase, BUCKET_DOCUMENTOS_ENGENHARIA, linhas.filter((l) => l.origem === "engenharia").map((l) => l.caminho)),
    assinar(supabase, BUCKET_COMPRAS_OBRA, docsCompras.map((a) => a.caminho)),
  ]);
  const exigidos = documentosExigidos(pj ? "pj" : "pf").map((documento): DocumentoClienteObraVM => {
    const doNegocio = linhas.find((l) => l.documento === documento && l.origem === "negocio");
    if (doNegocio) return { documento, arquivo: { nome: doNegocio.nome, url: urlsNegocio.get(doNegocio.caminho) ?? null, origem: "negocio", enviadoEm: doNegocio.enviado_em } };
    const daEngenharia = linhas.find((l) => l.documento === documento && l.origem === "engenharia");
    if (daEngenharia)
      return { documento, arquivo: { nome: daEngenharia.nome, url: urlsEngenharia.get(daEngenharia.caminho) ?? null, origem: "engenharia", enviadoEm: daEngenharia.enviado_em } };
    // A lista vem mais nova primeiro.
    const deCompras = docsCompras.find((a) => a.documento === documento);
    return { documento, arquivo: deCompras ? { nome: deCompras.nome, url: urlsCompras.get(deCompras.caminho) ?? null, origem: "compras", enviadoEm: deCompras.enviadoEm } : null };
  });
  const outros = docsCompras
    .filter((a) => a.documento === "outro")
    .map((a) => ({ descricao: a.descricao ?? "Outro documento", nome: a.nome, url: urlsCompras.get(a.caminho) ?? null, enviadoEm: a.enviadoEm }));
  return { exigidos, outros };
}
