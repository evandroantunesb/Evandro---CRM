-- Progresso de conquistas ainda bloqueadas, pedido por Evandro em 2026-10-04 pra
-- reproduzir o bloco "última/próxima conquista" da referência visual (realizado,
-- alvo, percentual calculável no client).
--
-- `contar_marco_membro()` — a função que já conta os 6 marcos elegíveis de
-- `criterio.metrica = 'marco_contagem'` — foi deliberadamente revogada de
-- `authenticated` em `20261002230000_gamificacao_fechamento_auditoria.sql` (item 2):
-- ela não valida dono do dado, só é seguro chamá-la internamente de dentro de outra
-- função `security definer` que já resolveu o membro certo. Essa revogação continua
-- de pé — esta migration NÃO reabre esse grant. Em vez disso, `progresso_conquistas_
-- membro()` resolve o membro do próprio chamador (via `meu_membro_id`, nunca um
-- `p_membro_id` arbitrário) e só então chama `contar_marco_membro()` por dentro,
-- exatamente como `avaliar_conquistas_marco()` já faz — reaproveita a função
-- existente, não duplica a lógica causal dos 6 marcos numa segunda linguagem.
--
-- Para `criterio.metrica = 'xp_acumulado'`, usa a mesma soma que `avaliar_
-- conquistas_pontos()` já usa pra decidir elegibilidade (`sum(xp) where not
-- estornado and referencia_tipo <> 'conquista'`) — não a soma "XP total" que a
-- Visão geral mostra hoje (`meuTotalXp`, que inclui bônus de conquista): usar
-- aquela inflaria o progresso mostrado em relação ao limiar real de desbloqueio.
--
-- Retorna uma linha por conquista ativa ainda não desbloqueada do chamador, com
-- `realizado`/`alvo` — o cálculo de percentual e a escolha de "próxima" (maior
-- percentual; empate decidido por `ativa_desde` mais antiga, determinístico) ficam
-- no client, que já tem tudo que precisa sem reimplementar a lógica causal.

create or replace function public.progresso_conquistas_membro(p_empresa_id uuid)
returns table (conquista_id uuid, realizado numeric, alvo numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_membro_id uuid;
  v_conquista record;
  v_realizado numeric;
begin
  v_membro_id := public.meu_membro_id(p_empresa_id);
  if v_membro_id is null then
    return;
  end if;

  for v_conquista in
    select c.id, c.criterio, c.ativa_desde, c.perfil_aplicavel
    from public.conquistas c
    where c.empresa_id = p_empresa_id
      and c.ativa
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = c.id and cd.membro_id = v_membro_id
      )
    order by c.ativa_desde asc
  loop
    if v_conquista.criterio->>'metrica' = 'xp_acumulado' then
      select coalesce(sum(xp), 0) into v_realizado
        from public.point_ledger
        where membro_id = v_membro_id and not estornado and referencia_tipo <> 'conquista';
    elsif v_conquista.criterio->>'metrica' = 'marco_contagem' then
      v_realizado := public.contar_marco_membro(
        v_conquista.criterio->>'marco',
        p_empresa_id,
        v_membro_id,
        v_conquista.ativa_desde,
        v_conquista.perfil_aplicavel
      );
    else
      -- Critério desconhecido/futuro: sem forma segura de calcular progresso
      -- objetivo ainda — não inventa um número, só não entra no resultado.
      continue;
    end if;

    conquista_id := v_conquista.id;
    realizado := v_realizado;
    alvo := (v_conquista.criterio->>'valor')::numeric;
    return next;
  end loop;
end;
$$;

revoke all on function public.progresso_conquistas_membro(uuid) from public;
grant execute on function public.progresso_conquistas_membro(uuid) to authenticated;
