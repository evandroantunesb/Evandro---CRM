"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { analisarCsv, linhasParaObjetos } from "@/lib/csv";
import {
  camposAvancadosParaPersistir,
  camposTecnicosFaltantesEquipamento,
  camposTecnicosParaPersistir,
  linhaCsvParaEquipamento,
  prepararPreviewImportacao,
  ROTULO_STATUS_TECNICO,
  statusTecnicoResultante,
  type PreviewImportacao,
  type StatusTecnico,
} from "@/lib/equipamentos";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ResultadoAcao } from "@/lib/tipos";

type PatchEquipamento = Database["public"]["Tables"]["equipamentos_empresa"]["Update"];

const CAMINHO = "/configuracoes/calculadora";
const LIMITE_DATASHEET = 10 * 1024 * 1024;

/** Revalida todas as abas de "Kits e calculadora" (Catálogo, Calculadora etc.), não só a raiz. */
function revalidarCalculadora() {
  revalidatePath(CAMINHO, "layout");
}

// Campos elétricos são opcionais (o equipamento pode ser cadastrado sem datasheet
// completo ainda) — número positivo quando informado, null quando vazio; nesse
// caso o equipamento fica com status técnico "incompleto" e não entra no motor automático.
const campoEletricoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number({ message: "Número inválido" }).positive("Informe um número positivo").nullable());

// Números sem restrição de sinal (coeficientes de temperatura, NMOT).
const numeroOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number({ message: "Número inválido" }).nullable());

const quantidadeMpptOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", "."))))
  .pipe(z.number({ message: "Número inválido" }).int().positive().nullable());

const precoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(/\./g, "").replace(",", "."))))
  .pipe(z.number({ message: "Preço inválido" }).min(0, "Preço inválido").nullable());

const textoLivre = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length ? v : null));

// Percentual opcional digitado em "97,5" (%) — guardado de 0 a 1, igual a `editarParametros`.
const percentualOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : Number(v.replace(",", ".")) / 100))
  .pipe(z.number({ message: "Percentual inválido" }).min(0, "Percentual inválido").max(1, "Percentual inválido").nullable());

const tipoInversorOpcional = z
  .enum(["", "on_grid", "hibrido"])
  .optional()
  .transform((v) => (v ? v : null));

const fasesCaOpcional = z
  .enum(["", "monofasico", "trifasico"])
  .optional()
  .transform((v) => (v ? v : null));

const camposModulo = {
  vocV: campoEletricoOpcional,
  iscA: campoEletricoOpcional,
  vmpV: campoEletricoOpcional,
  impA: campoEletricoOpcional,
  coefTempVocPctC: numeroOpcional,
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
};

// Dados avançados/internos — nenhum entra na validação elétrica do motor.
const camposAvancados = {
  categoria: textoLivre(60),
  tecnologia: textoLivre(60),
  statusValidacao: textoLivre(60),
  fontePrimaria: textoLivre(500),
  fonteSecundaria: textoLivre(500),
  observacoes: textoLivre(2000),
  coefTempPmaxPctC: numeroOpcional,
  coefTempIscPctC: numeroOpcional,
  bifacial: z
    .enum(["", "sim", "nao"])
    .optional()
    .transform((v) => (v === "sim" ? true : v === "nao" ? false : null)),
  bifacialidadePct: numeroOpcional.pipe(
    z.number().min(0, "Bifacialidade inválida").max(100, "Bifacialidade inválida").nullable(),
  ),
  nmotC: numeroOpcional,
  tensaoMaxSistemaV: campoEletricoOpcional,
  fusivelMaxSerieA: campoEletricoOpcional,
  eficienciaModuloPct: percentualOpcional,
  comprimentoMm: campoEletricoOpcional,
  larguraMm: campoEletricoOpcional,
  espessuraMm: campoEletricoOpcional,
  pesoKg: campoEletricoOpcional,
  potenciaAparenteMaxVa: campoEletricoOpcional,
  tensaoFasesAc: textoLivre(120),
  grauProtecao: textoLivre(20),
};

/** "automatico" = o sistema decide entre Completo e Incompleto pelos dados técnicos. */
const statusTecnicoDesejado = z
  .enum(["automatico", "em_revisao", "verificado", "descontinuado"])
  .optional()
  .transform((v): StatusTecnico => (!v || v === "automatico" ? "completo" : v));

const camposPrincipais = {
  fabricante: z.string().trim().min(1, "Informe o fabricante").max(120),
  modelo: z.string().trim().min(1, "Informe o modelo").max(120),
  potenciaW: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(z.number({ message: "Informe a potência" }).positive("Informe a potência")),
  precoReferenciaBRL: precoOpcional,
  prioridade: z.coerce.number({ message: "Prioridade inválida" }).int().min(-100).max(100).default(0),
  statusTecnico: statusTecnicoDesejado,
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
 * Status técnico que vai ficar gravado (o gatilho do banco aplica a mesma regra — ver
 * `statusTecnicoResultante`) e um aviso pro admin quando falta dado técnico ou quando a
 * escolha manual não pôde valer.
 */
function resolverStatusTecnico(
  tipo: "modulo" | "inversor",
  desejado: StatusTecnico,
  tecnicos: ReturnType<typeof camposTecnicosParaPersistir>,
) {
  const faltantes = camposTecnicosFaltantesEquipamento(tipo, tecnicos);
  const status = statusTecnicoResultante(desejado, faltantes.length === 0);
  let aviso = "";
  if (status === "incompleto") {
    aviso = ` Status técnico: Incompleto (não entra no motor automático). Falta: ${faltantes.join(", ")}.`;
  } else if (status !== desejado && desejado !== "completo") {
    aviso = ` Status técnico: ${ROTULO_STATUS_TECNICO[status]}.`;
  }
  return { status, aviso };
}

function mensagemErroEquipamento(error: { code?: string; message: string; hint?: string | null }, padrao: string) {
  if (error.code === "23505") return "Já existe um equipamento desse tipo com o mesmo fabricante e modelo.";
  return mensagemErro(error, padrao);
}

/**
 * Cadastro manual de um módulo ou inversor ("+ Novo equipamento" na aba Catálogo). Datasheet e
 * dados técnicos são opcionais; sem os dados técnicos completos o equipamento fica
 * "Incompleto" e não entra no motor automático (Evandro, 2026-10-01) — ver a migration
 * 20261001050000_equipamentos_status_tecnico.sql.
 */
export async function cadastrarEquipamentoManual(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      tipo: z.enum(["modulo", "inversor"]),
      ...camposPrincipais,
      ...camposModulo,
      ...camposInversor,
      ...camposAvancados,
    })
    .safeParse(entradasSemArquivo(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const tecnicos = camposTecnicosParaPersistir(d.tipo, d);
  const { status, aviso } = resolverStatusTecnico(d.tipo, d.statusTecnico, tecnicos);

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
      status_tecnico: status,
      ...tecnicos,
      ...camposAvancadosParaPersistir(d.tipo, d),
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: mensagemErroEquipamento(error, "Não foi possível cadastrar o equipamento.") };

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

  revalidarCalculadora();
  return { ok: true, mensagem: `Equipamento cadastrado.${aviso}` };
}

/**
 * Edição de um equipamento do catálogo: informações principais (fabricante, modelo, potência,
 * custo, prioridade, ativo, status técnico manual), dados técnicos usados pelo motor (validação
 * de string/MPPT — ver `dimensionamento.ts`), dados avançados/internos e datasheet. O formulário
 * sempre envia todos os campos do tipo (seções recolhidas continuam no DOM), então campo vazio
 * aqui significa "sem valor".
 */
export async function editarEquipamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = z
    .object({
      id: z.string().uuid(),
      tipo: z.enum(["modulo", "inversor"]),
      ...camposPrincipais,
      ...camposModulo,
      ...camposInversor,
      ...camposAvancados,
    })
    .safeParse(entradasSemArquivo(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const tecnicos = camposTecnicosParaPersistir(d.tipo, d);
  const { status, aviso } = resolverStatusTecnico(d.tipo, d.statusTecnico, tecnicos);

  const supabase = await criarClienteServidor();

  const patch: PatchEquipamento = {
    fabricante: d.fabricante,
    modelo: d.modelo,
    potencia_w: d.potenciaW,
    prioridade: d.prioridade,
    ativo: formData.get("ativo") === "on",
    preco_referencia_brl: d.precoReferenciaBRL,
    status_tecnico: status,
    ...tecnicos,
    ...camposAvancadosParaPersistir(d.tipo, d),
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
  if (error) return { ok: false, mensagem: mensagemErroEquipamento(error, "Não foi possível salvar.") };
  revalidarCalculadora();
  return { ok: true, mensagem: `Salvo.${aviso}` };
}

const LIMITE_CSV = 2 * 1024 * 1024;
const LIMITE_LINHAS_CSV = 2000;

export type ResultadoLeituraCsv =
  | { ok: false; mensagem: string }
  | { ok: true; mensagem: string; nomeArquivo: string; preview: PreviewImportacao }
  | null;

/**
 * Importação CSV, etapas "Ler → Mapear/validar → Preview" (Evandro, 2026-10-01): lê o arquivo,
 * valida cada linha com a mesma função que grava (`linhaCsvParaEquipamento`) e devolve o preview
 * — linhas válidas (novo/atualiza, status técnico resultante, campos faltantes), erros,
 * duplicados no arquivo e colunas ausentes/desconhecidas. NÃO grava nada: a gravação é
 * `confirmarImportacaoCsv`, depois que o admin conferir o preview.
 */
export async function lerCsvEquipamentos(_: ResultadoLeituraCsv, formData: FormData): Promise<ResultadoLeituraCsv> {
  const { atual } = await exigirPapel("admin");
  const arquivo = formData.get("csv");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, mensagem: "Selecione um arquivo CSV." };
  }
  if (arquivo.size > LIMITE_CSV) return { ok: false, mensagem: "Arquivo CSV muito grande (máximo 2 MB)." };

  const linhas = linhasParaObjetos(analisarCsv(await arquivo.text()));
  if (!linhas.length) return { ok: false, mensagem: "CSV vazio ou sem linhas de dados." };
  if (linhas.length > LIMITE_LINHAS_CSV) {
    return { ok: false, mensagem: `CSV com mais de ${LIMITE_LINHAS_CSV} linhas — divida em arquivos menores.` };
  }

  const supabase = await criarClienteServidor();
  // `select("*")` (e não uma lista de colunas) pra continuar funcionando num banco que ainda
  // não tem `status_tecnico` — nesse caso o preview só não preserva o status manual.
  const { data: existentes } = await supabase.from("equipamentos_empresa").select("*").eq("empresa_id", atual.empresaId);
  const preview = prepararPreviewImportacao(linhas, existentes ?? []);
  return { ok: true, mensagem: "Arquivo lido.", nomeArquivo: arquivo.name, preview };
}

/**
 * Importação CSV, etapas "Confirmar → Importar": recebe de volta (campo oculto `linhas`, JSON)
 * as linhas originais que o preview aprovou, valida de novo no servidor — nunca confia no que
 * veio do navegador — e faz upsert por (empresa, tipo, fabricante, modelo): reimportar o mesmo
 * catálogo atualiza os existentes em vez de duplicar. `status_tecnico` não vai no upsert: o
 * gatilho do banco calcula completo/incompleto e preserva a escolha manual de quem já existia.
 */
export async function confirmarImportacaoCsv(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(formData.get("linhas") ?? ""));
  } catch {
    return { ok: false, mensagem: "Leia o arquivo de novo antes de confirmar." };
  }
  const linhas = z.array(z.record(z.string(), z.string())).min(1).max(LIMITE_LINHAS_CSV).safeParse(bruto);
  if (!linhas.success) return { ok: false, mensagem: "Nada para importar — leia o arquivo de novo." };

  const preview = prepararPreviewImportacao(linhas.data, []);
  if (preview.erros.length) {
    const detalhes = preview.erros
      .slice(0, 5)
      .map((e) => e.erro)
      .join("; ");
    return { ok: false, mensagem: `Linhas inválidas no envio: ${detalhes}` };
  }
  const validos = preview.validas.flatMap((v) => {
    const resultado = linhaCsvParaEquipamento(v.original);
    return resultado.ok ? [{ ...resultado.valores, empresa_id: atual.empresaId }] : [];
  });

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("equipamentos_empresa")
    .upsert(validos, { onConflict: "empresa_id,tipo,fabricante,modelo" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível importar o catálogo.") };

  revalidarCalculadora();
  return { ok: true, mensagem: `${validos.length} equipamento(s) importado(s)/atualizado(s).` };
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
  revalidarCalculadora();
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
