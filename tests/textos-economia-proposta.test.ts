import { describe, expect, it } from "vitest";
import type { CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import { percentualFioBProjecao } from "@/lib/projecao-financeira";
import { ANOS_FIO_B_PROPOSTA, fraseParcelaEconomia, NOTA_FIO_B_PREMISSA, PARAGRAFOS_FIO_B, TITULO_FIO_B } from "@/lib/propostas/textos-economia";

/** Textos aprovados pelo Evandro em 26/11/2026 (prévia https://claude.ai/artifact/7He2QtGYErNp4eKubQz4tX, opções A). */

const sem = { aVista: null, parcelado: null, financiamento: null, personalizado: null, observacao: null } as unknown as CondicoesEmitidas;
const fin = (opcoes: { entrada: number; parcelas: number; valorParcela: number }[]): CondicoesEmitidas =>
  ({ ...sem, financiamento: { instituicao: "Sicredi", opcoes: opcoes.map((o) => ({ ...o, carenciaDias: 90 })) } }) as unknown as CondicoesEmitidas;

describe("Fio B na proposta", () => {
  it("anos da Lei 14.300 e a premissa de 100% a partir de 2029", () => {
    expect(ANOS_FIO_B_PROPOSTA).toEqual([
      { ano: 2023, percentual: 0.15, premissa: false },
      { ano: 2024, percentual: 0.3, premissa: false },
      { ano: 2025, percentual: 0.45, premissa: false },
      { ano: 2026, percentual: 0.6, premissa: false },
      { ano: 2027, percentual: 0.75, premissa: false },
      { ano: 2028, percentual: 0.9, premissa: false },
      { ano: 2029, percentual: 1, premissa: true },
    ]);
  });

  it("a tabela mostrada é a mesma que a projeção da economia usa (2026 em diante)", () => {
    for (const { ano, percentual } of ANOS_FIO_B_PROPOSTA.filter((a) => a.ano >= 2026)) expect(percentualFioBProjecao(ano)).toBe(percentual);
  });

  it("texto aprovado (opção A), sem nomear a distribuidora", () => {
    expect(TITULO_FIO_B).toBe("Como funciona a conta com energia solar");
    expect(PARAGRAFOS_FIO_B).toEqual([
      'Pela Lei 14.300/2022, quem instala energia solar a partir de 2023 paga aos poucos uma parte da tarifa de uso da rede (o "Fio B") sobre a energia que envia à distribuidora e usa depois. Essa parte sobe ano a ano: 60% em 2026, 75% em 2027 e 90% em 2028.',
      "Para os anos seguintes, a regra da ANEEL ainda não foi publicada. Por prudência, esta proposta considera 100% a partir de 2029, e a economia mostrada já desconta o Fio B de cada ano.",
      "A conta nunca zera: continuam a taxa mínima da distribuidora (custo de disponibilidade) e a iluminação pública.",
    ]);
    expect(NOTA_FIO_B_PREMISSA).toBe("* Premissa desta proposta; a regra para depois de 2028 ainda será definida pela ANEEL.");
    expect(PARAGRAFOS_FIO_B.join(" ")).not.toMatch(/Copel/i);
  });
});

describe("parcela do financiamento × economia (opção A: os dois números, sem conclusão)", () => {
  it("menor parcela entre as opções, com a entrada quando houver", () => {
    const c = fin([
      { entrada: 0, parcelas: 60, valorParcela: 598 },
      { entrada: 5000, parcelas: 48, valorParcela: 560 },
    ]);
    expect(fraseParcelaEconomia(c, 509.4)).toMatch(
      /^Para comparar: a menor parcela do financiamento é de R\$\s560,00 \(48x, com entrada de R\$\s5\.000,00\) e a economia estimada na conta de energia é de R\$\s509 no primeiro mês\.$/,
    );
  });

  it("sem entrada e parcela abaixo da economia: mesmos fatos, nenhuma promessa", () => {
    const c = fin([
      { entrada: 0, parcelas: 72, valorParcela: 489 },
      { entrada: 0, parcelas: 60, valorParcela: 598 },
    ]);
    const frase = fraseParcelaEconomia(c, 509)!;
    expect(frase).toMatch(/a menor parcela do financiamento é de R\$\s489,00 \(72x, sem entrada\)/);
    expect(frase).not.toMatch(/cobre|paga a parcela|se paga/);
  });

  it("uma opção só: 'a parcela', não 'a menor parcela'", () => {
    expect(fraseParcelaEconomia(fin([{ entrada: 0, parcelas: 60, valorParcela: 598 }]), 509)).toMatch(/^Para comparar: a parcela do financiamento é de R\$\s598,00 \(60x, sem entrada\)/);
  });

  it("empate no valor da parcela: a de menor entrada", () => {
    const c = fin([
      { entrada: 3000, parcelas: 48, valorParcela: 560 },
      { entrada: 0, parcelas: 72, valorParcela: 560 },
    ]);
    expect(fraseParcelaEconomia(c, 509)).toMatch(/\(72x, sem entrada\)/);
  });

  it("sem financiamento ou sem economia positiva: sem frase", () => {
    expect(fraseParcelaEconomia(sem, 509)).toBeNull();
    expect(fraseParcelaEconomia(fin([{ entrada: 0, parcelas: 60, valorParcela: 598 }]), 0)).toBeNull();
    expect(fraseParcelaEconomia(fin([{ entrada: 0, parcelas: 60, valorParcela: 598 }]), -12)).toBeNull();
  });
});
