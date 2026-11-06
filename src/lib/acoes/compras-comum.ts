import { revalidatePath } from "next/cache";

/** Telas que mostram pedidos, orçamentos e arquivos de compra da obra. */
export function revalidarCompras(obraId: string) {
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/compras`);
  revalidatePath("/obras");
  revalidatePath("/compras");
  revalidatePath("/financeiro");
}
