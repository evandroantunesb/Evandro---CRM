-- Condições de pagamento — configuração da empresa (PR 1 do plano aprovado pelo Evandro em 01/11/2026).
--
-- O que faz:
--  * `condicoes_pagamento_preferencias`: uma linha por empresa com o desconto máximo à vista que o vendedor e o
--    gestor dão sem aprovação (0 a 100%; o admin não tem limite) e se a modalidade "Personalizado" está disponível
--    para os vendedores. Sem linha: 0% para os dois e Personalizado disponível.
--  * `taxas_parcelamento`: as parcelas que a empresa oferece no cartão e no boleto (1 a 24) e a taxa de cada uma
--    (percentual que a operadora desconta do valor da venda). Parcela sem linha = indisponível; meio sem nenhuma
--    linha (ex.: boleto) = meio indisponível.
--  * `salvar_taxas_parcelamento(meio, taxas)`: troca a tabela de um meio de uma vez (tudo ou nada), com as mesmas
--    políticas de quem chama.
--  * Admin e gestor criam, alteram e removem; quem tem acesso comercial lê (o vendedor usa na proposta). Autor gravado
--    na linha e histórico na auditoria existente (`auditar`).
-- O que NÃO faz: não muda proposta nem contrato; o uso na proposta, o pedido de aprovação de desconto e o valor do
-- negócio vêm nas PRs seguintes.
-- Depende de: tem_papel, tem_acesso_comercial, meu_membro_id, tocar_updated_at, auditar (já existentes).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Preferências (descontos e Personalizado)
-- ---------------------------------------------------------------------------

create table public.condicoes_pagamento_preferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  desconto_max_vendedor numeric(5, 2) not null default 0 check (desconto_max_vendedor between 0 and 100),
  desconto_max_gestor numeric(5, 2) not null default 0 check (desconto_max_gestor between 0 and 100),
  personalizado_ativo boolean not null default true,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Taxas de parcelamento (cartão e boleto)
-- ---------------------------------------------------------------------------

create table public.taxas_parcelamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  meio text not null check (meio in ('cartao', 'boleto')),
  parcelas smallint not null check (parcelas between 1 and 24),
  taxa_percentual numeric(5, 2) not null check (taxa_percentual >= 0 and taxa_percentual < 100),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, meio, parcelas)
);

-- Empresa não muda e o autor é sempre quem está logado (as duas tabelas).
create or replace function public.preparar_config_condicoes_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da configuração não muda' using errcode = 'check_violation';
  end if;
  new.atualizado_por := public.meu_membro_id(new.empresa_id);
  return new;
end;
$$;
revoke all on function public.preparar_config_condicoes_pagamento() from public, anon, authenticated;

create trigger condicoes_pagamento_preferencias_preparar before insert or update on public.condicoes_pagamento_preferencias
  for each row execute function public.preparar_config_condicoes_pagamento();
create trigger condicoes_pagamento_preferencias_updated_at before update on public.condicoes_pagamento_preferencias
  for each row execute function public.tocar_updated_at();
create trigger auditar_condicoes_pagamento_preferencias after insert or update or delete on public.condicoes_pagamento_preferencias
  for each row execute function public.auditar();

create trigger taxas_parcelamento_preparar before insert or update on public.taxas_parcelamento
  for each row execute function public.preparar_config_condicoes_pagamento();
create trigger taxas_parcelamento_updated_at before update on public.taxas_parcelamento
  for each row execute function public.tocar_updated_at();
create trigger auditar_taxas_parcelamento after insert or update or delete on public.taxas_parcelamento
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- RLS: acesso comercial lê; admin e gestor escrevem
-- ---------------------------------------------------------------------------

alter table public.condicoes_pagamento_preferencias enable row level security;
create policy "acesso comercial vê condições de pagamento" on public.condicoes_pagamento_preferencias for select to authenticated
  using (public.tem_acesso_comercial(empresa_id));
create policy "admin e gestor criam condições de pagamento" on public.condicoes_pagamento_preferencias for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor editam condições de pagamento" on public.condicoes_pagamento_preferencias for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- Sem DELETE: para voltar ao padrão, grava-se outro valor.
revoke all on public.condicoes_pagamento_preferencias from anon;
revoke delete on public.condicoes_pagamento_preferencias from authenticated;

alter table public.taxas_parcelamento enable row level security;
create policy "acesso comercial vê taxas de parcelamento" on public.taxas_parcelamento for select to authenticated
  using (public.tem_acesso_comercial(empresa_id));
create policy "admin e gestor criam taxas de parcelamento" on public.taxas_parcelamento for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor editam taxas de parcelamento" on public.taxas_parcelamento for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor removem taxas de parcelamento" on public.taxas_parcelamento for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'));
revoke all on public.taxas_parcelamento from anon;

-- ---------------------------------------------------------------------------
-- Troca da tabela de um meio, tudo ou nada
-- ---------------------------------------------------------------------------

/**
 * Substitui as parcelas de um meio da empresa por `p_taxas` ([{parcelas, taxa}], vazio = meio indisponível).
 * security invoker: as políticas de quem chama valem para o DELETE e o INSERT; se uma linha falhar, nada muda.
 */
create or replace function public.salvar_taxas_parcelamento(p_empresa_id uuid, p_meio text, p_taxas jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not public.tem_papel(p_empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor configura o parcelamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if jsonb_typeof(p_taxas) is distinct from 'array' then
    raise exception 'Lista de parcelas inválida.' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.taxas_parcelamento t where t.empresa_id = p_empresa_id and t.meio = p_meio;
  insert into public.taxas_parcelamento (empresa_id, meio, parcelas, taxa_percentual)
  select p_empresa_id, p_meio, (x ->> 'parcelas')::smallint, (x ->> 'taxa')::numeric
  from jsonb_array_elements(p_taxas) x;
end;
$$;
revoke all on function public.salvar_taxas_parcelamento(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_taxas_parcelamento(uuid, text, jsonb) to authenticated;

reset lock_timeout;
