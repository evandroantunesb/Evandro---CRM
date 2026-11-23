#!/usr/bin/env node
/**
 * Gera a carga das tarifas oficiais B1 residencial convencional de todas as distribuidoras (item 6, entrega 1).
 *
 *   node scripts/aneel/gerar-tarifas.mjs <arquivo-sql-de-saida>
 *
 * Consulta o conjunto "Componentes Tarifárias 2026" da ANEEL (dados abertos), aplica `extrairTarifas` (mesma regra da
 * Copel), confere que a Copel recalculada bate com a linha já carregada (20261023210000) e grava:
 *   - .aurora/fontes/aneel-componentes-2026-b1-todas.json: consulta reproduzível, hash da resposta, linhas usadas
 *     (verbatim) e as distribuidoras recusadas com o motivo;
 *   - o arquivo SQL pedido, com o insert de todas as distribuidoras carregadas, menos a Copel (já existe).
 * Não conecta a banco nenhum.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { extrairTarifas, nomesAceitos, sqlCarga } from "./tarifas-regra.mjs";

const RECURSO_ID = "e8717aa8-2521-453f-bf16-fbb9a16eea39"; // componentes-tarifarias-2026.csv (datastore)
const FILTROS = {
  DscSubGrupoTarifario: "B1",
  DscModalidadeTarifaria: "Convencional",
  DscSubClasseConsumidor: "Residencial",
  DscComponenteTarifario: ["TE", "TUSD", "TUSD_FioB"],
  DscUnidade: "R$/MWh",
};
const LIMITE = 10000;
const ARQUIVO_FONTE = ".aurora/fontes/aneel-componentes-2026-b1-todas.json";

// Copel já carregada pela migration 20261023210000: só confere e pula.
const COPEL = { distribuidora: "COPEL-DIS", vigenciaInicio: "2026-06-24", teRsMwh: "310.85", tusdRsMwh: "457.17", fioBRsMwh: "214.535600374" };
const NOMES_COPEL = ["copel", "copel-dis", "copel dis", "copel distribuicao", "copel distribuicao s.a.", "copel distribuicao sa"];

function urlPagina(offset) {
  const u = new URL("https://dadosabertos.aneel.gov.br/api/3/action/datastore_search");
  u.searchParams.set("resource_id", RECURSO_ID);
  u.searchParams.set("filters", JSON.stringify(FILTROS));
  u.searchParams.set("limit", String(LIMITE));
  u.searchParams.set("offset", String(offset));
  return u;
}

async function consultar() {
  const hash = createHash("sha256");
  const linhas = [];
  for (let offset = 0; ; offset += LIMITE) {
    const resposta = await fetch(urlPagina(offset));
    if (!resposta.ok) throw new Error(`ANEEL respondeu ${resposta.status}`);
    const texto = await resposta.text();
    hash.update(texto);
    const corpo = JSON.parse(texto);
    if (!corpo.success) throw new Error("ANEEL: consulta sem sucesso");
    linhas.push(...corpo.result.records);
    if (corpo.result.records.length < LIMITE) return { linhas, total: corpo.result.total, sha256: hash.digest("hex") };
  }
}

async function principal() {
  const saidaSql = process.argv[2];
  if (!saidaSql) throw new Error("Uso: node scripts/aneel/gerar-tarifas.mjs <arquivo-sql-de-saida>");

  const extraidaEm = new Date().toISOString();
  const { linhas, total, sha256 } = await consultar();
  if (linhas.length !== total) throw new Error(`Paginação incompleta: ${linhas.length} de ${total}`);

  const { tarifas, recusadas } = extrairTarifas(linhas);
  const copel = tarifas.find((t) => t.distribuidora === COPEL.distribuidora && t.vigenciaInicio === COPEL.vigenciaInicio);
  for (const campo of ["teRsMwh", "tusdRsMwh", "fioBRsMwh"])
    if (copel?.[campo] !== COPEL[campo]) throw new Error(`Copel recalculada não bate em ${campo}: ${copel?.[campo]} (esperado ${COPEL[campo]})`);

  const novas = tarifas.filter((t) => t.distribuidora !== COPEL.distribuidora);
  const nomes = nomesAceitos(
    novas.map((t) => t.distribuidora),
    { reservados: NOMES_COPEL },
  );
  writeFileSync(saidaSql, sqlCarga(novas, nomes, { recursoId: RECURSO_ID, extraidaEm, sha256 }));

  const usadas = new Set(novas.flatMap((t) => Object.values(t.fonteLinhas).flat()));
  const fonte = {
    descricao:
      "Linhas BRUTAS (verbatim da API) da ANEEL, Componentes Tarifarias 2026, B1 Convencional Residencial, Tarifa de Aplicacao; TE e TUSD do detalhe 'Nao se aplica', TUSD_FioB do SCEE (mesma regra da Copel, .aurora/contratos/m2-p0-decisao-fio-b-copel.md). A API ja entrega os acentos perdidos (U+FFFD).",
    fonte: { conjunto: "https://dadosabertos.aneel.gov.br/dataset/componentes-tarifarias", recurso_id: RECURSO_ID },
    extracao: {
      quando: extraidaEm,
      consulta_reproduzivel: urlPagina(0).toString(),
      resposta_completa_registros: total,
      resposta_completa_sha256: sha256,
      observacao: "A resposta completa nao fica no repositorio; o hash identifica a copia usada (paginas concatenadas na ordem).",
    },
    carregadas: novas.map((t) => ({ distribuidora: t.distribuidora, vigencia_inicio: t.vigenciaInicio, nomes_aceitos: nomes.get(t.distribuidora) })),
    recusadas,
    linhas: linhas.filter((l) => usadas.has(l._id)),
  };
  writeFileSync(ARQUIVO_FONTE, `${JSON.stringify(fonte, null, 1)}\n`);

  console.log(`Carregadas: ${novas.length} (distribuidoras: ${new Set(novas.map((t) => t.distribuidora)).size}); Copel conferida.`);
  console.log(`Recusadas: ${recusadas.length}`);
  for (const r of recusadas) console.log(`  - ${r.distribuidora} (${r.vigenciaInicio}): ${r.motivo}`);
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
