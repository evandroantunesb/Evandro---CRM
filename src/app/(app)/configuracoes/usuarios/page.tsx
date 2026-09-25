import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel, TipoVendedor } from "@/lib/tipos";
import { FormularioConvite, LinhaMembro, type MembroLinha } from "./formularios";

export default async function Usuarios() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("empresa_membros")
    .select("id, papel, tipo_vendedor, recebe_leads, ativo, perfis(nome, email)")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");

  const membros: MembroLinha[] = (data ?? []).map((m) => {
    const perfil = m.perfis as unknown as { nome: string; email: string } | null;
    return {
      id: m.id,
      nome: perfil?.nome ?? "",
      email: perfil?.email ?? "",
      papel: m.papel as Papel,
      tipoVendedor: m.tipo_vendedor as TipoVendedor | null,
      recebeLeads: m.recebe_leads,
      ativo: m.ativo,
    };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Usuários</h1>
      <Cartao titulo="Convidar pessoa">
        <FormularioConvite />
      </Cartao>
      <Cartao titulo={`Equipe (${membros.length})`}>
        {membros.map((m) => (
          <LinhaMembro key={m.id} membro={m} />
        ))}
      </Cartao>
    </div>
  );
}
