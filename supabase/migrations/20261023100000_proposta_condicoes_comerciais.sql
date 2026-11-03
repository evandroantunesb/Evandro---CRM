-- Condições comerciais da proposta simples (M2 P0, decisões D1 e D2 do Evandro, 22/10/2026).
--
-- D1: a validade da proposta é de 7, 15 ou 30 dias, configurada pela empresa e calculada na emissão (dia da emissão em
--     São Paulo + prazo). O vendedor não informa a data de vencimento.
-- D2: a proposta mostra juntas as três formas de pagamento (à vista, cartão e financiamento) com o texto que a empresa
--     configurou. O vendedor não escolhe uma modalidade nem edita o texto.
--
-- Quem configura: admin e gestor da empresa. Todos os membros ativos leem (o vendedor vê a prévia antes de emitir).
-- Sem a linha, sem o prazo ou sem qualquer uma das três condições, a emissão é bloqueada pelo app.
--
-- Migration aditiva: tabela nova e vazia. Nenhuma linha existente muda; `propostas_emissoes` e o gatilho de emissão
-- ficam como estão. Propostas já emitidas guardam prazo, condições e PDF congelados nos próprios `dados`: mudar esta
-- configuração depois nunca altera link nem PDF emitidos.

create table public.proposta_condicoes_comerciais (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  validade_dias smallint check (validade_dias in (7, 15, 30)),
  pagamento_avista text check (pagamento_avista is null or length(btrim(pagamento_avista)) between 1 and 80),
  pagamento_cartao text check (pagamento_cartao is null or length(btrim(pagamento_cartao)) between 1 and 80),
  pagamento_financiamento text check (pagamento_financiamento is null or length(btrim(pagamento_financiamento)) between 1 and 80),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger proposta_condicoes_comerciais_updated_at before update on public.proposta_condicoes_comerciais
  for each row execute function public.tocar_updated_at();

alter table public.proposta_condicoes_comerciais enable row level security;

create policy "ver condições comerciais da proposta" on public.proposta_condicoes_comerciais for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin e gestor criam condições comerciais" on public.proposta_condicoes_comerciais for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor editam condições comerciais" on public.proposta_condicoes_comerciais for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- Sem política de DELETE: limpar = gravar nulo nos campos (a emissão fica bloqueada até completar de novo).

revoke all on table public.proposta_condicoes_comerciais from anon;
