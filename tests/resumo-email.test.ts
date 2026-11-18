/** Resumo diário por e-mail: montagem pura (assunto, grupos, escape, links) e autorização da rota do agendador. */
import { describe, expect, it } from "vitest";
import {
  TIPOS_RESUMO,
  chamadaDoAgendadorAutorizada,
  diaNoFuso,
  linkAbsoluto,
  montarResumoEmail,
  quandoRelativo,
} from "@/lib/resumo-email";

const AGORA = new Date("2026-11-19T10:30:00Z"); // 07:30 em Brasília
const SITE = "https://raion.exemplo";

describe("montarResumoEmail", () => {
  const itens = [
    { tipo: "lead_atribuido", mensagem: "Novo lead: João <8 kWp>", link: "/negocios/1", criadaEm: "2026-11-18T19:42:00Z" },
    { tipo: "desconto_solicitado", mensagem: 'Rafael pediu 6% em "Usina"', link: "/negocios/2?aba=proposta#desconto", criadaEm: "2026-11-19T10:58:00Z" },
    { tipo: "justificativa_atraso_pedida", mensagem: "Justificativa pedida", link: null, criadaEm: "2026-11-15T12:00:00Z" },
  ];
  const email = montarResumoEmail({ nome: "Carla Mendes", empresaNome: "Solar & Cia", itens, siteUrl: `${SITE}/`, agora: AGORA });

  it("assunto conta as pendências (singular e plural)", () => {
    expect(email.assunto).toBe("Você tem 3 pendências no Raion hoje");
    expect(montarResumoEmail({ nome: "", empresaNome: "X", itens: itens.slice(0, 1), siteUrl: SITE, agora: AGORA }).assunto).toBe(
      "Você tem 1 pendência no Raion hoje",
    );
  });

  it("agrupa na ordem da prévia e só os grupos com aviso", () => {
    const ordem = ["LEADS E HANDOFFS (1)", "DESCONTOS (1)", "OBRAS (1)"].map((g) => email.texto.indexOf(g));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(email.texto).not.toContain("PAGAMENTOS");
  });

  it("escapa o texto dos avisos e o nome da empresa no HTML", () => {
    expect(email.html).toContain("Novo lead: João &lt;8 kWp&gt;");
    expect(email.html).toContain("Rafael pediu 6% em &quot;Usina&quot;");
    expect(email.html).toContain("Solar &amp; Cia");
    expect(email.html).not.toContain("<8 kWp>");
  });

  it("saúda pelo primeiro nome; sem nome (ou só e-mail), só Bom dia", () => {
    expect(email.texto.startsWith("Bom dia, Carla.")).toBe(true);
    expect(montarResumoEmail({ nome: "carla@x.com", empresaNome: "X", itens, siteUrl: SITE, agora: AGORA }).texto.startsWith("Bom dia.")).toBe(true);
  });

  it("links absolutos para o próprio site, e o rodapé leva ao perfil", () => {
    expect(email.html).toContain(`href="${SITE}/negocios/1"`);
    expect(email.html).toContain(`href="${SITE}/negocios/2?aba=proposta#desconto"`);
    expect(email.html).toContain(`href="${SITE}/perfil#resumo-email"`);
  });
});

describe("linkAbsoluto", () => {
  it("só aceita caminho do próprio app; o resto vai para o início", () => {
    expect(linkAbsoluto("/obras/9", SITE)).toBe(`${SITE}/obras/9`);
    for (const ruim of [null, "", "https://outro.site/x", "//outro.site/x", "/\\outro.site", "javascript:alert(1)"]) {
      expect(linkAbsoluto(ruim, SITE)).toBe(`${SITE}/`);
    }
  });
});

describe("datas no fuso de Brasília", () => {
  it("dia e quando relativo", () => {
    expect(diaNoFuso(new Date("2026-11-19T02:00:00Z"))).toBe("2026-11-18");
    expect(quandoRelativo(new Date("2026-11-19T10:58:00Z"), AGORA)).toBe("hoje, 07:58");
    expect(quandoRelativo(new Date("2026-11-18T19:42:00Z"), AGORA)).toBe("ontem, 16:42");
    expect(quandoRelativo(new Date("2026-11-15T12:00:00Z"), AGORA)).toBe("15/11, 09:00");
  });
});

describe("chamadaDoAgendadorAutorizada", () => {
  it("só com o segredo exato; sem segredo configurado, recusa tudo", () => {
    expect(chamadaDoAgendadorAutorizada("Bearer s3gredo", "s3gredo")).toBe(true);
    expect(chamadaDoAgendadorAutorizada("Bearer outro", "s3gredo")).toBe(false);
    expect(chamadaDoAgendadorAutorizada("s3gredo", "s3gredo")).toBe(false);
    expect(chamadaDoAgendadorAutorizada(null, "s3gredo")).toBe(false);
    expect(chamadaDoAgendadorAutorizada("Bearer ", "")).toBe(false);
    expect(chamadaDoAgendadorAutorizada("Bearer undefined", undefined)).toBe(false);
  });
});

it("lista de tipos é a decidida pelo Evandro (18/11/2026)", () => {
  expect([...TIPOS_RESUMO].sort()).toEqual(
    [
      "desconto_decidido",
      "desconto_solicitado",
      "handoff_devolvido",
      "handoff_recebido",
      "justificativa_atraso_cobrada",
      "justificativa_atraso_pedida",
      "lead_atribuido",
      "pagamento_aviso_confirmado",
      "pagamento_aviso_devolvido",
    ].sort(),
  );
});
