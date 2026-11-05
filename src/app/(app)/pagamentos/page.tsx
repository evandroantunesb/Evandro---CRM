import { redirect } from "next/navigation";

/** "Pagamentos a confirmar" virou uma aba da tela Financeiro (A2b); o endereço antigo continua funcionando. */
export default function PagamentosAConfirmar() {
  redirect("/financeiro?aba=confirmar");
}
