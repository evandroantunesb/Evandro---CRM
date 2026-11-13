/*
 * Assistente de primeiro acesso (Onboarding, subprojeto 3; 20261205100000_assistente_primeiro_acesso.sql; desenho em
 * docs/superpowers/specs/2026-11-11-assistente-primeiro-acesso-design.md). Regra pura dos passos: Solo tem 5 e PRO 7
 * (os setores da obra ficam no passo Telas, subprojeto 4a). `passo_atual` é 1-based e `pulados` guarda as posições.
 */
import { INFO_SETOR, SETORES_DESLIGAVEIS, type SetorDesligavel } from "@/lib/telas-empresa";

export type ChavePasso = "empresa" | "marca" | "imagens" | "telas" | "pagamento" | "equipe" | "revisar";

/** Títulos e sobretítulos dos quadros aprovados. */
export const PASSOS: Record<ChavePasso, { titulo: string; chamada: string }> = {
  empresa: { titulo: "Sua empresa", chamada: "Como a sua empresa aparece" },
  marca: { titulo: "Marca e cores", chamada: "Como o Raion vai aparecer para a sua equipe" },
  imagens: { titulo: "Tela de entrada e faixa", chamada: "As imagens da sua empresa" },
  telas: { titulo: "Telas que a equipe usa", chamada: "Ligue só o que a sua empresa precisa" },
  pagamento: { titulo: "Formas de pagamento", chamada: "Como você recebe dos seus clientes" },
  equipe: { titulo: "Equipe", chamada: "Quem trabalha com você" },
  revisar: { titulo: "Revisar e começar", chamada: "Tudo pronto para começar" },
};

const SOLO: ChavePasso[] = ["empresa", "marca", "imagens", "pagamento", "revisar"];
const PRO: ChavePasso[] = ["empresa", "marca", "imagens", "telas", "pagamento", "equipe", "revisar"];

export const passosDoPlano = (solo: boolean): ChavePasso[] => [...(solo ? SOLO : PRO)];

export function proximoPasso(passos: readonly ChavePasso[], atual: ChavePasso): ChavePasso | null {
  const i = passos.indexOf(atual);
  return i >= 0 && i < passos.length - 1 ? passos[i + 1] : null;
}

export function passoAnterior(passos: readonly ChavePasso[], atual: ChavePasso): ChavePasso | null {
  const i = passos.indexOf(atual);
  return i > 0 ? passos[i - 1] : null;
}

export type EstadoAssistente = { passo_atual: number; pulados: readonly number[] };

export function estadoDoPasso(o: EstadoAssistente, passos: readonly ChavePasso[], chave: ChavePasso): "feito" | "pulado" | "pendente" {
  const posicao = passos.indexOf(chave) + 1;
  if (posicao < 1 || posicao >= o.passo_atual) return "pendente";
  return o.pulados.includes(posicao) ? "pulado" : "feito";
}

/** Passo do estado gravado (posição fora do plano = o primeiro). */
export function passoDoEstado(o: EstadoAssistente, passos: readonly ChavePasso[]): ChavePasso {
  return passos[Math.min(Math.max(o.passo_atual, 1), passos.length) - 1];
}

/**
 * Passo pedido na URL (`?passo=`), limitado ao alcance: no assistente em andamento, só o passo onde parou ou um anterior
 * (pular passos pela URL os marcaria como feitos); revendo, qualquer um. Pedido inválido = o passo onde parou.
 */
export function passoPedido(o: EstadoAssistente, passos: readonly ChavePasso[], pedido: string | undefined, rever: boolean): ChavePasso {
  const ondeParou = passoDoEstado(o, passos);
  const i = passos.indexOf(pedido as ChavePasso);
  if (i < 0) return ondeParou;
  return rever || i <= passos.indexOf(ondeParou) ? passos[i] : ondeParou;
}

/** O que a revisão (último passo) resume de cada passo. */
export type DadosRevisao = {
  empresa: { nome: string | null; cnpj: string | null; whatsapp: string | null };
  marca: { temLogo: boolean; temCores: boolean };
  imagens: { fotoEntrada: boolean; faixaPropria: boolean };
  telas: { ligadas: number; eletropostoLiberado: boolean; eletropostoLigado: boolean; setoresDesligados: SetorDesligavel[] };
  pagamento: { descontoVendedor: number; parcelasCartao: number; personalizado: boolean };
  equipe: { pessoas: number };
};

const PULADO: Partial<Record<ChavePasso, string>> = {
  imagens: "Pulado: fica a paisagem do Raion.",
  equipe: "Pulado: dá para cadastrar depois em Configurações › Usuários.",
};

const cnpjFormatado = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const telefoneFormatado = (t: string) => t.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

/** Linha de cada passo na revisão (quadro `OnboardingRevisar`). */
export function resumoDoPasso(chave: ChavePasso, estado: "feito" | "pulado" | "pendente", d: DadosRevisao): string {
  if (estado === "pulado") return PULADO[chave] ?? "Pulado: fica o padrão do Raion.";
  switch (chave) {
    case "empresa":
      return (
        [d.empresa.nome, d.empresa.cnpj && `CNPJ ${cnpjFormatado(d.empresa.cnpj)}`, d.empresa.whatsapp && `WhatsApp ${telefoneFormatado(d.empresa.whatsapp)}`]
          .filter(Boolean)
          .join(" · ") || "Nome da empresa do cadastro"
      );
    case "marca":
      if (!d.marca.temLogo && !d.marca.temCores) return "Logo e cores do Raion";
      return [d.marca.temLogo ? "Logo enviada" : "Logo do Raion", d.marca.temCores ? "cores da empresa" : "cores do Raion"].join(" · ");
    case "imagens":
      if (!d.imagens.fotoEntrada && !d.imagens.faixaPropria) return "Paisagem do Raion na entrada e na faixa";
      return [d.imagens.fotoEntrada ? "Foto própria na entrada" : "Paisagem na entrada", d.imagens.faixaPropria ? "foto própria na faixa" : "faixa igual à entrada"].join(" · ");
    case "telas":
      return [
        `${d.telas.ligadas} ligadas`,
        d.telas.eletropostoLiberado && !d.telas.eletropostoLigado ? "Eletroposto desligado" : null,
        ...SETORES_DESLIGAVEIS.filter((s) => d.telas.setoresDesligados.includes(s)).map((s) => `sem ${INFO_SETOR[s].rotulo}`),
      ]
        .filter(Boolean)
        .join(" · ");
    case "pagamento":
      return [
        d.pagamento.descontoVendedor > 0 ? `Vendedor dá até ${d.pagamento.descontoVendedor.toLocaleString("pt-BR")}%` : "Vendedor sem desconto sem aprovação",
        d.pagamento.parcelasCartao > 0 ? `cartão até ${d.pagamento.parcelasCartao}x` : "sem parcelado no cartão",
        d.pagamento.personalizado ? "Personalizado ligado" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "equipe":
      return d.equipe.pessoas > 0 ? `${d.equipe.pessoas} ${d.equipe.pessoas === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}` : "Só você por enquanto";
    case "revisar":
      return "";
  }
}
