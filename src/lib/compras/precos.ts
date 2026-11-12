import { lerNumeroBr } from "@/lib/formatacao";

/*
 * Compras P3, tabela de preços de material (20261129100000_compras_tabela_precos.sql). Regras puras: leitura da
 * planilha, mapa de colunas, prévia da importação e histórico. O banco valida tudo de novo ao importar.
 */

export const CATEGORIAS_MATERIAL = ["modulos", "inversores", "baterias", "estrutura", "cabos_protecao", "outros"] as const;
export type CategoriaMaterial = (typeof CATEGORIAS_MATERIAL)[number];
export const ROTULO_CATEGORIA_MATERIAL: Record<CategoriaMaterial, string> = {
  modulos: "Módulos",
  inversores: "Inversores",
  baterias: "Baterias",
  estrutura: "Estrutura",
  cabos_protecao: "Cabos e proteção",
  outros: "Outros",
};
export const ehCategoriaMaterial = (v: unknown): v is CategoriaMaterial => CATEGORIAS_MATERIAL.includes(v as CategoriaMaterial);

/** Preço com mais dias que isto pede tabela nova (indicador do topo). */
export const DIAS_PRECO_ANTIGO = 30;
/** Limite de preços por tabela (o banco recusa acima disso). */
export const MAX_PRECOS_POR_TABELA = 5000;

export type Celula = string | number | boolean | Date | null | undefined;

/** Texto comparável: sem acentos, minúsculo e com espaços simples. */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Mesma chave do banco (`chave_fornecedor`): minúsculas e espaços simples. */
export function chaveFornecedor(nome: string) {
  return nome.replace(/\s+/g, " ").trim().toLowerCase();
}

export function textoCelula(c: Celula): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).replace(/\s+/g, " ").trim();
}

/** Letra da coluna como na planilha: 0 → A, 26 → AA. */
export function letraColuna(indice: number) {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Preço de uma célula: número da planilha ou texto ("R$ 1.234,56", "780,00", "780.5"). Nulo = vazia; NaN = não é preço.
 */
export function lerPrecoCelula(c: Celula): number | null {
  if (c == null) return null;
  if (typeof c === "number") return Number.isFinite(c) ? Math.round(c * 100) / 100 : Number.NaN;
  if (typeof c !== "string") return Number.NaN;
  const t = c.replace(/R\$/i, "").replace(/[\s ]/g, "");
  if (!t) return null;
  const br = lerNumeroBr(t);
  const n = br != null && !Number.isNaN(br) ? br : /^\d+\.\d+$/.test(t) ? Number(t) : Number.NaN;
  return Number.isNaN(n) ? n : Math.round(n * 100) / 100;
}

/** CSV de planilha brasileira ou não: separador ";", "," ou tab (o mais comum na 1ª linha), aspas e BOM. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const contar = (sep: string) => primeira.split(sep).length - 1;
  const sep = [";", "\t", ","].reduce((a, b) => (contar(b) > contar(a) ? b : a), ";");
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

export type MapaColunas = {
  /** Linha do cabeçalho (0 = primeira); os dados começam na seguinte. */
  cabecalho: number;
  material: number;
  codigo: number | null;
  unidade: number | null;
  preco: number;
};

export function ehMapaColunas(v: unknown): v is MapaColunas {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  const idx = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 200;
  return idx(m.cabecalho) && idx(m.material) && idx(m.preco) && (m.codigo === null || idx(m.codigo)) && (m.unidade === null || idx(m.unidade));
}

const PALPITES: { campo: "material" | "codigo" | "unidade" | "preco"; padrao: RegExp }[] = [
  { campo: "preco", padrao: /preco|valor|custo/ },
  { campo: "codigo", padrao: /^cod|codigo|sku|^ref/ },
  { campo: "unidade", padrao: /^un\b|^un\.|^und|unidade|medida/ },
  { campo: "material", padrao: /descri|produto|material|^item|^nome/ },
];

/** Palpite das colunas pelo cabeçalho (nas 20 primeiras linhas). Nulo = não achou material e preço. */
export function adivinharMapa(linhas: Celula[][]): MapaColunas | null {
  for (let l = 0; l < Math.min(linhas.length, 20); l++) {
    const achado: Partial<Record<"material" | "codigo" | "unidade" | "preco", number>> = {};
    linhas[l].forEach((c, i) => {
      const t = normalizar(textoCelula(c));
      if (!t) return;
      const p = PALPITES.find((x) => achado[x.campo] == null && x.padrao.test(t));
      if (p) achado[p.campo] = i;
    });
    if (achado.material != null && achado.preco != null) {
      return { cabecalho: l, material: achado.material, preco: achado.preco, codigo: achado.codigo ?? null, unidade: achado.unidade ?? null };
    }
  }
  return null;
}

export function erroMapa(m: MapaColunas): string | null {
  if (m.material === m.preco) return "Material e preço de custo precisam ser colunas diferentes.";
  const usadas = [m.material, m.preco, m.codigo, m.unidade].filter((x) => x != null);
  if (new Set(usadas).size !== usadas.length) return "Cada coluna só pode ter um significado.";
  return null;
}

export type MaterialVM = { id: string; nome: string; categoria: CategoriaMaterial; unidade: string; potenciaW: number | null };

/** Como o material já apareceu nas tabelas deste fornecedor (código e descrição). */
export type VinculoFornecedor = { materialId: string; codigo: string | null; descricao: string | null };
export type PrecoAtual = { materialId: string; preco: number; dataPreco: string };

export type SituacaoLinha = "igual" | "subiu" | "baixou" | "novo" | "problema";

export type LinhaPrevia = {
  /** Número da linha na planilha (1 = primeira). */
  numero: number;
  descricao: string;
  codigo: string | null;
  unidade: string | null;
  preco: number | null;
  situacao: SituacaoLinha;
  /** Material reconhecido (por código, descrição ou nome). Em "novo" pode vir sugerido pelo nome. */
  materialId: string | null;
  precoAnterior: number | null;
  problema: string | null;
};

/** Unidade da planilha no padrão do Raion ("UN" → "un", "Metro" → "m"). */
export function normalizarUnidade(u: string | null): string {
  const t = normalizar(u ?? "");
  if (!t) return "un";
  if (/^(un|und|unid|unidade|pc|pca|peca)s?\.?$/.test(t)) return "un";
  if (/^(m|mt|mts|metro|metros)\.?$/.test(t)) return "m";
  return t.slice(0, 20);
}

export function montarPrevia({
  linhas,
  mapa,
  materiais,
  vinculos,
  precosAtuais,
}: {
  linhas: Celula[][];
  mapa: MapaColunas;
  materiais: MaterialVM[];
  vinculos: VinculoFornecedor[];
  precosAtuais: PrecoAtual[];
}): LinhaPrevia[] {
  const porCodigo = new Map<string, string>();
  const porDescricao = new Map<string, string>();
  // Vínculos do mais recente ao mais antigo: vale o primeiro de cada código e de cada descrição.
  for (const v of vinculos) {
    if (v.codigo && !porCodigo.has(normalizar(v.codigo))) porCodigo.set(normalizar(v.codigo), v.materialId);
    if (v.descricao && !porDescricao.has(normalizar(v.descricao))) porDescricao.set(normalizar(v.descricao), v.materialId);
  }
  const porNome = new Map(materiais.map((m) => [normalizar(m.nome), m.id]));
  const atual = new Map(precosAtuais.map((p) => [p.materialId, p.preco]));
  const vistos = new Map<string, number>();

  const resultado: LinhaPrevia[] = [];
  for (let l = mapa.cabecalho + 1; l < linhas.length; l++) {
    const linha = linhas[l] ?? [];
    if (linha.every((c) => textoCelula(c) === "")) continue;
    const descricao = textoCelula(linha[mapa.material]).slice(0, 200);
    const codigo = mapa.codigo != null ? textoCelula(linha[mapa.codigo]).slice(0, 60) || null : null;
    const unidade = mapa.unidade != null ? textoCelula(linha[mapa.unidade]) || null : null;
    const preco = lerPrecoCelula(linha[mapa.preco]);
    const base = { numero: l + 1, descricao, codigo, unidade, preco: preco != null && !Number.isNaN(preco) ? preco : null };

    let problema: string | null = null;
    if (!descricao) problema = "Sem material";
    else if (preco == null) problema = "Sem preço";
    else if (Number.isNaN(preco) || preco <= 0 || preco >= 1e10) problema = "Preço inválido";

    const reconhecido = (codigo && porCodigo.get(normalizar(codigo))) || porDescricao.get(normalizar(descricao));
    const materialId = reconhecido || porNome.get(normalizar(descricao)) || null;
    if (!problema && materialId && reconhecido) {
      const repetida = vistos.get(materialId);
      if (repetida != null) problema = `Repetido (linha ${repetida})`;
      else vistos.set(materialId, l + 1);
    }
    if (problema) {
      resultado.push({ ...base, situacao: "problema", materialId: null, precoAnterior: null, problema });
      continue;
    }
    const anterior = reconhecido ? (atual.get(reconhecido) ?? null) : null;
    const situacao: SituacaoLinha =
      !reconhecido || anterior == null ? "novo" : base.preco! > anterior ? "subiu" : base.preco! < anterior ? "baixou" : "igual";
    resultado.push({ ...base, situacao, materialId, precoAnterior: anterior, problema: null });
  }
  return resultado;
}

export function resumoPrevia(linhas: LinhaPrevia[]) {
  const n = (s: SituacaoLinha) => linhas.filter((l) => l.situacao === s).length;
  return { iguais: n("igual"), subiram: n("subiu"), baixaram: n("baixou"), novos: n("novo"), problemas: n("problema") };
}

/** Variação em % (1 casa), com sinal. */
export function variacao(anterior: number, novo: number) {
  return Math.round(((novo - anterior) / anterior) * 1000) / 10;
}

/** Escolha para uma linha "novo": criar material ou ligar a um existente. */
export type DecisaoNovo = { tipo: "criar"; nome: string; categoria: CategoriaMaterial; unidade: string } | { tipo: "ligar"; materialId: string };

export type ItemImportacao =
  | { material_id: string; codigo: string | null; descricao: string; preco: number }
  | { novo: { nome: string; categoria: CategoriaMaterial; unidade: string }; codigo: string | null; descricao: string; preco: number };

/**
 * Itens que vão ao banco: todas as linhas sem problema (as iguais confirmam a data do preço). Erro se uma linha nova não
 * tem decisão ou se dois itens caem no mesmo material.
 */
export function itensImportacao(linhas: LinhaPrevia[], decisoes: Record<number, DecisaoNovo | undefined>): { itens: ItemImportacao[] } | { erro: string } {
  const itens: ItemImportacao[] = [];
  const usados = new Map<string, number>();
  for (const l of linhas) {
    if (l.situacao === "problema") continue;
    const base = { codigo: l.codigo, descricao: l.descricao, preco: l.preco! };
    let chave: string;
    if (l.situacao === "novo") {
      const d = decisoes[l.numero];
      if (!d) return { erro: `Escolha o material da linha ${l.numero} ("${l.descricao}").` };
      if (d.tipo === "ligar") {
        itens.push({ material_id: d.materialId, ...base });
        chave = d.materialId;
      } else {
        const nome = d.nome.replace(/\s+/g, " ").trim();
        if (nome.length < 2 || nome.length > 120) return { erro: `Dê um nome de 2 a 120 caracteres ao material da linha ${l.numero}.` };
        itens.push({ novo: { nome, categoria: d.categoria, unidade: d.unidade.trim() || "un" }, ...base });
        chave = `novo:${normalizar(nome)}`;
      }
    } else {
      itens.push({ material_id: l.materialId!, ...base });
      chave = l.materialId!;
    }
    const antes = usados.get(chave);
    if (antes != null) return { erro: `As linhas ${antes} e ${l.numero} ficaram com o mesmo material. Ligue cada linha a um material diferente.` };
    usados.set(chave, l.numero);
  }
  if (itens.length === 0) return { erro: "Nenhum preço para importar." };
  if (itens.length > MAX_PRECOS_POR_TABELA) return { erro: `A tabela tem mais de ${MAX_PRECOS_POR_TABELA.toLocaleString("pt-BR")} preços. Divida a planilha.` };
  return { itens };
}

export type PrecoHistorico = { fornecedor: string; preco: number; dataPreco: string; criadoEm: string; manual: boolean; lancadoPor: string | null };

/** Histórico de um material: só as mudanças de preço em cada fornecedor (do mais recente ao mais antigo). */
export function historicoComMudancas(precos: PrecoHistorico[]): (PrecoHistorico & { anterior: number | null })[] {
  const ordem = [...precos].sort((a, b) => a.dataPreco.localeCompare(b.dataPreco) || a.criadoEm.localeCompare(b.criadoEm));
  const ultimo = new Map<string, number>();
  const saida: (PrecoHistorico & { anterior: number | null })[] = [];
  for (const p of ordem) {
    const chave = chaveFornecedor(p.fornecedor);
    const anterior = ultimo.get(chave) ?? null;
    if (anterior === p.preco) continue;
    saida.push({ ...p, anterior });
    ultimo.set(chave, p.preco);
  }
  return saida.reverse();
}

export type PrecoFornecedor = { fornecedor: string; preco: number; dataPreco: string };

/** Preços de um material ordenados do menor para o maior (o primeiro é o melhor). */
export function ordenarPrecos<T extends PrecoFornecedor>(precos: T[]): T[] {
  return [...precos].sort((a, b) => a.preco - b.preco || b.dataPreco.localeCompare(a.dataPreco));
}

/** Dias entre duas datas ISO (AAAA-MM-DD). */
export function diasDesde(dataIso: string, hoje: string) {
  return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dataIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Preço sugerido no pedido: o do fornecedor do pedido, se ele tem preço para o material; senão o melhor (menor) de
 * todos. Nulo = sem preço.
 */
export function precoSugerido(precos: PrecoFornecedor[], fornecedor: string): (PrecoFornecedor & { doFornecedor: boolean }) | null {
  const chave = chaveFornecedor(fornecedor);
  const proprio = chave ? precos.find((p) => chaveFornecedor(p.fornecedor) === chave) : undefined;
  if (proprio) return { ...proprio, doFornecedor: true };
  const melhor = ordenarPrecos(precos)[0];
  return melhor ? { ...melhor, doFornecedor: false } : null;
}
