import { describe, expect, it } from "vitest";
import { estadoSetor, estadosObra, filtrar, kpis, type ObraFiltravel } from "@/lib/obras/derivados";
import {
  ROTULO_STATUS,
  SETORES_OPERACIONAIS,
  STATUS_FINAL,
  STATUS_INICIAL,
  STATUS_POR_SETOR,
} from "@/lib/obras/rotulos";

// Copiados do CHECK obra_fluxos_status_valido (20261006220000_obras_base.sql).
const CHECK_DB = {
  compras: ["a_comprar", "cotando", "pedido_realizado", "faturado_fornecedor"],
  engenharia: [
    "a_iniciar",
    "projeto_em_elaboracao",
    "enviado_concessionaria",
    "aprovado",
    "aguardando_vistoria",
    "concluido",
  ],
  operacional: [
    "aguardando_liberacao",
    "liberada_agendamento",
    "agendada",
    "em_instalacao",
    "instalacao_concluida",
    "concluido",
  ],
};

const fluxo = (
  status: string,
  extra: Partial<{ parado: boolean; aguardando: string | null }> = {},
) => ({ status, parado: false, aguardando: null, ...extra });

function obra(
  o: Partial<ObraFiltravel> & {
    s?: Partial<Record<"compras" | "engenharia" | "operacional", ReturnType<typeof fluxo> | null>>;
  } = {},
): ObraFiltravel {
  const { s, ...resto } = o;
  return {
    numero: 1,
    clienteNome: "Cliente",
    cidade: "Cascavel",
    pausada: false,
    cancelada: false,
    alertaEstorno: false,
    vendaAlterada: false,
    setores: {
      compras: fluxo("a_comprar"),
      engenharia: fluxo("a_iniciar"),
      operacional: fluxo("aguardando_liberacao"),
      ...s,
    },
    ...resto,
  };
}

const concluidas = {
  compras: fluxo("faturado_fornecedor"),
  engenharia: fluxo("concluido"),
  operacional: fluxo("concluido"),
};

describe("rótulos", () => {
  it("status por setor espelham o CHECK do banco, na ordem", () => {
    expect(STATUS_POR_SETOR).toEqual(CHECK_DB);
    expect([...SETORES_OPERACIONAIS]).toEqual(["compras", "engenharia", "operacional"]);
  });
  it("inicial e final são a ponta da lista e todo status tem rótulo", () => {
    for (const s of SETORES_OPERACIONAIS) {
      expect(STATUS_INICIAL[s]).toBe(CHECK_DB[s][0]);
      expect(STATUS_FINAL[s]).toBe(CHECK_DB[s].at(-1));
      expect(Object.keys(ROTULO_STATUS[s])).toEqual(CHECK_DB[s]);
    }
  });
});

describe("estadoSetor", () => {
  it("estados simples", () => {
    expect(estadoSetor("compras", fluxo("a_comprar"))).toBe("nao_iniciado");
    expect(estadoSetor("compras", fluxo("cotando"))).toBe("em_andamento");
    expect(estadoSetor("compras", fluxo("faturado_fornecedor"))).toBe("concluido");
    expect(estadoSetor("engenharia", fluxo("concluido"))).toBe("concluido");
  });
  it("precedência: parado > aguardando > concluído > não iniciado > em andamento", () => {
    expect(
      estadoSetor("engenharia", fluxo("concluido", { parado: true, aguardando: "cliente" })),
    ).toBe("parado");
    expect(estadoSetor("engenharia", fluxo("concluido", { aguardando: "cliente" }))).toBe(
      "aguardando",
    );
    expect(estadoSetor("engenharia", fluxo("a_iniciar", { aguardando: "concessionaria" }))).toBe(
      "aguardando",
    );
    expect(estadoSetor("engenharia", fluxo("a_iniciar", { parado: true }))).toBe("parado");
    expect(estadoSetor("engenharia", fluxo("aprovado", { parado: true }))).toBe("parado");
  });
});

describe("estadosObra", () => {
  it("sem nada: lista vazia", () => expect(estadosObra(obra())).toEqual([]));
  it("flags da obra e derivados", () => {
    const e = estadosObra(
      obra({
        cancelada: true,
        pausada: true,
        alertaEstorno: true,
        vendaAlterada: true,
        s: {
          compras: fluxo("cotando", { parado: true }),
          engenharia: fluxo("aprovado", { aguardando: "cliente" }),
        },
      }),
    );
    expect(e).toEqual([
      "cancelada",
      "pausada",
      "estorno",
      "venda_alterada",
      "parado",
      "aguardando",
    ]);
  });
  it("concluída só com os três setores concluídos", () => {
    expect(estadosObra(obra({ s: concluidas }))).toEqual(["concluida"]);
    expect(estadosObra(obra({ s: { ...concluidas, operacional: fluxo("agendada") } }))).toEqual([]);
    expect(
      estadosObra(
        obra({ s: { ...concluidas, operacional: fluxo("concluido", { parado: true }) } }),
      ),
    ).toEqual(["parado"]);
  });
});

describe("kpis", () => {
  it("só contagens", () => {
    const lista = [
      obra(),
      obra({ s: concluidas }),
      obra({ cancelada: true }),
      obra({ pausada: true, alertaEstorno: true }),
      obra({ vendaAlterada: true, s: { compras: fluxo("cotando", { parado: true }) } }),
      obra({ s: { engenharia: fluxo("aprovado", { aguardando: "cliente" }) } }),
    ];
    expect(kpis(lista)).toEqual({
      total: 6,
      emAndamento: 4,
      comSetorParado: 1,
      comSetorAguardando: 1,
      concluidas: 1,
      pausadas: 1,
      canceladas: 1,
      comAlerta: 2,
    });
  });
  it("lista vazia", () => expect(kpis([]).total).toBe(0));
});

describe("filtrar", () => {
  const a = obra({ numero: 10, clienteNome: "João Silva", cidade: "Cascavel" });
  const b = obra({
    numero: 11,
    clienteNome: "Maria",
    cidade: "Foz do Iguaçu",
    pausada: true,
    s: { engenharia: fluxo("aprovado", { parado: true }) },
  });
  const c = obra({
    numero: 12,
    clienteNome: "Pedro",
    cidade: null,
    cancelada: true,
    vendaAlterada: true,
    s: concluidas,
  });
  const lista = [a, b, c];

  it("busca por cliente, número e cidade, sem acento/caixa", () => {
    expect(filtrar(lista, { busca: "joao" })).toEqual([a]);
    expect(filtrar(lista, { busca: "11" })).toEqual([b]);
    expect(filtrar(lista, { busca: "iguacu" })).toEqual([b]);
  });
  it("setor e estado do setor", () => {
    expect(filtrar(lista, { setor: "engenharia", estadoSetor: "parado" })).toEqual([b]);
    expect(filtrar(lista, { setor: "compras", estadoSetor: "parado" })).toEqual([]);
    expect(filtrar(lista, { estadoSetor: "concluido" })).toEqual([c]);
    expect(filtrar(lista, { setor: "operacional" })).toEqual(lista);
    expect(filtrar(lista, { setor: "todos", estadoSetor: "nao_iniciado" })).toEqual([a, b]);
  });
  it("estado da obra", () => {
    expect(filtrar(lista, { estadoObra: "pausada" })).toEqual([b]);
    expect(filtrar(lista, { estadoObra: "cancelada" })).toEqual([c]);
    expect(filtrar(lista, { estadoObra: "alerta" })).toEqual([c]);
    expect(filtrar(lista, { estadoObra: "todas" })).toEqual(lista);
  });
  it("combina filtros", () => {
    expect(
      filtrar(lista, {
        busca: "maria",
        estadoObra: "pausada",
        setor: "engenharia",
        estadoSetor: "parado",
      }),
    ).toEqual([b]);
  });
});

describe("fluxo ausente (inconsistência de dados)", () => {
  it("setor sem fluxo fica indisponível: nenhum status é inventado", () => {
    expect(estadoSetor("operacional", null)).toBe("indisponivel");
  });

  it("vira alerta factual na obra, não conta como concluída e entra no filtro de alerta", () => {
    const semFluxo = obra({ s: { ...concluidas, operacional: null } });
    expect(estadosObra(semFluxo)).toEqual(["fluxo_ausente"]);
    const k = kpis([semFluxo, obra()]);
    expect(k.comAlerta).toBe(1);
    expect(k.concluidas).toBe(0);
    expect(k.emAndamento).toBe(2);
    expect(filtrar([semFluxo, obra()], { estadoObra: "alerta" })).toEqual([semFluxo]);
    expect(filtrar([semFluxo, obra()], { estadoSetor: "indisponivel" })).toEqual([semFluxo]);
  });
});
