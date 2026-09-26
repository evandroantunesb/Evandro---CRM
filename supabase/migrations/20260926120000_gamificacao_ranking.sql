-- Fase 2 (gamificação) — ranking.
--
-- O extrato de pontos (`point_ledger`) segue a mesma visibilidade de "quem vê
-- o responsável" do resto do CRM (pode_ver_responsavel): um vendedor comum só
-- vê os próprios lançamentos, não os dos colegas. Isso é correto pro extrato
-- (detalhe individual), mas o ranking é justamente o oposto — é uma tela
-- coletiva, todo mundo da empresa precisa ver a posição de todo mundo.
--
-- Por isso o ranking não é uma view direta sobre point_ledger (que herdaria a
-- RLS restritiva), e sim uma função security definer: qualquer membro ativo
-- da empresa pode chamá-la, e ela agrega o total de pontos por colaborador
-- sem expor os lançamentos individuais (motivo/descrição) de ninguém.
create or replace function public.ranking_gamificacao(p_empresa_id uuid, p_desde timestamptz default null)
returns table (membro_id uuid, total_pontos bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.pontos)::bigint as total_pontos
  from public.point_ledger l
  where l.empresa_id = p_empresa_id
    and not l.estornado
    and (p_desde is null or l.created_at >= p_desde)
    and public.membro_ativo(p_empresa_id)
  group by l.membro_id
  order by total_pontos desc;
$$;

revoke all on function public.ranking_gamificacao(uuid, timestamptz) from public;
grant execute on function public.ranking_gamificacao(uuid, timestamptz) to authenticated;
