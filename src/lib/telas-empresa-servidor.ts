import "server-only";
import { cache } from "react";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";
import { TELAS_PADRAO, areaLigada, telasDaEmpresa, type Area, type TelasEmpresa } from "@/lib/telas-empresa";

/**
 * Telas da empresa em uso (20261203100000_telas_empresa.sql): telas e setores desligados pelo admin, plano (solo/pro) e
 * Eletroposto liberado pelo super-admin. Falha ao ler = o padrão de sempre (PRO, tudo ligado), sem quebrar o app.
 */
export async function lerTelasEmpresa(supabase: SupabaseServidor, empresaId: string): Promise<TelasEmpresa> {
  const [telas, empresa, produto] = await Promise.all([
    supabase.from("empresa_telas").select("desligadas, setores_desligados").eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("empresas").select("eletroposto_ativo").eq("id", empresaId).maybeSingle(),
    supabase.rpc("produto_da_empresa", { p_empresa_id: empresaId }),
  ]);
  const erro = telas.error ?? empresa.error ?? produto.error;
  if (erro) {
    console.error("Não foi possível ler as telas da empresa; seguindo com o padrão.", erro);
    return TELAS_PADRAO;
  }
  return telasDaEmpresa({
    produto: produto.data === "solo" ? "solo" : "pro",
    desligadas: telas.data?.desligadas ?? [],
    setoresDesligados: telas.data?.setores_desligados ?? [],
    eletropostoLiberado: !!empresa.data?.eletroposto_ativo,
  });
}

/** Uma leitura por requisição, para a empresa em uso. Sem empresa (só super-admin): o padrão. */
export const obterTelasEmpresa = cache(async (): Promise<TelasEmpresa> => {
  const { atual } = await obterSessao();
  if (!atual) return TELAS_PADRAO;
  return lerTelasEmpresa(await criarClienteServidor(), atual.empresaId);
});

/** A área está ligada na empresa em uso (os `layout.tsx` das áreas opcionais mostram o aviso quando não). */
export const telaPermitida = async (area: Area): Promise<boolean> => areaLigada(await obterTelasEmpresa(), area);
