/**
 * Proposta simples provisória (M2 P0): até 3 páginas A4 (capa, sistema, oferta), no layout aprovado em
 * `docs/referencias/proposta-solar-ibs.html`, SEM economia, payback, Fio B nem tipo de ligação. Puro (sem I/O, sem
 * "server-only").
 *
 * A emissão nunca altera os modelos publicados da empresa. Só LÊ deles o conteúdo que a empresa escreveu (condições,
 * inclusões, exclusões, garantias, etapas); texto padrão do renderizador nunca vira promessa ao cliente. Os dados
 * exibidos são congelados na emissão (`DadosEmissaoSimples`, gravado em `propostas_emissoes.dados`) e o PDF é gerado
 * uma única vez a partir deles.
 *
 * ORIGEM DOS NÚMEROS (nenhum vem do cálculo salvo em `calculos_solares`, que é legado e não comprovável):
 *  - potência (kWp) = soma dos módulos do kit emitido (`kit_componentes`: quantidade × potência_w / 1000);
 *  - geração (kWh/mês) = potência × `parametros_calculadora.produtividade_kwh_kwp_mes` da empresa (2 casas), e SÓ
 *    entra na proposta se o admin da empresa confirmou essa produtividade (`produtividade_confirmada_*`, migration
 *    20261022110000): sem confirmação válida (valor confirmado = valor atual) a proposta sai sem o número de geração;
 *  - consumo e preço = os do negócio (`negocios.consumo_medio_kwh`, `negocios.valor`).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { nomeKitPersonalizado, potenciaKitPersonalizadoKwp, type ComponenteKit } from "@/lib/calculadora";
import { valorComoPersistido } from "@/lib/consumo-persistido";
import { TIPOS_COMPONENTE_KIT } from "@/lib/tipos";

/** Identificação do layout que gera o PDF; muda quando o conteúdo/estrutura do modelo simples mudar. */
export const RENDERIZADOR_SIMPLES = "simples-v4";

/** Rodapé aprovado (proposta COM a geração estimada). */
export const RODAPE_SIMPLES =
  "Esta proposta apresenta o sistema e sua geração estimada. Não inclui estimativa de economia ou prazo de retorno.";

/** Variante para a proposta SEM geração (produtividade não confirmada): não promete um número que não está nela. */
export const RODAPE_SIMPLES_SEM_GERACAO = "Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno.";

export const rodapeDaProposta = (temGeracao: boolean) => (temGeracao ? RODAPE_SIMPLES : RODAPE_SIMPLES_SEM_GERACAO);

/** Limites da identificação da confirmação da produtividade (cabem na linha de premissa da página 2). */
export const LIMITES_CONFIRMACAO = { fonteMin: 10, fonteMax: 120, responsavelMin: 3, responsavelMax: 60 } as const;

/**
 * Limites que mantêm a proposta em 3 páginas A4 sem cortar nada: passou do limite, a emissão é recusada com a
 * orientação, em vez de truncar o texto que a empresa confirmou.
 */
export const LIMITES_SIMPLES = {
  incluso: 5,
  exclusos: 4,
  garantias: 3,
  etapas: 4,
  textoItem: 70,
  etapaTitulo: 28,
  etapaPrazo: 20,
  etapaDescricao: 50,
  componentes: 8,
  descricaoComponente: 70,
  condicoes: 240,
  clienteNome: 60,
  clienteEndereco: 100,
} as const;

// ---------------------------------------------------------------------------
// Conteúdo confirmado pela empresa (lido do modelo padrão publicado, só leitura)
// ---------------------------------------------------------------------------

export type Etapa = { titulo: string; prazo: string | null; descricao: string | null };

export type ConteudoDoModelo = {
  /** Texto sugerido das condições de pagamento (bloco "Condições comerciais"). */
  condicoes: string;
  /** Inclusões escritas pela empresa ("Inclusões e exclusões" ou "O que está incluso"); nulo = sem conteúdo. */
  incluso: string[] | null;
  /** Exclusões escritas pela empresa; nulo = sem conteúdo. */
  exclusos: string[] | null;
  /** Garantias escritas pela empresa; nulo = sem conteúdo. */
  garantias: string[] | null;
  /** Etapas ("título | prazo | descrição") escritas pela empresa; nulo = sem conteúdo. */
  etapas: Etapa[] | null;
};

function listaEscrita(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const itens = valor
    .filter((i): i is string => typeof i === "string")
    .map((i) => i.trim())
    .filter((i) => i.length > 0);
  return itens.length ? itens : null;
}

const itensDe = (config: unknown) => listaEscrita(config && typeof config === "object" ? (config as { itens?: unknown }).itens : null);

/** Só blocos ATIVOS e só texto presente na configuração; nada é completado com o padrão do renderizador. */
export function extrairConteudoDoModelo(blocos: { tipo: string; ativo: boolean; config: unknown }[] | null | undefined): ConteudoDoModelo {
  const ativo = (tipo: string) => (blocos ?? []).find((b) => b.tipo === tipo && b.ativo)?.config;
  const texto = (ativo("commercial_conditions") as { texto?: unknown } | null | undefined)?.texto;
  const escopo = ativo("scope_inclusions_exclusions") as { incluido?: unknown; excluido?: unknown } | null | undefined;
  const etapas = (itensDe(ativo("project_steps")) ?? [])
    .map((linha) => {
      const [titulo = "", prazo = "", descricao = ""] = linha.split("|").map((p) => p.trim());
      return { titulo, prazo: prazo || null, descricao: descricao || null };
    })
    .filter((e) => e.titulo);
  return {
    condicoes: typeof texto === "string" ? texto.trim() : "",
    incluso: listaEscrita(escopo?.incluido) ?? itensDe(ativo("included_services")),
    exclusos: listaEscrita(escopo?.excluido),
    garantias: itensDe(ativo("warranties")),
    etapas: etapas.length ? etapas : null,
  };
}

/** Validade padrão da proposta quando o modelo não define uma (decisão do Evandro, 29/10/2026). */
export const VALIDADE_PADRAO_DIAS = 10;

/**
 * Dias de validade sugeridos na emissão: o "Validade (dias)" do bloco "Dados do documento" do modelo padrão,
 * entre 1 e 180; senão, 10. É só a sugestão do campo "Válida até": o vendedor pode trocar a data.
 */
export function validadePadraoDoModelo(blocos: { tipo: string; config: unknown }[] | null | undefined): number {
  const config = (blocos ?? []).find((b) => b.tipo === "proposal_identity")?.config as { validadeDias?: unknown } | null | undefined;
  const dias = Number(typeof config?.validadeDias === "string" ? config.validadeDias.trim() : config?.validadeDias);
  return Number.isInteger(dias) && dias >= 1 && dias <= 180 ? dias : VALIDADE_PADRAO_DIAS;
}

/**
 * Dias de validade sugeridos na emissão, com a preferência da empresa (Configurações > Propostas >
 * Validade padrão) por cima: preferência da empresa > "Validade (dias)" do modelo padrão > 10.
 */
export function validadePadraoDaProposta(
  validadeDiasPreferencia: number | null | undefined,
  blocos: { tipo: string; config: unknown }[] | null | undefined,
): number {
  return validadeDiasPreferencia ?? validadePadraoDoModelo(blocos);
}

/** AAAA-MM-DD somado de `dias` (calendário, sem fuso). */
export function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Dados congelados da emissão
// ---------------------------------------------------------------------------

const textoCurto = z.string().trim().min(1).max(300);
const numeroPositivo = z.number().finite().positive();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listaDeItens = z.array(z.string().trim().min(1).max(300)).min(1).max(20).nullable();

export const esquemaDadosEmissaoSimples = z
  .object({
  esquema: z.literal(4),
  cliente: z.object({ nome: textoCurto, endereco: z.string().max(400).nullable() }),
  sistema: z.object({
    kitNome: textoCurto,
    /** Soma dos módulos do kit emitido. */
    potenciaKwp: numeroPositivo,
    consumoMedioKwh: numeroPositivo,
    /** Módulos do kit: quantidade total e potência (nula se houver módulos de potências diferentes). */
    modulos: z.object({ quantidade: z.number().int().positive(), potenciaW: numeroPositivo.nullable() }).nullable(),
    /**
     * Geração estimada: potência × produtividade da empresa. Nula = produtividade NÃO confirmada pelo admin na
     * emissão, e a proposta sai sem esse número.
     */
    geracao: z
      .object({
        kwhMes: numeroPositivo,
        produtividadeKwhKwpMes: numeroPositivo,
        /** Quando o admin da empresa confirmou essa produtividade (ISO), de onde veio o valor e quem o validou. */
        confirmadaEm: z.string().min(10),
        fonte: z.string().trim().min(LIMITES_CONFIRMACAO.fonteMin).max(LIMITES_CONFIRMACAO.fonteMax),
        responsavel: z.string().trim().min(LIMITES_CONFIRMACAO.responsavelMin).max(LIMITES_CONFIRMACAO.responsavelMax),
      })
      .nullable(),
    componentes: z
      .array(
        z.object({
          tipo: z.enum(TIPOS_COMPONENTE_KIT),
          descricao: z.string().trim().min(1).max(300),
          quantidade: z.number().int().positive(),
          potenciaW: z.number().finite().positive().nullable(),
        }),
      )
      .min(1),
  }),
  preco: z.object({ valor: numeroPositivo }),
  comercial: z.object({
    validadeAte: dataIso,
    /** Obrigatória: a proposta só é congelada com as condições de pagamento confirmadas (uma opção por linha). */
    condicoesPagamento: z.string().trim().min(1).max(LIMITES_SIMPLES.condicoes),
    /** Conteúdo confirmado pela empresa no modelo; nulo = bloco omitido na proposta. */
    incluso: listaDeItens,
    exclusos: listaDeItens,
    garantias: listaDeItens,
    etapas: z
      .array(z.object({ titulo: z.string().trim().min(1).max(100), prazo: z.string().max(100).nullable(), descricao: z.string().max(300).nullable() }))
      .min(1)
      .max(8)
      .nullable(),
  }),
  identidade: z.object({
    nomeExibicao: z.string().max(200),
    corPrimaria: z.string().max(7),
    corDestaque: z.string().max(7),
    whatsapp: z.string().max(40),
  }),
  emissao: z.object({ versao: z.number().int().positive(), emitidaEm: z.string().min(10) }),
  rodape: z.string(),
})
  // O rodapé acompanha a geração: com o número, o aprovado; sem ele, a variante que não o promete.
  .refine((d) => d.rodape === rodapeDaProposta(d.sistema.geracao != null), { path: ["rodape"], message: "Rodapé não confere com a proposta." });

export type DadosEmissaoSimples = z.infer<typeof esquemaDadosEmissaoSimples>;

/** JSON canônico (chaves ordenadas): o mesmo conteúdo gera sempre os mesmos bytes, não importa a ordem do jsonb. */
export function jsonCanonico(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, ordenar(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(ordenar(valor));
}

export function sha256Hex(entrada: string | Uint8Array): string {
  return createHash("sha256").update(entrada).digest("hex");
}

export function hashDosDados(dados: unknown): string {
  // Passa por JSON para igualar o que o jsonb devolve (sem undefined, números normalizados).
  return sha256Hex(jsonCanonico(JSON.parse(JSON.stringify(dados))));
}

/** Lê `dados` do banco: confere o formato E o hash gravado. Qualquer divergência = indisponível (nunca exibe). */
export function lerDadosDaEmissao(dados: unknown, hashGravado: string): { ok: true; dados: DadosEmissaoSimples } | { ok: false } {
  const analisado = esquemaDadosEmissaoSimples.safeParse(dados);
  if (!analisado.success) return { ok: false };
  if (hashDosDados(dados) !== hashGravado) return { ok: false };
  return { ok: true, dados: analisado.data };
}

// ---------------------------------------------------------------------------
// Produtividade confirmada
// ---------------------------------------------------------------------------

export type ParametrosProdutividade = {
  produtividade_kwh_kwp_mes: number;
  produtividade_confirmada_valor: number | null;
  produtividade_confirmada_em: string | null;
  produtividade_confirmada_fonte: string | null;
  produtividade_confirmada_responsavel: string | null;
};

export type ProdutividadeConfirmada = { valor: number; em: string; fonte: string; responsavel: string };

/**
 * Condição para a geração valer numa proposta emitida: o admin da empresa confirmou o valor ATUAL da produtividade,
 * dizendo de onde ele vem (fonte) e quem o validou (responsável). Valor confirmado diferente do atual, ou sem fonte
 * ou responsável, = não validada.
 */
export function produtividadeConfirmada(p: ParametrosProdutividade | null | undefined): ProdutividadeConfirmada | null {
  if (!p || p.produtividade_confirmada_valor == null || !p.produtividade_confirmada_em) return null;
  const fonte = p.produtividade_confirmada_fonte?.trim() ?? "";
  const responsavel = p.produtividade_confirmada_responsavel?.trim() ?? "";
  if (fonte.length < LIMITES_CONFIRMACAO.fonteMin || responsavel.length < LIMITES_CONFIRMACAO.responsavelMin) return null;
  if (valorComoPersistido(p.produtividade_confirmada_valor, 2) !== valorComoPersistido(p.produtividade_kwh_kwp_mes, 2)) return null;
  return { valor: p.produtividade_kwh_kwp_mes, em: p.produtividade_confirmada_em, fonte, responsavel };
}

// ---------------------------------------------------------------------------
// Requisitos para emitir
// ---------------------------------------------------------------------------

export type EntradaEmissaoSimples = {
  contatoNome: string | null;
  contatoEndereco: string | null;
  /** Valor do negócio (preço da proposta). */
  valorNegocio: number | null;
  /** Consumo do NEGÓCIO (nunca do cálculo salvo). */
  consumoMedioKwhNegocio: number | null;
  /** Itens ATUAIS do kit do negócio (`kit_componentes`), na ordem. */
  componentes: { tipo: string; descricao: string; quantidade: number; potencia_w: number | null }[];
  /** Produtividade confirmada pelo admin (ver `produtividadeConfirmada`); nulo = geração fora da proposta. */
  produtividadeConfirmada: ProdutividadeConfirmada | null;
  /** Informada pelo vendedor (AAAA-MM-DD); sem padrão. */
  validadeAte: string | null;
  condicoesPagamento: string | null;
  conteudo: Pick<ConteudoDoModelo, "incluso" | "exclusos" | "garantias" | "etapas">;
  identidade: { nomeExibicao: string; corPrimaria: string; corDestaque: string; whatsapp: string };
  versao: number;
  emitidaEm: string;
  /** AAAA-MM-DD de hoje em São Paulo. */
  hoje: string;
};

export const MENSAGEM_VALIDADE_OBRIGATORIA = "Informe até quando a proposta é válida.";
export const MENSAGEM_CONDICOES_OBRIGATORIAS = "Informe as condições de pagamento (uma opção por linha): a proposta só é emitida com elas confirmadas.";
export const MENSAGEM_VALIDADE_PASSADA = "A validade não pode ser anterior a hoje.";

/** Uma opção de pagamento por linha do texto das condições; texto de uma linha só vira parágrafo na proposta. */
export const opcoesDePagamento = (texto: string | null | undefined): string[] =>
  (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);

/** Data AAAA-MM-DD existente no calendário. */
export function dataIsoValida(texto: string | null | undefined): texto is string {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

type SistemaDoKit = {
  potenciaKwp: number;
  modulos: { quantidade: number; potenciaW: number | null };
  geracao: { kwhMes: number; produtividadeKwhKwpMes: number; confirmadaEm: string; fonte: string; responsavel: string } | null;
};

/** Potência (kWp), módulos e geração (kWh/mês) como a proposta os mostra. `geracao` nulo = não confirmada. */
export function sistemaDoKit(componentes: EntradaEmissaoSimples["componentes"], confirmada: EntradaEmissaoSimples["produtividadeConfirmada"]): SistemaDoKit | null {
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes.map((c) => ({ tipo: c.tipo, potenciaW: c.potencia_w, quantidade: c.quantidade })));
  if (!(potenciaKwp > 0)) return null;
  const modulos = componentes.filter((c) => c.tipo === "modulo" && c.potencia_w);
  const potencias = new Set(modulos.map((m) => m.potencia_w));
  const produtividade = confirmada?.valor;
  const geracao =
    confirmada && typeof produtividade === "number" && Number.isFinite(produtividade) && produtividade > 0
      ? { kwhMes: valorComoPersistido(potenciaKwp * produtividade, 2), produtividadeKwhKwpMes: produtividade, confirmadaEm: confirmada.em, fonte: confirmada.fonte, responsavel: confirmada.responsavel }
      : null;
  return {
    potenciaKwp,
    modulos: { quantidade: modulos.reduce((s, m) => s + m.quantidade, 0), potenciaW: potencias.size === 1 ? (modulos[0]!.potencia_w as number) : null },
    geracao,
  };
}

export type ResultadoMontagem = { ok: true; dados: DadosEmissaoSimples } | { ok: false; pendencias: string[] };

/** Confere os requisitos e monta os dados congelados. Nunca completa dado ausente com padrão ou zero. */
export function montarDadosEmissaoSimples(e: EntradaEmissaoSimples): ResultadoMontagem {
  const pendencias: string[] = [];
  const L = LIMITES_SIMPLES;
  if (!e.contatoNome?.trim()) pendencias.push("O negócio precisa ter um contato com nome.");
  if (e.componentes.length === 0) pendencias.push("O kit do negócio não tem itens.");
  const sistema = sistemaDoKit(e.componentes, e.produtividadeConfirmada);
  if (e.componentes.length > 0 && !sistema) pendencias.push("O kit precisa de módulos com potência informada para calcular a potência.");
  if (e.componentes.length > L.componentes) pendencias.push(`O kit tem mais de ${L.componentes} itens: a proposta simples comporta até ${L.componentes}. Agrupe itens do kit.`);
  if (e.componentes.some((c) => c.descricao.trim().length > L.descricaoComponente)) {
    pendencias.push(`Há item do kit com descrição acima de ${L.descricaoComponente} caracteres. Encurte a descrição no kit.`);
  }
  if ((e.contatoNome?.trim().length ?? 0) > L.clienteNome) pendencias.push(`O nome do contato passa de ${L.clienteNome} caracteres.`);
  if ((e.contatoEndereco?.trim().length ?? 0) > L.clienteEndereco) pendencias.push(`O endereço do contato passa de ${L.clienteEndereco} caracteres.`);
  if (opcoesDePagamento(e.condicoesPagamento).length === 0) pendencias.push(MENSAGEM_CONDICOES_OBRIGATORIAS);
  if ((e.condicoesPagamento?.trim().length ?? 0) > L.condicoes) pendencias.push(`As condições de pagamento passam de ${L.condicoes} caracteres. Resuma o texto.`);
  for (const [nome, itens, max] of [
    ["Incluso", e.conteudo.incluso, L.incluso],
    ["Não incluso", e.conteudo.exclusos, L.exclusos],
    ["Garantias", e.conteudo.garantias, L.garantias],
  ] as const) {
    if (!itens) continue;
    if (itens.length > max) pendencias.push(`O modelo da empresa tem ${itens.length} itens em "${nome}": a proposta simples comporta até ${max}. Reduza no modelo.`);
    if (itens.some((i) => i.length > L.textoItem)) pendencias.push(`Há item de "${nome}" com mais de ${L.textoItem} caracteres. Encurte no modelo.`);
  }
  if (e.conteudo.etapas) {
    if (e.conteudo.etapas.length > L.etapas) pendencias.push(`O modelo da empresa tem ${e.conteudo.etapas.length} etapas: a proposta simples comporta até ${L.etapas}.`);
    if (e.conteudo.etapas.some((s) => s.titulo.length > L.etapaTitulo || (s.prazo?.length ?? 0) > L.etapaPrazo || (s.descricao?.length ?? 0) > L.etapaDescricao)) {
      pendencias.push(`Há etapa com texto acima do limite (título ${L.etapaTitulo}, prazo ${L.etapaPrazo}, descrição ${L.etapaDescricao} caracteres). Encurte no modelo.`);
    }
  }
  if (!(typeof e.valorNegocio === "number" && e.valorNegocio > 0)) pendencias.push("Informe o valor do negócio (preço da proposta).");
  if (!(typeof e.consumoMedioKwhNegocio === "number" && e.consumoMedioKwhNegocio > 0)) pendencias.push("Informe o consumo médio do cliente no negócio.");
  if (!e.validadeAte) pendencias.push(MENSAGEM_VALIDADE_OBRIGATORIA);
  else if (!dataIsoValida(e.validadeAte)) pendencias.push("Validade inválida.");
  else if (e.validadeAte < e.hoje) pendencias.push(MENSAGEM_VALIDADE_PASSADA);
  if (pendencias.length || !sistema) return { ok: false, pendencias };

  const componentes = e.componentes.map((c) => ({
    tipo: c.tipo,
    descricao: c.descricao,
    quantidade: c.quantidade,
    potenciaW: c.potencia_w != null && c.potencia_w > 0 ? c.potencia_w : null,
  }));
  const condicoes = e.condicoesPagamento!.trim();
  const candidato = {
    esquema: 4 as const,
    cliente: { nome: e.contatoNome!.trim(), endereco: e.contatoEndereco?.trim() || null },
    sistema: {
      kitNome: nomeKitPersonalizado(
        e.componentes.map((c): ComponenteKit => ({ tipo: c.tipo as ComponenteKit["tipo"], descricao: c.descricao, potenciaW: c.potencia_w, quantidade: c.quantidade })),
      ),
      potenciaKwp: sistema.potenciaKwp,
      consumoMedioKwh: e.consumoMedioKwhNegocio!,
      modulos: sistema.modulos.quantidade > 0 ? sistema.modulos : null,
      geracao: sistema.geracao,
      componentes,
    },
    preco: { valor: e.valorNegocio! },
    comercial: {
      validadeAte: e.validadeAte!,
      condicoesPagamento: condicoes,
      incluso: e.conteudo.incluso,
      exclusos: e.conteudo.exclusos,
      garantias: e.conteudo.garantias,
      etapas: e.conteudo.etapas,
    },
    identidade: e.identidade,
    emissao: { versao: e.versao, emitidaEm: e.emitidaEm },
    rodape: rodapeDaProposta(sistema.geracao != null),
  };
  const analisado = esquemaDadosEmissaoSimples.safeParse(candidato);
  if (!analisado.success) return { ok: false, pendencias: ["Os dados do negócio não passaram na conferência da proposta. Revise o kit e o cliente."] };
  return { ok: true, dados: analisado.data };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Data de um instante (ISO com fuso) no calendário de São Paulo: 21h30 de 20/10 em Brasília é 21/10 em UTC. */
export function dataBrSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const brNumero = (n: number) => n.toLocaleString("pt-BR");

/** Premissa da geração, com a origem dos números (potência do kit × produtividade confirmada da empresa). */
export function textoPremissaGeracao(dados: DadosEmissaoSimples): string {
  const s = dados.sistema;
  if (!s.geracao) return "";
  return (
    `Geração estimada = potência do kit (${brNumero(s.potenciaKwp)} kWp, soma dos módulos listados) × produtividade média de ` +
    `${brNumero(s.geracao.produtividadeKwhKwpMes)} kWh por kWp ao mês, valor confirmado pela empresa em ${dataBrSaoPaulo(s.geracao.confirmadaEm)} (fonte: ${s.geracao.fonte}; responsável pela validação: ${s.geracao.responsavel}). ` +
    "Estimativa comercial, sem simulação de engenharia; a geração real varia com local, sombreamento, orientação e clima."
  );
}

/** Texto das condições comerciais na página web da proposta emitida. */
export function textoCondicoesComerciais(dados: DadosEmissaoSimples): string {
  const partes = [`Proposta válida até ${dataBr(dados.comercial.validadeAte)}.`];
  if (dados.comercial.condicoesPagamento) partes.push(`Condições de pagamento: ${dados.comercial.condicoesPagamento}`);
  return partes.join("\n\n");
}
