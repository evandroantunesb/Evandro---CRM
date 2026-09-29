-- Distribuição automática de leads: o rodízio simples já existia (recebe_leads /
-- recebeu_lead_em em empresa_membros, usado em enviarCaptura). Isto adiciona a
-- fila de aprovação do gestor com prazo de auto-aprovação configurável por
-- origem, conforme decidido desde o início do projeto ("rodízio automático com
-- aprovação do gestor; prazo de auto-aprovação configurável por origem, padrão 1h").

alter table public.origens
  add column prazo_auto_aprovacao_minutos integer not null default 60
    check (prazo_auto_aprovacao_minutos > 0);

create type public.status_atribuicao_lead as enum ('pendente', 'aprovada', 'reatribuida', 'expirada');

create table public.atribuicoes_leads (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  membro_sugerido_id uuid not null references public.empresa_membros (id) on delete cascade,
  membro_final_id uuid references public.empresa_membros (id) on delete set null,
  status public.status_atribuicao_lead not null default 'pendente',
  expira_em timestamptz not null,
  decidido_por uuid references public.empresa_membros (id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);
create index on public.atribuicoes_leads (empresa_id, status, expira_em);
-- No máximo uma atribuição pendente por negócio.
create unique index atribuicoes_leads_uma_pendente_por_negocio on public.atribuicoes_leads (negocio_id) where status = 'pendente';

alter table public.atribuicoes_leads enable row level security;
create policy "gestor ve atribuicoes de leads" on public.atribuicoes_leads for select to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'));

-- ---------------------------------------------------------------------------
-- Aprovação (manual ou automática)
-- ---------------------------------------------------------------------------

-- Decide uma atribuição pendente: atribui o negócio a p_membro_final_id (ou ao
-- sugerido, se nulo). p_automatico=true pula a checagem de papel (usado só pelo
-- job agendado abaixo, nunca chamado direto pelo cliente).
create or replace function public.decidir_atribuicao_lead(p_id uuid, p_membro_final_id uuid, p_automatico boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_atrib public.atribuicoes_leads%rowtype;
  v_final uuid;
begin
  select * into v_atrib from public.atribuicoes_leads where id = p_id and status = 'pendente' for update;
  if not found then
    raise exception 'Atribuição não encontrada ou já decidida' using errcode = 'no_data_found';
  end if;

  if not p_automatico and not public.tem_papel(v_atrib.empresa_id, '{admin,gestor}') then
    raise exception 'Sem permissão para decidir esta atribuição' using errcode = 'insufficient_privilege';
  end if;

  v_final := coalesce(p_membro_final_id, v_atrib.membro_sugerido_id);
  if not exists (
    select 1 from public.empresa_membros where id = v_final and empresa_id = v_atrib.empresa_id and ativo
  ) then
    raise exception 'Responsável inválido' using errcode = 'check_violation';
  end if;

  update public.negocios set responsavel_id = v_final where id = v_atrib.negocio_id;
  update public.atribuicoes_leads
    set status = (case
                    when p_automatico then 'expirada'
                    when v_final = v_atrib.membro_sugerido_id then 'aprovada'
                    else 'reatribuida'
                  end)::public.status_atribuicao_lead,
        membro_final_id = v_final,
        decidido_por = case when p_automatico then null else public.meu_membro_id(v_atrib.empresa_id) end,
        decidido_em = now()
    where id = p_id;
end;
$$;

-- Chamada pelo cliente: admin/gestor aprovando (p_membro_final_id nulo) ou
-- reatribuindo (escolhendo outro vendedor) uma atribuição pendente.
create or replace function public.aprovar_atribuicao_lead(p_id uuid, p_membro_final_id uuid default null)
returns void
language sql security definer set search_path = ''
as $$
  select public.decidir_atribuicao_lead(p_id, p_membro_final_id, false);
$$;

-- Roda periodicamente (pg_cron abaixo): aprova sozinho quem passou do prazo.
create or replace function public.expirar_atribuicoes_leads()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.atribuicoes_leads where status = 'pendente' and expira_em <= now() for update skip locked
  loop
    perform public.decidir_atribuicao_lead(v_id, null, true);
  end loop;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('expirar-atribuicoes-leads', '*/5 * * * *', $$select public.expirar_atribuicoes_leads()$$);
