"use server";

import { analisarCsv, linhasParaObjetos } from "@/lib/csv";
import {
  linhaCsvParaMunicipioDistribuidora,
  normalizarTexto,
  resolverDistribuidora,
  type DistribuidoraCandidata,
  type ResolucaoDistribuidora,
} from "@/lib/distribuidoras";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel, exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const LIMITE_CSV = 2 * 1024 * 1024;
const LIMITE_LINHAS_CSV = 20000;

/**
 * Distribuidora(s) que atendem um município, a partir do código IBGE (Etapa
 * 1 do wizard "Adicionar negócio"). Consulta `municipios_distribuidoras`
 * (dado público compartilhado entre empresas, só linhas `ativo = true`) e
 * devolve a decisão de `resolverDistribuidora` (lógica pura, testável sem
 * banco, em `src/lib/distribuidoras.ts`): única (seleciona automático),
 * ambígua (lista pra confirmação manual) ou não encontrada (seleção manual
 * livre). As tabelas nascem vazias (sem carga real ainda) — "não
 * encontrada" é o caminho normal até uma importação futura, não um erro.
 */
export async function resolverDistribuidoraPorIbge(codigoIbge: string): Promise<ResolucaoDistribuidora> {
  await exigirPapel();
  const codigo = codigoIbge.trim();
  if (!codigo) return { tipo: "nao_encontrada" };

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("municipios_distribuidoras")
    .select("codigo_ibge, distribuidora_sigla, distribuidora_cnpj")
    .eq("codigo_ibge", codigo)
    .eq("ativo", true);

  const candidatas: DistribuidoraCandidata[] = (data ?? []).map((linha) => ({
    codigoIbge: linha.codigo_ibge,
    siglaDistribuidora: linha.distribuidora_sigla,
    cnpjDistribuidora: linha.distribuidora_cnpj,
  }));
  return resolverDistribuidora(candidatas);
}

/**
 * Mesma resolução de `resolverDistribuidoraPorIbge`, a partir de cidade + UF
 * digitadas no cadastro do negócio: primeiro resolve pra código IBGE via
 * `municipios_ibge` (nome normalizado + UF, mesma normalização do cadastro —
 * `normalizarTexto`); cidade/UF sem correspondência em `municipios_ibge`
 * também cai em "não encontrada" (não é erro — é o caminho normal enquanto a
 * base do IBGE não foi importada, ou quando o vendedor digitou o nome de um
 * jeito que a base não reconhece).
 */
export async function resolverDistribuidoraPorCidadeUf(cidade: string, uf: string): Promise<ResolucaoDistribuidora> {
  await exigirPapel();
  const nomeNormalizado = normalizarTexto(cidade);
  const ufNormalizada = uf.trim().toUpperCase();
  if (!nomeNormalizado || ufNormalizada.length !== 2) return { tipo: "nao_encontrada" };

  const supabase = await criarClienteServidor();
  const { data: municipio } = await supabase
    .from("municipios_ibge")
    .select("codigo_ibge")
    .eq("nome_normalizado", nomeNormalizado)
    .eq("uf", ufNormalizada)
    .maybeSingle();
  if (!municipio) return { tipo: "nao_encontrada" };

  return resolverDistribuidoraPorIbge(municipio.codigo_ibge);
}

/**
 * Importação em lote de município → distribuidora (Fase 2, pedido do
 * Evandro em 2026-10-01). Espera linhas já no formato final combinado com
 * ele (`codigo_ibge, municipio, uf, distribuidora_sigla, distribuidora_cnpj,
 * fonte, data_referencia`) — resultado do join das duas bases da ANEEL
 * (IndQual Município + Indicadores Coletivos de Continuidade) por
 * `IdeConjUndConsumidoras`, normalizando tipo/formatação do identificador
 * antes de comparar (evitar perda de zero à esquerda ou comparação
 * número/texto incorreta). Esse join é responsabilidade de quem prepara o
 * CSV de entrada, não desta função — aqui só valida linha a linha
 * (`linhaCsvParaMunicipioDistribuidora`, pura e testável sem banco) e faz
 * upsert em `municipios_ibge`/`municipios_distribuidoras` com
 * `imported_at = now()` e `ativo = true`.
 *
 * Restrita a admin da plataforma (`exigirSuperAdmin`, mesmo papel que a RLS
 * dessas tabelas exige via `e_plataforma_admin()`) — grava com o client
 * admin (service role) porque a RLS de escrita dessas tabelas globais
 * bloqueia qualquer usuário comum, mesmo admin de empresa.
 */
export async function importarMunicipiosDistribuidoras(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirSuperAdmin();

  const arquivo = formData.get("csv");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, mensagem: "Selecione um arquivo CSV." };
  }
  if (arquivo.size > LIMITE_CSV) return { ok: false, mensagem: "Arquivo CSV muito grande (máximo 2 MB)." };

  const texto = await arquivo.text();
  const linhas = linhasParaObjetos(analisarCsv(texto));
  if (!linhas.length) return { ok: false, mensagem: "CSV vazio ou sem linhas de dados." };
  if (linhas.length > LIMITE_LINHAS_CSV) {
    return { ok: false, mensagem: `CSV com mais de ${LIMITE_LINHAS_CSV} linhas — divida em arquivos menores.` };
  }

  const erros: string[] = [];
  const municipios = new Map<string, { codigo_ibge: string; municipio: string; nome_normalizado: string; uf: string }>();
  const distribuidoras: {
    codigo_ibge: string;
    distribuidora_sigla: string;
    distribuidora_cnpj: string | null;
    fonte: string;
    data_referencia: string | null;
    imported_at: string;
    ativo: boolean;
  }[] = [];
  const agora = new Date().toISOString();

  linhas.forEach((linha, i) => {
    const resultado = linhaCsvParaMunicipioDistribuidora(linha);
    if (!resultado.ok) {
      erros.push(`linha ${i + 2}: ${resultado.erro}`);
      return;
    }
    const v = resultado.valores;
    municipios.set(v.codigoIbge, {
      codigo_ibge: v.codigoIbge,
      municipio: v.municipio,
      nome_normalizado: normalizarTexto(v.municipio),
      uf: v.uf,
    });
    distribuidoras.push({
      codigo_ibge: v.codigoIbge,
      distribuidora_sigla: v.distribuidoraSigla,
      distribuidora_cnpj: v.distribuidoraCnpj,
      fonte: v.fonte,
      data_referencia: v.dataReferencia,
      imported_at: agora,
      ativo: true,
    });
  });

  if (!distribuidoras.length) {
    return { ok: false, mensagem: `Nenhuma linha válida. Erros: ${erros.slice(0, 5).join("; ")}` };
  }

  const admin = criarClienteAdmin();
  const { error: erroMunicipios } = await admin
    .from("municipios_ibge")
    .upsert(Array.from(municipios.values()), { onConflict: "codigo_ibge" });
  if (erroMunicipios) {
    return { ok: false, mensagem: mensagemErro(erroMunicipios, "Não foi possível importar os municípios.") };
  }

  const { error: erroDistribuidoras } = await admin
    .from("municipios_distribuidoras")
    .upsert(distribuidoras, { onConflict: "codigo_ibge,distribuidora_sigla" });
  if (erroDistribuidoras) {
    return { ok: false, mensagem: mensagemErro(erroDistribuidoras, "Não foi possível importar as distribuidoras.") };
  }

  const resumo = `${municipios.size} município(s) e ${distribuidoras.length} vínculo(s) de distribuidora importados/atualizados.`;
  return { ok: true, mensagem: erros.length ? `${resumo} ${erros.length} linha(s) ignorada(s).` : resumo };
}
