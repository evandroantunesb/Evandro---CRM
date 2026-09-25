import Link from "next/link";
import { notFound } from "next/navigation";
import { Cartao, Selo } from "@/components/ui";
import { exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL, ROTULO_TIPO_VENDEDOR, type Papel, type TipoVendedor } from "@/lib/tipos";
import { alterarSituacao } from "../../actions";
import { FormularioAdmin, FormularioEdicaoEmpresa } from "../../formularios";
import { SeloSituacao } from "../../situacao";

export default async function Empresa({ params }: PageProps<"/super-admin/empresas/[id]">) {
  await exigirSuperAdmin();
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome, cnpj, situacao, created_at, empresa_membros(id, papel, tipo_vendedor, ativo, perfis(nome, email))")
    .eq("id", id)
    .maybeSingle();
  if (!empresa) notFound();

  const outrasSituacoes = (["ativa", "suspensa", "cancelada"] as const).filter((s) => s !== empresa.situacao);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href="/super-admin" className="text-sm text-zinc-600 hover:underline">
        ← Empresas
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{empresa.nome}</h1>
        <SeloSituacao situacao={empresa.situacao} />
      </div>
      <Cartao titulo="Dados da empresa">
        <FormularioEdicaoEmpresa empresa={{ id: empresa.id, nome: empresa.nome, cnpj: empresa.cnpj }} />
      </Cartao>
      <Cartao titulo="Situação">
        <p className="mb-3 text-sm text-zinc-600">
          Empresa suspensa ou cancelada perde o acesso na hora. Os dados continuam guardados.
        </p>
        <div className="flex gap-2">
          {outrasSituacoes.map((s) => (
            <form key={s} action={alterarSituacao}>
              <input type="hidden" name="empresaId" value={empresa.id} />
              <input type="hidden" name="situacao" value={s} />
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
                {{ ativa: "Reativar", suspensa: "Suspender", cancelada: "Cancelar" }[s]}
              </button>
            </form>
          ))}
        </div>
      </Cartao>
      <Cartao titulo="Adicionar admin">
        <FormularioAdmin empresaId={empresa.id} />
      </Cartao>
      <Cartao titulo={`Usuários (${empresa.empresa_membros.length})`}>
        <ul>
          {empresa.empresa_membros.map((m) => {
            const perfil = m.perfis as unknown as { nome: string; email: string } | null;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{perfil?.nome || "(sem nome)"}</span>{" "}
                  <span className="text-zinc-500">{perfil?.email}</span>
                </span>
                <Selo>{ROTULO_PAPEL[m.papel as Papel]}</Selo>
                {m.tipo_vendedor && <Selo>{ROTULO_TIPO_VENDEDOR[m.tipo_vendedor as TipoVendedor]}</Selo>}
                {!m.ativo && <Selo tom="negativo">Inativo</Selo>}
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}
