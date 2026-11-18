import { describe, expect, it } from "vitest";
import { linkWhatsAppContrato } from "@/lib/contrato-envio";
import { descreverAtividade } from "@/lib/linha-do-tempo";

const LINK = "https://raion-crm-roan.vercel.app/contrato/abc";
const nomes = { etapa: (i: string) => i, origem: (i: string) => i, membro: (i: string) => i, motivo: (i: string) => i };

describe("linkWhatsAppContrato", () => {
  it("com telefone válido abre a conversa do cliente, com o primeiro nome", () => {
    expect(linkWhatsAppContrato({ nome: "Marcos Pereira", telefone: "(45) 99999-0000" }, LINK)).toBe(
      `https://wa.me/5545999990000?text=${encodeURIComponent(`Olá, Marcos! Segue o seu contrato: ${LINK}`)}`,
    );
  });

  it.each([[""], [null], ["1234"]])("sem telefone válido (%s) abre sem destinatário", (telefone) => {
    expect(linkWhatsAppContrato({ nome: "Marcos Pereira", telefone }, LINK)).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Olá, Marcos! Segue o seu contrato: ${LINK}`)}`,
    );
  });

  it("sem nome, saudação genérica", () => {
    expect(linkWhatsAppContrato({ nome: null, telefone: null }, LINK)).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Olá! Segue o seu contrato: ${LINK}`)}`,
    );
  });
});

describe("linha do tempo", () => {
  it("edição do texto do contrato", () => {
    expect(descreverAtividade("contrato_texto_editado", { contrato_id: "x" }, nomes)).toBe("Editou o texto do contrato");
  });
});
