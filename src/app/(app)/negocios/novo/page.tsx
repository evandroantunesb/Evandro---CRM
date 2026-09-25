import Link from "next/link";
import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { FormularioNegocio } from "./formulario";

export default async function NovoNegocio({ searchParams }: PageProps<"/negocios/novo">) {
  const { atual } = await exigirPapel();
  const { funil } = await searchParams;
  const config = await carregarConfiguracao(atual.empresaId);
  const funilEscolhido = config.funis.find((f) => f.id === funil && f.ativo) ?? config.funis.find((f) => f.ativo);
  if (!funilEscolhido) return <p className="text-sm text-zinc-600">Nenhum funil ativo.</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/negocios" className="text-sm text-zinc-600 hover:underline">
        ← Negócios
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">Adicionar negócio</h1>
      <Cartao>
        <FormularioNegocio
          funilId={funilEscolhido.id}
          origens={config.origens.filter((o) => o.ativa)}
          responsaveis={atual.papel === "vendedor" ? [] : config.membros.filter((m) => m.ativo)}
          meuMembroId={atual.membroId}
        />
      </Cartao>
    </div>
  );
}
