-- Comissões: cálculo causal + versionamento de planos + abertura/fechamento (Evandro,
-- 2026-10-02, depois da auditoria read-only). Três mudanças de modelo. A fórmula de receita
-- reaproveita a MESMA lógica causal já validada em Metas (ver
-- 20261002200000_metas_realizado_causal.sql), mas Comissões tem semântica própria — um
-- snapshot fechado nunca muda retroativamente, Metas não tem esse conceito — então a função
-- é duplicada de propósito (`calcular_receita_causal_comissao`), mantendo os dois conceitos
-- desacoplados.
--
-- 1. Cálculo deixa de somar `negocios.valor` ao vivo e passa a usar fechamento causal ativo
--    (`deal.won` mais recente do negócio, sem `deal.reopened` depois) + deltas de
--    `deal.value_corrected` do mesmo ciclo, com `payload.responsavel_id` congelado.
--
-- 2. `planos_comissao` passa a ser versionado por vigência mensal (`vigencia_inicio`), nunca
--    mais editado em lugar. Decisão do Evandro pra compatibilizar as linhas já existentes,
--    sem reconstruir histórico que não conhecemos: `vigencia_inicio = 2026-10-01` pra todo
--    plano legado, considerada a primeira versão historicamente confiável — NUNCA um
--    sentinela "desde sempre", e NUNCA inferido de `created_at` (a linha pode ter sido
--    editada depois de criada, então `created_at` não prova que as condições atuais já
--    valiam desde então). Toda nova versão precisa de vigência explícita, estritamente
--    posterior à versão anterior do mesmo colaborador e nunca retroativa a um mês já
--    decorrido.
--
-- 3. `comissoes_calculadas` ganha `status` (aberta/fechada). Aberta: cálculo/recálculo livre
--    (como hoje). Fechada: snapshot imutável — trigger bloqueia qualquer UPDATE subsequente,
--    RLS bloqueia DELETE. Fechar (`fechar_comissao`) congela, além dos campos que já eram
--    gravados no cálculo (resultado, salário-base, comissão, total, faixa aplicada, plano),
--    o resto do plano usado: tipo de cálculo, OTE e as faixas completas — não só a que bateu.
--    "Paga" e reabertura de comissão fechada ficam deliberadamente fora desta migration.
--
-- `comissoes_calculadas` já existentes (meses anteriores a outubro/2026) são preservadas como
-- snapshots legados, sem plano histórico reconstruído. Como não existe nenhuma versão de
-- plano com vigência antes de 2026-10-01, calcular/recalcular um mês anterior a isso agora
-- retorna "sem plano vigente para este período" — nunca cai de volta pro plano atual.

-- ---------------------------------------------------------------------------
-- 1. Cálculo causal
-- ---------------------------------------------------------------------------

create or replace function public.calcular_receita_causal_comissao(
  p_empresa_id uuid,
  p_membro_id uuid,
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
begin
  if not public.pode_ver_responsavel(p_empresa_id, p_membro_id) then
    raise exception 'Você não tem acesso a esse colaborador.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

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
  select coalesce(sum(
    (g.payload ->> 'valor')::numeric + coalesce((
      select sum((vc.payload ->> 'delta')::numeric) from public.eventos vc
      where vc.empresa_id = p_empresa_id and vc.tipo = 'deal.value_corrected'
        and (vc.payload ->> 'evento_original_id')::bigint = g.id
    ), 0)
  ), 0)
  into v_resultado
  from ganhos_ativos g;

  return coalesce(v_resultado, 0);
end;
$$;

revoke all on function public.calcular_receita_causal_comissao(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.calcular_receita_causal_comissao(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Planos com vigência mensal — versionado, nunca editado em lugar
-- ---------------------------------------------------------------------------

alter table public.planos_comissao add column vigencia_inicio date;
update public.planos_comissao set vigencia_inicio = '2026-10-01' where vigencia_inicio is null;
alter table public.planos_comissao alter column vigencia_inicio set not null;
alter table public.planos_comissao add constraint planos_comissao_vigencia_dia1 check (extract(day from vigencia_inicio) = 1);

drop index if exists public.planos_comissao_um_ativo_por_membro;
alter table public.planos_comissao drop column ativo;
alter table public.planos_comissao add constraint planos_comissao_membro_vigencia_unica unique (membro_id, vigencia_inicio);

-- Append-only a partir de agora: nunca retroativo a um mês decorrido, sempre estritamente
-- posterior à versão anterior do mesmo colaborador.
create or replace function public.validar_vigencia_plano_comissao()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_mes_atual date := date_trunc('month', current_date)::date;
  v_ultima_vigencia date;
begin
  if new.vigencia_inicio < v_mes_atual then
    raise exception 'A vigência de um novo plano não pode ser retroativa a um mês já decorrido.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select max(vigencia_inicio) into v_ultima_vigencia
    from public.planos_comissao where membro_id = new.membro_id;
  if v_ultima_vigencia is not null and new.vigencia_inicio <= v_ultima_vigencia then
    raise exception 'Já existe uma versão de plano com vigência igual ou posterior a essa data.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger planos_comissao_validar_vigencia
  before insert on public.planos_comissao
  for each row execute function public.validar_vigencia_plano_comissao();

-- Editar passou a significar "criar uma nova versão" — nunca mais um UPDATE comum. Apagar
-- só é permitido pra uma versão que ainda não entrou em vigência (preserva as que já valeram
-- ou valem agora).
drop policy if exists "planos_comissao_update" on public.planos_comissao;
drop policy if exists "planos_comissao_delete" on public.planos_comissao;
create policy "planos_comissao_delete" on public.planos_comissao for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}') and vigencia_inicio > date_trunc('month', current_date)::date);

-- ---------------------------------------------------------------------------
-- 3. Comissão aberta/fechada
-- ---------------------------------------------------------------------------

create type public.status_comissao as enum ('aberta', 'fechada');

alter table public.comissoes_calculadas
  add column status public.status_comissao not null default 'aberta',
  add column tipo_calculo_congelado public.tipo_calculo_comissao,
  add column meta_ote_congelada numeric(12, 2),
  add column faixas_congeladas jsonb,
  add column fechada_em timestamptz,
  add column fechado_por uuid references public.empresa_membros (id) on delete set null;

create or replace function public.bloquear_edicao_comissao_fechada()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.status = 'fechada' then
    raise exception 'Esta comissão está fechada e não pode ser alterada.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger comissoes_calculadas_bloquear_fechada
  before update on public.comissoes_calculadas
  for each row execute function public.bloquear_edicao_comissao_fechada();

drop policy if exists "comissoes_calculadas_delete" on public.comissoes_calculadas;
create policy "comissoes_calculadas_delete" on public.comissoes_calculadas for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}') and status = 'aberta');

create or replace function public.fechar_comissao(p_comissao_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_comissao public.comissoes_calculadas;
  v_plano public.planos_comissao;
begin
  select * into v_comissao from public.comissoes_calculadas where id = p_comissao_id for update;
  if not found then
    raise exception 'Comissão não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.tem_papel(v_comissao.empresa_id, '{admin}') then
    raise exception 'Só admin pode fechar uma comissão.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_comissao.status = 'fechada' then
    raise exception 'Esta comissão já está fechada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_comissao.plano_id is null then
    raise exception 'Esta comissão não tem um plano vinculado — recalcule antes de fechar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_plano from public.planos_comissao where id = v_comissao.plano_id;
  if not found then
    raise exception 'O plano usado no cálculo não existe mais — recalcule antes de fechar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.comissoes_calculadas set
    status = 'fechada',
    tipo_calculo_congelado = v_plano.tipo_calculo,
    meta_ote_congelada = v_plano.meta_ote,
    faixas_congeladas = v_plano.faixas,
    fechada_em = now(),
    fechado_por = public.meu_membro_id(v_comissao.empresa_id)
  where id = p_comissao_id;
end;
$$;

revoke all on function public.fechar_comissao(uuid) from public, anon;
grant execute on function public.fechar_comissao(uuid) to authenticated;
