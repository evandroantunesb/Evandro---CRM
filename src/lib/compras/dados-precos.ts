import type { criarClienteServidor } from "@/lib/supabase/server";
import {
  DIAS_PRECO_ANTIGO,
  diasDesde,
  ehCategoriaMaterial,
  ehMapaColunas,
  ordenarPrecos,
  chaveFornecedor,
  type CategoriaMaterial,
  type MapaColunas,
  type MaterialVM,
  type PrecoAtual,
  type PrecoHistorico,
  type VinculoFornecedor,
} from "./precos";

/*
 * Leitura da tabela de preços (20261129100000_compras_tabela_precos.sql). A RLS decide quem vê; `acessoPrecos` só
 * decide a tela e os botões.
 */

type SupabaseServidor = Awaited<ReturnType<typeof criarClienteServidor>>;

export async function acessoPrecos(supabase: SupabaseServidor, empresaId: string): Promise<{ ver: boolean; editar: boolean }> {
  const [ver, editar] = await Promise.all([
    supabase.rpc("pode_ver_precos_compra", { p_empresa_id: empresaId }),
    supabase.rpc("pode_editar_precos_compra", { p_empresa_id: empresaId }),
  ]);
  if (ver.error) throw ver.error;
  if (editar.error) throw editar.error;
  return { ver: ver.data === true, editar: editar.data === true };
}

const categoria = (v: string): CategoriaMaterial => (ehCategoriaMaterial(v) ? v : "outros");

export async function carregarMateriais(supabase: SupabaseServidor, empresaId: string): Promise<MaterialVM[]> {
  const { data, error } = await supabase.from("compras_materiais").select("id, nome, categoria, unidade").eq("empresa_id", empresaId).order("nome");
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, categoria: categoria(m.categoria) }));
}

export type PrecoAtualVM = { materialId: string; fornecedor: string; preco: number; dataPreco: string };

export async function carregarPrecosAtuais(supabase: SupabaseServidor, empresaId: string): Promise<PrecoAtualVM[]> {
  const { data, error } = await supabase.rpc("precos_atuais_compra", { p_empresa_id: empresaId });
  if (error) throw error;
  return (data ?? []).map((p) => ({ materialId: p.material_id, fornecedor: p.fornecedor, preco: Number(p.preco), dataPreco: p.data_preco }));
}

export type LinhaMaterialVM = MaterialVM & {
  /** Do menor para o maior: o primeiro é o melhor preço. */
  precos: PrecoAtualVM[];
  /** Data do preço mais recente entre os fornecedores. */
  atualizado: string | null;
};

export type TabelaRecebidaVM = {
  id: string;
  fornecedor: string;
  dataTabela: string;
  validoAte: string | null;
  itens: number;
  vencida: boolean;
};

export type TelaPrecosVM = {
  materiais: LinhaMaterialVM[];
  kpis: {
    materiais: number;
    categorias: number;
    fornecedores: number;
    ultima: { fornecedor: string; data: string } | null;
    antigos: number;
    mudaram: { subiram: number; baixaram: number } | null;
  };
  /** A tabela mais recente de cada fornecedor. */
  tabelas: TabelaRecebidaVM[];
};

export async function carregarTelaPrecos(supabase: SupabaseServidor, empresaId: string, hoje: string): Promise<TelaPrecosVM> {
  const [materiais, atuais, tabelasRes] = await Promise.all([
    carregarMateriais(supabase, empresaId),
    carregarPrecosAtuais(supabase, empresaId),
    supabase
      .from("compras_tabelas_preco")
      .select("id, fornecedor, fornecedor_chave, data_tabela, valido_ate, novos, subiram, baixaram, iguais, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (tabelasRes.error) throw tabelasRes.error;

  const porMaterial = new Map<string, PrecoAtualVM[]>();
  for (const p of atuais) porMaterial.set(p.materialId, [...(porMaterial.get(p.materialId) ?? []), p]);
  const linhas = materiais.map((m): LinhaMaterialVM => {
    const precos = ordenarPrecos(porMaterial.get(m.id) ?? []);
    const atualizado = precos.reduce<string | null>((max, p) => (max == null || p.dataPreco > max ? p.dataPreco : max), null);
    return { ...m, precos, atualizado };
  });

  const tabelas = tabelasRes.data ?? [];
  const maisRecente = new Map<string, (typeof tabelas)[number]>();
  for (const t of tabelas) {
    const k = t.fornecedor_chave ?? chaveFornecedor(t.fornecedor);
    const atual = maisRecente.get(k);
    if (!atual || t.data_tabela > atual.data_tabela) maisRecente.set(k, t);
  }
  const ultima = tabelas[0] ?? null;

  return {
    materiais: linhas,
    kpis: {
      materiais: materiais.length,
      categorias: new Set(materiais.map((m) => m.categoria)).size,
      fornecedores: maisRecente.size,
      ultima: ultima ? { fornecedor: ultima.fornecedor, data: ultima.data_tabela } : null,
      antigos: atuais.filter((p) => diasDesde(p.dataPreco, hoje) > DIAS_PRECO_ANTIGO).length,
      mudaram: ultima ? { subiram: ultima.subiram, baixaram: ultima.baixaram } : null,
    },
    tabelas: [...maisRecente.values()]
      .sort((a, b) => b.data_tabela.localeCompare(a.data_tabela))
      .map((t) => ({
        id: t.id,
        fornecedor: t.fornecedor,
        dataTabela: t.data_tabela,
        validoAte: t.valido_ate,
        itens: t.novos + t.subiram + t.baixaram + t.iguais,
        vencida: t.valido_ate != null && t.valido_ate < hoje,
      })),
  };
}

export type MaterialDetalheVM = {
  material: MaterialVM;
  precos: PrecoAtualVM[];
  historico: PrecoHistorico[];
};

export async function carregarMaterial(supabase: SupabaseServidor, empresaId: string, materialId: string): Promise<MaterialDetalheVM | null> {
  const [materialRes, historicoRes, membrosRes] = await Promise.all([
    supabase.from("compras_materiais").select("id, nome, categoria, unidade").eq("empresa_id", empresaId).eq("id", materialId).maybeSingle(),
    supabase
      .from("compras_precos")
      .select("fornecedor, preco, data_preco, created_at, tabela_id, lancado_por")
      .eq("empresa_id", empresaId)
      .eq("material_id", materialId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("empresa_membros").select("id, perfis(nome)").eq("empresa_id", empresaId),
  ]);
  if (materialRes.error) throw materialRes.error;
  if (historicoRes.error) throw historicoRes.error;
  if (!materialRes.data) return null;
  const nomes = new Map((membrosRes.data ?? []).map((m) => [m.id, (m.perfis as { nome: string | null } | null)?.nome ?? null]));
  const historico = (historicoRes.data ?? []).map(
    (p): PrecoHistorico => ({
      fornecedor: p.fornecedor,
      preco: Number(p.preco),
      dataPreco: p.data_preco,
      criadoEm: p.created_at,
      manual: p.tabela_id == null,
      lancadoPor: p.lancado_por ? (nomes.get(p.lancado_por) ?? null) : null,
    }),
  );
  // Preço atual de cada fornecedor: o de data mais recente (empate: o lançado por último).
  const atual = new Map<string, PrecoAtualVM>();
  for (const h of [...historico].sort((a, b) => b.dataPreco.localeCompare(a.dataPreco) || b.criadoEm.localeCompare(a.criadoEm))) {
    const chave = chaveFornecedor(h.fornecedor);
    if (!atual.has(chave)) atual.set(chave, { materialId, fornecedor: h.fornecedor, preco: h.preco, dataPreco: h.dataPreco });
  }
  return {
    material: { ...materialRes.data, categoria: categoria(materialRes.data.categoria) },
    precos: ordenarPrecos([...atual.values()]),
    historico,
  };
}

/** Para a prévia da importação: mapa lembrado, como o fornecedor já chamou cada material e os preços atuais dele. */
export type DadosFornecedorVM = { mapa: MapaColunas | null; vinculos: VinculoFornecedor[]; precosAtuais: PrecoAtual[] };

export async function carregarDadosFornecedor(supabase: SupabaseServidor, empresaId: string, fornecedor: string): Promise<DadosFornecedorVM> {
  const chave = chaveFornecedor(fornecedor);
  const [mapaRes, precosRes] = await Promise.all([
    supabase.from("compras_mapas_colunas").select("mapa").eq("empresa_id", empresaId).eq("fornecedor_chave", chave).maybeSingle(),
    supabase
      .from("compras_precos")
      .select("material_id, codigo_fornecedor, descricao_fornecedor, preco, data_preco, created_at")
      .eq("empresa_id", empresaId)
      .eq("fornecedor_chave", chave)
      .order("data_preco", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);
  if (mapaRes.error) throw mapaRes.error;
  if (precosRes.error) throw precosRes.error;
  const vinculos = new Map<string, VinculoFornecedor>();
  const precosAtuais = new Map<string, PrecoAtual>();
  for (const p of precosRes.data ?? []) {
    if (!precosAtuais.has(p.material_id)) precosAtuais.set(p.material_id, { materialId: p.material_id, preco: Number(p.preco), dataPreco: p.data_preco });
    const k = `${p.codigo_fornecedor ?? ""}|${p.descricao_fornecedor ?? ""}`;
    if (!vinculos.has(k)) vinculos.set(k, { materialId: p.material_id, codigo: p.codigo_fornecedor, descricao: p.descricao_fornecedor });
  }
  const mapa = mapaRes.data?.mapa;
  return { mapa: ehMapaColunas(mapa) ? mapa : null, vinculos: [...vinculos.values()], precosAtuais: [...precosAtuais.values()] };
}

/** Materiais com preço, para o "Preço da tabela" do pedido de compra. Vazio para quem não vê a tabela (RLS). */
export type MaterialPedidoVM = { id: string; nome: string; unidade: string; precos: { fornecedor: string; preco: number; dataPreco: string }[] };

export async function carregarTabelaParaPedido(supabase: SupabaseServidor, empresaId: string): Promise<MaterialPedidoVM[]> {
  const [materiais, atuais] = await Promise.all([carregarMateriais(supabase, empresaId), carregarPrecosAtuais(supabase, empresaId)]);
  const porMaterial = new Map<string, PrecoAtualVM[]>();
  for (const p of atuais) porMaterial.set(p.materialId, [...(porMaterial.get(p.materialId) ?? []), p]);
  return materiais
    .filter((m) => porMaterial.has(m.id))
    .map((m) => ({ id: m.id, nome: m.nome, unidade: m.unidade, precos: ordenarPrecos(porMaterial.get(m.id)!).map(({ fornecedor, preco, dataPreco }) => ({ fornecedor, preco, dataPreco })) }));
}
