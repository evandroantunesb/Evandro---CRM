/*
 * Passo 1 do assistente, "Sua empresa" (Onboarding, subprojeto 3): nome de exibição e WhatsApp vão para a identidade da
 * proposta; o CNPJ, para a empresa (`salvar_cnpj_empresa`). Regra pura: limpa máscaras e confere tamanhos.
 */

export type DadosEmpresa = { nome: string | null; cnpj: string | null; whatsapp: string | null };

const digitos = (v: string) => v.replace(/\D/g, "");

export function lerDadosEmpresa(entrada: { nome: string; cnpj: string; whatsapp: string }): { ok: true; dados: DadosEmpresa } | { ok: false; mensagem: string } {
  const nome = entrada.nome.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  const cnpj = digitos(entrada.cnpj) || null;
  const whatsapp = digitos(entrada.whatsapp) || null;
  if (cnpj && cnpj.length !== 14) return { ok: false, mensagem: "O CNPJ tem 14 dígitos." };
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) return { ok: false, mensagem: "WhatsApp: informe DDD e número (10 a 13 dígitos)." };
  return { ok: true, dados: { nome, cnpj, whatsapp } };
}
