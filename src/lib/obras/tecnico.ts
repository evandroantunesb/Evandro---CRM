import { ROTULO_TIPO_COMPONENTE_KIT, ROTULO_TIPO_LIGACAO } from "@/lib/tipos";

/**
 * Dados técnicos da obra, extraídos do `snapshot` (jsonb) como um DTO EXPLÍCITO.
 * O snapshot é tratado como NÃO confiável: pode ter campos faltando, tipos errados ou extras.
 * Só as chaves listadas aqui são lidas, cada uma com validação de tipo; o resto é ignorado.
 * Nunca se lê `cliente` (dado pessoal), `negocio.titulo`, `negocio.numero` nem `contrato_status`,
 * e nenhum objeto do snapshot é copiado inteiro para o resultado.
 */

export type ItemKitVM = {
  /** Rótulo do tipo (Módulo, Inversor, Bateria, Outro); tipo desconhecido vira "Outro". */
  tipo: string;
  descricao: string;
  potenciaW: number | null;
  quantidade: number | null;
};

export type DadosTecnicosVM = {
  kit: ItemKitVM[];
  kitNome: string | null;
  potenciaKwp: number | null;
  tipoLigacao: string | null;
  consumoMedioKwh: number | null;
  geracaoEstimadaKwhMes: number | null;
  distribuidora: string | null;
  tipoTelhado: string | null;
  estruturaTelhado: string | null;
  padraoCliente: string | null;
};

export const MAX_ITENS_KIT = 100;
export const MAX_TEXTO_TECNICO = 200;

type Registro = Record<string, unknown>;

/** Objeto simples (não nulo, não array). */
const ehRegistro = (v: unknown): v is Registro => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lê uma chave PRÓPRIA (nunca herdada do protótipo). */
const ler = (r: Registro | null, chave: string): unknown => (r && Object.hasOwn(r, chave) ? r[chave] : undefined);

const subobjeto = (r: Registro | null, chave: string): Registro | null => {
  const v = ler(r, chave);
  return ehRegistro(v) ? v : null;
};

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const aparado = v.trim();
  return aparado ? aparado.slice(0, MAX_TEXTO_TECNICO) : null;
};

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const inteiroPositivo = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

const rotuloTipoLigacao = (v: unknown): string | null =>
  typeof v === "string" && Object.hasOwn(ROTULO_TIPO_LIGACAO, v) ? ROTULO_TIPO_LIGACAO[v as keyof typeof ROTULO_TIPO_LIGACAO] : null;

const rotuloTipoComponente = (v: unknown): string =>
  typeof v === "string" && Object.hasOwn(ROTULO_TIPO_COMPONENTE_KIT, v)
    ? ROTULO_TIPO_COMPONENTE_KIT[v as keyof typeof ROTULO_TIPO_COMPONENTE_KIT]
    : ROTULO_TIPO_COMPONENTE_KIT.outro;

function extrairKit(bruto: unknown): ItemKitVM[] {
  if (!Array.isArray(bruto)) return [];
  const itens: ItemKitVM[] = [];
  for (const item of bruto) {
    if (itens.length >= MAX_ITENS_KIT) break;
    if (!ehRegistro(item)) continue;
    const descricao = texto(ler(item, "descricao"));
    if (!descricao) continue;
    itens.push({
      tipo: rotuloTipoComponente(ler(item, "tipo")),
      descricao,
      potenciaW: numero(ler(item, "potencia_w")),
      quantidade: inteiroPositivo(ler(item, "quantidade")),
    });
  }
  return itens;
}

/** Extrai o DTO técnico de um snapshot desconhecido. Nunca lança. */
export function extrairDadosTecnicos(snapshot: unknown): DadosTecnicosVM {
  const raiz = ehRegistro(snapshot) ? snapshot : null;
  const negocio = subobjeto(raiz, "negocio");
  const calculo = subobjeto(raiz, "calculo");
  return {
    kit: extrairKit(ler(raiz, "kit")),
    kitNome: texto(ler(calculo, "kit_nome")),
    potenciaKwp: numero(ler(calculo, "potencia_kwp")),
    tipoLigacao: rotuloTipoLigacao(ler(calculo, "tipo_ligacao")),
    consumoMedioKwh: numero(ler(calculo, "consumo_medio_kwh")) ?? numero(ler(negocio, "consumo_medio_kwh")),
    geracaoEstimadaKwhMes: numero(ler(calculo, "geracao_estimada_kwh_mes")),
    distribuidora: texto(ler(negocio, "distribuidora")),
    tipoTelhado: texto(ler(negocio, "tipo_telhado")),
    estruturaTelhado: texto(ler(negocio, "estrutura_telhado")),
    padraoCliente: texto(ler(negocio, "padrao_cliente")),
  };
}
