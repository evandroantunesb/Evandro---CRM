-- Reconstrução causal das 5 métricas de Metas (Evandro, 2026-10-02, bloco seguinte ao
-- fechamento antifraude #103-#124). `calcularRealizado()` (`src/lib/metas.ts`) consultava
-- `negocios`/`tarefas` pelo estado AO VIVO (responsável atual, status atual) — mesmo
-- problema que o motor de pontos já resolveu com beneficiário/perfil congelados, nunca
-- propagado pra Metas. Esta migration move o cálculo pra uma função SQL que usa só fontes
-- causais (`eventos`, insert-only), preservando o conceito visual e os períodos existentes
-- (só muda a FONTE do "realizado", não a tela nem `calcularProgresso`).
--
-- Duas decisões de produto do Evandro (não técnicas) definem as regras abaixo:
--
-- 1. Receita — modelo A: a receita pertence ao PERÍODO DO `deal.won` ORIGINAL, nunca ao mês
--    da correção. Ex.: ganhou 50k em setembro, corrigiu pra 55k em outubro → receita causal
--    de setembro = 55k. Calculado como `deal.won.payload.valor` + soma dos deltas de
--    `deal.value_corrected` vinculados ao mesmo `deal.won` (via `evento_original_id`),
--    independente do mês em que cada correção ocorreu. Se o ganho for invalidado por
--    `deal.reopened`, aquele ciclo deixa de contar (um novo ganho é um novo ciclo/período).
--
-- 2. Conversão — só fechamento causal ATIVO: não conta toda transição, só a mais recente
--    de cada negócio entre (`deal.won`, `deal.lost`, `deal.reopened`) quando essa mais
--    recente for `deal.won` ou `deal.lost` (reaberto sem novo fechamento não entra). O
--    período usado é o `created_at` desse evento de fechamento ativo, nunca o status/
--    responsável ao vivo do negócio.
--
-- Em todas as 5 métricas, a atribuição usa `payload.responsavel_id` (ou, pras
-- reversões, o `responsavel_id` do evento original) — o responsável/beneficiário
-- CONGELADO no evento, nunca `negocios.responsavel_id`/`tarefas.responsavel_id` atual.
--
-- - Negócios ganhos: mesma base de "fechamento causal ativo" do item 2, contando só
--   `deal.won`.
-- - Reuniões realizadas / Tarefas concluídas: `eventos.reuniao.realizada`/`task.completed`
--   líquido da reversão simétrica da #120 (`reuniao.realizada_revertida`/
--   `task.completed_revertido`) — um evento com reversão apontando pra ele (via
--   `payload.evento_original_id`) não conta, mesmo que a reversão tenha acontecido fora
--   do período da ocorrência original.
--
-- Autorização: `security definer` (lê `eventos` direto, ignorando RLS de propósito, como
-- já é padrão no projeto), então a função PRECISA replicar a checagem de visibilidade que
-- a RLS de `metas` já impõe (`pode_ver_responsavel`) — sem isso, qualquer usuário
-- autenticado poderia chamar a RPC com o `empresa_id`/`membro_id` de outra pessoa.

create or replace function public.calcular_realizado_meta(
  p_empresa_id uuid,
  p_membro_id uuid,
  p_metrica public.metrica_meta,
  p_desde timestamptz,
  p_ate_exclusivo timestamptz
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado numeric;
  v_tipo_evento text;
  v_tipo_revertido text;
begin
  if not public.pode_ver_responsavel(p_empresa_id, p_membro_id) then
    raise exception 'Você não tem acesso a esse colaborador.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if p_metrica in ('receita', 'negocios_ganhos') then
    with fechamentos as (
      select e.id, e.tipo, e.payload, e.created_at,
        row_number() over (partition by e.entidade_id order by e.created_at desc) as rn
      from public.eventos e
      where e.empresa_id = p_empresa_id and e.entidade = 'negocio'
        and e.tipo in ('deal.won', 'deal.lost', 'deal.reopened')
    ),
    ganhos_ativos as (
      select f.id, f.payload from fechamentos f
      where f.rn = 1 and f.tipo = 'deal.won'
        and (f.payload ->> 'responsavel_id')::uuid = p_membro_id
        and f.created_at >= p_desde and f.created_at < p_ate_exclusivo
    )
    select case when p_metrica = 'receita' then
        coalesce(sum(
          (g.payload ->> 'valor')::numeric + coalesce((
            select sum((vc.payload ->> 'delta')::numeric) from public.eventos vc
            where vc.empresa_id = p_empresa_id and vc.tipo = 'deal.value_corrected'
              and (vc.payload ->> 'evento_original_id')::bigint = g.id
          ), 0)
        ), 0)
      else count(*)::numeric end
      into v_resultado
      from ganhos_ativos g;
    return coalesce(v_resultado, 0);
  end if;

  if p_metrica = 'conversao' then
    with fechamentos as (
      select e.tipo, e.payload, e.created_at,
        row_number() over (partition by e.entidade_id order by e.created_at desc) as rn
      from public.eventos e
      where e.empresa_id = p_empresa_id and e.entidade = 'negocio'
        and e.tipo in ('deal.won', 'deal.lost', 'deal.reopened')
    ),
    fechamentos_ativos as (
      select f.tipo from fechamentos f
      where f.rn = 1 and f.tipo in ('deal.won', 'deal.lost')
        and (f.payload ->> 'responsavel_id')::uuid = p_membro_id
        and f.created_at >= p_desde and f.created_at < p_ate_exclusivo
    )
    select case when count(*) = 0 then 0
      else (count(*) filter (where tipo = 'deal.won'))::numeric / count(*)::numeric * 100
      end
      into v_resultado
      from fechamentos_ativos;
    return coalesce(v_resultado, 0);
  end if;

  -- reunioes | tarefas_concluidas: líquido da reversão simétrica (#120).
  v_tipo_evento := case p_metrica when 'reunioes' then 'reuniao.realizada' else 'task.completed' end;
  v_tipo_revertido := v_tipo_evento || case when p_metrica = 'reunioes' then '_revertida' else '_revertido' end;

  select count(*) into v_resultado
    from public.eventos e
    where e.empresa_id = p_empresa_id and e.tipo = v_tipo_evento
      and (e.payload ->> 'responsavel_id')::uuid = p_membro_id
      and e.created_at >= p_desde and e.created_at < p_ate_exclusivo
      and not exists (
        select 1 from public.eventos r
        where r.empresa_id = p_empresa_id and r.tipo = v_tipo_revertido
          and (r.payload ->> 'evento_original_id')::bigint = e.id
      );
  return coalesce(v_resultado, 0);
end;
$$;

revoke all on function public.calcular_realizado_meta(uuid, uuid, public.metrica_meta, timestamptz, timestamptz) from public, anon;
grant execute on function public.calcular_realizado_meta(uuid, uuid, public.metrica_meta, timestamptz, timestamptz) to authenticated;
