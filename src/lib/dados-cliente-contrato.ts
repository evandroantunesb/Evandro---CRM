/**
 * Dados do cliente exigidos para gerar o contrato (decisão do Evandro, 29/10/2026). Mesma regra da função de banco
 * `pendencias_contrato_contato` (20261029190000_dados_cliente_contrato.sql), que trava o contrato mesmo fora da tela.
 * Pessoa física: nome completo, CPF, RG, nascimento, e-mail, telefone, CEP, rua, número, bairro e cidade.
 * Pessoa jurídica: sem RG e nascimento; inscrição estadual opcional.
 */

export type DadosClienteContrato = {
  tipo: string | null;
  nome: string | null;
  documento: string | null;
  rg: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
};

const vazio = (v: string | null | undefined) => !v?.trim();

/** Rótulos do que falta, na ordem do formulário. Lista vazia = pode gerar o contrato. */
export function pendenciasDadosContrato(c: DadosClienteContrato | null): string[] {
  if (!c) return ["dados do cliente"];
  const pj = c.tipo === "pj";
  const faltas: [boolean, string][] = [
    [vazio(c.nome), "nome completo"],
    [vazio(c.documento), pj ? "CNPJ" : "CPF"],
    [!pj && vazio(c.rg), "RG"],
    [!pj && vazio(c.data_nascimento), "data de nascimento"],
    [vazio(c.email), "e-mail"],
    [vazio(c.telefone), "telefone"],
    [vazio(c.cep), "CEP"],
    [vazio(c.logradouro), "rua"],
    [vazio(c.numero), "número"],
    [vazio(c.bairro), "bairro"],
    [vazio(c.cidade), "cidade"],
  ];
  return faltas.filter(([falta]) => falta).map(([, rotulo]) => rotulo);
}

/** Mesma frase do banco, para a tela e o servidor falarem igual. */
export function mensagemPendenciasContrato(pendencias: string[]): string {
  return `Para gerar o contrato, preencha os dados do cliente: ${pendencias.join(", ")}.`;
}

export const soDigitos = (v: string) => v.replace(/\D/g, "");

/** CPF com dígitos verificadores válidos (aceita com ou sem pontuação). */
export function cpfValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** CNPJ com dígitos verificadores válidos (aceita com ou sem pontuação). */
export function cnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/** 000.000.000-00 ou 00.000.000/0000-00; outro tamanho volta como veio. */
export function formatarDocumento(valor: string): string {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return valor.trim();
}
