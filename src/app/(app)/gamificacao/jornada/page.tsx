import { Award, Check, Lock } from "lucide-react";
import { calcularNivel, ROTULO_MARCO_CONQUISTA, type MarcoConquista } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { GAMIFICACAO } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  BadgeGf,
  BarraProgressoGf,
  CabecalhoPaginaGf,
  CartaoGf,
  EstadoVazioGf,
  formatarNumeroGf,
  PaginaGf,
} from "../_compartilhado/ui";

function descreverCriterio(criterio: unknown) {
  const c = criterio as { metrica: "xp_acumulado" | "marco_contagem"; valor: number; marco?: string };
  if (c.metrica === "marco_contagem") {
    const rotulo = ROTULO_MARCO_CONQUISTA[c.marco as MarcoConquista] ?? c.marco;
    return `${c.valor.toLocaleString("pt-BR")}x ${rotulo}`;
  }
  return `Acumule ${c.valor.toLocaleString("pt-BR")} XP`;
}

const HEXAGONO = "[clip-path:polygon(25%_5%,75%_5%,100%_50%,75%_95%,25%_95%,0_50%)]";

export default async function MinhaJornada() {
  const { atual } = await exigirPapel(...GAMIFICACAO);
  const supabase = await criarClienteServidor();

  const [{ data: lancamentos }, { data: niveis }, { data: conquistas }, { data: desbloqueadas }] = await Promise.all([
    supabase.from("point_ledger").select("xp").eq("membro_id", atual.membroId).eq("estornado", false),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).eq("ativa", true).order("xp_minimo"),
    supabase
      .from("conquistas")
      .select("id, nome, descricao, icone, criterio, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("membro_id", atual.membroId),
  ]);

  // Abrir a Jornada é a "visualização" da conquista — mesma infraestrutura do sininho
  // (lida_em), sem tela ou mecanismo novo.
  await supabase
    .from("notificacoes")
    .update({ lida_em: new Date().toISOString() })
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", atual.membroId)
    .eq("tipo", "conquista_desbloqueada")
    .is("lida_em", null);

  const totalXp = (lancamentos ?? []).reduce((soma, l) => soma + l.xp, 0);
  const niveisNormalizados = (niveis ?? []).map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo }));
  const { nivel, nome: nomeNivel, xpBaseNivel, proximoNivel, progresso } = calcularNivel(niveisNormalizados, totalXp);
  const nivelAtual = { nivel, nome: nomeNivel, xpMinimo: xpBaseNivel };

  const idsDesbloqueadas = new Set((desbloqueadas ?? []).map((d) => d.conquista_id));
  // Conquista desativada some pra quem ainda não desbloqueou, mas continua
  // visível no histórico de quem já tem (decisão de Evandro, 2026-10-02).
  const conquistasVisiveis = (conquistas ?? []).filter((c) => c.ativa || idsDesbloqueadas.has(c.id));

  return (
    <PaginaGf largura="media">
      <CabecalhoPaginaGf
        titulo="Minha jornada"
        descricao="Seu nível, o caminho até o próximo e as conquistas que você já desbloqueou."
      />

      <CartaoGf destaque>
        <div className="flex flex-col gap-5 @min-[560px]:flex-row @min-[560px]:items-center">
          <div className="flex min-w-0 items-center gap-4 @min-[560px]:w-72 @min-[560px]:shrink-0">
            <span
              aria-hidden
              className={`flex h-16 w-16 shrink-0 items-center justify-center bg-[var(--gf-verde-10)] font-titulo text-3xl font-bold text-[var(--gf-verde)] ring-1 ring-[var(--gf-verde)]/60 ${HEXAGONO}`}
            >
              {nivelAtual.nivel}
            </span>
            <div className="min-w-0">
              <p className="gf-t-rotulo">Nível atual</p>
              <p className="gf-t-kpi mt-1 break-words">{nivelAtual.nome ?? `Nível ${nivelAtual.nivel}`}</p>
              <p className="gf-t-aux mt-0.5">
                <span className="gf-num font-semibold text-[var(--gf-texto)]">{formatarNumeroGf(totalXp)} XP</span>{" "}
                acumulados
              </p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--gf-texto-sec)]">
                {proximoNivel
                  ? `Rumo ao nível ${proximoNivel.nivel}${proximoNivel.nome ? ` · ${proximoNivel.nome}` : ""}`
                  : "Nível máximo alcançado"}
              </span>
              {proximoNivel && (
                <span className="gf-num font-semibold text-[var(--gf-texto)]">
                  Faltam {formatarNumeroGf(proximoNivel.xpMinimo - totalXp)} XP
                </span>
              )}
            </div>
            <BarraProgressoGf
              valor={progresso}
              tamanho="lg"
              rotulo={proximoNivel ? `Progresso até o nível ${proximoNivel.nivel}` : "Nível máximo alcançado"}
              className="mt-2.5"
            />
            <p className="gf-t-micro mt-1.5">{progresso}% do caminho neste nível</p>
          </div>
        </div>
      </CartaoGf>

      {niveisNormalizados.length > 0 && (
        <CartaoGf titulo="Progressão de níveis" descricao="Do primeiro ao último nível configurado.">
          <ol className="flex flex-col">
            {niveisNormalizados.map((n, i) => {
              const atualNivel = n.nivel === nivelAtual.nivel;
              const concluido = !atualNivel && n.xpMinimo <= totalXp;
              const proximo = proximoNivel?.nivel === n.nivel;
              const ultimo = i === niveisNormalizados.length - 1;
              return (
                <li key={n.nivel} className="flex gap-4" aria-current={atualNivel ? "step" : undefined}>
                  <div className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        atualNivel
                          ? "bg-[var(--gf-verde)] text-[var(--gf-on-verde)]"
                          : concluido
                            ? "bg-[var(--gf-verde-10)] text-[var(--gf-verde)] ring-1 ring-[var(--gf-verde-borda)]"
                            : "border border-dashed border-[var(--gf-neutro-barra)] text-[var(--gf-texto-sec)]"
                      }`}
                    >
                      {concluido ? <Check size={18} strokeWidth={3} /> : n.nivel}
                    </span>
                    {!ultimo && (
                      <span
                        aria-hidden
                        className={`my-1 w-0.5 flex-1 ${concluido ? "bg-[var(--gf-verde-borda)]" : "bg-[var(--gf-borda)]"}`}
                      />
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 ${ultimo ? "" : "pb-6"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <p className="gf-t-item text-base break-words">
                        Nível {n.nivel}
                        {n.nome && <span className="font-normal text-[var(--gf-texto-sec)]"> · {n.nome}</span>}
                      </p>
                      {atualNivel ? (
                        <BadgeGf tom="positivo">Você está aqui</BadgeGf>
                      ) : concluido ? (
                        <BadgeGf tom="neutro" Icone={Check}>
                          Concluído
                        </BadgeGf>
                      ) : proximo ? (
                        <BadgeGf tom="atencao">Próximo nível</BadgeGf>
                      ) : null}
                    </div>
                    <p className="gf-t-aux mt-0.5">
                      {formatarNumeroGf(n.xpMinimo)} XP necessários
                      {!atualNivel && !concluido && (
                        <>
                          {" · "}
                          <span className="font-semibold text-[var(--gf-texto)]">
                            faltam {formatarNumeroGf(n.xpMinimo - totalXp)} XP
                          </span>
                        </>
                      )}
                    </p>
                    {proximo && (
                      <BarraProgressoGf
                        valor={progresso}
                        rotulo={`Progresso até o nível ${n.nivel}`}
                        className="mt-2.5 max-w-md"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CartaoGf>
      )}

      <CartaoGf
        titulo="Conquistas"
        Icone={Award}
        tomIcone="dourado"
        descricao={`${idsDesbloqueadas.size} de ${conquistasVisiveis.length} desbloqueadas`}
      >
        {!conquistasVisiveis.length ? (
          <EstadoVazioGf Icone={Award} compacto titulo="Nenhuma conquista configurada ainda">
            Quando a administração criar conquistas, você acompanha o progresso de cada uma aqui.
          </EstadoVazioGf>
        ) : (
          <ul className="grid grid-cols-1 gap-3 @min-[480px]:grid-cols-2 @min-[820px]:grid-cols-3">
            {conquistasVisiveis.map((c) => {
              const desbloqueada = idsDesbloqueadas.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 ${
                    desbloqueada
                      ? "border-[var(--gf-dourado-borda)] bg-[var(--gf-dourado-10)]"
                      : "border-[var(--gf-borda)] bg-[var(--gf-surface-alta)]"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none ${
                      desbloqueada
                        ? "bg-[var(--gf-surface)]"
                        : "bg-[var(--gf-surface)] text-[var(--gf-texto-sec)]"
                    }`}
                  >
                    {desbloqueada ? c.icone : <Lock size={20} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="gf-t-item break-words">{c.nome}</p>
                    {c.descricao && <p className="gf-t-aux mt-0.5 line-clamp-2 break-words">{c.descricao}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {desbloqueada ? (
                        <BadgeGf tom="atencao" Icone={Check}>
                          Desbloqueada
                        </BadgeGf>
                      ) : (
                        <span className="gf-t-micro">{descreverCriterio(c.criterio)}</span>
                      )}
                      {!c.ativa && <BadgeGf>Desativada</BadgeGf>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CartaoGf>
    </PaginaGf>
  );
}
