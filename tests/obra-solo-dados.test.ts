import { describe, expect, it } from "vitest";
import { carregarObrasSolo, numerosSolo, type ObraSoloListaVM } from "@/lib/obras/solo-dados";
import type { SupabaseServidor } from "@/lib/supabase/server";

type Linha = Record<string, unknown>;

/** Cliente falso: cada tabela devolve as linhas dadas, filtradas pelos `eq` pedidos. */
function criarFake(tabelas: Record<string, Linha[]>) {
  const chamadas: string[] = [];
  const consulta = (nome: string) => {
    let linhas = tabelas[nome] ?? [];
    const q = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        linhas = linhas.filter((l) => l[coluna] === valor);
        return q;
      },
      order: () => q,
      then: (resolve: (r: { data: Linha[]; error: null }) => unknown) => resolve({ data: linhas, error: null }),
    };
    return q;
  };
  return {
    chamadas,
    cliente: {
      from: (nome: string) => {
        chamadas.push(nome);
        return consulta(nome);
      },
    } as unknown as SupabaseServidor,
  };
}

const ETAPAS = ["contrato", "entrada", "projeto_art", "material_comprado", "protocolo", "material_entregue", "instalacao", "vistoria", "conexao", "entrega"];
const checklist = (obra: string, feitas: number, extra: Partial<Record<string, Linha>> = {}): Linha[] =>
  ETAPAS.map((etapa, i) => ({
    obra_id: obra,
    empresa_id: "e1",
    etapa,
    feita_em: i < feitas ? "2026-10-01" : null,
    nao_se_aplica_motivo: null,
    prevista_para: null,
    ...extra[etapa],
  }));
const obra = (id: string, numero: number, extra: Linha = {}): Linha => ({
  id,
  empresa_id: "e1",
  numero,
  cliente_nome: `Cliente ${numero}`,
  cidade: "Campinas",
  uf: "SP",
  potencia_kwp: "8.2",
  pausada_em: null,
  cancelada_em: null,
  ...extra,
});

describe("carregarObrasSolo", () => {
  it("monta andamento, etapa atual com a data prevista e a situação de cada obra", async () => {
    const f = criarFake({
      obras: [obra("o1", 1), obra("o2", 2), obra("o3", 3, { cancelada_em: "2026-10-05T00:00:00Z" }), obra("x", 9, { empresa_id: "e2" })],
      obra_checklist: [
        ...checklist("o1", 7, { vistoria: { prevista_para: "2026-11-21" } }),
        ...checklist("o2", 10, { entrega: { feita_em: "2026-10-28" } }),
        ...checklist("o3", 2),
      ],
    });
    const obras = await carregarObrasSolo(f.cliente, "e1");
    expect(obras.map((o) => o.numero)).toEqual([1, 2, 3]);
    const [o1, o2, o3] = obras;
    expect(o1).toMatchObject({ situacao: "em_andamento", atualPrevistaPara: "2026-11-21", potenciaKwp: 8.2 });
    expect(o1.andamento).toEqual({ resolvidas: 7, total: 10, atual: "vistoria", concluida: false });
    expect(o2).toMatchObject({ situacao: "entregue", entregueEm: "2026-10-28" });
    expect(o3.situacao).toBe("cancelada");
  });

  it("obra sem checklist fica de fora", async () => {
    const f = criarFake({ obras: [obra("o1", 1), obra("o2", 2)], obra_checklist: checklist("o1", 2) });
    expect((await carregarObrasSolo(f.cliente, "e1")).map((o) => o.id)).toEqual(["o1"]);
  });
});

describe("numerosSolo", () => {
  const vm = (extra: Partial<ObraSoloListaVM>): ObraSoloListaVM => ({
    id: "o",
    numero: 1,
    clienteNome: "Fazenda Boa Vista",
    cidade: null,
    uf: null,
    potenciaKwp: 10,
    situacao: "em_andamento",
    andamento: { resolvidas: 2, total: 10, atual: "projeto_art", concluida: false },
    linhas: [],
    atualPrevistaPara: null,
    entregueEm: null,
    ...extra,
  });

  it("conta entregues só no ano corrente e soma o kWp em andamento", () => {
    const n = numerosSolo(
      [
        vm({ potenciaKwp: 8.2 }),
        vm({ potenciaKwp: 30 }),
        vm({ situacao: "entregue", entregueEm: "2026-03-01" }),
        vm({ situacao: "entregue", entregueEm: "2025-12-30" }),
        vm({ situacao: "cancelada" }),
      ],
      "2026-11-11",
    );
    expect(n).toMatchObject({ emAndamento: 2, kwpEmAndamento: 38.2, entreguesNoAno: 1 });
  });

  it("próxima data prevista: a menor de hoje em diante, com a etapa e o cliente", () => {
    const n = numerosSolo(
      [
        vm({ atualPrevistaPara: "2026-11-01" }),
        vm({ atualPrevistaPara: "2026-11-21", clienteNome: "Marcos Pereira", andamento: { resolvidas: 7, total: 10, atual: "vistoria", concluida: false } }),
        vm({ atualPrevistaPara: "2026-11-15", clienteNome: "Fazenda Boa Vista", andamento: { resolvidas: 9, total: 10, atual: "conexao", concluida: false } }),
        vm({ situacao: "pausada", atualPrevistaPara: "2026-11-12" }),
      ],
      "2026-11-11",
    );
    expect(n.proximaPrevista).toEqual({ data: "2026-11-15", etapa: "conexao", clienteNome: "Fazenda Boa Vista" });
    expect(numerosSolo([vm({})], "2026-11-11").proximaPrevista).toBeNull();
  });
});
