import { Cartao, Voltar } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS_CADASTRAVEIS, ROTULO_PAPEL, type Papel, type PerfilGamificacao, type StatusMembro, type TipoVendedor } from "@/lib/tipos";
import { FormularioConvite, LinhaMembro, type MembroLinha } from "./formularios";

export default async function Usuarios() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();

  const [{ data }, { data: setores, error: erroSetores }] = await Promise.all([
    supabase
      .from("empresa_membros")
      .select("id, papel, tipo_vendedor, perfil_gamificacao, recebe_leads, status, perfis(nome, email)")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase.from("membro_setores_obra").select("membro_id, setor, capacidade").eq("empresa_id", atual.empresaId),
  ]);

  const membros: MembroLinha[] = (data ?? []).map((m) => {
    const perfil = m.perfis as unknown as { nome: string; email: string } | null;
    return {
      id: m.id,
      nome: perfil?.nome ?? "",
      email: perfil?.email ?? "",
      papel: m.papel as Papel,
      tipoVendedor: m.tipo_vendedor as TipoVendedor | null,
      perfilGamificacao: m.perfil_gamificacao as PerfilGamificacao | null,
      recebeLeads: m.recebe_leads,
      status: m.status as StatusMembro,
      setores: erroSetores ? null : (setores ?? []).filter((s) => s.membro_id === m.id),
    };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Usuários</h1>
      <Cartao titulo="Convidar pessoa">
        <FormularioConvite />
      </Cartao>
      <Cartao titulo={`Equipe (${membros.length})`}>
        <div className="flex flex-col gap-4">
          <p id="perfil-gamificacao" className="scroll-mt-4 text-sm text-texto-2">
            O perfil de gamificação (SDR/Closer/CS Farmer) de cada pessoa é definido abaixo, junto com o restante do cadastro.
          </p>
          {erroSetores && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os setores. Atualize a página para tentar novamente.</p>}
          {PAPEIS_CADASTRAVEIS.map((papel) => {
            const doGrupo = membros.filter((m) => m.papel === papel);
            if (doGrupo.length === 0) return null;
            return (
              <div key={papel} className="flex flex-col gap-3">
                <p className="sobretitulo">{ROTULO_PAPEL[papel]} · {doGrupo.length}</p>
                {doGrupo.map((m) => (
                  <LinhaMembro key={m.id} membro={m} />
                ))}
              </div>
            );
          })}
        </div>
      </Cartao>
    </div>
  );
}
