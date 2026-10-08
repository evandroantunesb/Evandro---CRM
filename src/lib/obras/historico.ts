import { AGUARDANDO_OBRA, ROTULO_MARCO_OBRA, ROTULO_SETOR, ROTULO_STATUS_MARCO_OBRA, STATUS_POR_SETOR, rotuloAguardando, rotuloStatus, type SetorObra } from "./rotulos";

/**
 * Histórico da obra para a tela de detalhe. Monta o texto SÓ com campos seguros e rótulos próprios:
 * nunca exibe motivo (livre), autorização, origem, ids nem o valor cru de qualquer campo livre.
 * Código desconhecido ou formato inesperado vira texto neutro, sem lançar.
 */

/** Linha de `obra_historico` (só o que o histórico usa). `dados` é jsonb: tratado como não confiável. */
export type LinhaHistoricoObra = {
  created_at: string;
  tipo: string;
  setor: string | null;
  dados: unknown;
  autor_membro_id: string | null;
};

export type ItemHistoricoVM = {
  quando: string;
  tipoRotulo: string;
  setorRotulo: string | null;
  /** Texto montado com rótulos; pode ser vazio (ex.: "Obra criada"). */
  descricao: string;
  autor: string;
};

const SEM_NOME = "Usuário não identificado";

const ROTULO_TIPO: Record<string, string> = {
  obra_criada: "Obra criada",
  pagamento_estornado: "Pagamento estornado",
  pagamento_reconfirmado: "Pagamento reconfirmado",
  venda_alterada: "Venda alterada",
  participante_atribuido: "Participante atribuído",
  participante_encerrado: "Participante encerrado",
  fluxo_alterado: "Setor alterado",
  marco_alterado: "Marco alterado",
};

const ROTULO_SETOR_HISTORICO: Record<string, string> = { ...ROTULO_SETOR, comercial: "Comercial" };

const ROTULO_FUNCAO: Record<string, string> = {
  vendedor: "vendedor",
  sdr: "SDR",
  responsavel: "responsável",
  apoio: "apoio",
  substituto: "substituto",
};

type Registro = Record<string, unknown>;
const ehRegistro = (v: unknown): v is Registro => typeof v === "object" && v !== null && !Array.isArray(v);
const ler = (r: Registro | null, chave: string): unknown => (r && Object.hasOwn(r, chave) ? r[chave] : undefined);
const rotulo = (tabela: Record<string, string>, codigo: unknown): string | null =>
  typeof codigo === "string" && Object.hasOwn(tabela, codigo) ? tabela[codigo] : null;
const ehSetorFluxo = (setor: string | null): setor is SetorObra => setor === "compras" || setor === "engenharia" || setor === "operacional";

function descreverFluxo(setor: string | null, dados: Registro | null): string {
  const campo = ler(dados, "campo");
  const de = ler(dados, "de");
  const para = ler(dados, "para");

  if (campo === "status") {
    // Só código que existe na lista do setor vira rótulo; qualquer outro é ignorado.
    const conhecido = (c: unknown) => (ehSetorFluxo(setor) && typeof c === "string" && STATUS_POR_SETOR[setor].includes(c) ? rotuloStatus(setor, c) : null);
    const rotuloDe = conhecido(de);
    const rotuloPara = conhecido(para);
    if (rotuloDe && rotuloPara) return `Status: ${rotuloDe} → ${rotuloPara}`;
    if (rotuloPara) return `Status alterado para ${rotuloPara}`;
    return "Status alterado";
  }

  if (campo === "parado") {
    const parado = ler(ehRegistro(para) ? para : null, "parado");
    if (parado === true) return "Marcado como parado";
    if (parado === false) return "Retomado";
    return "Situação de parada alterada";
  }

  if (campo === "aguardando") {
    if (para === null) return "Sem aguardar";
    if (typeof para === "string" && (AGUARDANDO_OBRA as readonly string[]).includes(para)) return rotuloAguardando(para);
    return "Aguardando alterado";
  }

  return "Andamento do setor alterado";
}

function descreverMarco(dados: Registro | null): string {
  const marco = rotulo(ROTULO_MARCO_OBRA, ler(dados, "marco")) ?? "Marco";
  const statusDe = (chave: "de" | "para") => {
    const bloco = ler(dados, chave);
    return rotulo(ROTULO_STATUS_MARCO_OBRA, ler(ehRegistro(bloco) ? bloco : null, "status"));
  };
  const de = statusDe("de");
  const para = statusDe("para");
  if (de && para) return `${marco}: ${de} → ${para}`;
  if (para) return `${marco}: alterado para ${para}`;
  return `${marco}: alterado`;
}

function nomeDoParticipante(dados: Registro | null, nomes: ReadonlyMap<string, string>): string {
  const id = ler(dados, "membro_id");
  return (typeof id === "string" && nomes.get(id)) || SEM_NOME;
}

function descrever(linha: LinhaHistoricoObra, nomes: ReadonlyMap<string, string>): string {
  const dados = ehRegistro(linha.dados) ? linha.dados : null;
  switch (linha.tipo) {
    case "obra_criada":
      return "";
    case "pagamento_estornado":
      return "Pagamento da venda estornado";
    case "pagamento_reconfirmado":
      return "Pagamento da venda reconfirmado";
    case "venda_alterada": {
      const tecnico = ler(dados, "tecnico") === true;
      const comercial = ler(dados, "comercial") === true;
      if (tecnico && comercial) return "Dados técnicos e comerciais da venda mudaram";
      if (tecnico) return "Dados técnicos da venda mudaram";
      if (comercial) return "Dados comerciais da venda mudaram";
      return "Dados da venda mudaram";
    }
    case "participante_atribuido": {
      const funcao = rotulo(ROTULO_FUNCAO, ler(dados, "funcao")) ?? "participante";
      const principal = ler(dados, "principal") === true;
      return `${nomeDoParticipante(dados, nomes)} entrou como ${funcao}${principal ? " principal" : ""}`;
    }
    case "participante_encerrado":
      return `${nomeDoParticipante(dados, nomes)} saiu`;
    case "fluxo_alterado":
      return descreverFluxo(linha.setor, dados);
    case "marco_alterado":
      return descreverMarco(dados);
    default:
      return "Evento registrado";
  }
}

const instante = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Itens do histórico, do mais recente para o mais antigo. */
export function montarHistorico(linhas: readonly LinhaHistoricoObra[], nomes: ReadonlyMap<string, string>): ItemHistoricoVM[] {
  return [...linhas]
    .sort((a, b) => instante(b.created_at) - instante(a.created_at))
    .map((l): ItemHistoricoVM => ({
      quando: l.created_at,
      tipoRotulo: rotulo(ROTULO_TIPO, l.tipo) ?? "Evento",
      setorRotulo: rotulo(ROTULO_SETOR_HISTORICO, l.setor),
      descricao: descrever(l, nomes),
      autor: l.autor_membro_id == null ? "Sistema" : nomes.get(l.autor_membro_id) || SEM_NOME,
    }));
}
