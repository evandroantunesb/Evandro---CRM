import Link from "next/link";
import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function Contatos({ searchParams }: PageProps<"/contatos">) {
  const { atual } = await exigirPapel();
  const { q } = await searchParams;
  const busca = (typeof q === "string" ? q : "").replace(/[%,()]/g, "").trim();

  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("contatos")
    .select("id, nome, tipo, telefone, email, cidade, uf, negocios(count)")
    .eq("empresa_id", atual.empresaId)
    .order("nome")
    .limit(200);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    consulta = consulta.or(
      [`nome.ilike.%${busca}%`, `email.ilike.%${busca}%`, ...(digitos.length >= 4 ? [`telefone_digitos.like.%${digitos}%`] : [])].join(","),
    );
  }
  const { data } = await consulta;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Contatos</h1>
      <form action="/contatos">
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
      </form>
      <Cartao>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Telefone</th>
                <th className="py-2 pr-4 font-medium">E-mail</th>
                <th className="py-2 pr-4 font-medium">Cidade</th>
                <th className="py-2 font-medium">Negócios</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-zinc-100">
                  <td className="py-2 pr-4">
                    <Link href={`/contatos/${c.id}`} className="font-medium text-amber-700 hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{c.telefone}</td>
                  <td className="py-2 pr-4">{c.email}</td>
                  <td className="py-2 pr-4">{[c.cidade, c.uf].filter(Boolean).join(" / ")}</td>
                  <td className="py-2">{(c.negocios as unknown as { count: number }[])[0]?.count ?? 0}</td>
                </tr>
              ))}
              {!data?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500">
                    Nenhum contato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
