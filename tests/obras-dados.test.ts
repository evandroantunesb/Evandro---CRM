import { describe, expect, it } from "vitest";
import { carregarObras } from "@/lib/obras/dados";
import type { SupabaseServidor } from "@/lib/supabase/server";

type Chamada = { tipo: "from" | "rpc"; nome: string; select?: string };

function mock(tabelas: Record<string, unknown[]>, rpcs: Record<string, unknown[]>) {
  const chamadas: Chamada[] = [];
  const builder = (dados: unknown[]) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      order: () => b,
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok),
    };
    return b;
  };
  const supabase = {
    from(nome: string) {
      const c: Chamada = { tipo: "from", nome };
      chamadas.push(c);
      const b = builder(tabelas[nome] ?? []);
      b.select = (s: string) => {
        c.select = s;
        return b;
      };
      return b;
    },
    rpc(nome: string) {
      chamadas.push({ tipo: "rpc", nome });
      return builder(rpcs[nome] ?? []);
    },
  };
  return { supabase: supabase as unknown as SupabaseServidor, chamadas };
}

const FLUXOS = [
  {
    obra_id: "o1",
    setor: "compras",
    status: "cotando",
    status_desde: "2026-10-01T00:00:00Z",
    parado: true,
    parado_motivo: "Sem fornecedor",
    aguardando: null,
    aguardando_desde: null,
    concluido_em: null,
  },
  {
    obra_id: "o1",
    setor: "engenharia",
    status: "aprovado",
    status_desde: "2026-10-02T00:00:00Z",
    parado: false,
    parado_motivo: null,
    aguardando: "cliente",
    aguardando_desde: "2026-10-03T00:00:00Z",
    concluido_em: null,
  },
];
const PRINCIPAIS = [
  { obra_id: "o1", membro_id: "m1", setor: "compras" },
  { obra_id: "o1", membro_id: "m-ex", setor: "engenharia" },
];
const IDENTIDADES = [{ membro_id: "m1", nome: "Ana Souza", avatar_caminho: "a/ana.png" }];

const PROIBIDAS = [
  "snapshot",
  "documento",
  "telefone",
  "email",
  "endereco",
  "cliente_documento",
  "cliente_telefone",
  "cliente_endereco",
  "valor",
  "negocio_id",
  "contrato_id",
];

function semVazamento(resultado: unknown) {
  const json = JSON.stringify(resultado);
  for (const k of PROIBIDAS) expect(json.toLowerCase()).not.toContain(`"${k}"`);
  for (const s of [
    "DOC-SENTINELA",
    "TEL-SENTINELA",
    "END-SENTINELA",
    "SNAP-SENTINELA",
    "MAIL-SENTINELA",
  ])
    expect(json).not.toContain(s);
}

describe("carregarObras", () => {
  it("operacao: só obras_operacao, nunca a tabela obras", async () => {
    const { supabase, chamadas } = mock(
      { obra_fluxos: FLUXOS, obra_participantes: PRINCIPAIS },
      {
        obras_operacao: [
          {
            obra_id: "o1",
            empresa_id: "e1",
            numero: 7,
            cliente_nome: "João",
            cidade: "Cascavel",
            uf: "PR",
            potencia_kwp: 10.5,
            tipo_ligacao: "trifasico",
            created_at: "2026-10-01T00:00:00Z",
            pausada_em: null,
            cancelada_em: null,
            alerta_pagamento_estornado_em: "2026-10-04T00:00:00Z",
            venda_alterada_em: null,
            cliente_documento: "DOC-SENTINELA",
            cliente_telefone: "TEL-SENTINELA",
            cliente_endereco: "END-SENTINELA",
            snapshot: { cliente: "SNAP-SENTINELA" },
          },
        ],
        identidade_membros: IDENTIDADES,
      },
    );
    const r = await carregarObras(supabase, { papel: "operacao", empresaId: "e1", membroId: "m1" });
    expect(chamadas.some((c) => c.tipo === "from" && c.nome === "obras")).toBe(false);
    expect(chamadas.some((c) => c.tipo === "rpc" && c.nome === "obras_operacao")).toBe(true);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: "o1",
      numero: 7,
      clienteNome: "João",
      uf: "PR",
      potenciaKwp: 10.5,
      alertaEstorno: true,
      pausada: false,
    });
    semVazamento(r);
  });

  it("vendedor: select explícito de obras, sem snapshot; fluxos e principais mapeados", async () => {
    const { supabase, chamadas } = mock(
      {
        obras: [
          {
            id: "o1",
            numero: 7,
            cliente_nome: "João",
            cidade: null,
            uf: null,
            potencia_kwp: null,
            tipo_ligacao: null,
            pausada_em: null,
            cancelada_em: null,
            alerta_pagamento_estornado_em: null,
            venda_alterada_em: null,
            created_at: "2026-10-01T00:00:00Z",
            snapshot: { x: "SNAP-SENTINELA" },
            cliente_documento: "DOC-SENTINELA",
          },
        ],
        obra_fluxos: FLUXOS,
        obra_participantes: PRINCIPAIS,
      },
      { identidade_membros: IDENTIDADES },
    );
    const r = await carregarObras(supabase, { papel: "vendedor", empresaId: "e1", membroId: "m1" });
    const sel = chamadas.find((c) => c.tipo === "from" && c.nome === "obras")?.select ?? "";
    expect(sel).not.toBe("");
    expect(sel).not.toContain("snapshot");
    expect(sel).not.toContain("*");
    expect(chamadas.some((c) => c.nome === "obras_operacao")).toBe(false);
    for (const c of chamadas.filter((c) => c.select)) expect(c.select).not.toContain("snapshot");

    const s = r[0].setores;
    expect(s.compras).toMatchObject({
      status: "cotando",
      parado: true,
      paradoMotivo: "Sem fornecedor",
    });
    expect(s.compras.principal).toEqual({
      membroId: "m1",
      nome: "Ana Souza",
      avatarCaminho: "a/ana.png",
    });
    expect(s.engenharia.aguardando).toBe("cliente");
    // membro inativo: sem nome (a tela mostra "Ex-colaborador")
    expect(s.engenharia.principal).toEqual({ membroId: "m-ex", nome: null, avatarCaminho: null });
    // fluxo ausente: status inicial
    expect(s.operacional).toMatchObject({
      status: "aguardando_liberacao",
      parado: false,
      principal: null,
    });
    semVazamento(r);
  });

  it("sem obras: não consulta fluxos, participantes nem identidades", async () => {
    const { supabase, chamadas } = mock({ obras: [] }, {});
    expect(
      await carregarObras(supabase, { papel: "admin", empresaId: "e1", membroId: "m1" }),
    ).toEqual([]);
    expect(chamadas.map((c) => c.nome)).toEqual(["obras"]);
  });
});
