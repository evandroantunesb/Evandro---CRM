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
  { chave: "negocio_titulo", rotulo: "Título do negócio" },
  { chave: "negocio_valor", rotulo: "Valor do negócio (R$)" },
  { chave: "kit_nome", rotulo: "Kit contratado" },
  { chave: "kit_potencia_kwp", rotulo: "Potência do kit (kWp)" },
  { chave: "data_hoje", rotulo: "Data de hoje" },
] as const;

export type DadosContrato = Record<(typeof PLACEHOLDERS_CONTRATO)[number]["chave"], string>;

/** Troca cada {{campo}} do modelo pelo valor correspondente; campos sem dado viram "—". */
export function preencherModeloContrato(modelo: string, dados: DadosContrato): string {
  return modelo.replace(/\{\{\s*(\w+)\s*\}\}/g, (correspondencia, chave: string) => {
    if (!(chave in dados)) return correspondencia;
    const valor = (dados as Record<string, string | undefined>)[chave];
    return valor && valor.trim() ? valor : "—";
  });
}
