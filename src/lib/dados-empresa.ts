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
  return { ok: true, dados: { nome, cnpj, whatsapp: whatsapp && telefoneLegivel(whatsapp) } };
}

/** O WhatsApp é impresso na proposta como está gravado: "(41) 99999-8888", com "+55 " quando veio o DDI. */
function telefoneLegivel(d: string): string {
  // 12 ou 13 dígitos: os 2 primeiros são o DDI (55); o resto é DDD + número (10 ou 11).
  const ddi = d.length >= 12 ? d.slice(0, 2) : "";
  const local = d.slice(ddi.length);
  const numero = local.slice(2);
  const meio = numero.length === 9 ? 5 : 4;
  return `${ddi ? `+${ddi} ` : ""}(${local.slice(0, 2)}) ${numero.slice(0, meio)}-${numero.slice(meio)}`;
}
