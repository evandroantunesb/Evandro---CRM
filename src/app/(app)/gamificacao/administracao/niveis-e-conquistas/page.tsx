import { Medal, TrendingUp } from "lucide-react";
import { type MarcoConquista } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PerfilGamificacao } from "@/lib/tipos";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, SecaoGf, VoltarGf } from "../../_compartilhado/ui";
import { LinhaConquista, LinhaNivel, NovaConquista, NovoNivel } from "../_compartilhado/formularios";

export default async function NiveisEConquistas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: niveis }, { data: conquistas }] = await Promise.all([
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo, ativa").eq("empresa_id", atual.empresaId).order("nivel"),
    supabase
      .from("conquistas")
      .select("id, nome, descricao, icone, criterio, xp_bonus, perfil_aplicavel, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
  ]);

  return (
    <PaginaGf largura="formulario" className="gap-8">
      <div className="flex flex-col gap-3">
        <VoltarGf href="/gamificacao/administracao">Administração</VoltarGf>
        <CabecalhoPaginaGf titulo="Níveis e conquistas" />
      </div>

      <SecaoGf
        titulo="Níveis"
        Icone={TrendingUp}
        descricao="Níveis definem quanto XP é preciso acumular para subir (XP nunca é gasto na loja). Sem níveis cadastrados, todo mundo fica no nível 1. O XP mínimo precisa crescer junto com o número do nível. Desativar um nível só tira ele do cálculo de todo mundo — a configuração continua salva e pode ser reativada."
      >
        <CartaoGf titulo="Novo nível">
          <NovoNivel />
        </CartaoGf>
        <CartaoGf titulo={`Níveis (${niveis?.length ?? 0})`}>
          {!niveis?.length ? (
            <EstadoVazioGf Icone={TrendingUp} compacto titulo="Nenhum nível cadastrado">
              Sem níveis, todo mundo fica no nível 1. Cadastre o primeiro acima.
            </EstadoVazioGf>
          ) : (
            <div className="flex flex-col gap-3">
              {niveis.map((n) => (
                <LinhaNivel key={n.nivel} nivel={{ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo, ativa: n.ativa }} />
              ))}
            </div>
          )}
        </CartaoGf>
      </SecaoGf>

      <SecaoGf
        titulo="Conquistas"
        Icone={Medal}
        tom="dourado"
        descricao="Conquistas desbloqueiam sozinhas quando o colaborador acumula o XP exigido, e podem dar um XP bônus (nunca moedas — uma conquista que premie em moedas precisa de configuração própria, fora desta tela)."
      >
        <CartaoGf titulo="Nova conquista">
          <NovaConquista />
        </CartaoGf>
        <CartaoGf titulo={`Conquistas (${conquistas?.length ?? 0})`}>
          {!conquistas?.length ? (
            <EstadoVazioGf Icone={Medal} compacto titulo="Nenhuma conquista cadastrada">
              Crie a primeira conquista acima.
            </EstadoVazioGf>
          ) : (
            <div className="flex flex-col gap-3">
              {conquistas.map((c) => {
                const criterio = c.criterio as { metrica: "xp_acumulado" | "marco_contagem"; valor: number; marco?: string };
                return (
                  <LinhaConquista
                    key={c.id}
                    conquista={{
                      id: c.id,
                      nome: c.nome,
                      descricao: c.descricao,
                      icone: c.icone,
                      metrica: criterio.metrica,
                      marco: (criterio.marco as MarcoConquista) ?? null,
                      valor: criterio.valor,
                      xpBonus: c.xp_bonus,
                      perfilAplicavel: c.perfil_aplicavel as PerfilGamificacao | null,
                      ativa: c.ativa,
                    }}
                  />
                );
              })}
            </div>
          )}
        </CartaoGf>
      </SecaoGf>
    </PaginaGf>
  );
}
