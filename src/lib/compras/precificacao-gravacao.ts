import "server-only";
import { autorizarGravacaoCalculo } from "@/lib/calculo-gravacao";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { TipoComponenteKit } from "@/lib/tipos";
import { MARGENS_ZERADAS, type MargensCategoria } from "./margens";
import { melhoresCustos, precificarKit, type AvisoPreco, type ItemPrecificacao, type PrecificacaoKit } from "./precificacao-kit";
import { ehCategoriaMaterial } from "./precos";

/*
 * Compras P4b: preço do kit pela tabela de preços, no servidor (20261201100000_kit_pela_tabela.sql). O vendedor não lê
 * custo nem margem (RLS), então o servidor lê com a chave de serviço, DEPOIS de a sessão provar acesso:
 *   - prévia (novo negócio, antes de gravar): `tem_acesso_comercial` na empresa da sessão;
 *   - retrato (negócio gravado): `autorizar_gravacao_calculo` no negócio, o mesmo do cálculo.
 * Para fora sai só o preço sugerido e os avisos sem custo; o custo vai direto para `negocio_custo_kit`.
 */

type Admin = ReturnType<typeof criarClienteAdmin>;

function clienteAdmin(): Admin | null {
  try {
    return criarClienteAdmin();
  } catch {
    return null;
  }
}

async function carregarBase(admin: Admin, empresaId: string, materialIds: string[]) {
  const [margensRes, parametrosRes, materiaisRes, precosRes] = await Promise.all([
    admin.from("compras_margens").select("categoria, margem").eq("empresa_id", empresaId),
    admin
      .from("parametros_calculadora")
      .select("custo_instalacao_por_modulo, custo_material_ca_por_kwp, custo_engenharia, comissao_percentual")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    materialIds.length
      ? admin.from("compras_materiais").select("id, categoria").eq("empresa_id", empresaId).in("id", materialIds)
      : Promise.resolve({ data: [], error: null }),
    materialIds.length
      ? admin
          .from("compras_precos")
          .select("material_id, fornecedor, fornecedor_chave, preco, data_preco, tabela_id, created_at")
          .eq("empresa_id", empresaId)
          .in("material_id", materialIds)
          .order("data_preco", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [margensRes, parametrosRes, materiaisRes, precosRes]) if (r.error) throw r.error;
  const p = parametrosRes.data;
  if (!p) return null;
  const margens: MargensCategoria = { ...MARGENS_ZERADAS };
  for (const m of margensRes.data ?? []) if (ehCategoriaMaterial(m.categoria)) margens[m.categoria] = Number(m.margem);
  const categoria = new Map((materiaisRes.data ?? []).map((m) => [m.id, ehCategoriaMaterial(m.categoria) ? m.categoria : "outros"] as const));
  const tabelaIds = [...new Set((precosRes.data ?? []).map((l) => l.tabela_id).filter((x): x is string => x != null))];
  const tabelasRes = tabelaIds.length
    ? await admin.from("compras_tabelas_preco").select("id, valido_ate").eq("empresa_id", empresaId).in("id", tabelaIds)
    : { data: [], error: null };
  if (tabelasRes.error) throw tabelasRes.error;
  const validade = new Map((tabelasRes.data ?? []).map((t) => [t.id, t.valido_ate] as const));
  const custos = melhoresCustos(
    (precosRes.data ?? [])
      .filter((l) => categoria.has(l.material_id))
      .map((l) => ({
        materialId: l.material_id,
        categoria: categoria.get(l.material_id)!,
        fornecedorChave: l.fornecedor_chave ?? l.fornecedor.toLowerCase(),
        fornecedor: l.fornecedor,
        preco: Number(l.preco),
        dataPreco: l.data_preco,
        validoAte: l.tabela_id ? (validade.get(l.tabela_id) ?? null) : null,
      })),
  );
  return {
    margens,
    custos,
    parametros: {
      custoInstalacaoPorModulo: Number(p.custo_instalacao_por_modulo),
      custoMaterialCaPorKwp: Number(p.custo_material_ca_por_kwp),
      custoEngenharia: Number(p.custo_engenharia),
      comissaoPercentual: Number(p.comissao_percentual),
    },
  };
}

async function calcular(admin: Admin, empresaId: string, itens: ItemPrecificacao[]): Promise<PrecificacaoKit | null> {
  const ids = [...new Set(itens.map((i) => i.materialId).filter((x): x is string => x != null))];
  const base = await carregarBase(admin, empresaId, ids);
  if (!base) return null;
  return precificarKit({ itens, ...base, hoje: hojeEmSaoPaulo() });
}

export type PreviaPrecoKit = {
  sugerido: number | null;
  avisos: AvisoPreco[];
  /** Algum item usa a tabela de preços (material ou preço à mão). Sem isso, o kit não é precificado pela tabela. */
  usaTabela: boolean;
};

const usaTabela = (itens: ItemPrecificacao[]) => itens.some((i) => i.materialId != null || i.precoVendaManual != null);

/** Prévia do preço (sem gravar), para o novo negócio. Só com acesso comercial à empresa da sessão. */
export async function previaPrecoKit(supabase: SupabaseServidor, empresaId: string, itens: ItemPrecificacao[]): Promise<PreviaPrecoKit | null> {
  const { data: pode } = await supabase.rpc("tem_acesso_comercial", { p_empresa_id: empresaId });
  const admin = clienteAdmin();
  if (pode !== true || !admin) return null;
  const r = await calcular(admin, empresaId, itens);
  return r && { sugerido: r.sugerido, avisos: r.avisos, usaTabela: usaTabela(itens) };
}

/**
 * Recalcula e grava o retrato do negócio (preço sugerido e custo do kit) a partir dos itens gravados. Kit vazio apaga o
 * retrato. Devolve o que o vendedor pode ver, ou null se não foi possível (o negócio e o kit continuam salvos).
 */
export async function gravarPrecificacaoNegocio(supabase: SupabaseServidor, negocioId: string): Promise<PreviaPrecoKit | null> {
  const autorizado = await autorizarGravacaoCalculo(supabase, negocioId);
  const admin = clienteAdmin();
  if (!autorizado.ok || !admin) return null;
  const { empresaId } = autorizado.autorizacao;
  const { data: kit, error } = await admin
    .from("kit_componentes")
    .select("tipo, descricao, quantidade, potencia_w, material_id, preco_venda_manual")
    .eq("negocio_id", negocioId)
    .order("ordem");
  if (error) return null;
  if (!kit?.length) {
    await Promise.all([
      admin.from("negocio_precificacao").delete().eq("negocio_id", negocioId),
      admin.from("negocio_custo_kit").delete().eq("negocio_id", negocioId),
    ]);
    return { sugerido: null, avisos: [], usaTabela: false };
  }
  const itens: ItemPrecificacao[] = kit.map((k) => ({
    tipo: k.tipo as TipoComponenteKit,
    descricao: k.descricao,
    quantidade: k.quantidade,
    potenciaW: k.potencia_w == null ? null : Number(k.potencia_w),
    materialId: k.material_id,
    precoVendaManual: k.preco_venda_manual == null ? null : Number(k.preco_venda_manual),
  }));
  const r = await calcular(admin, empresaId, itens);
  if (!r) return null;
  const agora = new Date().toISOString();
  const [a, b] = await Promise.all([
    admin
      .from("negocio_precificacao")
      .upsert({ negocio_id: negocioId, empresa_id: empresaId, preco_sugerido: r.sugerido, avisos: r.avisos, calculado_em: agora }),
    admin.from("negocio_custo_kit").upsert({
      negocio_id: negocioId,
      empresa_id: empresaId,
      custo_itens: r.custoItens,
      parcial: r.parcial,
      itens: r.itensCusto,
      calculado_em: agora,
    }),
  ]);
  if (a.error || b.error) return null;
  return { sugerido: r.sugerido, avisos: r.avisos, usaTabela: usaTabela(itens) };
}
