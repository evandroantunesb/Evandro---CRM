import { Banknote } from "lucide-react";
import { carregarConfiguracao } from "@/lib/crm";
import { formatarMoeda } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusComissao, TipoCalculoComissao } from "@/lib/tipos";
import { formatarReferenciaComissao, StatusComissaoGf } from "../../gamificacao/_compartilhado/comissao-ui";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, VoltarGf } from "../../gamificacao/_compartilhado/ui";
import { CalcularComissaoForm, FecharComissaoForm, HistoricoVersoesPlano, PlanoComissaoForm, type VersaoPlano } from "./formularios";

export default async function ConfigComissoes() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const mesAtual = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: planos }, { data: historico }, config] = await Promise.all([
    supabase
      .from("planos_comissao")
      .select("id, membro_id, vigencia_inicio, salario_base, meta_ote, tipo_calculo, faixas")
      .eq("empresa_id", atual.empresaId)
      .order("vigencia_inicio", { ascending: false }),
    supabase
      .from("comissoes_calculadas")
      .select("id, membro_id, referencia, resultado_apurado, valor_comissao, valor_total, status")
      .eq("empresa_id", atual.empresaId)
      .order("referencia", { ascending: false })
      .limit(50),
    carregarConfiguracao(atual.empresaId),
  ]);

  const membros = config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL));
  const nomeMembro = new Map(config.membros.map((m) => [m.id, m.nome]));

  const versoesPorMembro = new Map<string, VersaoPlano[]>();
  for (const p of planos ?? []) {
    const versao: VersaoPlano = {
      id: p.id,
      vigenciaInicio: p.vigencia_inicio,
      salarioBase: p.salario_base,
      metaOte: p.meta_ote,
      tipoCalculo: p.tipo_calculo as TipoCalculoComissao,
      faixas: p.faixas as unknown as VersaoPlano["faixas"],
    };
    const lista = versoesPorMembro.get(p.membro_id) ?? [];
    lista.push(versao);
    versoesPorMembro.set(p.membro_id, lista);
  }

  return (
    <PaginaGf largura="formulario">
      <VoltarGf href="/gamificacao/administracao">Administração</VoltarGf>
      <CabecalhoPaginaGf
        titulo="Comissões"
        descricao="Cada colaborador tem um plano com salário-base opcional e faixas de resultado (receita de negócios ganhos no mês). É um conceito separado de pontos e de metas — não afeta o extrato nem o ranking da gamificação. Alterar o plano cria uma nova versão com vigência a partir do mês escolhido; versões passadas são preservadas."
      />

      <CartaoGf titulo="Planos por colaborador">
        {!membros.length ? (
          <EstadoVazioGf Icone={Banknote} compacto titulo="Nenhum colaborador ativo">
            Cadastre colaboradores em Usuários para configurar planos de comissão.
          </EstadoVazioGf>
        ) : (
          <div className="flex flex-col gap-3">
            {membros.map((membro) => {
              const versoes = versoesPorMembro.get(membro.id) ?? [];
              const versaoAtual = versoes.find((v) => v.vigenciaInicio <= mesAtual) ?? null;
              return (
                <div key={membro.id} className="gf-item-edicao flex flex-col gap-4">
                  <PlanoComissaoForm membro={membro} versaoAtual={versaoAtual} />
                  <HistoricoVersoesPlano versoes={versoes} versaoVigenteId={versaoAtual?.id ?? null} mesAtual={mesAtual} />
                </div>
              );
            })}
          </div>
        )}
      </CartaoGf>

      <CartaoGf titulo="Calcular comissão do mês">
        <CalcularComissaoForm membros={membros} />
      </CartaoGf>

      <CartaoGf titulo={`Histórico de cálculo (${historico?.length ?? 0})`}>
        {!historico?.length ? (
          <EstadoVazioGf Icone={Banknote} compacto titulo="Nenhum cálculo feito ainda">
            Use “Calcular comissão do mês” acima para gerar o primeiro.
          </EstadoVazioGf>
        ) : (
          <ul className="flex flex-col">
            {historico.map((h) => (
              <li
                key={h.id}
                className="flex flex-col gap-3 border-t border-[var(--gf-borda)] py-4 first:border-t-0 first:pt-0 last:pb-0 @min-[680px]:flex-row @min-[680px]:items-center @min-[680px]:justify-between"
              >
                <div className="min-w-0">
                  <p className="gf-t-item break-words">{nomeMembro.get(h.membro_id) ?? "(removido)"}</p>
                  <p className="gf-t-aux mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{formatarReferenciaComissao(h.referencia)}</span>
                    <StatusComissaoGf status={h.status as StatusComissao} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div>
                      <dt className="gf-t-micro">Resultado</dt>
                      <dd className="gf-num font-medium">{formatarMoeda(h.resultado_apurado)}</dd>
                    </div>
                    <div>
                      <dt className="gf-t-micro">Comissão</dt>
                      <dd className="gf-num font-medium">{formatarMoeda(h.valor_comissao)}</dd>
                    </div>
                    <div>
                      <dt className="gf-t-micro">Total</dt>
                      <dd className="gf-num font-bold">{formatarMoeda(h.valor_total)}</dd>
                    </div>
                  </dl>
                  {h.status === "aberta" && <FecharComissaoForm comissaoId={h.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
