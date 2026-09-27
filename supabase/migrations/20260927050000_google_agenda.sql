-- ---------------------------------------------------------------------------
-- Integração com o Google Agenda: cada membro conecta sua própria conta
-- Google e, ao criar uma tarefa, ela também vira um evento na agenda dele.
-- ---------------------------------------------------------------------------

create table public.google_agenda_conexoes (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null unique references public.empresa_membros (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  refresh_token text not null,
  email_google text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.google_agenda_conexoes (empresa_id);

create trigger google_agenda_conexoes_updated_at before update on public.google_agenda_conexoes
  for each row execute function public.tocar_updated_at();

-- O refresh_token é uma credencial sensível: nenhuma política de RLS é
-- criada, então só o cliente com a service role (usado no servidor, depois
-- de checar a sessão) consegue ler ou escrever nessa tabela.
alter table public.google_agenda_conexoes enable row level security;

-- Guarda o evento criado na Agenda pra permitir apagar junto se a tarefa for apagada.
alter table public.tarefas add column google_evento_id text;
