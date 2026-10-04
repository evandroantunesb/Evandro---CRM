-- Variação histórica de posição no ranking, pedida por Evandro em 2026-10-04 pra
-- reproduzir "#4 no ranking mensal, ↑2 posições esta semana" da referência visual.
--
-- Reconstrução causal pura a partir do `point_ledger` imutável — sem snapshot.
-- `ranking_gamificacao` ganha um parâmetro opcional `p_ate` (limite superior de
-- tempo, exclusivo como `p_desde` já é). Quando `p_ate` é null, o comportamento é
-- idêntico ao de hoje (`not estornado`, estado ao vivo). Quando `p_ate` é informado,
-- a função reconstrói o estado do ledger NAQUELE INSTANTE, não o estado atual.
--
-- Correção central (apontada por Evandro, não estava na primeira proposta do
-- diagnóstico): `not estornado` sozinho não basta pra reconstrução histórica. Um
-- lançamento criado antes de `p_ate` e só estornado DEPOIS de `p_ate` estava válido
-- naquele instante — `not estornado` o esconderia incorretamente, porque reflete o
-- estado de AGORA, não o estado de `p_ate`.
--
-- Definição de fronteira (explícita, como pedido): um lançamento é considerado válido
-- no instante `p_ate` quando:
--   created_at < p_ate                                   (já existia antes do corte)
--   and (estornado_em is null or estornado_em > p_ate)    (se foi estornado, só depois do corte)
-- `estornado_em` já existe em `point_ledger` desde a migration fundacional
-- (`20260926100000_gamificacao_pontos.sql`) e é preenchido por todo caminho de
-- estorno que já existe (`estornar_lancamentos_evento`, `estornar_lancamentos_do_
-- evento`, `reavaliar_credito_condicionado_valor`) — nenhuma mudança nesses caminhos,
-- só uma leitura nova de uma coluna que já era mantida corretamente.
--
-- Cenário de teste obrigatório (Evandro): membro A ganha XP antes do início da
-- semana, fica acima de B; durante a semana o XP de A é estornado. A consulta
-- histórica em `p_ate = início da semana` ainda vê o XP de A (criado antes do corte,
-- `estornado_em` depois do corte → válido naquele instante); a consulta atual
-- (`p_ate = null`) vê o estorno (`not estornado` reflete agora) e A cai no ranking —
-- a variação de posição reflete a queda real.
--
-- Preserva, sem alteração, tudo que a função já fazia: isolamento por empresa,
-- perfil SDR/Closer/cs_farmer (`profile_at_event`), exclusão de admin/gestor,
-- `membro_ativo`. `p_desde` continua com a mesma semântica de sempre (limite
-- inferior, inclusive).

drop function if exists public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz);

create function public.ranking_gamificacao(
  p_empresa_id uuid,
  p_perfil public.perfil_gamificacao,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns table (membro_id uuid, total_xp bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.xp)::bigint as total_xp
  from public.point_ledger l
  join public.empresa_membros m on m.id = l.membro_id
  where l.empresa_id = p_empresa_id
    and l.profile_at_event = p_perfil
    and (p_desde is null or l.created_at >= p_desde)
    and (p_ate is null or l.created_at < p_ate)
    and (
      case when p_ate is null
        then not l.estornado
        else (l.estornado_em is null or l.estornado_em > p_ate)
      end
    )
    and public.membro_ativo(p_empresa_id)
    and m.papel not in ('admin', 'gestor')
  group by l.membro_id
  order by total_xp desc;
$$;

revoke all on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz, timestamptz) from public;
grant execute on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz, timestamptz) to authenticated;
