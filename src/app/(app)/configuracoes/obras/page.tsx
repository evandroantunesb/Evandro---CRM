import { Cartao, Voltar } from "@/components/ui";
import { ROTULO_SETOR, SETORES_OBRA } from "@/lib/obras/rotulos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioResponsavelPadrao } from "./formulario";

export default async function ConfiguracaoObras() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: membros, error: erroMembros }, { data: setores, error: erroSetores }, { data: padroes, error: erroPadroes }] = await Promise.all([
    supabase.from("empresa_membros").select("id, perfis(nome)")
      .eq("empresa_id", atual.empresaId).eq("papel", "operacao").eq("status", "ativo"),
    supabase.from("membro_setores_obra").select("membro_id, setor")
      .eq("empresa_id", atual.empresaId),
    supabase.from("empresa_responsaveis_obra_padrao").select("setor, membro_id")
      .eq("empresa_id", atual.empresaId),
  ]);

  const erro = erroMembros || erroSetores || erroPadroes;
  const pessoas = (membros ?? []).map((m) => ({
    id: m.id,
    nome: (m.perfis as unknown as { nome: string } | null)?.nome || "Colaborador sem nome",
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <Voltar href="/configuracoes">Configurações</Voltar>
    <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Responsáveis das obras</h1>
    <Cartao titulo="Distribuição automática">
      <p className="mb-4 text-sm text-zinc-600">
        Ao criar uma nova obra após a venda paga e assinada, o responsável padrão de cada setor recebe o card.
        Obras existentes não são alteradas. Você pode trocar participantes em cada obra.
      </p>
      {erro ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar a configuração. Atualize a página.</p> :
        <div className="flex flex-col gap-3">
          {SETORES_OBRA.map((setor) => {
            const candidatos = pessoas.filter((m) => setores?.some((s) => s.membro_id === m.id && s.setor === setor));
            return <FormularioResponsavelPadrao key={`${setor}:${padroes?.find((p) => p.setor === setor)?.membro_id ?? ""}`} setor={setor}
              atual={padroes?.find((p) => p.setor === setor)?.membro_id ?? null}
              candidatos={candidatos} />;
          })}
          {SETORES_OBRA.some((setor) => !setores?.some((s) => s.setor === setor)) &&
            <p className="text-sm text-zinc-600">Configure o setor dos colaboradores em Usuários para que apareçam aqui.</p>}
        </div>}
      <p className="mt-4 text-sm text-zinc-600">
        {ROTULO_SETOR.operacional} coordena a execução. Um coordenador do setor também acompanha todas as obras, mesmo sem ser o responsável principal.
      </p>
    </Cartao>
  </div>;
}
