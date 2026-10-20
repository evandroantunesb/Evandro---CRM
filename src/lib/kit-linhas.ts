import { lerNumeroBr } from "@/lib/formatacao";
import { ROTULO_TIPO_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

/**
 * Validação das linhas do editor do kit personalizado (módulos, inversor, baterias, outros), sem React.
 * Fonte única do que o editor mostra, calcula (potência, preço sugerido) e envia: o que a tela exibe
 * como quantidade é a quantidade usada em tudo. Nada é arredondado, substituído ou descartado em
 * silêncio: valor inválido ou linha incompleta vira um problema que bloqueia o envio, e o que o
 * usuário digitou continua na tela.
 */

export type LinhaComponente = {
  tipo: TipoComponenteKit;
  descricao: string;
  potenciaW: string;
  quantidade: string;
  /** Preço de referência (teste) vindo do catálogo ao selecionar — nunca é salvo, só usado pra sugerir o valor do negócio. */
  precoEstimadoUnitario?: string;
};

/** Item no formato que o servidor valida e grava (`componenteKitSchema`). */
export type ComponenteLinha = {
  tipo: TipoComponenteKit;
  descricao: string;
  potenciaW: number | null;
  quantidade: number;
};

export type CampoLinha = "descricao" | "potenciaW" | "quantidade";

export type ProblemaLinha = {
  /** Posição da linha na lista do editor. */
  indice: number;
  campo: CampoLinha;
  mensagem: string;
};

export type AnaliseLinhas = {
  /** Só as linhas SEM problema, com o número exato que o usuário digitou. Mesma lista enviada ao servidor. */
  itens: { indice: number; componente: ComponenteLinha }[];
  componentes: ComponenteLinha[];
  problemas: ProblemaLinha[];
};

// Limites do servidor (`componenteKitSchema`/`componentesJsonSchema`) e da coluna `quantidade` (integer).
export const MAX_COMPONENTES_KIT = 50;
export const MAX_DESCRICAO_COMPONENTE = 120;
export const MAX_QUANTIDADE_COMPONENTE = 2_147_483_647;

/**
 * Analisa as linhas. Regras (todas bloqueiam o envio; nenhuma corrige o valor):
 * - descrição obrigatória: linha sem descrição precisa ser preenchida ou removida (antes sumia do envio);
 * - quantidade: inteiro maior que zero no padrão brasileiro ("10", "1.200"); vazio, zero, negativo,
 *   fração ("1,5"), texto ou formato ambíguo ("1.2") são recusados (antes viravam 1 ou eram arredondados);
 * - potência: opcional, mas se preenchida precisa ser um número maior que zero (antes valor inválido
 *   era descartado e a potência do kit saía menor sem aviso).
 */
export function analisarLinhas(linhas: LinhaComponente[]): AnaliseLinhas {
  const itens: AnaliseLinhas["itens"] = [];
  const problemas: ProblemaLinha[] = [];

  linhas.forEach((l, indice) => {
    const antes = problemas.length;
    const descricao = l.descricao.trim();

    if (indice >= MAX_COMPONENTES_KIT) {
      problemas.push({ indice, campo: "descricao", mensagem: `O kit aceita no máximo ${MAX_COMPONENTES_KIT} itens: remova esta linha.` });
    }
    if (!descricao) {
      problemas.push({ indice, campo: "descricao", mensagem: "Preencha o modelo / descrição ou remova esta linha." });
    } else if (descricao.length > MAX_DESCRICAO_COMPONENTE) {
      problemas.push({ indice, campo: "descricao", mensagem: `Descrição muito longa (máximo ${MAX_DESCRICAO_COMPONENTE} caracteres).` });
    }

    let potenciaW: number | null = null;
    if (l.potenciaW.trim() !== "") {
      const p = lerNumeroBr(l.potenciaW);
      if (p == null || !Number.isFinite(p) || p <= 0) {
        problemas.push({ indice, campo: "potenciaW", mensagem: "Potência inválida: use um número maior que zero (ex.: 550 ou 550,5) ou deixe em branco." });
      } else {
        potenciaW = p;
      }
    }

    const q = lerNumeroBr(l.quantidade);
    let quantidade = 0;
    if (q == null) {
      problemas.push({ indice, campo: "quantidade", mensagem: "Informe a quantidade." });
    } else if (!Number.isFinite(q)) {
      problemas.push({ indice, campo: "quantidade", mensagem: "Quantidade inválida: use um número inteiro (ex.: 10 ou 1.200)." });
    } else if (!Number.isInteger(q) || q <= 0) {
      problemas.push({ indice, campo: "quantidade", mensagem: "A quantidade deve ser um número inteiro maior que zero." });
    } else if (q > MAX_QUANTIDADE_COMPONENTE) {
      problemas.push({ indice, campo: "quantidade", mensagem: "Quantidade acima do limite permitido." });
    } else {
      quantidade = q;
    }

    if (problemas.length === antes) itens.push({ indice, componente: { tipo: l.tipo, descricao, potenciaW, quantidade } });
  });

  return { itens, componentes: itens.map((i) => i.componente), problemas };
}

/**
 * Linhas → itens enviados ao servidor. Só as linhas válidas entram; quem envia precisa checar
 * `analisarLinhas(...).problemas` antes (o envio é bloqueado enquanto houver problema).
 */
export function linhasParaComponentes(linhas: LinhaComponente[]): ComponenteLinha[] {
  return analisarLinhas(linhas).componentes;
}

/** Mensagem única para o bloqueio do envio (a de cada campo aparece na própria linha). */
export function resumoProblemasKit(problemas: ProblemaLinha[], linhas: LinhaComponente[]): string | null {
  if (problemas.length === 0) return null;
  const primeiro = problemas[0];
  const tipo = ROTULO_TIPO_COMPONENTE_KIT[linhas[primeiro.indice]?.tipo ?? "outro"] ?? "Kit";
  const resto = problemas.length - 1;
  return `Corrija o kit antes de continuar — ${tipo}: ${primeiro.mensagem}${resto > 0 ? ` (mais ${resto} ${resto === 1 ? "problema" : "problemas"} no kit)` : ""}`;
}
