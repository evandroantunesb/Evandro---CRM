import type { ReactNode } from "react";
import Link from "next/link";
import { AvancarEtapa } from "@/components/mover-etapa";
import { Cartao, CartaoRecolhivel, Selo } from "@/components/ui";
import { alternarEtiqueta } from "@/lib/acoes/negocios";
import { formatarMoeda } from "@/lib/crm";
import { FECHAR_NEGOCIO, pode } from "@/lib/permissoes";
import { calcularStatusQualificacao } from "@/lib/qualificacao";
import { CATALOGO_ELETROPOSTO, normalizarModelos } from "@/lib/eletroposto";
import { FeedbackHandoff } from "./feedback-handoff";
import { HandoffAceite } from "./handoff-aceite";
import { Qualificacao } from "./qualificacao";
import { QualificacaoEntregue } from "./qualificacao-entregue";
import type { Ficha } from "./dados-ficha";
import { EdicaoDados } from "./edicao-dados";

/** Aba Negócio: oportunidade, perfil do lead, handoff, contato e etiquetas; o arquivamento vem da página (instância única). */
export function AbaVisao({ ficha, arquivamento }: { ficha: Ficha; arquivamento: ReactNode }) {
  const {
    atual,
    negocio,
    config,
    contato,
    nomes,
    arquivado,
    ehEletroposto,
    eletroposto,
    propostaEletroposto,
    ultimoHandoff,
    podeResponderHandoff,
    notas,
    souAdmin,
    etiquetasMarcadas,
    etiquetasVisiveis,
  } = ficha;
  const whatsapp = contato.telefone?.replace(/\D/g, "");

  // Resumo dos dados do negócio (cartão recolhido): consumo, conta e telhado, quando informados.
  const consumoResumo = negocio.consumo_medio_kwh ?? negocio.consumo_estimado_kwh;
  const resumoDados =
    [
      consumoResumo != null && `Consumo ${consumoResumo.toLocaleString("pt-BR")} kWh/mês${negocio.consumo_medio_kwh == null ? " (estimado)" : ""}`,
      negocio.valor_conta_energia != null && `Conta ${formatarMoeda(negocio.valor_conta_energia)}`,
      negocio.tipo_telhado && `Telhado ${negocio.tipo_telhado}`,
    ]
      .filter(Boolean)
      .join(" · ") || "Toque para ver e editar";

  // Resumo da qualificação SDR (cartão recolhido): mesmo critério do selo dentro dela.
  const statusQualificacao = calcularStatusQualificacao(!!contato.telefone, negocio.qualif_objetivo, negocio.qualif_e_decisor);
  const simNao = (v: boolean | null) => (v === true ? "sim" : v === false ? "não" : null);
  const resumoQualificacao = [
    `${statusQualificacao.rotulo} · ${statusQualificacao.atendidos} de ${statusQualificacao.total} critérios`,
    simNao(negocio.qualif_e_decisor) && `Decisor: ${simNao(negocio.qualif_e_decisor)}`,
    simNao(negocio.qualif_imovel_proprio) && `Imóvel próprio: ${simNao(negocio.qualif_imovel_proprio)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* O SDR trabalha a qualificação: ela abre antes dos dados do negócio; nos demais papéis a ordem é a de sempre. */}
        {(() => {
          const conteudoDados = (
            <div className="flex flex-col gap-4">
              {negocio.status === "aberto" && !arquivado && (
                <AvancarEtapa
                  negocioId={negocio.id}
                  etapaAtualId={negocio.etapa_id}
                  etapas={config.etapas.filter((e) => e.funilId === negocio.funil_id && e.ativa)}
                  motivos={config.motivos}
                  podeFechar={pode(atual.papel, FECHAR_NEGOCIO)}
                />
              )}
              <EdicaoDados ficha={ficha} secao="comercial" />
            </div>
          );
          // Oportunidade sempre à vista para quem vende; para o SDR (que trabalha a qualificação) fica recolhida.
          const blocoDados =
            atual.papel === "sdr" ? (
              <CartaoRecolhivel titulo="Oportunidade" resumo={resumoDados}>
                {conteudoDados}
              </CartaoRecolhivel>
            ) : (
              <Cartao titulo="Oportunidade">{conteudoDados}</Cartao>
            );
          const blocoQualificacao = (
        <CartaoRecolhivel titulo="Perfil do lead" resumo={resumoQualificacao} aberto>
          <Qualificacao
            negocio={{
              id: negocio.id,
              qualifTipoCliente: negocio.qualif_tipo_cliente,
              qualifPossuiContaEnergia: negocio.qualif_possui_conta_energia,
              qualifDistribuidora: negocio.qualif_distribuidora,
              qualifImovelProprio: negocio.qualif_imovel_proprio,
              qualifObjetivo: negocio.qualif_objetivo,
              qualifPrazoInstalacao: negocio.qualif_prazo_instalacao,
              qualifBuscaFinanciamento: negocio.qualif_busca_financiamento,
              qualifOrcamentoOutraEmpresa: negocio.qualif_orcamento_outra_empresa,
              qualifEDecisor: negocio.qualif_e_decisor,
              qualifOutroDecisor: negocio.qualif_outro_decisor,
              qualifParticipantesDecisao: negocio.qualif_participantes_decisao,
              qualifObservacoes: negocio.qualif_observacoes,
            }}
            telefoneContato={contato.telefone}
            vendedores={config.membros.filter((m) => m.ativo && m.papel === "vendedor")}
            eletroposto={ehEletroposto}
          />
          {/* Depois do aceite, o que o SDR entregou fica à vista (só leitura), com o que mudou desde então. */}
          {ultimoHandoff?.status === "aceito" && (
            <div className="mt-4">
              <QualificacaoEntregue
                snapshot={(ultimoHandoff.qualificacao_snapshot ?? {}) as Record<string, string | boolean | null>}
                atual={{
                  tipo_cliente: negocio.qualif_tipo_cliente,
                  possui_conta_energia: negocio.qualif_possui_conta_energia,
                  distribuidora: negocio.qualif_distribuidora,
                  imovel_proprio: negocio.qualif_imovel_proprio,
                  objetivo: negocio.qualif_objetivo,
                  prazo_instalacao: negocio.qualif_prazo_instalacao,
                  busca_financiamento: negocio.qualif_busca_financiamento,
                  orcamento_outra_empresa: negocio.qualif_orcamento_outra_empresa,
                  e_decisor: negocio.qualif_e_decisor,
                  outro_decisor: negocio.qualif_outro_decisor,
                  participantes_decisao: negocio.qualif_participantes_decisao,
                }}
                enviadoEm={ultimoHandoff.created_at}
                deNome={ultimoHandoff.de_membro_id ? nomes.membro(ultimoHandoff.de_membro_id) : "SDR"}
              />
            </div>
          )}
        </CartaoRecolhivel>
          );
          return atual.papel === "sdr" ? (
            <>
              {blocoQualificacao}
              {blocoDados}
            </>
          ) : (
            <>
              {blocoDados}
              {blocoQualificacao}
            </>
          );
        })()}
        {/* Eletroposto: o que o vendedor precisa saber do cliente, à vista; a edição fica na aba do eletroposto. */}
        {ehEletroposto && eletroposto && (
          <Cartao titulo="Resumo do eletroposto">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-texto-2">Local próprio</dt>
                <dd className="text-texto">{eletroposto.local_proprio ? "Sim" : "Não"}</dd>
              </div>
              <div>
                <dt className="text-texto-2">Usina FV</dt>
                <dd className="text-texto">{eletroposto.usina_fv ? "Sim" : "Não"}</dd>
              </div>
              <div>
                <dt className="text-texto-2">Modelos</dt>
                <dd className="text-texto">
                  {propostaEletroposto
                    ? normalizarModelos(eletroposto.modelos).map((m) => CATALOGO_ELETROPOSTO[m].nome).join(" · ")
                    : "Ainda não escolhidos"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/negocios/${negocio.id}?aba=proposta`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-dourado-texto underline-offset-2 hover:underline md:min-h-0"
            >
              Editar na aba Eletroposto
            </Link>
          </Cartao>
        )}
        {ultimoHandoff &&
          (souAdmin ||
            atual.papel === "gestor" ||
            atual.membroId === ultimoHandoff.para_membro_id ||
            atual.membroId === ultimoHandoff.de_membro_id) &&
          (() => {
            if (ultimoHandoff.status === "pendente") {
              return (
                <Cartao titulo="Oportunidade">
                  <HandoffAceite
                    negocioId={negocio.id}
                    handoffId={ultimoHandoff.id}
                    deNome={ultimoHandoff.de_membro_id ? nomes.membro(ultimoHandoff.de_membro_id) : "SDR"}
                    podeResponder={!!podeResponderHandoff}
                  />
                </Cartao>
              );
            }
            if (ultimoHandoff.status === "devolvido") {
              return (
                <Cartao titulo="Oportunidade">
                  <div className="flex flex-col gap-1">
                    <Selo tom="negativo">Devolvido por {nomes.membro(ultimoHandoff.para_membro_id)}</Selo>
                    <span className="text-sm text-zinc-600">{ultimoHandoff.motivo_devolucao}</span>
                  </div>
                </Cartao>
              );
            }

            const feedbackExistente = ultimoHandoff.handoffs_feedback as unknown as { feedback: string; autor_id: string } | null;
            const jaContatouLead = (notas ?? []).some(
              (n) => n.autor_id === ultimoHandoff.para_membro_id && n.created_at > ultimoHandoff.created_at,
            );
            return (
              <Cartao titulo="Feedback do lead (handoff)">
                <FeedbackHandoff
                  negocioId={negocio.id}
                  handoffId={ultimoHandoff.id}
                  souAutor={atual.membroId === ultimoHandoff.para_membro_id}
                  jaContatouLead={jaContatouLead}
                  feedback={feedbackExistente?.feedback ?? null}
                  autorNome={feedbackExistente ? nomes.membro(feedbackExistente.autor_id) : null}
                />
              </Cartao>
            );
          })()}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Cartao titulo="Contato">
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">{contato.tipo === "pj" ? "Razão social" : "Nome"}</dt>
              <dd>
                <Link href={`/contatos/${contato.id}`} className="font-medium text-amber-700 hover:underline">
                  {contato.nome}
                </Link>
              </dd>
            </div>
            {contato.telefone && (
              <div>
                <dt className="text-zinc-500">Telefone</dt>
                <dd>{contato.telefone}</dd>
              </div>
            )}
            {contato.email && (
              <div>
                <dt className="text-zinc-500">E-mail</dt>
                <dd>{contato.email}</dd>
              </div>
            )}
            {contato.endereco && (
              <div>
                <dt className="text-zinc-500">Endereço</dt>
                <dd>{contato.endereco}</dd>
              </div>
            )}
            {(contato.cidade || contato.uf) && (
              <div>
                <dt className="text-zinc-500">Cidade</dt>
                <dd>{[contato.cidade, contato.uf].filter(Boolean).join(" / ")}</dd>
              </div>
            )}
          </dl>
          {whatsapp && whatsapp.length >= 10 && (
            <a
              href={`https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Abrir no WhatsApp
            </a>
          )}
        </Cartao>
        {etiquetasVisiveis.length > 0 && (
          <Cartao titulo="Etiquetas">
            <div className="flex flex-wrap gap-2">
              {etiquetasVisiveis.map((e) => {
                const marcada = etiquetasMarcadas.has(e.id);
                return (
                  <form key={e.id} action={alternarEtiqueta}>
                    <input type="hidden" name="negocioId" value={negocio.id} />
                    <input type="hidden" name="etiquetaId" value={e.id} />
                    <input type="hidden" name="marcar" value={String(!marcada)} />
                    <button
                      aria-pressed={marcada}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${marcada ? "text-white" : "bg-white text-zinc-700"}`}
                      style={
                        marcada
                          ? { background: e.cor ?? "#71717a", borderColor: e.cor ?? "#71717a" }
                          : { borderColor: e.cor ?? "#d4d4d8" }
                      }
                    >
                      {marcada ? "✓ " : ""}
                      {e.nome}
                    </button>
                  </form>
                );
              })}
            </div>
          </Cartao>
        )}
        {arquivamento}
      </div>
    </div>
  );
}
