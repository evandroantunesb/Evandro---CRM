/** Consumo da fatura, separado da tarifa base (TE + TUSD) do cálculo GD II. */
import { consumoComoPersistido, valorComoPersistido } from "@/lib/consumo-persistido";

export type ConsumoResolvido =
  | { origem: "informado"; kwh: number; tarifaEfetiva: null }
  | { origem: "estimado"; kwh: number; tarifaEfetiva: number }
  | { origem: "ausente"; kwh: null; tarifaEfetiva: null };

/** Arredonda primeiro as entradas como o banco (conta: 2 casas, tarifa efetiva: 4); nunca usa a tarifa base. */
export function resolverConsumo(
  consumoInformado: number | null,
  valorConta: number | null,
  tarifaEfetiva: number | null,
): ConsumoResolvido {
  if (consumoInformado != null && consumoInformado > 0) {
    const kwh = consumoComoPersistido(consumoInformado);
    if (Number.isFinite(kwh) && kwh > 0) return { origem: "informado", kwh, tarifaEfetiva: null };
  }
  if (valorConta != null && tarifaEfetiva != null) {
    const conta = valorComoPersistido(valorConta, 2);
    const tarifa = valorComoPersistido(tarifaEfetiva, 4);
    if (conta > 0 && tarifa > 0) {
      const kwh = consumoComoPersistido(conta / tarifa);
      if (Number.isFinite(kwh) && kwh > 0) return { origem: "estimado", kwh, tarifaEfetiva: tarifa };
    }
  }
  return { origem: "ausente", kwh: null, tarifaEfetiva: null };
}
