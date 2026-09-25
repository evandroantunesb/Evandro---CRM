import Link from "next/link";
import { Cartao } from "@/components/ui";
import { obterSessao } from "@/lib/sessao";
import { FormularioPerfil } from "./formulario";

export default async function Perfil() {
  const sessao = await obterSessao();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Meu perfil</h1>
      <Cartao>
        <FormularioPerfil nome={sessao.nome === sessao.email ? "" : sessao.nome} email={sessao.email} />
      </Cartao>
      <Cartao titulo="Senha">
        <Link href="/definir-senha" className="text-sm font-medium text-amber-700 hover:underline">
          Trocar minha senha →
        </Link>
      </Cartao>
    </div>
  );
}
