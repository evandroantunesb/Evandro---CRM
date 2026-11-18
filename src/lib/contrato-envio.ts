import { linkWhatsApp } from "@/lib/obras/checklist";

/** Mensagem do envio do contrato pelo WhatsApp, com o primeiro nome do cliente. */
function mensagemContrato(nome: string | null, link: string): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  return `${primeiro ? `Olá, ${primeiro}!` : "Olá!"} Segue o seu contrato: ${link}`;
}

/** Link do WhatsApp para enviar o contrato: direto ao número do cliente; sem número válido, sem destinatário. */
export function linkWhatsAppContrato(cliente: { nome: string | null; telefone: string | null }, link: string): string {
  const mensagem = mensagemContrato(cliente.nome, link);
  return linkWhatsApp(cliente.telefone, mensagem) ?? `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}
