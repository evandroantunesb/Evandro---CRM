-- Fixture determinística da suíte SQL da P1a. SÓ para banco descartável, no estado ANTERIOR às migrations da P1a
-- (migrations até 20261015110000). IDs fixos; roda numa transação e é gravada (COMMIT) de propósito.
-- Reproduz o que cenario.sql escolhe: empresa A (admin, gestor-sem-uso, vendedor responsável, SDR, vendedor do legado),
-- gestor e operação na empresa A (perfis das tentativas de emissão), empresa B (vendedor), um administrador da plataforma fora da empresa A e três negócios na empresa A.
\set ON_ERROR_STOP 1
begin;

-- Trava: só entra em banco vazio, antes das migrations da P1a. O banco local de desenvolvimento nunca passa por aqui.
do $$
begin
  if (select count(*) from public.empresas) > 0 or (select count(*) from auth.users) > 0 then
    raise exception 'Fixture recusada: o banco não está vazio (use um banco descartável recém-criado).';
  end if;
  if to_regclass('public.proposta_versoes') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'arquivado_em') then
    raise exception 'Fixture recusada: o banco já tem as migrations da P1a.';
  end if;
end
$$;
create table public.p1a_marca_descartavel (id boolean primary key default true check (id), fixture text not null, criada_em timestamptz not null default now());
insert into public.p1a_marca_descartavel (fixture) values ('p1a-v1');

-- Usuários (sem senha: os testes SQL usam papéis e claims, não o login).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'p1a-admin-a@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'p1a-vendedor-a@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'p1a-sdr-a@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000004'::uuid, 'p1a-vendedor-legado-a@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000005'::uuid, 'p1a-vendedor-b@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000006'::uuid, 'p1a-plataforma@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000007'::uuid, 'p1a-gestor-a@exemplo.invalid'),
  ('a1000000-0000-4000-8000-000000000008'::uuid, 'p1a-operacao-a@exemplo.invalid')
) u(id, email);

insert into public.empresas (id, nome) values
  ('b1000000-0000-4000-8000-00000000000a', 'P1a Empresa A (fixture)'),
  ('b1000000-0000-4000-8000-00000000000b', 'P1a Empresa B (fixture)');

insert into public.empresa_membros (id, empresa_id, user_id, papel, status) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'admin', 'ativo'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002', 'vendedor', 'ativo'),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000003', 'sdr', 'ativo'),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000004', 'vendedor', 'ativo'),
  ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000005', 'vendedor', 'ativo'),
  ('c1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000007', 'gestor', 'ativo'),
  ('c1000000-0000-4000-8000-000000000008', 'b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000008', 'operacao', 'ativo')
on conflict (empresa_id, user_id) do update set papel = excluded.papel, status = excluded.status;

insert into public.plataforma_admins (user_id) values ('a1000000-0000-4000-8000-000000000006') on conflict do nothing;

-- Funil e etapa da empresa A.
insert into public.funis (id, empresa_id, nome) values ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'Funil P1a')
  on conflict do nothing;
insert into public.etapas (id, empresa_id, funil_id, nome) values
  ('d2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001', 'Etapa P1a')
  on conflict do nothing;

insert into public.contatos (id, empresa_id, nome) values
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'Cliente P1a principal'),
  ('e1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-00000000000a', 'Cliente P1a sem versão'),
  ('e1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000a', 'Cliente P1a legado');

-- Negócios: principal (vendedor A), sem versão (vendedor A) e legado (vendedor do legado).
insert into public.negocios (id, empresa_id, titulo, contato_id, funil_id, etapa_id, responsavel_id) values
  ('f1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'P1a negócio principal', 'e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-00000000000a', 'P1a negócio sem versão', 'e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000a', 'P1a negócio legado', 'e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004');

-- Itens do kit (o banco exige kit antes do cálculo) e cálculo solar do principal e do legado.
insert into public.kit_componentes (empresa_id, negocio_id, tipo, descricao) values
  ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000001', 'modulo', 'Módulo 550 W (fixture)'),
  ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000001', 'inversor', 'Inversor 5 kW (fixture)'),
  ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000003', 'modulo', 'Módulo 550 W legado (fixture)'),
  ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000003', 'inversor', 'Inversor 5 kW legado (fixture)');

insert into public.calculos_solares (empresa_id, negocio_id, kit_nome, kit_potencia_kwp, kit_preco, consumo_medio_kwh, tarifa_kwh,
    produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_kwh, geracao_estimada_kwh_mes, kwh_faturado, kwh_compensado,
    custo_fio_b, conta_sem_solar, conta_com_solar, economia_mensal, payback_meses, criado_por, atualizado_por)
select 'b1000000-0000-4000-8000-00000000000a', n, 'Kit P1a 5 kWp', 5, 20000, 600, 0.9, 130, 0.3, 100, 650, 100, 500, 40, 540, 90, 450, 44.4, m, m
from (values ('f1000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000002'::uuid),
             ('f1000000-0000-4000-8000-000000000003'::uuid, 'c1000000-0000-4000-8000-000000000004'::uuid)) v(n, m);

-- Proposta legada do negócio legado (sem versões).
insert into public.propostas (empresa_id, negocio_id) values ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000003');

-- Contrato com pagamento confirmado no negócio legado: a confirmação cria a obra (gatilho diferido, no COMMIT).
-- Alguns testes (S2q) precisam de ao menos um contrato e uma obra para tentar movê-los para um negócio arquivado.
update public.negocios set status = 'ganho', valor = 20000 where id = 'f1000000-0000-4000-8000-000000000003';
insert into public.contratos (id, empresa_id, negocio_id, conteudo, status, responsavel_assinatura_id)
values ('11000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000003', 'Contrato P1a (fixture)',
        'assinado', 'c1000000-0000-4000-8000-000000000004');
with ev as (insert into public.eventos (empresa_id, tipo) values ('b1000000-0000-4000-8000-00000000000a', 'pagamento_confirmado') returning id)
insert into public.confirmacoes_pagamento (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
    beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
select 'b1000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003',
       'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', ev.id from ev;

-- Quarto negócio, com repasse (handoff) pendente do SDR para o vendedor: o teste S3 precisa de um repasse pendente.
insert into public.contatos (id, empresa_id, nome) values ('e1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-00000000000a', 'Cliente P1a repasse');
insert into public.negocios (id, empresa_id, titulo, contato_id, funil_id, etapa_id, responsavel_id)
values ('f1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-00000000000a', 'P1a negócio com repasse pendente', 'e1000000-0000-4000-8000-000000000004',
        'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003');
insert into public.handoffs (empresa_id, negocio_id, contato_id, de_membro_id, para_membro_id, status_qualificacao, status)
values ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000004',
        'c1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', 'qualificado', 'pendente');

-- Tarefa já concluída no negócio principal (arquivar exige negócio sem tarefa aberta).
insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em, concluida_em, responsavel_id)
values ('b1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000001', 'Tarefa P1a concluída', now(), now(), 'c1000000-0000-4000-8000-000000000002');

commit;
select 'fixture ok' as resultado,
  (select count(*) from public.empresas) as empresas, (select count(*) from public.negocios) as negocios;
