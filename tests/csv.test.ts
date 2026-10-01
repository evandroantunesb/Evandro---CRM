import { describe, expect, it } from "vitest";
import { analisarCsv, linhasParaObjetos } from "@/lib/csv";

describe("analisarCsv", () => {
  it("separa linhas e colunas simples", () => {
    expect(analisarCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("remove o BOM da primeira linha", () => {
    expect(analisarCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("mantém vírgula dentro de campo entre aspas", () => {
    expect(analisarCsv('a,b\n"Dataset, teste",2')).toEqual([
      ["a", "b"],
      ["Dataset, teste", "2"],
    ]);
  });

  it("decodifica aspas duplas escapadas (\"\") dentro de um campo entre aspas", () => {
    expect(analisarCsv('a\n"ele disse ""oi"""')).toEqual([["a"], ['ele disse "oi"']]);
  });

  it("aceita \\r\\n como quebra de linha", () => {
    expect(analisarCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("linhasParaObjetos", () => {
  it("usa a primeira linha como cabeçalho e ignora linhas totalmente vazias", () => {
    const objetos = linhasParaObjetos([
      ["fabricante", "modelo"],
      ["Fab", "X1"],
      ["", ""],
      ["Fab", "X2"],
    ]);
    expect(objetos).toEqual([
      { fabricante: "Fab", modelo: "X1" },
      { fabricante: "Fab", modelo: "X2" },
    ]);
  });
});
