import { z } from "zod";

/**
 * Catálogo técnico de componentes (módulos e inversores) via API da OpenSolar,
 * usado só pra puxar ficha técnica ao montar o kit personalizado — não é
 * catálogo de distribuidor brasileiro (sem preço/estoque real). Ver decisão
 * em memória do projeto ("raion-api-fornecedor-pesquisa").
 */

export type ComponenteCatalogo = { id: number; descricao: string; potenciaW: number | null };

const esquemaModulo = z.object({
  id: z.number(),
  manufacturer_name: z.string(),
  code: z.string(),
  data: z.string(),
});

const esquemaInversor = z.object({
  id: z.number(),
  manufacturer_name: z.string(),
  code: z.string(),
  data: z.string(),
});

function potenciaWattsDoJson(dataJson: string, ...campos: string[]): number | null {
  try {
    const dados = JSON.parse(dataJson) as Record<string, unknown>;
    for (const campo of campos) {
      const v = dados[campo];
      if (typeof v === "number" && v > 0) return Math.round(v * 1000);
    }
  } catch {
    // Ficha técnica em formato inesperado: segue sem potência (vendedor preenche à mão).
  }
  return null;
}

async function buscarAtivacoes(endpoint: "component_module_activations" | "component_inverter_activations") {
  const token = process.env.OPENSOLAR_API_TOKEN;
  const orgId = process.env.OPENSOLAR_ORG_ID;
  if (!token || !orgId) return null;

  const resposta = await fetch(`https://api.opensolar.com/api/orgs/${orgId}/${endpoint}/?fieldset=list`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!resposta.ok) return null;
  return resposta.json();
}

/** Módulos ativados na organização da OpenSolar, filtrados por texto (fabricante ou código). */
export async function buscarModulosCatalogo(termo: string): Promise<ComponenteCatalogo[]> {
  const itens = await buscarAtivacoes("component_module_activations");
  if (!Array.isArray(itens)) return [];
  const t = termo.trim().toLowerCase();
  return itens
    .map((item) => esquemaModulo.safeParse(item))
    .filter((r) => r.success)
    .map((r) => {
      const m = r.data!;
      return {
        id: m.id,
        descricao: `${m.manufacturer_name} ${m.code}`,
        potenciaW: potenciaWattsDoJson(m.data, "kw_stc"),
      };
    })
    .filter((c) => !t || c.descricao.toLowerCase().includes(t));
}

/** Inversores ativados na organização da OpenSolar, filtrados por texto (fabricante ou código). */
export async function buscarInversoresCatalogo(termo: string): Promise<ComponenteCatalogo[]> {
  const itens = await buscarAtivacoes("component_inverter_activations");
  if (!Array.isArray(itens)) return [];
  const t = termo.trim().toLowerCase();
  return itens
    .map((item) => esquemaInversor.safeParse(item))
    .filter((r) => r.success)
    .map((r) => {
      const inv = r.data!;
      return {
        id: inv.id,
        descricao: `${inv.manufacturer_name} ${inv.code}`,
        potenciaW: potenciaWattsDoJson(inv.data, "kw_stc", "kw_rated", "power_rating"),
      };
    })
    .filter((c) => !t || c.descricao.toLowerCase().includes(t));
}
