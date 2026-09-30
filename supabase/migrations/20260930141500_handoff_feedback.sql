-- Pedido do Evandro 2026-09-30: (1) o vendedor recebe notificação ao receber o handoff
-- do SDR — sem botão de recusa, recusa é sempre manual via gestor, fora do app; (2)
-- o vendedor pode escrever um feedback sobre o lead recebido, visível só a admin/gestor
-- e ao próprio autor (nunca ao SDR que fez o handoff) — métrica futura pra avaliar o SDR.

-- Novo tipo de notificação: "handoff_recebido".
alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('lead_atribuido', 'tarefa_atribuida', 'handoff_recebido'));

create or replace function public.registrar_handoff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.eventos
    where empresa_id = new.empresa_id and tipo = 'handoff.created' and entidade_id = new.negocio_id
  ) then
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (new.empresa_id, 'handoff.created', v_ator, 'negocio', new.negocio_id,
            jsonb_build_object('handoff_id', new.id, 'para_membro_id', new.para_membro_id));
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (new.empresa_id, new.para_membro_id, 'handoff_recebido', 'Você recebeu um lead qualificado pelo SDR.',
          '/negocios/' || new.negocio_id);

  return null;
end;
$$;

-- Feedback do vendedor sobre o lead recebido, ligado ao handoff. Tabela própria (não
-- coluna em handoffs) pra que a RLS barre o SDR de verdade, e não só a tela — o código
-- nunca é a única barreira (CLAUDE.md).
create table public.handoffs_feedback (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  handoff_id uuid not null references public.handoffs (id) on delete cascade,
  autor_id uuid not null references public.empresa_membros (id) on delete cascade,
  feedback text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (handoff_id)
);
create index on public.handoffs_feedback (empresa_id, autor_id);

alter table public.handoffs_feedback enable row level security;

-- Ver: admin/gestor (avaliam o SDR) ou o próprio autor (o vendedor que escreveu). O SDR
-- que fez o handoff nunca aparece aqui — não é admin/gestor nem autor_id.
create policy "handoffs_feedback: ver admin/gestor ou o próprio autor" on public.handoffs_feedback
  for select to authenticated
  using (
    public.membro_ativo(empresa_id)
    and (public.tem_papel(empresa_id, '{admin,gestor}') or autor_id = public.meu_membro_id(empresa_id))
  );

-- Criar: só quem recebeu aquele handoff (para_membro_id do handoff = autor).
create policy "handoffs_feedback: criar quem recebeu o handoff" on public.handoffs_feedback
  for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and autor_id = public.meu_membro_id(empresa_id)
    and exists (
      select 1 from public.handoffs h
      where h.id = handoff_id and h.empresa_id = empresa_id and h.para_membro_id = autor_id
    )
  );

-- Editar: só o próprio autor, no próprio feedback.
create policy "handoffs_feedback: editar o próprio" on public.handoffs_feedback
  for update to authenticated
  using (public.membro_ativo(empresa_id) and autor_id = public.meu_membro_id(empresa_id))
  with check (public.membro_ativo(empresa_id) and autor_id = public.meu_membro_id(empresa_id));

create trigger handoffs_feedback_updated_at
  before update on public.handoffs_feedback
  for each row execute function public.tocar_updated_at();
