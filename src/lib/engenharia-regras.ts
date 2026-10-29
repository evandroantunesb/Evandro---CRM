import type { ObraListaVM } from "@/lib/obras/dados";
import { setorConcluido } from "@/lib/obras/derivados";
import { STATUS_POR_SETOR } from "@/lib/obras/rotulos";

/**
 * Obras em andamento agrupadas pelo status do setor Engenharia, na ordem do fluxo. Só fatos registrados: o
 * status, o estado (parado/aguardando) e quem é o responsável principal. Sem percentual, SLA nem semáforo.
 */

export type ObraNaEngenharia = {
  id: string;
  numero: number;
  clienteNome: string;
  cidadeUf: string;
  potenciaKwp: number | null;
  estado: ObraListaVM["setores"][number]["estado"];
  aguardando: string | null;
  principalNome: string | null;
};

export type GrupoEngenharia = { status: string; rotulo: string; obras: ObraNaEngenharia[] };

export function agruparObrasEngenharia(obras: readonly ObraListaVM[], rotuloStatus: (status: string) => string): GrupoEngenharia[] {
  const grupos = new Map<string, ObraNaEngenharia[]>(
    STATUS_POR_SETOR.engenharia.filter((s) => !setorConcluido("engenharia", s)).map((s) => [s, []]),
  );
  for (const o of obras) {
    if (o.situacao !== "em_andamento") continue;
    const eng = o.setores.find((s) => s.setor === "engenharia");
    if (!eng?.status || setorConcluido("engenharia", eng.status)) continue;
    // Status que o banco aceite e a lista não conheça ainda vira grupo próprio, no fim: nunca some da tela.
    const lista = grupos.get(eng.status) ?? [];
    grupos.set(eng.status, lista);
    lista.push({
      id: o.id,
      numero: o.numero,
      clienteNome: o.clienteNome,
      cidadeUf: [o.cidade, o.uf].filter(Boolean).join("/") || "—",
      potenciaKwp: o.potenciaKwp,
      estado: eng.estado,
      aguardando: eng.aguardando,
      principalNome: eng.principalNome,
    });
  }
  return [...grupos].map(([status, lista]) => ({ status, rotulo: rotuloStatus(status), obras: lista.sort((a, b) => a.numero - b.numero) }));
}
