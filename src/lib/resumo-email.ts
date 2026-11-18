/**
 * Resumo diário por e-mail (item 3 do roadmap; prévia aprovada em 18/11/2026): monta assunto, HTML e texto a partir
 * dos avisos do sininho. Puro: sem banco nem rede, para ser testado à parte.
 */
import { timingSafeEqual } from "node:crypto";

/** Confere `Authorization: Bearer <CRON_SECRET>` (o Cron da Vercel manda assim), em tempo constante. Sem segredo, recusa. */
export function chamadaDoAgendadorAutorizada(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/** Tipos de aviso que pedem ação e entram no resumo (o banco filtra pela mesma lista em `resumo_email_pendentes`). */
export const GRUPOS_RESUMO = [
  { titulo: "Leads e handoffs", tipos: ["lead_atribuido", "handoff_recebido", "handoff_devolvido"] },
  { titulo: "Descontos", tipos: ["desconto_solicitado", "desconto_decidido"] },
  { titulo: "Pagamentos", tipos: ["pagamento_aviso_confirmado", "pagamento_aviso_devolvido"] },
  { titulo: "Obras", tipos: ["justificativa_atraso_pedida", "justificativa_atraso_cobrada"] },
] as const;

export const TIPOS_RESUMO: readonly string[] = GRUPOS_RESUMO.flatMap((g) => g.tipos);

export const FUSO_RESUMO = "America/Sao_Paulo";

export type ItemResumo = { tipo: string; mensagem: string; link: string | null; criadaEm: string };

export type EmailResumo = { assunto: string; html: string; texto: string };

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Dia (AAAA-MM-DD) de uma data no fuso do resumo. */
export function diaNoFuso(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_RESUMO, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

/** "hoje, 07:58", "ontem, 16:42" ou "12/11, 09:30", no fuso do resumo. */
export function quandoRelativo(criadaEm: Date, agora: Date): string {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_RESUMO, hour: "2-digit", minute: "2-digit" }).format(criadaEm);
  const dia = diaNoFuso(criadaEm);
  if (dia === diaNoFuso(agora)) return `hoje, ${hora}`;
  if (dia === diaNoFuso(new Date(agora.getTime() - 24 * 60 * 60 * 1000))) return `ontem, ${hora}`;
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}, ${hora}`;
}

/** Só caminhos do próprio app ("/negocios/…") viram link; qualquer outro valor leva ao início. */
export function linkAbsoluto(link: string | null, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (link && link.startsWith("/") && !link.startsWith("//") && !link.includes("\\")) return `${base}${link}`;
  return `${base}/`;
}

function primeiroNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo || limpo.includes("@")) return "";
  return limpo.split(/\s+/)[0];
}

export function montarResumoEmail({
  nome,
  empresaNome,
  itens,
  siteUrl,
  agora,
}: {
  nome: string;
  empresaNome: string;
  itens: ItemResumo[];
  siteUrl: string;
  agora: Date;
}): EmailResumo {
  const total = itens.length;
  const assunto = total === 1 ? "Você tem 1 pendência no Raion hoje" : `Você tem ${total} pendências no Raion hoje`;
  const saudacao = primeiroNome(nome) ? `Bom dia, ${primeiroNome(nome)}` : "Bom dia";
  const intro =
    total === 1
      ? "Desde o último resumo, chegou 1 aviso que espera uma ação sua e ainda não foi visto no sininho."
      : `Desde o último resumo, chegaram ${total} avisos que esperam uma ação sua e ainda não foram vistos no sininho.`;
  const base = siteUrl.replace(/\/+$/, "");

  const grupos = GRUPOS_RESUMO.map((g) => ({
    titulo: g.titulo,
    itens: itens.filter((i) => (g.tipos as readonly string[]).includes(i.tipo)),
  })).filter((g) => g.itens.length > 0);

  const htmlGrupos = grupos
    .map(
      (g) => `
        <tr><td style="padding:0 0 6px;font-family:Manrope,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0F0F10">${escapar(g.titulo)} <span style="background:#D4AF37;border-radius:999px;padding:1px 8px;font-size:11px;letter-spacing:0">${g.itens.length}</span></td></tr>
        ${g.itens
          .map(
            (i) => `
        <tr><td style="padding:0 0 8px"><a href="${escapar(linkAbsoluto(i.link, siteUrl))}" style="display:block;text-decoration:none;color:#0F0F10;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.45">${escapar(i.mensagem)}<br><span style="color:#6B7280;font-size:12px">${escapar(quandoRelativo(new Date(i.criadaEm), agora))} · <span style="color:#8a6d12;font-weight:600">Abrir no Raion →</span></span></a></td></tr>`,
          )
          .join("")}
        <tr><td style="height:10px"></td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(assunto)}</title></head>
<body style="margin:0;background:#FAF8F3;font-family:Inter,Arial,sans-serif;color:#0F0F10">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">
  <tr><td style="background:#0F0F10;padding:18px 24px"><span style="color:#ffffff;font-family:Manrope,Arial,sans-serif;font-weight:800;letter-spacing:.14em;font-size:14px">RAION</span><span style="float:right;color:#A8A8A8;font-size:12px">${escapar(empresaNome)}</span></td></tr>
  <tr><td style="padding:24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:Manrope,Arial,sans-serif;font-size:20px;font-weight:700;padding:0 0 6px">${escapar(saudacao)}</td></tr>
      <tr><td style="color:#6B7280;font-size:14px;line-height:1.5;padding:0 0 20px">${escapar(intro)}</td></tr>
      ${htmlGrupos}
      <tr><td><a href="${escapar(`${base}/`)}" style="display:inline-block;background:#D4AF37;color:#0F0F10;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px">Abrir o Raion</a></td></tr>
    </table>
  </td></tr>
  <tr><td style="border-top:1px solid #E5E7EB;padding:16px 24px;font-size:12px;color:#6B7280;line-height:1.6">Você recebe este resumo porque é da equipe da ${escapar(empresaNome)} no Raion.<br>Para não receber mais, desligue em <a href="${escapar(`${base}/perfil#resumo-email`)}" style="color:#6B7280">Meu perfil → Resumo diário por e-mail</a>.</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const texto = [
    `${saudacao}.`,
    "",
    intro,
    "",
    ...grupos.flatMap((g) => [
      `${g.titulo.toUpperCase()} (${g.itens.length})`,
      ...g.itens.map((i) => `- ${i.mensagem} (${quandoRelativo(new Date(i.criadaEm), agora)})\n  ${linkAbsoluto(i.link, siteUrl)}`),
      "",
    ]),
    `Abrir o Raion: ${base}/`,
    "",
    `Você recebe este resumo porque é da equipe da ${empresaNome} no Raion. Para não receber mais, desligue em Meu perfil: ${base}/perfil#resumo-email`,
  ].join("\n");

  return { assunto, html, texto };
}
