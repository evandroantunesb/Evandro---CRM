-- Cenário dos testes v5: escolhido nos dados do banco LOCAL (sem IDs fixos), dentro da transação do teste.
-- Fica na tabela temporária `cen` (legível nos blocos DO e por todos os papéis) e nas variáveis psql (:neg etc.).
create temp table cen on commit drop as
with principal as (
  -- negócio com cálculo e sem proposta, de vendedor ativo, em empresa com SDR ativo
  select n.empresa_id, n.id as neg, m.user_id as vendedor, m.id as vendedor_membro
  from public.calculos_solares c
  join public.negocios n on n.id = c.negocio_id
  join public.empresa_membros m on m.id = n.responsavel_id and m.papel = 'vendedor' and m.status = 'ativo'
  where not exists (select 1 from public.propostas p where p.negocio_id = n.id)
    and exists (select 1 from public.empresa_membros s where s.empresa_id = n.empresa_id and s.papel = 'sdr' and s.status = 'ativo')
    -- como na v4: empresa sem identidade e sem modelo publicado (o teste de imagens cria a identidade e usa os
    -- blocos congelados na proposta)
    and not exists (select 1 from public.proposta_identidades i where i.empresa_id = n.empresa_id)
    and not exists (select 1 from public.proposta_modelos pm where pm.empresa_id = n.empresa_id and pm.status = 'publicado')
    -- v7: arquivar exige negócio sem tarefas abertas
    and not exists (select 1 from public.tarefas t where t.negocio_id = n.id and t.concluida_em is null)
  order by (select count(*) from public.kit_componentes k where k.negocio_id = n.id) desc, n.id
  limit 1
)
select p.empresa_id as empresa, p.neg, p.vendedor, p.vendedor_membro,
  (select s.user_id from public.empresa_membros s
    where s.empresa_id = p.empresa_id and s.papel = 'sdr' and s.status = 'ativo' order by s.id limit 1) as sdr,
  -- outro negócio da mesma empresa, sem proposta nem registros que já bloqueiem a exclusão hoje
  (select y.id from public.negocios y
    where y.empresa_id = p.empresa_id and y.id <> p.neg
      and not exists (select 1 from public.propostas x where x.negocio_id = y.id)
      and not exists (select 1 from public.contratos x where x.negocio_id = y.id)
      and not exists (select 1 from public.obras x where x.negocio_id = y.id)
      and not exists (select 1 from public.registros_pagamento x where x.negocio_id = y.id)
      and not exists (select 1 from public.confirmacoes_pagamento x where x.negocio_id = y.id)
      and not exists (select 1 from public.tarefas x where x.negocio_id = y.id and x.concluida_em is null)
    order by y.id limit 1) as neg_sem_versao,
  o.user_id as outro, o.id as outro_membro, o.empresa_id as empresa_outra,
  (select a.user_id from public.plataforma_admins a
    where not exists (select 1 from public.empresa_membros m where m.user_id = a.user_id and m.empresa_id = p.empresa_id)
    order by a.user_id limit 1) as superadmin,
  l.neg as neg_legado, l.vendedor as vendedor_legado
from principal p
cross join lateral (
  -- vendedor ativo de OUTRA empresa, que não é membro da empresa do cenário
  select m.user_id, m.id, m.empresa_id from public.empresa_membros m
  where m.empresa_id <> p.empresa_id and m.papel = 'vendedor' and m.status = 'ativo'
    and not exists (select 1 from public.empresa_membros x where x.user_id = m.user_id and x.empresa_id = p.empresa_id)
  order by m.id limit 1) o
cross join lateral (
  -- proposta legada: negócio com proposta e cálculo, de vendedor ativo
  select n.id as neg, m.user_id as vendedor from public.propostas pr
  join public.negocios n on n.id = pr.negocio_id
  join public.calculos_solares c on c.negocio_id = n.id
  join public.empresa_membros m on m.id = n.responsavel_id and m.papel = 'vendedor' and m.status = 'ativo'
  order by n.id limit 1) l;
grant select on cen to anon, authenticated, service_role;

select count(*) = 1 and bool_and(neg is not null and sdr is not null and neg_sem_versao is not null and outro is not null
       and superadmin is not null and neg_legado is not null) as cenario_completo from cen;
select quote_literal(empresa) as empresa, quote_literal(neg) as neg, quote_literal(vendedor) as vendedor,
       quote_literal(sdr) as sdr, quote_literal(neg_sem_versao) as neg_sem_versao, quote_literal(outro) as outro,
       quote_literal(outro_membro) as outro_membro, quote_literal(empresa_outra) as empresa_outra,
       quote_literal(superadmin) as superadmin, quote_literal(neg_legado) as neg_legado,
       quote_literal(vendedor_legado) as vendedor_legado
from cen \gset
