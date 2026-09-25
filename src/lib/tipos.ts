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
