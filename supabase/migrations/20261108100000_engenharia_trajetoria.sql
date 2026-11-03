-- Engenharia: "Sua trajetória" e "Trajetória da equipe" (início do engenheiro, PR 2; desenho aprovado em 03/11/2026).
--
-- Decisões do Evandro (02 e 03/11/2026):
--  * Conta a obra com a Engenharia CONCLUÍDA: o 1º `fluxo_alterado` da Engenharia com status → `concluido` no
--    histórico (vale a data da 1ª conclusão, mesmo que a obra tenha sido reaberta depois).
--  * Na trajetória pessoal, a obra conta para quem foi registrado em `obra_participantes` da Engenharia (responsável,
--    apoio ou substituto) ANTES da conclusão, mesmo que a participação já tenha terminado.
--  * Obra cancelada depois da conclusão continua contando (o trabalho foi feito; causalidade).
--  * Potência: só kWp (`obras.potencia_kwp`, congelado na criação da obra). Sem potência conta 0 kWp.
--
-- Por que security definer: a RLS do papel `operacao` (`pode_ver_obra_operacao`) exige participação ATIVA, então
-- esconderia as obras antigas de quem já saiu delas. A função devolve só contagens e somas por mês (nunca a lista de
-- obras): a pessoa vê o próprio total; a equipe (totais da empresa e por pessoa) só para admin, gestor e quem
-- coordena a Engenharia, que já veem a carteira inteira do setor.
--
-- Só função, sem tabela nova. Depende de: membro_ativo, tem_papel, meu_membro_id (já existentes).

create or replace function public.trajetoria_engenharia(p_empresa_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_eu uuid;
  v_equipe boolean;
  v jsonb;
begin
  if not public.membro_ativo(p_empresa_id) then
    raise exception 'Sem acesso a esta empresa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_eu := public.meu_membro_id(p_empresa_id);
  v_equipe := public.tem_papel(p_empresa_id, '{admin,gestor}')
    or exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = p_empresa_id and s.membro_id = v_eu and s.setor = 'engenharia' and s.capacidade = 'coordenar'
    );

  with conclusoes as (
    select distinct on (h.obra_id) h.obra_id, h.created_at as em
    from public.obra_historico h
    where h.empresa_id = p_empresa_id and h.setor = 'engenharia' and h.tipo = 'fluxo_alterado'
      and h.dados ->> 'campo' = 'status' and h.dados ->> 'para' = 'concluido'
    order by h.obra_id, h.created_at, h.id
  ),
  concluidas as (
    select c.obra_id, c.em, coalesce(o.potencia_kwp, 0) as kwp,
      to_char(c.em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
    from conclusoes c join public.obras o on o.id = c.obra_id and o.empresa_id = p_empresa_id
  ),
  -- Uma linha por obra e pessoa, mesmo com várias participações (funções ou substituições).
  participacoes as (
    select distinct c.obra_id, p.membro_id, c.kwp, c.mes
    from concluidas c
    join public.obra_participantes p on p.obra_id = c.obra_id and p.empresa_id = p_empresa_id
    where p.setor = 'engenharia' and p.inicio < c.em
  )
  select jsonb_build_object(
    'pessoal', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'obras', m.obras, 'kwp', m.kwp) order by m.mes)
      from (select mes, count(*) as obras, sum(kwp) as kwp from participacoes where membro_id = v_eu group by mes) m
    ), '[]'::jsonb),
    'equipe', case when v_equipe then jsonb_build_object(
      'meses', coalesce((
        select jsonb_agg(jsonb_build_object('mes', m.mes, 'obras', m.obras, 'kwp', m.kwp) order by m.mes)
        from (select mes, count(*) as obras, sum(kwp) as kwp from concluidas group by mes) m
      ), '[]'::jsonb),
      'pessoas', coalesce((
        select jsonb_agg(jsonb_build_object('membro_id', x.membro_id, 'nome', x.nome, 'obras', x.obras, 'kwp', x.kwp)
          order by x.obras desc, x.kwp desc, x.nome)
        from (
          select p.membro_id, coalesce(nullif(trim(pf.nome), ''), pf.email::text) as nome, count(*) as obras, sum(p.kwp) as kwp
          from participacoes p
          join public.empresa_membros em on em.id = p.membro_id and em.empresa_id = p_empresa_id
          join public.perfis pf on pf.id = em.user_id
          group by p.membro_id, pf.nome, pf.email
        ) x
      ), '[]'::jsonb)
    ) end
  ) into v;
  return v;
end;
$$;

revoke all on function public.trajetoria_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.trajetoria_engenharia(uuid) to authenticated;
