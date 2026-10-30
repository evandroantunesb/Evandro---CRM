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
  fixacao_definida: "Fixação do telhado",
  checklist_engenharia_aplicado: "Checklist aplicado",
  documento_engenharia_enviado: "Documento anexado",
  item_engenharia_alterado: "Item do checklist",
  protocolo_engenharia_registrado: "Protocolo registrado",
  protocolo_engenharia_atualizado: "Protocolo atualizado",
  vistoria_engenharia_solicitada: "Vistoria solicitada",
  vistoria_engenharia_atualizada: "Vistoria atualizada",
  engenharia_concluida_excecao: "Engenharia concluída sem conexão",
};

// Situações e registros do protocolo (mesmos de `engenharia-protocolos-regras`, sem importar regra de tela).
const ROTULO_PROTOCOLO: Record<string, string> = {
  protocolado: "Protocolado",
  em_analise: "Em análise",
  com_exigencia: "Com exigência",
  aprovado: "Aprovado",
  orcamento_emitido: "Orçamento emitido",
  indeferido: "Indeferido",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
};
// Registros da vistoria (mesmos de `engenharia-vistoria-regras`, sem importar regra de tela).
const ROTULO_REGISTRO_VISTORIA: Record<string, string> = {
  agendada: "Agendada",
  aprovada: "Aprovada",
  nao_conformidade: "Não conformidade apontada",
  cancelada: "Pedido cancelado",
  medidor_adequado: "Medidor adequado",
  conexao_confirmada: "Conexão confirmada",
};
const ROTULO_CANAL_PROTOCOLO: Record<string, string> = { pew: "PEW", caw: "CAW", atendimento: "atendimento comercial", outro: "outro canal" };

// Rótulos dos status do checklist da Engenharia (mesmos de `ROTULO_STATUS_ITEM`, sem importar regra de tela).
const ROTULO_ITEM_ENGENHARIA: Record<string, string> = {
  pendente: "Pendente",
  em_conferencia: "Em conferência",
  valido: "Válido",
  invalido: "Inválido",
  dispensado: "Não se aplica",
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
    case "fixacao_definida": {
      const nome = (chave: "de" | "para") => {
        const v = ler(dados, chave);
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      const de = nome("de");
      const para = nome("para");
      if (de && para) return `${de} → ${para}`;
      if (para) return `Definida como ${para}`;
      if (de) return `${de} removida`;
      return "Fixação alterada";
    }
    // Título do item vem do modelo da empresa; nome do arquivo e motivo (livres, podem ter dado pessoal) não aparecem.
    case "checklist_engenharia_aplicado": {
      const n = ler(dados, "itens");
      return typeof n === "number" && n > 0 ? `${n} ${n === 1 ? "item" : "itens"}` : "";
    }
    case "documento_engenharia_enviado": {
      const item = ler(dados, "item");
      const versao = ler(dados, "versao");
      const nome = typeof item === "string" && item.trim() ? item.trim() : "Item do checklist";
      return typeof versao === "number" ? `${nome}: versão ${versao}` : nome;
    }
    case "item_engenharia_alterado": {
      const item = ler(dados, "item");
      const nome = typeof item === "string" && item.trim() ? item.trim() : "Item do checklist";
      const de = rotulo(ROTULO_ITEM_ENGENHARIA, ler(dados, "de"));
      const para = rotulo(ROTULO_ITEM_ENGENHARIA, ler(dados, "para"));
      return de && para ? `${nome}: ${de} → ${para}` : nome;
    }
    // Número do protocolo e texto da distribuidora não aparecem (o histórico é visto por quem vê a obra).
    case "protocolo_engenharia_registrado": {
      const distribuidora = ler(dados, "distribuidora");
      const canal = rotulo(ROTULO_CANAL_PROTOCOLO, ler(dados, "canal"));
      const nome = typeof distribuidora === "string" && distribuidora.trim() ? distribuidora.trim() : "Distribuidora";
      return canal ? `${nome}, via ${canal}` : nome;
    }
    case "protocolo_engenharia_atualizado": {
      const de = rotulo(ROTULO_PROTOCOLO, ler(dados, "de"));
      const para = rotulo(ROTULO_PROTOCOLO, ler(dados, "para"));
      const reenvio = ler(dados, "tipo") === "reenvio";
      if (reenvio) return "Reenviado com correções";
      return de && para ? `${de} → ${para}` : "Situação do protocolo alterada";
    }
    // Textos da vistoria (apontamentos, motivos) e o motivo da exceção não aparecem.
    case "vistoria_engenharia_solicitada":
      return "";
    case "vistoria_engenharia_atualizada":
      return rotulo(ROTULO_REGISTRO_VISTORIA, ler(dados, "tipo")) ?? "Situação da vistoria alterada";
    case "engenharia_concluida_excecao":
      return "Concluída pelo administrador sem a conexão confirmada";
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
