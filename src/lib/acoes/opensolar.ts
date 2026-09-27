"use server";

import { exigirPapel } from "@/lib/sessao";
import { buscarInversoresCatalogo, buscarModulosCatalogo, type ComponenteCatalogo } from "@/lib/opensolar";

/** Busca módulos ou inversores no catálogo técnico (OpenSolar) pro autopreenchimento do kit. */
export async function buscarComponentesCatalogo(
  tipo: "modulo" | "inversor",
  termo: string,
): Promise<ComponenteCatalogo[]> {
  await exigirPapel();
  if (termo.trim().length < 2) return [];
  return tipo === "modulo" ? buscarModulosCatalogo(termo) : buscarInversoresCatalogo(termo);
}
