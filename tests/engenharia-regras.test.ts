import { describe, expect, it } from "vitest";
import { agruparObrasEngenharia } from "@/lib/engenharia-regras";
import type { ObraListaVM } from "@/lib/obras/dados";
import { rotuloStatus } from "@/lib/obras/rotulos";

const obra = (numero: number, status: string | null, extra: Partial<ObraListaVM> = {}, parado = false): ObraListaVM => ({
  id: `o${numero}`,
  numero,
  clienteNome: `Cliente ${numero}`,
  cidade: "Curitiba",
  uf: "PR",
  potenciaKwp: 5,
  situacao: "em_andamento",
  alertas: [],
  criadaEm: "2026-10-01",
  setores: [
    { setor: "engenharia", status, statusRotulo: status ?? "", estado: parado ? "parado" : "em_andamento", aguardando: null, principalNome: null },
  ],
  ...extra,
});

const rotulo = (s: string) => rotuloStatus("engenharia", s);

describe("agruparObrasEngenharia", () => {
  it("agrupa pelo status da Engenharia, na ordem do fluxo, e mantém os grupos vazios", () => {
    const grupos = agruparObrasEngenharia([obra(3, "aprovado"), obra(1, "a_iniciar"), obra(2, "a_iniciar")], rotulo);
    expect(grupos.map((g) => g.status)).toEqual(["a_iniciar", "projeto_em_elaboracao", "enviado_concessionaria", "aprovado", "aguardando_vistoria"]);
    expect(grupos[0].obras.map((o) => o.numero)).toEqual([1, 2]);
    expect(grupos[3].obras.map((o) => o.numero)).toEqual([3]);
    expect(grupos[1].obras).toEqual([]);
  });

  it("ignora obra pausada, cancelada, concluída ou com a Engenharia já concluída", () => {
    const grupos = agruparObrasEngenharia(
      [obra(1, "a_iniciar", { situacao: "pausada" }), obra(2, "a_iniciar", { situacao: "cancelada" }), obra(3, "concluido"), obra(4, null)],
      rotulo,
    );
    expect(grupos.flatMap((g) => g.obras)).toEqual([]);
  });

  it("status desconhecido vira grupo próprio com o código cru", () => {
    const grupos = agruparObrasEngenharia([obra(7, "novo_status")], rotulo);
    expect(grupos.at(-1)).toMatchObject({ status: "novo_status", rotulo: "novo_status" });
    expect(grupos.at(-1)?.obras).toHaveLength(1);
  });
});
