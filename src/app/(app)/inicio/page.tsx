import { redirect } from "next/navigation";
import { Cartao } from "@/components/ui";
import { obterSessao } from "@/lib/sessao";
import { ROTULO_PAPEL } from "@/lib/tipos";

export default async function Inicio() {
  const sessao = await obterSessao();
  if (!sessao.atual) redirect(sessao.superAdmin ? "/super-admin" : "/sem-acesso");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Olá, {sessao.nome.split(" ")[0]}</h1>
      <Cartao>
        <p className="text-sm text-zinc-700">
          Você está em <strong>{sessao.atual.empresaNome}</strong> como{" "}
          <strong>{ROTULO_PAPEL[sessao.atual.papel]}</strong>. O funil de vendas chega na próxima entrega.
        </p>
      </Cartao>
    </div>
  );
}
