import { redirect } from "next/navigation";
import { exigirPapel } from "@/lib/sessao";

export default async function ConfigGamificacao() {
  await exigirPapel("admin");
  redirect("/gamificacao/administracao");
}
