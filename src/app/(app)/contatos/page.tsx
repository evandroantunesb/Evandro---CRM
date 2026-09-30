import { Briefcase, Building2, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Cartao, Selo } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function Contatos({ searchParams }: PageProps<"/contatos">) {
  const { atual } = await exigirPapel();
  // SDR não tem acesso à carteira geral de contatos (spec RAION_SDR_REGRAS_PERMISSOES) — só aos contatos dos seus próprios negócios, via /contatos/[id].
  if (atual.papel === "sdr") redirect("/inicio");
  const { q } = await searchParams;
  const busca = (typeof q === "string" ? q : "").replace(/[%,()]/g, "").trim();

  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("contatos")
    .select("id, nome, tipo, telefone, email, cidade, uf, created_at, negocios(count)")
    .eq("empresa_id", atual.empresaId)
    .order("nome")
    .limit(200);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    consulta = consulta.or(
      [`nome.ilike.%${busca}%`, `email.ilike.%${busca}%`, ...(digitos.length >= 4 ? [`telefone_digitos.like.%${digitos}%`] : [])].join(","),
    );
  }

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);
  const [{ data }, { count: totalGeral }, { count: novosNoMes }] = await Promise.all([
    consulta,
    supabase.from("contatos").select("id", { count: "exact", head: true }).eq("empresa_id", atual.empresaId),
    supabase
      .from("contatos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", atual.empresaId)
      .gte("created_at", inicioDoMes.toISOString()),
  ]);

  const contatos = (data ?? []).map((c) => ({
    ...c,
    negocios: (c.negocios as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  const comNegocio = contatos.filter((c) => c.negocios > 0).length;
  const filtrado = Boolean(busca);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Contatos</h1>
        <p className="text-sm text-zinc-500">Carteira de contatos cadastrados na empresa.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiContato Icone={Users} tom="neutro" valor={totalGeral ?? 0} legenda="Total de contatos" rodape="Em toda a empresa" />
        <KpiContato Icone={TrendingUp} tom="verde" valor={novosNoMes ?? 0} legenda="Novos no mês" rodape="Desde o dia 1" />
        <KpiContato Icone={Briefcase} tom="ambar" valor={comNegocio} legenda="Com negócio" rodape={filtrado ? "Na busca atual" : "Da lista abaixo"} />
        <KpiContato
          Icone={Building2}
          tom="neutro"
          valor={contatos.length - comNegocio}
          legenda="Sem negócio"
          rodape={filtrado ? "Na busca atual" : "Da lista abaixo"}
        />
      </div>

      <Cartao titulo="Lista de contatos">
        <form action="/contatos" className="mb-3">
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20 sm:max-w-sm"
          />
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-medium text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Nome</th>
                <th className="py-2 pr-4">Telefone</th>
                <th className="py-2 pr-4">E-mail</th>
                <th className="py-2 pr-4">Cidade</th>
                <th className="py-2">Negócios</th>
              </tr>
            </thead>
            <tbody>
              {contatos.map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 hover:bg-offwhite/60">
                  <td className="py-2 pr-4">
                    <Link href={`/contatos/${c.id}`} className="flex items-center gap-2 font-medium text-amber-700 hover:underline">
                      <Avatar nome={c.nome} tamanho={24} />
                      {c.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">{c.telefone || "—"}</td>
                  <td className="py-2 pr-4 text-zinc-700">{c.email || "—"}</td>
                  <td className="py-2 pr-4 text-zinc-700">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="py-2">
                    {c.negocios > 0 ? <Selo tom="atencao">{c.negocios}</Selo> : <Selo>0</Selo>}
                  </td>
                </tr>
              ))}
              {!contatos.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500">
                    {busca ? "Nenhum contato encontrado com essa busca." : "Nenhum contato cadastrado ainda."}
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

const TOM_KPI = {
  neutro: "bg-zinc-100 text-zinc-600",
  ambar: "bg-amber-50 text-amber-700",
  verde: "bg-green-50 text-green-700",
};

function KpiContato({
  Icone,
  tom,
  valor,
  legenda,
  rodape,
}: {
  Icone: LucideIcon;
  tom: keyof typeof TOM_KPI;
  valor: number;
  legenda: string;
  rodape: string;
}) {
  return (
    <div className="flex min-h-[112px] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TOM_KPI[tom]}`}>
        <Icone size={17} />
      </span>
      <div>
        <p className="text-xs font-medium text-zinc-500">{legenda}</p>
        <p className="text-2xl font-semibold text-zinc-900 [font-variant-numeric:tabular-nums]">{valor}</p>
      </div>
      <p className="text-xs text-zinc-500">{rodape}</p>
    </div>
  );
}
