import { redirect } from "next/navigation";
import { exigirPapel } from "@/lib/sessao";

/** A administração da Gamificação foi para o hub de Configurações (seção "Gamificação e metas"). */
export default async function AdministracaoGamificacao() {
  await exigirPapel("admin");
  redirect("/configuracoes#gamificacao");
}
