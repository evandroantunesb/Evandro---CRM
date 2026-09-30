-- Sininho: notificações individuais (fase 7 da spec RAION_SDR_REGRAS_PERMISSOES, §45),
-- escopo reduzido a 2 dos 8 tipos listados — os únicos sem dependência de fluxo ainda
-- não construído (devolução de lead §46, aceite/rejeição de handoff): "novo lead
-- atribuído" e "gestor atribuiu tarefa". O sininho hoje só soma pendências
-- (src/lib/notificacoes.ts, contarPendencias) sem persistência nem itens individuais;
-- isto adiciona o primeiro registro persistente do tipo no projeto.
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  tipo text not null check (tipo in ('lead_atribuido', 'tarefa_atribuida')),
  mensagem text not null,
  link text,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notificacoes (membro_id, lida_em, created_at desc);

alter table public.notificacoes enable row level security;

create policy "notificacoes: ver as próprias" on public.notificacoes for select to authenticated
  using (membro_id = public.meu_membro_id(empresa_id));

create policy "notificacoes: marcar como lida" on public.notificacoes for update to authenticated
  using (membro_id = public.meu_membro_id(empresa_id))
  with check (membro_id = public.meu_membro_id(empresa_id));

-- Sem policy de insert: só o backend cria (via decidir_atribuicao_lead, security
-- definer, ou pelo cliente admin nas Server Actions), nunca direto pelo usuário.

-- Estende a função existente (rodízio de leads) para notificar quem recebeu o lead,
-- cobrindo aprovação manual, reatribuição e auto-aprovação por prazo.
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

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (v_atrib.empresa_id, v_final, 'lead_atribuido', 'Novo lead atribuído a você.', '/negocios/' || v_atrib.negocio_id);
end;
$$;
