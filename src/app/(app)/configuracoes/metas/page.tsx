import { Target } from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { MetricaMeta } from "@/lib/tipos";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, VoltarGf } from "../../gamificacao/_compartilhado/ui";
import { LinhaMeta, NovaMeta } from "./formularios";

export default async function ConfigMetas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: metas }, config] = await Promise.all([
    supabase
      .from("metas")
      .select("id, titulo, metrica, membro_id, periodo_inicio, periodo_fim, valor_alvo, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("periodo_inicio", { ascending: false }),
    carregarConfiguracao(atual.empresaId),
  ]);

  const membros = config.membros.filter((m) => m.ativo);
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));

  return (
    <PaginaGf largura="formulario">
      <VoltarGf href="/gamificacao/administracao">Administração</VoltarGf>
      <CabecalhoPaginaGf
        titulo="Metas"
        descricao="Cada meta é individual: escolha o colaborador, a métrica e o período. O progresso é calculado sozinho a partir dos negócios e tarefas já registrados no CRM."
      />
      <CartaoGf titulo="Nova meta">
        <NovaMeta membros={membros} />
      </CartaoGf>
      <CartaoGf titulo={`Metas (${metas?.length ?? 0})`}>
        {!metas?.length ? (
          <EstadoVazioGf Icone={Target} compacto titulo="Nenhuma meta cadastrada ainda">
            Crie a primeira meta acima para acompanhar o progresso de um colaborador.
          </EstadoVazioGf>
        ) : (
          <div className="flex flex-col gap-3">
            {metas.map((m) => (
              <LinhaMeta
                key={m.id}
                nomeColaborador={nomeMembro.get(m.membro_id) ?? "(removido)"}
                meta={{
                  id: m.id,
                  titulo: m.titulo,
                  metrica: m.metrica as MetricaMeta,
                  membroId: m.membro_id,
                  periodoInicio: m.periodo_inicio,
                  periodoFim: m.periodo_fim,
                  valorAlvo: m.valor_alvo,
                  ativa: m.ativa,
                }}
                membros={membros}
              />
            ))}
          </div>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
