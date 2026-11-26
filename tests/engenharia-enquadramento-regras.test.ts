import { describe, expect, it } from "vitest";
import {
  canalSugerido,
  enquadramentoCompleto,
  itemVale,
  lerCondicoes,
  perguntasSemResposta,
  textoCondicoes,
  type CanalConcessionaria,
  type RespostasEnquadramento,
} from "@/lib/engenharia-enquadramento-regras";

const completo: RespostasEnquadramento = {
  tipo_solicitacao: "nova_conexao",
  tensao: "verificar",
  zona: "rural",
  categoria: "micro",
  faixa_formulario: "ate_10kw",
  tipo_instalacao: "telhado",
  modalidade_scee: "local",
  titularidade: "pf",
  obra_rede: "desconhecido",
  inversor_verificado: "verificar",
  situacao_ambiental: "dispensa",
};

describe("enquadramento (P6c)", () => {
  it("completo só com todas as perguntas; 'Desconhecido' e 'Verificar' contam", () => {
    expect(enquadramentoCompleto(null)).toBe(false);
    expect(enquadramentoCompleto({ respostas: completo })).toBe(true);
    const sem: RespostasEnquadramento = { ...completo, titularidade: undefined };
    expect(enquadramentoCompleto({ respostas: sem })).toBe(false);
    expect(perguntasSemResposta({ respostas: sem })).toEqual(["Titularidade"]);
    expect(perguntasSemResposta(null)).toHaveLength(11);
  });

  it("lerCondicoes descarta pergunta ou resposta desconhecida e lista vazia", () => {
    expect(lerCondicoes(null)).toEqual({});
    expect(lerCondicoes(["x"])).toEqual({});
    expect(
      lerCondicoes({ titularidade: ["terceiro_procuracao", "inventada"], cor: ["azul"], tipo_instalacao: [], categoria: "micro" }),
    ).toEqual({ titularidade: ["terceiro_procuracao"] });
  });

  it("itemVale: sem condição ou sem ficha vale; pergunta sem resposta não exclui; entre perguntas, todas", () => {
    const procuracao = { titularidade: ["terceiro_procuracao"] };
    expect(itemVale({}, completo)).toBe(true);
    expect(itemVale(procuracao, null)).toBe(true);
    expect(itemVale(procuracao, completo)).toBe(false);
    expect(itemVale(procuracao, { ...completo, titularidade: "terceiro_procuracao" })).toBe(true);
    expect(itemVale(procuracao, { categoria: "micro" })).toBe(true);

    const soloRemoto = { tipo_instalacao: ["solo"], modalidade_scee: ["remoto", "compartilhada"] };
    expect(itemVale(soloRemoto, { ...completo, tipo_instalacao: "solo", modalidade_scee: "compartilhada" })).toBe(true);
    expect(itemVale(soloRemoto, { ...completo, tipo_instalacao: "solo" })).toBe(false);
  });

  it("textoCondicoes resume na ordem da ficha", () => {
    expect(textoCondicoes({})).toBe("Vale sempre");
    expect(textoCondicoes({ titularidade: ["terceiro_procuracao"], tipo_instalacao: ["solo", "outra"] })).toBe(
      "Tipo de instalação: Solo ou Outra · Titularidade: Terceiro com procuração",
    );
  });
});

// Canais da Copel como a migration 20261224100000 cadastra (a regra de 04/11/2026 virou cadastro).
const CANAIS_COPEL: CanalConcessionaria[] = [
  { id: "pew", nome: "PEW", ordem: 10, ativo: true, tipos: ["nova_conexao", "ampliacao", "regularizacao", "ligacao_nova", "aumento_carga"], tensoes: ["baixa"] },
  { id: "site", nome: "Site da Copel", ordem: 20, ativo: true, tipos: ["troca_titularidade", "cadastro_compensacao", "ligacao_nova", "aumento_carga"], tensoes: ["media"] },
  { id: "caw", nome: "CAW", ordem: 30, ativo: true, tipos: [], tensoes: [] },
  { id: "atendimento", nome: "Atendimento comercial", ordem: 40, ativo: true, tipos: [], tensoes: [] },
];
const sugerido = (r: RespostasEnquadramento | null, canais = CANAIS_COPEL) => canalSugerido(canais, r)?.nome ?? null;

describe("canal sugerido pelos canais da concessionária (Copel igual à regra de 04/11/2026)", () => {
  it("geração, ligação nova e aumento de carga em baixa tensão vão pelo PEW; o resto pelo site", () => {
    for (const tipo of ["nova_conexao", "ampliacao", "regularizacao"]) expect(sugerido({ tipo_solicitacao: tipo }), tipo).toBe("PEW");
    expect(sugerido({ tipo_solicitacao: "nova_conexao", tensao: "media" })).toBe("PEW");
    expect(sugerido({ tipo_solicitacao: "ligacao_nova", tensao: "baixa" })).toBe("PEW");
    expect(sugerido({ tipo_solicitacao: "aumento_carga", tensao: "baixa" })).toBe("PEW");
    expect(sugerido({ tipo_solicitacao: "aumento_carga", tensao: "media" })).toBe("Site da Copel");
    expect(sugerido({ tipo_solicitacao: "troca_titularidade" })).toBe("Site da Copel");
    expect(sugerido({ tipo_solicitacao: "cadastro_compensacao" })).toBe("Site da Copel");
  });

  it("sem tipo, 'Outra' ou tensão indefinida onde ela decide: não sugere", () => {
    expect(sugerido(null)).toBeNull();
    expect(sugerido({})).toBeNull();
    expect(sugerido({ tipo_solicitacao: "outro" })).toBeNull();
    expect(sugerido({ tipo_solicitacao: "ligacao_nova", tensao: "verificar" })).toBeNull();
    expect(sugerido({ tipo_solicitacao: "aumento_carga" })).toBeNull();
  });

  it("segue a ordem, ignora canal inativo e nunca sugere canal sem condição", () => {
    const semPew = CANAIS_COPEL.map((c) => (c.nome === "PEW" ? { ...c, ativo: false } : c));
    expect(sugerido({ tipo_solicitacao: "nova_conexao" }, semPew)).toBeNull();
    const invertidos = CANAIS_COPEL.map((c) => (c.nome === "Site da Copel" ? { ...c, ordem: 5, tipos: ["nova_conexao"], tensoes: [] } : c));
    expect(sugerido({ tipo_solicitacao: "nova_conexao" }, invertidos)).toBe("Site da Copel");
    expect(sugerido({ tipo_solicitacao: "troca_titularidade" }, CANAIS_COPEL.filter((c) => c.tipos.length === 0))).toBeNull();
  });
});
