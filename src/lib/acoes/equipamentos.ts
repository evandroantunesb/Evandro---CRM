"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { analisarCsv, linhasParaObjetos } from "@/lib/csv";
import { camposTecnicosParaPersistir, linhaCsvParaEquipamento } from "@/lib/equipamentos";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ResultadoAcao } from "@/lib/tipos";

type PatchEquipamento = Database["public"]["Tables"]["equipamentos_empresa"]["Update"];

const CAMINHO = "/configuracoes/calculadora";
const LIMITE_DATASHEET = 10 * 1024 * 1024;

// Campos elétricos são opcionais (o equipamento pode ser cadastrado sem datasheet
// completo ainda) — número positivo quando informado, null quando vazio; nesse
// caso o motor de dimensionamento trata a opção como "não verificada" (ver dimensionamento.ts).
const campoEletricoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().positive().nullable());

const coefTempOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().nullable());

const quantidadeMpptOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number().int().positive().nullable());

const precoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(/\./g, "").replace(",", "."))))
  .pipe(z.number().min(0, "Preço inválido").nullable());

const textoOpcional = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((v) => (v && v.length ? v : null));

// Percentual opcional digitado em "97,5" (%) — guardado de 0 a 1, igual a `editarParametros`.
const percentualOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", ".")) / 100))
  .pipe(z.number().min(0, "Percentual inválido").max(1, "Percentual inválido").nullable());

const tipoInversorOpcional = z
  .enum(["on_grid", "hibrido"])
  .optional()
  .transform((v) => v ?? null);

const fasesCaOpcional = z
  .enum(["monofasico", "trifasico"])
  .optional()
  .transform((v) => v ?? null);

const camposModulo = {
  vocV: campoEletricoOpcional,
  iscA: campoEletricoOpcional,
  vmpV: campoEletricoOpcional,
  impA: campoEletricoOpcional,
  coefTempVocPctC: coefTempOpcional,
};

const camposInversor = {
  tipoInversor: tipoInversorOpcional,
  tensaoMaxDcV: campoEletricoOpcional,
  tensaoPartidaV: campoEletricoOpcional,
  mpptMinV: campoEletricoOpcional,
  mpptMaxV: campoEletricoOpcional,
  quantidadeMppt: quantidadeMpptOpcional,
  entradasPorMppt: quantidadeMpptOpcional,
  correnteMaxEntradaA: campoEletricoOpcional,
  iscMaximoEntradaA: campoEletricoOpcional,
  potenciaDcMaximaEntradaW: campoEletricoOpcional,
  tensaoAcV: campoEletricoOpcional,
  fasesCa: fasesCaOpcional,
  correnteMaxAcA: campoEletricoOpcional,
  eficienciaPct: percentualOpcional,
  tensaoFasesAc: textoOpcional,
};

/** Nome seguro para o caminho no Storage (o nome original fica no registro). */
function nomeSeguroArquivo(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
  return `${crypto.randomUUID()}-${limpo || "datasheet"}`;
}

/** Só os campos de texto/número do formulário — arquivos (datasheet) são tratados à parte. */
function entradasSemArquivo(formData: FormData) {
  return Object.fromEntries(Array.from(formData.entries()).filter(([, v]) => typeof v === "string"));
}

async function enviarDatasheet(empresaId: string, arquivo: File): Promise<{ caminho: string; nome: string } | null> {
  if (!arquivo.size || arquivo.size > LIMITE_DATASHEET) return null;
  const caminho = `${empresaId}/${nomeSeguroArquivo(arquivo.name)}`;
  const admin = criarClienteAdmin();
  const { error } = await admin.storage
    .from("datasheets")
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (error) return null;
  return { caminho, nome: arquivo.name || "datasheet" };
}

/**
 * Cadastro manual completo de um módulo ou inversor — único fluxo de entrada no
 * catálogo (a busca automática via OpenSolar foi removida em 2026-09-30 por não
 * funcionar de forma confiável). Datasheet é opcional; sem os campos elétricos
 * completos, o equipamento fica disponível pro dimensionamento automático mas
 * marcado como "não verificado" — ver `dimensionamento.ts`.
 */
export async function cadastrarEquipamentoManual(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      tipo: z.enum(["modulo", "inversor"]),
      fabricante: z.string().trim().min(1, "Informe o fabricante").max(120),
      modelo: z.string().trim().min(1, "Informe o modelo").max(120),
      potenciaW: z.coerce.number().positive("Informe a potência"),
      precoReferenciaBRL: precoOpcional,
      prioridade: z.coerce.number().int().min(-100).max(100).default(0),
      ...camposModulo,
      ...camposInversor,
    })
    .safeParse(entradasSemArquivo(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data: inserido, error } = await supabase
    .from("equipamentos_empresa")
    .insert({
      empresa_id: atual.empresaId,
      tipo: d.tipo,
      fabricante: d.fabricante,
      modelo: d.modelo,
      potencia_w: d.potenciaW,
      preco_referencia_brl: d.precoReferenciaBRL,
      prioridade: d.prioridade,
      ativo: formData.get("ativo") === "on",
      ...camposTecnicosParaPersistir(d.tipo, d),
      ...(d.tipo === "inversor" ? { tensao_fases_ac: d.tensaoFasesAc } : {}),
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível cadastrar o equipamento.") };

  const arquivo = formData.get("datasheet");
  if (arquivo instanceof File && arquivo.size > 0) {
    const enviado = await enviarDatasheet(atual.empresaId, arquivo);
    if (enviado) {
      await supabase
        .from("equipamentos_empresa")
        .update({ datasheet_caminho: enviado.caminho, datasheet_nome: enviado.nome })
        .eq("id", inserido.id);
    }
    // Cadastro não falha por causa do datasheet — ele pode ser enviado depois na edição.
  }

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Equipamento cadastrado." };
}

/**
 * Liga/desliga um equipamento já cadastrado, ajusta a prioridade comercial dele
 * no ranking automático, salva os dados elétricos do datasheet (usados pelo
 * motor de dimensionamento pra validar string/MPPT — ver `dimensionamento.ts`)
 * e troca ou remove o arquivo de datasheet. Os campos elétricos são opcionais
 * e variam por tipo (módulo vs. inversor); o formulário só envia os do tipo
 * correspondente.
 */
export async function editarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      id: z.string().uuid(),
      tipo: z.enum(["modulo", "inversor"]),
      prioridade: z.coerce.number().int().min(-100).max(100),
      precoReferenciaBRL: precoOpcional,
      ...camposModulo,
      ...camposInversor,
    })
    .safeParse(entradasSemArquivo(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();

  const patch: PatchEquipamento = {
    prioridade: d.prioridade,
    ativo: formData.get("ativo") === "on",
    preco_referencia_brl: d.precoReferenciaBRL,
    ...camposTecnicosParaPersistir(d.tipo, d),
    ...(d.tipo === "inversor" ? { tensao_fases_ac: d.tensaoFasesAc } : {}),
  };

  const novoArquivo = formData.get("datasheet");
  const removerDatasheet = formData.get("remover_datasheet") === "on";
  if ((novoArquivo instanceof File && novoArquivo.size > 0) || removerDatasheet) {
    const { data: equipamentoAtual } = await supabase
      .from("equipamentos_empresa")
      .select("datasheet_caminho")
      .eq("id", d.id)
      .single();
    if (novoArquivo instanceof File && novoArquivo.size > 0) {
      const enviado = await enviarDatasheet(atual.empresaId, novoArquivo);
      if (enviado) {
        patch.datasheet_caminho = enviado.caminho;
        patch.datasheet_nome = enviado.nome;
      }
    } else {
      patch.datasheet_caminho = null;
      patch.datasheet_nome = null;
    }
    if (equipamentoAtual?.datasheet_caminho) {
      await criarClienteAdmin().storage.from("datasheets").remove([equipamentoAtual.datasheet_caminho]);
    }
  }

  const { error } = await supabase.from("equipamentos_empresa").update(patch).eq("id", d.id);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

const LIMITE_CSV = 2 * 1024 * 1024;
const LIMITE_LINHAS_CSV = 2000;

/**
 * Importação em massa do catálogo via CSV (pedido do Evandro, 2026-10-01, pra já deixar
 * pronto antes de receber a planilha real de módulos/inversores). Mesmas colunas disjuntas
 * de módulo/inversor do cadastro manual — ver `linhaCsvParaEquipamento` em
 * `lib/equipamentos.ts`, onde mora toda a lógica de mapeamento (testável sem banco).
 * Faz upsert por (empresa, tipo, fabricante, modelo): reimportar o mesmo catálogo atualiza
 * os equipamentos existentes em vez de duplicar.
 */
export async function importarEquipamentosCsv(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
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
  const validos = linhas.flatMap((linha, i) => {
    const resultado = linhaCsvParaEquipamento(linha);
    if (!resultado.ok) {
      erros.push(`linha ${i + 2}: ${resultado.erro}`);
      return [];
    }
    return [{ ...resultado.valores, empresa_id: atual.empresaId }];
  });
  if (!validos.length) {
    return { ok: false, mensagem: `Nenhuma linha válida. Erros: ${erros.slice(0, 5).join("; ")}` };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("equipamentos_empresa")
    .upsert(validos, { onConflict: "empresa_id,tipo,fabricante,modelo" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível importar o catálogo.") };

  revalidatePath(CAMINHO);
  const resumo = `${validos.length} equipamento(s) importado(s)/atualizado(s).`;
  const avisoErros = erros.length ? ` ${erros.length} linha(s) ignorada(s): ${erros.slice(0, 5).join("; ")}.` : "";
  return { ok: true, mensagem: resumo + avisoErros };
}

export async function apagarEquipamento(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("equipamentos_empresa").delete().eq("id", id.data).select("datasheet_caminho");
  if (data?.[0]?.datasheet_caminho) {
    await criarClienteAdmin().storage.from("datasheets").remove([data[0].datasheet_caminho]);
  }
  revalidatePath(CAMINHO);
}

/** URL assinada (60s) pra abrir o datasheet — o bucket é privado. */
export async function obterUrlDatasheet(equipamentoId: string): Promise<string | null> {
  await exigirPapel();
  const id = z.string().uuid().safeParse(equipamentoId);
  if (!id.success) return null;
  const supabase = await criarClienteServidor();
  const { data: equipamento } = await supabase
    .from("equipamentos_empresa")
    .select("datasheet_caminho")
    .eq("id", id.data)
    .maybeSingle();
  if (!equipamento?.datasheet_caminho) return null;
  const { data } = await supabase.storage.from("datasheets").createSignedUrl(equipamento.datasheet_caminho, 60);
  return data?.signedUrl ?? null;
}
