-- Métricas simples de captação por formulário (quantas vezes a página pública foi
-- aberta e quantos formulários foram de fato enviados) e um novo campo no
-- formulário público: valor da conta de energia (substitui a unidade
-- consumidora, que sai do formulário público mas continua existindo no
-- negócio para preenchimento manual depois).

alter table public.formularios add column visualizacoes integer not null default 0;
alter table public.formularios add column preenchimentos integer not null default 0;

alter table public.negocios add column valor_conta_energia numeric(12, 2);

-- Incrementos atômicos via RPC (chamados pelo cliente admin/service-role, que já
-- ignora RLS) — evita a corrida de "ler valor, somar, gravar" com acessos simultâneos.
create or replace function public.incrementar_visualizacao_formulario(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.formularios set visualizacoes = visualizacoes + 1 where id = p_id;
$$;

create or replace function public.incrementar_preenchimento_formulario(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.formularios set preenchimentos = preenchimentos + 1 where id = p_id;
$$;
