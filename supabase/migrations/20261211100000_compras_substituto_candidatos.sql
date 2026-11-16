-- Compras: o setor que atende no lugar dele também é candidato e recebe as tarefas (Perfis e setores, pendência do 2c).
--
-- Decisões do Evandro (16/11/2026), sobre a regra de 05/11 ("o setor que atende Compras vale só enquanto ninguém ativo
-- tiver o setor Compras"):
--  1. Autorização nas obras: a perda do substituto quando alguém entra em Compras continua (é a regra). Nada muda em
--     `autorizacao_setor_obra`.
--  2. Candidatos a participante e tarefas do setor Compras: enquanto a regra valer, quem atua no setor que atende no
--     lugar de Compras (`setor_atende_compras`) entra na lista de candidatos e pode ser responsável por tarefa de
--     Compras. Com alguém ativo em Compras, só ele; sem escolha do admin (nulo), ninguém.
--
-- Como: o mesmo mapeamento que `autorizacao_setor_obra` já faz (setor Compras -> `setor_atende_compras`) passa a valer
-- em `membro_atua_no_setor` (responsável de tarefa, tarefas automáticas, participante) e em `membros_do_setor` (lista
-- de candidatos). Os demais setores não mudam. Corpos de 20261029210000_tarefas_setor.sql e
-- 20261122100000_gestor_escreve_setores.sql.
--
-- Depende de: setor_atende_compras (20261125100000), tem_papel, meu_membro_id.

set lock_timeout = '5s';

-- Membro ativo de Operação que atua no setor (executar ou coordenar). Em Compras, o setor que atende no lugar dele.
create or replace function public.membro_atua_no_setor(p_empresa_id uuid, p_membro_id uuid, p_setor public.setor_obra)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros m
    join public.membro_setores_obra s on s.empresa_id = m.empresa_id and s.membro_id = m.id
      and s.setor = case when p_setor = 'compras' then public.setor_atende_compras(p_empresa_id) else p_setor end
    where m.id = p_membro_id and m.empresa_id = p_empresa_id and m.ativo and m.papel = 'operacao'
  );
$$;
revoke all on function public.membro_atua_no_setor(uuid, uuid, public.setor_obra) from public, anon, authenticated, service_role;

-- Quem atua no setor (para escolher o responsável de tarefa ou o participante da obra): admin, gestor ou o
-- coordenador do setor recebem a lista. Em Compras, o setor que atende no lugar dele (sem ninguém em Compras).
create or replace function public.membros_do_setor(p_empresa_id uuid, p_setor public.setor_obra)
returns table (membro_id uuid, capacidade public.capacidade_obra)
language sql stable security definer set search_path = ''
as $$
  select s.membro_id, s.capacidade
  from public.membro_setores_obra s
  join public.empresa_membros m on m.id = s.membro_id and m.empresa_id = s.empresa_id and m.ativo and m.papel = 'operacao'
  where s.empresa_id = p_empresa_id
    and s.setor = case when p_setor = 'compras' then public.setor_atende_compras(p_empresa_id) else p_setor end
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or exists (
        select 1 from public.membro_setores_obra eu
        where eu.empresa_id = p_empresa_id and eu.membro_id = public.meu_membro_id(p_empresa_id)
          and eu.setor = case when p_setor = 'compras' then public.setor_atende_compras(p_empresa_id) else p_setor end
          and eu.capacidade = 'coordenar'
      )
    )
  order by s.membro_id;
$$;

reset lock_timeout;
