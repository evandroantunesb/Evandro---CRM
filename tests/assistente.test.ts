import { describe, expect, it } from "vitest";
import { PASSOS, estadoDoPasso, passoAnterior, passosDoPlano, proximoPasso, resumoDoPasso } from "@/lib/assistente";

describe("resumo da revisão (quadro OnboardingRevisar)", () => {
  const d = {
    empresa: { nome: "Solar Campinas", cnpj: "12345678000190", whatsapp: "19998765432" },
    marca: { temLogo: true, temCores: true },
    imagens: { fotoEntrada: false, faixaPropria: false },
    telas: { ligadas: 7, eletropostoLiberado: true, eletropostoLigado: false, setoresDesligados: [] as ("engenharia" | "administrativo")[] },
    pagamento: { descontoVendedor: 5, parcelasCartao: 12, personalizado: true },
    equipe: { pessoas: 2 },
  };
  it("feito: o que ficou configurado", () => {
    expect(resumoDoPasso("empresa", "feito", d)).toBe("Solar Campinas · CNPJ 12.345.678/0001-90 · WhatsApp (19) 99876-5432");
    expect(resumoDoPasso("marca", "feito", d)).toBe("Logo enviada · cores da empresa");
    expect(resumoDoPasso("imagens", "feito", d)).toBe("Paisagem do Raion na entrada e na faixa");
    expect(resumoDoPasso("telas", "feito", d)).toBe("7 ligadas · Eletroposto desligado");
    expect(resumoDoPasso("pagamento", "feito", d)).toBe("Vendedor dá até 5% · cartão até 12x · Personalizado ligado");
    expect(resumoDoPasso("equipe", "feito", d)).toBe("2 pessoas cadastradas");
  });

  it("resumo do passo telas cita o setor desligado", () => {
    const sem = (setoresDesligados: ("engenharia" | "administrativo")[]) => ({ ...d, telas: { ...d.telas, setoresDesligados } });
    expect(resumoDoPasso("telas", "feito", sem(["engenharia"]))).toBe("7 ligadas · Eletroposto desligado · sem Engenharia");
    expect(resumoDoPasso("telas", "feito", sem(["engenharia", "administrativo"]))).toBe("7 ligadas · Eletroposto desligado · sem Engenharia · sem Administrativo");
    expect(resumoDoPasso("telas", "feito", sem([]))).toBe("7 ligadas · Eletroposto desligado");
  });

  it("pulado: fica o padrão", () => {
    expect(resumoDoPasso("imagens", "pulado", d)).toBe("Pulado: fica a paisagem do Raion.");
    expect(resumoDoPasso("equipe", "pulado", d)).toBe("Pulado: dá para cadastrar depois em Configurações › Usuários.");
    expect(resumoDoPasso("marca", "pulado", d)).toBe("Pulado: fica o padrão do Raion.");
  });

  it("feito sem nada preenchido também diz o padrão", () => {
    const vazio = { ...d, marca: { temLogo: false, temCores: false }, equipe: { pessoas: 0 }, pagamento: { descontoVendedor: 0, parcelasCartao: 0, personalizado: false } };
    expect(resumoDoPasso("marca", "feito", vazio)).toBe("Logo e cores do Raion");
    expect(resumoDoPasso("equipe", "feito", vazio)).toBe("Só você por enquanto");
    expect(resumoDoPasso("pagamento", "feito", vazio)).toBe("Vendedor sem desconto sem aprovação · sem parcelado no cartão");
  });
});

describe("passos do assistente", () => {
  it("Solo tem 5 passos; PRO tem 7 (setores entram no subprojeto 4)", () => {
    expect(passosDoPlano(true)).toEqual(["empresa", "marca", "imagens", "pagamento", "revisar"]);
    expect(passosDoPlano(false)).toEqual(["empresa", "marca", "imagens", "telas", "pagamento", "equipe", "revisar"]);
    expect(PASSOS.imagens.titulo).toBe("Tela de entrada e faixa");
    expect(PASSOS.revisar.titulo).toBe("Revisar e começar");
  });

  it("próximo e anterior, nulos nas pontas", () => {
    const pro = passosDoPlano(false);
    expect(proximoPasso(pro, "empresa")).toBe("marca");
    expect(proximoPasso(pro, "revisar")).toBeNull();
    expect(passoAnterior(pro, "empresa")).toBeNull();
    expect(passoAnterior(pro, "telas")).toBe("imagens");
  });

  it("estado: antes do atual = feito (ou pulado); o atual e os seguintes = pendente", () => {
    const solo = passosDoPlano(true);
    const o = { passo_atual: 4, pulados: [2] };
    expect(estadoDoPasso(o, solo, "empresa")).toBe("feito");
    expect(estadoDoPasso(o, solo, "marca")).toBe("pulado");
    expect(estadoDoPasso(o, solo, "imagens")).toBe("feito");
    expect(estadoDoPasso(o, solo, "pagamento")).toBe("pendente");
    expect(estadoDoPasso(o, solo, "revisar")).toBe("pendente");
  });
});
