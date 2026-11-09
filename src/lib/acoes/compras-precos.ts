"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { carregarDadosFornecedor, type DadosFornecedorVM } from "@/lib/compras/dados-precos";
import { CATEGORIAS_MATERIAL, MAX_PRECOS_POR_TABELA, ehMapaColunas, type MapaColunas } from "@/lib/compras/precos";
import { mensagemErro } from "@/lib/erros";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Tabela de preços de material (20261129100000_compras_tabela_precos.sql). Cada ação só valida a forma e chama a RPC;
 * quem pode e o que vale ficam no banco. A planilha não passa por Server Action: o navegador a lê, envia o arquivo ao
 * Storage e a ação recebe só o caminho e as linhas já interpretadas.
 */

const uuid = z.string().uuid();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const fornecedor = z.string().trim().min(2, "Informe o fornecedor.").max(120, "Nome do fornecedor muito longo.");
const material = z.object({
  nome: z.string().trim().min(2, "Informe o nome do material (de 2 a 120 caracteres).").max(120, "Nome do material muito longo."),
  categoria: z.enum(CATEGORIAS_MATERIAL, "Escolha a categoria do material."),
  unidade: z.string().trim().min(1, "Informe a unidade.").max(20, "Unidade muito longa."),
});
const preco = z.number({ message: "Informe o preço de custo." }).finite().positive("Informe o preço de custo.").lt(1e10, "Preço muito alto.");

function revalidarPrecos(materialId?: string) {
  revalidatePath("/compras/precos");
  if (materialId) revalidatePath(`/compras/precos/material/${materialId}`);
}

export async function criarMaterialCompra(dados: z.input<typeof material>): Promise<ResultadoAcao & { id?: string }> {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const d = material.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc("criar_material_compra", {
    p_empresa_id: atual.empresaId,
    p_nome: d.data.nome,
    p_categoria: d.data.categoria,
    p_unidade: d.data.unidade,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível cadastrar o material.") };
  revalidarPrecos();
  return { ok: true, mensagem: "Material cadastrado.", id: id as string };
}

export async function editarMaterialCompra(dados: z.input<typeof material> & { materialId: string }): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = material.extend({ materialId: uuid }).safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("editar_material_compra", {
    p_material_id: d.data.materialId,
    p_nome: d.data.nome,
    p_categoria: d.data.categoria,
    p_unidade: d.data.unidade,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o material.") };
  revalidarPrecos(d.data.materialId);
  return { ok: true, mensagem: "Material salvo." };
}

const esquemaPrecoManual = z.object({
  materialId: uuid,
  fornecedor,
  preco,
  data,
  codigo: z.string().trim().max(60, "Código muito longo."),
});

export async function lancarPrecoCompra(dados: z.input<typeof esquemaPrecoManual>): Promise<ResultadoAcao> {
  await exigirPapel(...GERIR_OBRAS);
  const d = esquemaPrecoManual.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("lancar_preco_compra", {
    p_material_id: d.data.materialId,
    p_fornecedor: d.data.fornecedor,
    p_preco: d.data.preco,
    p_data: d.data.data,
    p_codigo: d.data.codigo || undefined,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível lançar o preço.") };
  revalidarPrecos(d.data.materialId);
  return { ok: true, mensagem: "Preço lançado." };
}

/** Mapa de colunas lembrado e como o fornecedor já chamou cada material (para a prévia). */
export async function dadosFornecedorTabela(nome: string): Promise<DadosFornecedorVM | null> {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const f = fornecedor.safeParse(nome);
  if (!f.success) return null;
  return carregarDadosFornecedor(await criarClienteServidor(), atual.empresaId, f.data);
}

const texto = (max: number) => z.string().trim().min(1).max(max);
const base = { codigo: z.string().trim().max(60).nullable(), descricao: texto(200), preco };
const esquemaImportacao = z.object({
  fornecedor,
  dataTabela: data,
  validoAte: data.nullable(),
  arquivo: z.object({ caminho: z.string().min(1).max(400), nome: texto(200) }),
  linhasLidas: z.number().int().min(1),
  ignoradas: z.number().int().min(0),
  mapa: z.custom<MapaColunas>(ehMapaColunas, "Indique as colunas da planilha."),
  itens: z
    .array(z.union([z.object({ material_id: uuid, ...base }), z.object({ novo: material, ...base })]))
    .min(1, "Nenhum preço para importar.")
    .max(MAX_PRECOS_POR_TABELA, "A tabela tem preços demais. Divida a planilha."),
});

export async function importarTabelaPrecos(
  dados: z.input<typeof esquemaImportacao>,
): Promise<ResultadoAcao & { contagem?: { novos: number; subiram: number; baixaram: number; iguais: number } }> {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const d = esquemaImportacao.safeParse(dados);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { data: r, error } = await supabase.rpc("importar_tabela_precos", {
    p_empresa_id: atual.empresaId,
    p_fornecedor: d.data.fornecedor,
    p_data_tabela: d.data.dataTabela,
    p_caminho: d.data.arquivo.caminho,
    p_nome_arquivo: d.data.arquivo.nome,
    p_linhas_lidas: d.data.linhasLidas,
    p_ignoradas: d.data.ignoradas,
    p_mapa: d.data.mapa,
    p_itens: d.data.itens,
    ...(d.data.validoAte ? { p_valido_ate: d.data.validoAte } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível importar a tabela.") };
  revalidarPrecos();
  const c = r as { novos: number; subiram: number; baixaram: number; iguais: number };
  const total = c.novos + c.subiram + c.baixaram + c.iguais;
  return { ok: true, mensagem: `${total.toLocaleString("pt-BR")} preços importados.`, contagem: c };
}
