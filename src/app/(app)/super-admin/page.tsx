import Link from "next/link";
import { Cartao } from "@/components/ui";
import { exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioEmpresa } from "./formularios";
import { SeloSituacao } from "./situacao";

export default async function SuperAdmin() {
  await exigirSuperAdmin();
  const supabase = await criarClienteServidor();
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nome, cnpj, situacao, created_at, empresa_membros(ativo)")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Super-admin</h1>
      <Cartao titulo="Nova empresa">
        <FormularioEmpresa />
      </Cartao>
      <Cartao titulo={`Empresas (${empresas?.length ?? 0})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Empresa</th>
                <th className="py-2 pr-4 font-medium">Usuários ativos</th>
                <th className="py-2 pr-4 font-medium">Situação</th>
                <th className="py-2 font-medium">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {(empresas ?? []).map((e) => (
                <tr key={e.id} className="border-t border-zinc-100">
                  <td className="py-2 pr-4">
                    <Link href={`/super-admin/empresas/${e.id}`} className="font-medium text-amber-700 hover:underline">
                      {e.nome}
                    </Link>
                    {e.cnpj && <span className="block text-xs text-zinc-500">{e.cnpj}</span>}
                  </td>
                  <td className="py-2 pr-4">{e.empresa_membros.filter((m) => m.ativo).length}</td>
                  <td className="py-2 pr-4">
                    <SeloSituacao situacao={e.situacao} />
                  </td>
                  <td className="py-2">{new Date(e.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
