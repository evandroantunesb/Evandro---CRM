/**
 * Lista de equipamentos sem preço (item 5 do roadmap, opção A; prévia aprovada em 18/11/2026): colunas, prévia e itens
 * para `importar_lista_equipamentos`. Puro, para ser testado à parte.
 */
import {
  MAX_PRECOS_POR_TABELA,
  ehCategoriaMaterial,
  
  normalizar,
  normalizarUnidade,
  
  
  textoCelula,
  type Celula,
  type CategoriaMaterial,
  type DecisaoNovo,
  type MaterialVM,
} from "@/lib/compras/precos";
import { lerPotenciaCelula, palpiteCategoria, potenciaDoItem } from "@/lib/compras/potencia";

export type MapaLista = { cabecalho: number; material: number; categoria: number | null; unidade: number | null; potencia: number | null };

const PALPITES: { campo: keyof Omit<MapaLista, "cabecalho">; padrao: RegExp }[] = [
  { campo: "potencia", padrao: /^pot\b|^pot\.|potencia|^w$|^wp$|^k?wp?$|^watts?$/ },
  { campo: "categoria", padrao: /categ|^tipo|grupo|familia/ },
  { campo: "unidade", padrao: /^un\b|^un\.|^und|unidade|medida/ },
  { campo: "material", padrao: /descri|produto|material|equipamento|modelo|^item|^nome/ },
];

/** Palpite das colunas pelo cabeçalho (nas 20 primeiras linhas). Nulo = não achou a coluna do equipamento. */
export function adivinharMapaLista(linhas: Celula[][]): MapaLista | null {
  for (let l = 0; l < Math.min(linhas.length, 20); l++) {
    const achado: Partial<Record<keyof Omit<MapaLista, "cabecalho">, number>> = {};
    linhas[l].forEach((c, i) => {
      const t = normalizar(textoCelula(c));
      if (!t) return;
      const p = PALPITES.find((x) => achado[x.campo] == null && x.padrao.test(t));
      if (p) achado[p.campo] = i;
    });
    if (achado.material != null) {
      return { cabecalho: l, material: achado.material, categoria: achado.categoria ?? null, unidade: achado.unidade ?? null, potencia: achado.potencia ?? null };
    }
  }
  return null;
}

export function erroMapaLista(m: MapaLista): string | null {
  const usadas = [m.material, m.categoria, m.unidade, m.potencia].filter((x) => x != null);
  if (new Set(usadas).size !== usadas.length) return "Cada coluna só pode ter um significado.";
  return null;
}

/** Categoria da coluna "Categoria" (o nome da lista do Raion ou um palpite pelo texto); sem coluna, pelo equipamento. */
export function categoriaDaLinha(textoCategoria: string, descricao: string): CategoriaMaterial {
  const t = normalizar(textoCategoria).replace(/\s+/g, "_");
  if (ehCategoriaMaterial(t)) return t;
  return textoCategoria ? palpiteCategoria(textoCategoria) : palpiteCategoria(descricao);
}

export type LinhaLista = {
  numero: number;
  descricao: string;
  categoria: CategoriaMaterial;
  unidade: string | null;
  /** Potência lida (W): nula sem coluna ou vazia, NaN ilegível. */
  potencia: number | null;
  /** Material já cadastrado com o mesmo nome. */
  materialId: string | null;
  problema: string | null;
};

export function montarPreviaLista({ linhas, mapa, materiais }: { linhas: Celula[][]; mapa: MapaLista; materiais: MaterialVM[] }): LinhaLista[] {
  const porNome = new Map(materiais.map((m) => [normalizar(m.nome), m.id]));
  const vistos = new Map<string, number>();
  const resultado: LinhaLista[] = [];
  for (let l = mapa.cabecalho + 1; l < linhas.length; l++) {
    const linha = linhas[l] ?? [];
    if (linha.every((c) => textoCelula(c) === "")) continue;
    const descricao = textoCelula(linha[mapa.material]).slice(0, 200);
    const categoriaTexto = mapa.categoria != null ? textoCelula(linha[mapa.categoria]) : "";
    const unidade = mapa.unidade != null ? textoCelula(linha[mapa.unidade]) || null : null;
    const potencia = mapa.potencia != null ? lerPotenciaCelula(linha[mapa.potencia]) : null;
    const chave = normalizar(descricao);
    let problema: string | null = null;
    if (!descricao) problema = "Sem equipamento";
    else if (descricao.length < 2) problema = "Nome curto demais";
    else if (vistos.has(chave)) problema = `Repetido (linha ${vistos.get(chave)})`;
    else vistos.set(chave, l + 1);
    resultado.push({
      numero: l + 1,
      descricao,
      categoria: categoriaDaLinha(categoriaTexto, descricao),
      unidade,
      potencia,
      materialId: problema ? null : (porNome.get(chave) ?? null),
      problema,
    });
  }
  return resultado;
}

/** Decisão padrão: o material do mesmo nome, ou criar com a categoria da linha. */
export function decisaoPadraoLista(l: LinhaLista): DecisaoNovo {
  return l.materialId
    ? { tipo: "ligar", materialId: l.materialId }
    : { tipo: "criar", nome: l.descricao.slice(0, 120), categoria: l.categoria, unidade: normalizarUnidade(l.unidade) };
}

export type ItemLista = (
  | { material_id: string; descricao: string }
  | { novo: { nome: string; categoria: CategoriaMaterial; unidade: string }; descricao: string }
) & { potencia_w?: number };

export function itensLista(linhas: LinhaLista[], decisaoDe: (l: LinhaLista) => DecisaoNovo): { itens: ItemLista[] } | { erro: string } {
  const itens: ItemLista[] = [];
  const usados = new Map<string, number>();
  for (const l of linhas) {
    if (l.problema) continue;
    const d = decisaoDe(l);
    const extra = { descricao: l.descricao, ...potenciaDoItem(l.potencia) };
    let chave: string;
    if (d.tipo === "ligar") {
      itens.push({ material_id: d.materialId, ...extra });
      chave = d.materialId;
    } else {
      const nome = d.nome.replace(/\s+/g, " ").trim();
      if (nome.length < 2 || nome.length > 120) return { erro: `Dê um nome de 2 a 120 caracteres ao equipamento da linha ${l.numero}.` };
      itens.push({ novo: { nome, categoria: d.categoria, unidade: d.unidade.trim() || "un" }, ...extra });
      chave = `novo:${normalizar(nome)}`;
    }
    const antes = usados.get(chave);
    if (antes != null) return { erro: `As linhas ${antes} e ${l.numero} ficaram com o mesmo equipamento. Ligue cada linha a um equipamento diferente.` };
    usados.set(chave, l.numero);
  }
  if (itens.length === 0) return { erro: "Nenhum equipamento para importar." };
  if (itens.length > MAX_PRECOS_POR_TABELA) return { erro: `A lista tem mais de ${MAX_PRECOS_POR_TABELA.toLocaleString("pt-BR")} equipamentos. Divida a planilha.` };
  return { itens };
}
