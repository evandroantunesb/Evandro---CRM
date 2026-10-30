import { describe, expect, it } from "vitest";
import { ACAO_SEM_RESPONSAVEL, diasDesde, montarCentralEngenharia } from "@/lib/engenharia-regras";
import type { ObraListaVM, SetorObraVM } from "@/lib/obras/dados";
import { rotuloStatus } from "@/lib/obras/rotulos";

const obra = (numero: number, status: string | null, eng: Partial<SetorObraVM> = {}, extra: Partial<ObraListaVM> = {}): ObraListaVM => ({
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
    {
      setor: "engenharia",
      status,
      statusRotulo: status ?? "",
      estado: "em_andamento",
      aguardando: null,
      principalNome: "Ana",
      souPrincipal: true,
      statusDesde: `2026-10-${String(numero).padStart(2, "0")}T12:00:00Z`,
      aguardandoDesde: null,
      ...eng,
    },
  ],
  ...extra,
});

const rotulo = (s: string) => rotuloStatus("engenharia", s);
const executor = { coordena: false };

describe("montarCentralEngenharia", () => {
  it("agrupa pelo status da Engenharia, na ordem do fluxo, e mantém os grupos vazios", () => {
    const { grupos } = montarCentralEngenharia([obra(3, "aprovado"), obra(1, "a_iniciar"), obra(2, "a_iniciar")], rotulo, executor);
    expect(grupos.map((g) => g.status)).toEqual(["a_iniciar", "projeto_em_elaboracao", "enviado_concessionaria", "aprovado", "aguardando_vistoria"]);
    expect(grupos[0].obras.map((o) => o.numero)).toEqual([1, 2]);
    expect(grupos[3].obras.map((o) => o.numero)).toEqual([3]);
    expect(grupos[1].obras).toEqual([]);
  });

  it("ignora obra pausada, cancelada, concluída ou com a Engenharia já concluída", () => {
    const central = montarCentralEngenharia(
      [obra(1, "a_iniciar", {}, { situacao: "pausada" }), obra(2, "a_iniciar", {}, { situacao: "cancelada" }), obra(3, "concluido"), obra(4, null)],
      rotulo,
      executor,
    );
    expect(central.grupos.flatMap((g) => g.obras)).toEqual([]);
    expect(central.acoes).toEqual([]);
    expect(central.comTerceiros).toEqual([]);
  });

  it("status desconhecido vira grupo próprio com o código cru e não ganha ação inventada", () => {
    const { grupos, acoes } = montarCentralEngenharia([obra(7, "novo_status")], rotulo, executor);
    expect(grupos.at(-1)).toMatchObject({ status: "novo_status", rotulo: "novo_status" });
    expect(grupos.at(-1)?.obras).toHaveLength(1);
    expect(acoes[0].proximaAcao).toBeNull();
  });

  it("ação do executor: só as obras em que é o principal, a mais antiga na etapa primeiro, com o texto da etapa", () => {
    const { acoes } = montarCentralEngenharia(
      [obra(9, "projeto_em_elaboracao"), obra(2, "a_iniciar"), obra(5, "aprovado", { souPrincipal: false, principalNome: "Bia" })],
      rotulo,
      executor,
    );
    expect(acoes.map((o) => [o.numero, o.proximaAcao])).toEqual([
      [2, "Conferir dados e iniciar o projeto"],
      [9, "Concluir projeto e documentação"],
    ]);
  });

  it("etapa com a concessionária ou marcação 'Aguardando' vai para terceiros, não para ação", () => {
    const central = montarCentralEngenharia(
      [
        obra(1, "enviado_concessionaria"),
        obra(2, "aguardando_vistoria"),
        obra(3, "projeto_em_elaboracao", { aguardando: "Aguardando cliente", aguardandoDesde: "2026-09-30T12:00:00Z" }),
        obra(4, "projeto_em_elaboracao"),
      ],
      rotulo,
      executor,
    );
    expect(central.acoes.map((o) => o.numero)).toEqual([4]);
    // A obra 3 aguarda desde 30/09: é a mais antiga.
    expect(central.comTerceiros.map((o) => o.numero)).toEqual([3, 1, 2]);
    expect(central.comTerceiros.find((o) => o.numero === 1)?.proximaAcao).toBe("Verificar resposta da concessionária");
  });

  it("obra sem responsável principal vira 'Definir responsável' só para quem coordena", () => {
    const semPrincipal = obra(6, "enviado_concessionaria", { principalNome: null, souPrincipal: false });
    const coordenador = montarCentralEngenharia([semPrincipal], rotulo, { coordena: true });
    expect(coordenador.acoes.map((o) => [o.numero, o.proximaAcao])).toEqual([[6, ACAO_SEM_RESPONSAVEL]]);
    expect(coordenador.comTerceiros).toEqual([]);

    const exec = montarCentralEngenharia([semPrincipal], rotulo, executor);
    expect(exec.acoes).toEqual([]);
    expect(exec.comTerceiros.map((o) => o.numero)).toEqual([6]);
  });
});

describe("central com exigência aberta (P3)", () => {
  it("obra na etapa da concessionária com exigência aberta vira ação de quem é o principal", () => {
    const central = montarCentralEngenharia([obra(1, "enviado_concessionaria"), obra(2, "enviado_concessionaria")], rotulo, {
      coordena: false,
      exigencias: new Map([["o1", 2]]),
    });
    expect(central.acoes.map((o) => [o.numero, o.proximaAcao])).toEqual([[1, "Responder 2 exigências da concessionária"]]);
    expect(central.comTerceiros.map((o) => o.numero)).toEqual([2]);
  });

  it("sem responsável, quem coordena vê 'Definir responsável' antes da exigência", () => {
    const { acoes } = montarCentralEngenharia([obra(3, "enviado_concessionaria", { principalNome: null, souPrincipal: false })], rotulo, {
      coordena: true,
      exigencias: new Map([["o3", 1]]),
    });
    expect(acoes[0].proximaAcao).toBe(ACAO_SEM_RESPONSAVEL);
  });
});

describe("diasDesde", () => {
  it("conta dias corridos no horário de Brasília", () => {
    const agora = new Date("2026-10-29T15:00:00Z");
    expect(diasDesde("2026-10-29T03:30:00Z", agora)).toBe(0);
    // 02:30 UTC do dia 29 ainda é dia 28 em Brasília.
    expect(diasDesde("2026-10-29T02:30:00Z", agora)).toBe(1);
    expect(diasDesde("2026-10-19T12:00:00Z", agora)).toBe(10);
  });
});
