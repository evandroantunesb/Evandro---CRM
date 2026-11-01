import { describe, expect, it } from "vitest";
import {
  enquadramentoCompleto,
  itemVale,
  lerCondicoes,
  perguntasSemResposta,
  textoCondicoes,
  type RespostasEnquadramento,
} from "@/lib/engenharia-enquadramento-regras";

const completo: RespostasEnquadramento = {
  tipo_solicitacao: "nova_conexao",
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
    expect(perguntasSemResposta(null)).toHaveLength(9);
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
