-- Avisos externos: resumo diário por e-mail (item 3 do roadmap; decisões do Evandro em 18/11/2026; plano em
-- docs/superpowers/plans/2026-11-18-resumo-diario-email.md).
--
--  1. `preferencias_resumo_email`: cada pessoa liga ou desliga o próprio resumo, por empresa. Sem linha = ligado.
--  2. `resumos_email_envios`: um registro por pessoa (membro) e dia; garante um envio só por dia, mesmo com o
--     agendador chamando duas vezes, e guarda a janela coberta para o resumo seguinte.
--  3. `resumo_email_pendentes`, `reservar_resumo_email` e `concluir_resumo_email`: só a service role (rota do
--     agendador). O resumo lê o sininho (`notificacoes`) e não muda nada nele.
--
-- Depende de: meu_membro_id.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Preferência
-- ---------------------------------------------------------------------------

create table public.preferencias_resumo_email (
  membro_id uuid primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ligado boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (empresa_id, membro_id) references public.empresa_membros (empresa_id, id) on delete cascade
);
create index on public.preferencias_resumo_email (empresa_id);

alter table public.preferencias_resumo_email enable row level security;
revoke all on table public.preferencias_resumo_email from public, anon, authenticated;
grant select on table public.preferencias_resumo_email to authenticated;

create policy "ver a propria preferencia de resumo" on public.preferencias_resumo_email for select to authenticated
  using (membro_id = (select public.meu_membro_id(empresa_id)));

/** Liga ou desliga o resumo de quem chama, na empresa indicada. */
create or replace function public.definir_resumo_email(p_empresa_id uuid, p_ligado boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(p_empresa_id);
begin
  if v_eu is null or p_ligado is null then
    raise exception 'Sem permissão para mudar esta preferência.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  insert into public.preferencias_resumo_email (membro_id, empresa_id, ligado)
  values (v_eu, p_empresa_id, p_ligado)
  on conflict (membro_id) do update set ligado = excluded.ligado, updated_at = now();
end;
$$;
revoke all on function public.definir_resumo_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_resumo_email(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Envios
-- ---------------------------------------------------------------------------

create table public.resumos_email_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null,
  dia date not null,
  janela_inicio timestamptz,
  janela_fim timestamptz,
  itens integer not null default 0 check (itens >= 0),
  situacao text not null default 'enviando' check (situacao in ('enviando', 'enviado', 'falhou')),
  erro text check (char_length(erro) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membro_id, dia),
  foreign key (empresa_id, membro_id) references public.empresa_membros (empresa_id, id) on delete cascade
);
create index on public.resumos_email_envios (empresa_id);
create index on public.resumos_email_envios (membro_id, janela_fim desc) where situacao = 'enviado';

-- Só a service role (rota do agendador) lê e escreve.
alter table public.resumos_email_envios enable row level security;
revoke all on table public.resumos_email_envios from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funções do agendador
-- ---------------------------------------------------------------------------

/*
 * Avisos que entram no resumo de `p_dia`, até `p_ate`: só os tipos que pedem ação, ainda não lidos no sininho, de
 * membros ativos com o resumo ligado e sem resumo enviado nesse dia. A janela começa onde o último resumo enviado
 * terminou (no máximo 7 dias para trás; sem envio anterior, 24 horas).
 */
create or replace function public.resumo_email_pendentes(p_dia date, p_ate timestamptz)
returns table (
  empresa_id uuid,
  empresa_nome text,
  membro_id uuid,
  nome text,
  email text,
  janela_inicio timestamptz,
  notificacao_id uuid,
  tipo text,
  mensagem text,
  link text,
  criada_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with membros as (
    select m.id, m.empresa_id, e.nome as empresa_nome, coalesce(nullif(btrim(p.nome), ''), u.email) as nome, u.email,
           greatest(
             coalesce((select max(r.janela_fim) from public.resumos_email_envios r
                       where r.membro_id = m.id and r.situacao = 'enviado'), p_ate - interval '24 hours'),
             p_ate - interval '7 days'
           ) as janela_inicio
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    join auth.users u on u.id = m.user_id
    left join public.perfis p on p.id = m.user_id
    left join public.preferencias_resumo_email pr on pr.membro_id = m.id
    where m.ativo
      and coalesce(pr.ligado, true)
      and u.email is not null
      and not exists (select 1 from public.resumos_email_envios r
                      where r.membro_id = m.id and r.dia = p_dia
                        and (r.situacao = 'enviado' or (r.situacao = 'enviando' and r.updated_at > now() - interval '1 hour')))
  )
  select mb.empresa_id, mb.empresa_nome, mb.id, mb.nome, mb.email, mb.janela_inicio,
         n.id, n.tipo, n.mensagem, n.link, n.created_at
  from membros mb
  join public.notificacoes n on n.membro_id = mb.id and n.empresa_id = mb.empresa_id
  where n.lida_em is null
    and n.created_at > mb.janela_inicio
    and n.created_at <= p_ate
    and n.tipo in ('lead_atribuido', 'handoff_recebido', 'handoff_devolvido', 'desconto_solicitado', 'desconto_decidido',
                   'pagamento_aviso_confirmado', 'pagamento_aviso_devolvido', 'justificativa_atraso_pedida',
                   'justificativa_atraso_cobrada')
  order by mb.empresa_id, mb.id, n.created_at;
$$;
revoke all on function public.resumo_email_pendentes(date, timestamptz) from public, anon, authenticated;
grant execute on function public.resumo_email_pendentes(date, timestamptz) to service_role;

/*
 * Reserva o resumo do dia antes de enviar: devolve o id só se ninguém enviou nem está enviando (um envio que falhou,
 * ou que ficou "enviando" por mais de 1 hora, pode ser tentado de novo). Duas chamadas ao mesmo tempo: só uma recebe o id.
 */
create or replace function public.reservar_resumo_email(p_empresa_id uuid, p_membro_id uuid, p_dia date,
                                                        p_janela_inicio timestamptz, p_janela_fim timestamptz,
                                                        p_itens integer)
returns uuid
language sql security definer set search_path = ''
as $$
  insert into public.resumos_email_envios (empresa_id, membro_id, dia, janela_inicio, janela_fim, itens)
  values (p_empresa_id, p_membro_id, p_dia, p_janela_inicio, p_janela_fim, p_itens)
  on conflict (membro_id, dia) do update
    set situacao = 'enviando', erro = null, janela_inicio = excluded.janela_inicio, janela_fim = excluded.janela_fim,
        itens = excluded.itens, updated_at = now()
    where public.resumos_email_envios.situacao = 'falhou'
       or (public.resumos_email_envios.situacao = 'enviando' and public.resumos_email_envios.updated_at <= now() - interval '1 hour')
  returning id;
$$;
revoke all on function public.reservar_resumo_email(uuid, uuid, date, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reservar_resumo_email(uuid, uuid, date, timestamptz, timestamptz, integer) to service_role;

/** Fecha a reserva: enviado ou falhou (com o erro, sem dados do destinatário). */
create or replace function public.concluir_resumo_email(p_id uuid, p_enviado boolean, p_erro text default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.resumos_email_envios
     set situacao = case when p_enviado then 'enviado' else 'falhou' end,
         erro = case when p_enviado then null else left(coalesce(p_erro, 'Falha no envio.'), 1000) end,
         updated_at = now()
   where id = p_id and situacao = 'enviando';
$$;
revoke all on function public.concluir_resumo_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.concluir_resumo_email(uuid, boolean, text) to service_role;

reset lock_timeout;
