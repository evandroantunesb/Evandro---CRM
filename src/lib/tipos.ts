/** Todos os papéis do banco (tipagem). Quem pode o quê está em `@/lib/permissoes`. */
export const PAPEIS = ["admin", "gestor", "vendedor", "sdr", "operacao"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Papéis oferecidos no cadastro de usuários. `operacao` entra quando houver setores de Obras (PR 3b-2). */
export const PAPEIS_CADASTRAVEIS = ["admin", "gestor", "vendedor", "sdr"] as const satisfies readonly Papel[];

export const TIPOS_VENDEDOR = ["interno", "representante"] as const;
export type TipoVendedor = (typeof TIPOS_VENDEDOR)[number];

/** Em qual ranking/pontuação a pessoa compete — separado de `papel` (permissão). Gestor/admin não têm perfil (fora do ranking comercial). */
export const PERFIS_GAMIFICACAO = ["sdr", "closer", "cs_farmer"] as const;
export type PerfilGamificacao = (typeof PERFIS_GAMIFICACAO)[number];

export const ROTULO_PERFIL_GAMIFICACAO: Record<PerfilGamificacao, string> = {
  sdr: "SDR",
  closer: "Closer",
  cs_farmer: "CS Farmer",
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Vendedor",
  sdr: "SDR",
  operacao: "Operação",
};

export const ROTULO_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  interno: "Interno",
  representante: "Representante",
};

/** Como o rodízio de leads reparte entre vendedores e SDR (Configurações > Origens, pedido do Evandro 2026-09-30). */
export const MODOS_DISTRIBUICAO_LEADS = ["somente_vendedores", "somente_sdr", "parcial", "aleatorio"] as const;
export type ModoDistribuicaoLeads = (typeof MODOS_DISTRIBUICAO_LEADS)[number];

export const ROTULO_MODO_DISTRIBUICAO_LEADS: Record<ModoDistribuicaoLeads, string> = {
  somente_vendedores: "Somente vendedores",
  somente_sdr: "Somente SDR",
  parcial: "Parcial (% pro SDR)",
  aleatorio: "Aleatório (sorteia entre vendedores e SDR)",
};

export const STATUS_MEMBRO = ["ativo", "inativo", "desligado"] as const;
export type StatusMembro = (typeof STATUS_MEMBRO)[number];

export const ROTULO_STATUS_MEMBRO: Record<StatusMembro, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  desligado: "Desligado",
};

/** Resultado padrão das Server Actions usadas com useActionState. */
export type ResultadoAcao = { ok: boolean; mensagem: string } | null;

export const TIPOS_TAREFA = ["ligacao", "whatsapp", "visita", "reuniao", "email", "outro"] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];

export const ROTULO_TIPO_TAREFA: Record<TipoTarefa, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  visita: "Visita",
  reuniao: "Reunião",
  email: "E-mail",
  outro: "Outro",
};

/**
 * Resultado estruturado ao concluir (Evandro, 2026-10-01): ligação/WhatsApp e reunião/visita
 * exigem um resultado pra concluir — e-mail/outro continuam concluindo sem exigir nada.
 * Sem pontuação automática; serve só pra registrar o que realmente aconteceu.
 */
export const RESULTADOS_TAREFA = [
  "contato_realizado",
  "sem_resposta",
  "numero_invalido",
  "retornar_depois",
  "sem_interesse",
  "realizada",
  "no_show",
  "cancelada",
] as const;
export type ResultadoTarefa = (typeof RESULTADOS_TAREFA)[number];

export const ROTULO_RESULTADO_TAREFA: Record<ResultadoTarefa, string> = {
  contato_realizado: "Contato realizado",
  sem_resposta: "Sem resposta",
  numero_invalido: "Número inválido",
  retornar_depois: "Retornar depois",
  sem_interesse: "Sem interesse",
  realizada: "Realizada",
  no_show: "Não compareceu",
  cancelada: "Cancelada",
};

/** Resultados válidos por tipo de tarefa — null = tipo não exige resultado pra concluir. */
export const RESULTADOS_POR_TIPO_TAREFA: Record<TipoTarefa, readonly ResultadoTarefa[] | null> = {
  ligacao: ["contato_realizado", "sem_resposta", "numero_invalido", "retornar_depois", "sem_interesse"],
  whatsapp: ["contato_realizado", "sem_resposta", "numero_invalido", "retornar_depois", "sem_interesse"],
  reuniao: ["realizada", "no_show", "cancelada"],
  visita: ["realizada", "no_show", "cancelada"],
  email: null,
  outro: null,
};

/** Campos que o admin pode exigir para um negócio entrar numa etapa (mesma lista do banco). */
export const CAMPOS_OBRIGATORIOS = [
  "valor",
  "origem",
  "descricao",
  "contato_telefone",
  "contato_email",
  "contato_documento",
  "contato_cidade",
] as const;
export type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

export const ROTULO_CAMPO_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  valor: "Valor",
  origem: "Origem",
  descricao: "Descrição",
  contato_telefone: "Telefone do contato",
  contato_email: "E-mail do contato",
  contato_documento: "CPF/CNPJ do contato",
  contato_cidade: "Cidade do contato",
};

export const TIPOS_LIGACAO = ["monofasico", "bifasico", "trifasico"] as const;
export type TipoLigacao = (typeof TIPOS_LIGACAO)[number];

export const ROTULO_TIPO_LIGACAO: Record<TipoLigacao, string> = {
  monofasico: "Monofásico",
  bifasico: "Bifásico",
  trifasico: "Trifásico",
};

export const TIPOS_COMPONENTE_KIT = ["modulo", "inversor", "bateria", "outro"] as const;
export type TipoComponenteKit = (typeof TIPOS_COMPONENTE_KIT)[number];

export const ROTULO_TIPO_COMPONENTE_KIT: Record<TipoComponenteKit, string> = {
  modulo: "Módulo",
  inversor: "Inversor",
  bateria: "Bateria",
  outro: "Outro",
};

export const CATEGORIAS_ANEXO = ["geral", "cnh", "fatura_gerador", "fatura_beneficiario"] as const;
export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number];

export const ROTULO_CATEGORIA_ANEXO: Record<CategoriaAnexo, string> = {
  geral: "Geral",
  cnh: "CNH / documento",
  fatura_gerador: "Fatura do gerador",
  fatura_beneficiario: "Fatura dos beneficiários",
};

export const TIPOS_PLANO = ["gratuito", "pago"] as const;
export type TipoPlano = (typeof TIPOS_PLANO)[number];

export const ROTULO_TIPO_PLANO: Record<TipoPlano, string> = {
  gratuito: "Gratuito",
  pago: "Pago",
};

export const MODELOS_COBRANCA = ["por_usuario", "fixo", "fixo_mais_usuario"] as const;
export type ModeloCobranca = (typeof MODELOS_COBRANCA)[number];

export const ROTULO_MODELO_COBRANCA: Record<ModeloCobranca, string> = {
  por_usuario: "Por usuário ativo",
  fixo: "Fixo mensal",
  fixo_mais_usuario: "Fixo + por usuário",
};

export const STATUS_CONTRATO = ["rascunho", "aguardando_assinatura", "assinado"] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];

export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  rascunho: "Rascunho",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
};

/** Calculado por `status_pagamento_contrato()` — não existe coluna de status, ver migration. */
export const STATUS_PAGAMENTO_CONTRATO = ["pendente", "confirmado", "estornado"] as const;
export type StatusPagamentoContrato = (typeof STATUS_PAGAMENTO_CONTRATO)[number];

export const ROTULO_STATUS_PAGAMENTO_CONTRATO: Record<StatusPagamentoContrato, string> = {
  pendente: "Aguardando confirmação do pagamento",
  confirmado: "Pagamento confirmado",
  estornado: "Confirmação de pagamento estornada",
};

export const MODOS_PRECO = ["sem_preco", "parcelado", "avista", "completo"] as const;
export type ModoPreco = (typeof MODOS_PRECO)[number];

export const ROTULO_MODO_PRECO: Record<ModoPreco, string> = {
  sem_preco: "Sem preço (só a economia)",
  parcelado: "Só parcelado",
  avista: "Só à vista",
  completo: "Completo (à vista e parcelado)",
};

export const OPERADORES_CONDICAO = ["=", "!=", ">=", ">", "<=", "<"] as const;
export type OperadorCondicao = (typeof OPERADORES_CONDICAO)[number];

export const ROTULO_OPERADOR_CONDICAO: Record<OperadorCondicao, string> = {
  "=": "é igual a",
  "!=": "é diferente de",
  ">=": "é maior ou igual a",
  ">": "é maior que",
  "<=": "é menor ou igual a",
  "<": "é menor que",
};

export const PERIODOS_LIMITE_REGRA = ["dia", "mes"] as const;
export type PeriodoLimiteRegra = (typeof PERIODOS_LIMITE_REGRA)[number];

export const ROTULO_PERIODO_LIMITE_REGRA: Record<PeriodoLimiteRegra, string> = {
  dia: "por dia",
  mes: "por mês",
};

export const METRICAS_META = ["receita", "negocios_ganhos", "reunioes", "conversao", "tarefas_concluidas"] as const;
export type MetricaMeta = (typeof METRICAS_META)[number];

export const ROTULO_METRICA_META: Record<MetricaMeta, string> = {
  receita: "Receita (negócios ganhos)",
  negocios_ganhos: "Negócios ganhos (quantidade)",
  reunioes: "Reuniões realizadas",
  conversao: "Taxa de conversão (%)",
  tarefas_concluidas: "Tarefas concluídas",
};

/** Unidade de exibição de cada métrica: moeda, quantidade inteira ou percentual. */
export const UNIDADE_METRICA_META: Record<MetricaMeta, "moeda" | "quantidade" | "percentual"> = {
  receita: "moeda",
  negocios_ganhos: "quantidade",
  reunioes: "quantidade",
  conversao: "percentual",
  tarefas_concluidas: "quantidade",
};

export const TIPOS_CALCULO_COMISSAO = ["percentual", "multiplicador"] as const;
export type TipoCalculoComissao = (typeof TIPOS_CALCULO_COMISSAO)[number];

export const ROTULO_TIPO_CALCULO_COMISSAO: Record<TipoCalculoComissao, string> = {
  percentual: "Percentual sobre o resultado",
  multiplicador: "Multiplicador sobre o resultado",
};

export const STATUS_COMISSAO = ["aberta", "fechada"] as const;
export type StatusComissao = (typeof STATUS_COMISSAO)[number];

export const ROTULO_STATUS_COMISSAO: Record<StatusComissao, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
};

export const TIPOS_CLIENTE_QUALIF = ["residencial", "comercial", "industrial", "rural", "outro"] as const;
export type TipoClienteQualif = (typeof TIPOS_CLIENTE_QUALIF)[number];

export const ROTULO_TIPO_CLIENTE_QUALIF: Record<TipoClienteQualif, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
  industrial: "Industrial",
  rural: "Rural",
  outro: "Outro",
};

export const PRAZOS_INSTALACAO_QUALIF = ["imediatamente", "ate_30_dias", "1_3_meses", "3_6_meses", "somente_pesquisando"] as const;
export type PrazoInstalacaoQualif = (typeof PRAZOS_INSTALACAO_QUALIF)[number];

export const ROTULO_PRAZO_INSTALACAO_QUALIF: Record<PrazoInstalacaoQualif, string> = {
  imediatamente: "Imediatamente",
  ate_30_dias: "Até 30 dias",
  "1_3_meses": "1 a 3 meses",
  "3_6_meses": "3 a 6 meses",
  somente_pesquisando: "Somente pesquisando",
};

export const STATUS_RESGATE = ["solicitado", "aprovado", "entregue", "cancelado"] as const;
export type StatusResgate = (typeof STATUS_RESGATE)[number];

export const ROTULO_STATUS_RESGATE: Record<StatusResgate, string> = {
  solicitado: "Solicitado",
  aprovado: "Aprovado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
