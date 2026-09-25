export const PAPEIS = ["admin", "gestor", "vendedor"] as const;
export type Papel = (typeof PAPEIS)[number];

export const TIPOS_VENDEDOR = ["interno", "representante"] as const;
export type TipoVendedor = (typeof TIPOS_VENDEDOR)[number];

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

export const ROTULO_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  interno: "Interno",
  representante: "Representante",
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
