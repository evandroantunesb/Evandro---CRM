import { ROTULO_TIPO_LIGACAO } from "@/lib/tipos";

/** Campos disponíveis no modelo de contrato, preenchidos automaticamente ao gerar. */
export const PLACEHOLDERS_CONTRATO = [
  { chave: "empresa_nome", rotulo: "Nome da empresa" },
  { chave: "empresa_cnpj", rotulo: "CNPJ da empresa" },
  { chave: "cliente_nome", rotulo: "Nome do cliente" },
  { chave: "cliente_documento", rotulo: "CPF/CNPJ do cliente" },
  { chave: "cliente_endereco", rotulo: "Endereço do cliente" },
  { chave: "cliente_cidade", rotulo: "Cidade do cliente" },
  { chave: "cliente_uf", rotulo: "UF do cliente" },
  { chave: "cliente_email", rotulo: "E-mail do cliente" },
  { chave: "cliente_telefone", rotulo: "Telefone do cliente" },
  { chave: "cliente_telefone2", rotulo: "Segundo telefone do cliente" },
  { chave: "negocio_titulo", rotulo: "Título do negócio" },
  { chave: "negocio_numero", rotulo: "Número do negócio" },
  { chave: "negocio_valor", rotulo: "Valor do negócio (R$)" },
  { chave: "negocio_uc", rotulo: "Unidade consumidora" },
  { chave: "distribuidora", rotulo: "Distribuidora de energia" },
  { chave: "vendedor_nome", rotulo: "Nome do vendedor responsável" },
  { chave: "kit_nome", rotulo: "Kit contratado" },
  { chave: "kit_potencia_kwp", rotulo: "Potência do kit (kWp)" },
  { chave: "kit_itens", rotulo: "Itens do kit (um por linha)" },
  { chave: "tipo_ligacao", rotulo: "Tipo de ligação" },
  { chave: "consumo_medio_kwh", rotulo: "Consumo médio (kWh/mês)" },
  { chave: "geracao_estimada_kwh_mes", rotulo: "Geração estimada (kWh/mês)" },
  { chave: "data_hoje", rotulo: "Data de hoje" },
  { chave: "data_hoje_extenso", rotulo: "Data de hoje por extenso" },
] as const;

export type ChaveContrato = (typeof PLACEHOLDERS_CONTRATO)[number]["chave"];
export type DadosContrato = Record<ChaveContrato, string>;

const CHAVES = new Set<string>(PLACEHOLDERS_CONTRATO.map((p) => p.chave));
const ROTULO = new Map<string, string>(PLACEHOLDERS_CONTRATO.map((p) => [p.chave, p.rotulo]));

/** Qualquer coisa entre chaves duplas (inclusive malformada, como `{{ }}` ou `{{campo-x}}`). */
const MARCADOR = /\{\{([^{}]*)\}\}/g;

/** Troca cada {{campo}} do modelo pelo valor correspondente; campos sem dado viram "—". */
export function preencherModeloContrato(modelo: string, dados: DadosContrato): string {
  return modelo.replace(/\{\{\s*(\w+)\s*\}\}/g, (correspondencia, chave: string) => {
    if (!(chave in dados)) return correspondencia;
    const valor = (dados as Record<string, string | undefined>)[chave];
    return valor && valor.trim() ? valor : "—";
  });
}

/** Chaves {{campo}} usadas no modelo (só as conhecidas), sem repetição. */
export function camposUsadosNoModelo(modelo: string): ChaveContrato[] {
  const usados = new Set<ChaveContrato>();
  for (const m of modelo.matchAll(MARCADOR)) {
    const chave = m[1].trim();
    if (CHAVES.has(chave)) usados.add(chave as ChaveContrato);
  }
  return [...usados];
}

/**
 * Valida o texto do modelo ao salvar: `desconhecidos` lista os marcadores entre chaves duplas
 * que não são campos disponíveis (erro de digitação apareceria cru no contrato do cliente);
 * `chavesSoltas` indica `{{` ou `}}` sem par.
 */
export function validarModeloContrato(modelo: string): { desconhecidos: string[]; chavesSoltas: boolean } {
  const desconhecidos = new Set<string>();
  for (const m of modelo.matchAll(MARCADOR)) {
    const chave = m[1].trim();
    if (!CHAVES.has(chave)) desconhecidos.add(`{{${m[1]}}}`);
  }
  const restante = modelo.replace(MARCADOR, "");
  return { desconhecidos: [...desconhecidos], chavesSoltas: restante.includes("{{") || restante.includes("}}") };
}

/** Marcadores que sobraram num texto (contrato já preenchido): se houver, não vai para o cliente. */
export function marcadoresPendentes(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCADOR)].map((m) => m[0]))];
}

/**
 * O contrato pode ser mostrado/enviado ao cliente: nenhum marcador sobrando e nenhuma chave
 * isolada (`{{` ou `}}` sem par), mesmo malformada.
 */
export function contratoProntoParaCliente(conteudo: string): boolean {
  return marcadoresPendentes(conteudo).length === 0 && !conteudo.includes("{{") && !conteudo.includes("}}");
}

/**
 * Rótulos de TODOS os campos usados no modelo que estão sem dado (o contrato não sai com "—"
 * no lugar de informação). Campo que o modelo não usa não bloqueia.
 */
export function camposSemDado(modelo: string, dados: DadosContrato): string[] {
  return camposUsadosNoModelo(modelo)
    .filter((c) => !dados[c]?.trim())
    .map((c) => ROTULO.get(c) ?? c);
}

/** Dados de origem para o contrato, já lidos do banco (sob RLS) pela ação. */
export type FontesContrato = {
  empresa: { nome: string | null; cnpj: string | null } | null;
  negocio: {
    titulo: string;
    numero: number | null;
    valor: number | null;
    unidade_consumidora: string | null;
    qualif_distribuidora: string | null;
    consumo_medio_kwh: number | null;
  };
  contato: {
    nome: string | null;
    documento: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    email: string | null;
    telefone: string | null;
    telefone2: string | null;
  } | null;
  calculo: {
    kit_nome: string | null;
    kit_potencia_kwp: number | null;
    tipo_ligacao: string | null;
    consumo_medio_kwh: number | null;
    geracao_estimada_kwh_mes: number | null;
  } | null;
  itensKit: { descricao: string; quantidade: number | null; potencia_w: number | null }[];
  vendedorNome: string | null;
  agora: Date;
  formatarMoeda: (valor: number) => string;
};

const numeroBr = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Uma linha por item do kit: "10 × Módulo 550 W" (potência só quando a descrição não a traz). */
export function formatarItensKit(itens: FontesContrato["itensKit"]): string {
  return itens
    .filter((i) => i.descricao?.trim())
    .map((i) => {
      const qtd = i.quantidade && i.quantidade > 0 ? `${i.quantidade} × ` : "";
      const potencia = i.potencia_w && !/\bw\b/i.test(i.descricao) ? ` (${numeroBr(i.potencia_w)} W)` : "";
      return `${qtd}${i.descricao.trim()}${potencia}`;
    })
    .join("\n");
}

/** Monta os valores de cada campo a partir dos dados já existentes (sem campo novo no banco). */
export function montarDadosContrato(f: FontesContrato): DadosContrato {
  const c = f.contato;
  const consumo = f.calculo?.consumo_medio_kwh ?? f.negocio.consumo_medio_kwh;
  const ligacao = f.calculo?.tipo_ligacao;
  return {
    empresa_nome: f.empresa?.nome ?? "",
    empresa_cnpj: f.empresa?.cnpj ?? "",
    cliente_nome: c?.nome ?? "",
    cliente_documento: c?.documento ?? "",
    cliente_endereco: c?.endereco ?? "",
    cliente_cidade: c?.cidade ?? "",
    cliente_uf: c?.uf ?? "",
    cliente_email: c?.email ?? "",
    cliente_telefone: c?.telefone ?? "",
    cliente_telefone2: c?.telefone2 ?? "",
    negocio_titulo: f.negocio.titulo,
    negocio_numero: f.negocio.numero != null ? String(f.negocio.numero) : "",
    negocio_valor: f.negocio.valor != null ? f.formatarMoeda(f.negocio.valor) : "",
    negocio_uc: f.negocio.unidade_consumidora ?? "",
    distribuidora: f.negocio.qualif_distribuidora ?? "",
    vendedor_nome: f.vendedorNome ?? "",
    kit_nome: f.calculo?.kit_nome ?? "",
    // Mesmo formato de antes (toLocaleString padrão), para não mudar contratos gerados.
    kit_potencia_kwp: f.calculo?.kit_potencia_kwp != null ? `${f.calculo.kit_potencia_kwp.toLocaleString("pt-BR")} kWp` : "",
    kit_itens: formatarItensKit(f.itensKit),
    tipo_ligacao: ligacao && Object.hasOwn(ROTULO_TIPO_LIGACAO, ligacao) ? ROTULO_TIPO_LIGACAO[ligacao as keyof typeof ROTULO_TIPO_LIGACAO] : "",
    consumo_medio_kwh: consumo != null ? `${numeroBr(consumo)} kWh/mês` : "",
    geracao_estimada_kwh_mes: f.calculo?.geracao_estimada_kwh_mes != null ? `${numeroBr(f.calculo.geracao_estimada_kwh_mes)} kWh/mês` : "",
    data_hoje: f.agora.toLocaleDateString("pt-BR"),
    data_hoje_extenso: f.agora.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }),
  };
}
