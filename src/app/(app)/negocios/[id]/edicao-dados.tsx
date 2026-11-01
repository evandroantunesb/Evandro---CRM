import { EDITAR_VALOR_NEGOCIO, ESCOLHER_RESPONSAVEL_NEGOCIO, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { EdicaoNegocio } from "./edicao";
import type { Ficha } from "./dados-ficha";

/** Dados do negócio em dois cartões: Oportunidade (aba Negócio) e Conta de luz e local (aba Conta e sistema). */
export function EdicaoDados({ ficha, secao }: { ficha: Ficha; secao: "comercial" | "tecnico" }) {
  const { atual, negocio, config, ehEletroposto } = ficha;
  return (
    <EdicaoNegocio
      secao={secao}
      // Os campos usam defaultValue: desarquivar com novo responsável (ou arquivar) muda os dados por fora do
      // editor, e sem remontar ele mostraria o responsável antigo e o gravaria no próximo "Salvar".
      key={`${secao}:${negocio.responsavel_id ?? ""}:${negocio.arquivado_em ?? ""}`}
      empresaId={negocio.empresa_id}
      negocio={{
        id: negocio.id,
        titulo: negocio.titulo,
        origemId: negocio.origem_id,
        responsavelId: negocio.responsavel_id,
        valor: negocio.valor,
        descricao: negocio.descricao,
        tipoTelhado: negocio.tipo_telhado,
        unidadeConsumidora: negocio.unidade_consumidora,
        padraoCliente: negocio.padrao_cliente,
        consumoMedioKwh: negocio.consumo_medio_kwh,
        consumoEstimadoKwh: negocio.consumo_estimado_kwh,
        tarifaEfetivaKwh: negocio.tarifa_efetiva_kwh,
        valorContaEnergia: negocio.valor_conta_energia,
        fechamentoPrevisto: negocio.fechamento_previsto,
      }}
      origens={config.origens.filter((o) => o.ativa || o.id === negocio.origem_id)}
      responsaveis={pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) ? config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL)) : []}
      podeEditarValor={pode(atual.papel, EDITAR_VALOR_NEGOCIO)}
      eletroposto={ehEletroposto}
    />
  );
}
