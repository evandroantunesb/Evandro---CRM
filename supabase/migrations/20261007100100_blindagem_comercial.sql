-- PR 3b-1: blindagem comercial no banco para um 5º papel (`operacao`).
-- Aprovado pelo Evandro em 2026-10-07. O papel `operacao` (20261007100000_papel_operacao.sql)
-- nasce SEM acesso ao domínio comercial, nem direto pelo Supabase: negócios, contatos,
-- tarefas, handoffs, proposta, contrato, calculadora/kit, configuração comercial (funis,
-- etapas, origens, etiquetas, motivos, preços, modelos, formulários), equipes, metas,
-- comissões e gamificação. Ele vê só a própria empresa, a própria linha de membro e o
-- próprio perfil. Os 4 papéis atuais (admin, gestor, vendedor, sdr) mantêm o acesso.
--
-- Também nesta PR:
-- - negócio, tarefa e handoff só apontam para membro com papel comercial da mesma empresa;
--   handoff exige negócio, contato e membros da mesma empresa;
-- - tarefa: só admin/gestor reatribuem a terceiros (vendedor/SDR podem assumir para si e
--   continuar concluindo tarefa de terceiro no contexto do próprio negócio);
-- - ranking: `papel not in ('admin','gestor')` vira lista positiva `in ('vendedor','sdr')`.
-- Sem mudança de regra, pontuação ou tela de gamificação. Obras ficam para a 3b-2.

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

-- Quem usa o domínio comercial. Lista positiva: papel novo não entra por exclusão.
create or replace function public.tem_acesso_comercial(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{admin,gestor,vendedor,sdr}');
$$;

-- O membro (alvo de responsável/destinatário) é da empresa informada, está ativo e tem
-- papel comercial. INTERNA: só os gatilhos abaixo a chamam (rodam como dono). Fechada a
-- todos os clientes para não virar consulta de membros de outras empresas.
create or replace function public.e_membro_comercial(p_empresa_id uuid, p_membro_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.empresa_membros
    where id = p_membro_id
      and empresa_id = p_empresa_id
      and ativo
      and papel = any ('{admin,gestor,vendedor,sdr}'::public.papel_membro[])
  );
$$;

-- tem_acesso_comercial é usada direto nas policies: só `authenticated` executa.
revoke all on function public.tem_acesso_comercial(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tem_acesso_comercial(uuid) to authenticated;
revoke all on function public.e_membro_comercial(uuid, uuid) from public, anon, authenticated, service_role;

-- Base da RLS comercial. Igual à anterior, mas quem consulta precisa ter papel comercial:
-- `operacao` não vê nada nem sendo marcado responsável ou gestor de equipe.
create or replace function public.pode_ver_responsavel(p_empresa_id uuid, p_responsavel_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with eu as (
    select m.id, m.papel
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    where m.empresa_id = p_empresa_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and e.situacao = 'ativa'
      and m.papel = any ('{admin,gestor,vendedor,sdr}'::public.papel_membro[])
  )
  select exists (
    select 1 from eu
    where eu.papel = 'admin'
       or eu.id = p_responsavel_id
       or (p_responsavel_id is null and eu.papel = 'gestor')
       or exists (
         select 1
         from public.equipe_membros minha
         join public.equipe_membros dele on dele.equipe_id = minha.equipe_id
         join public.equipes eq on eq.id = minha.equipe_id and eq.ativa
         where minha.membro_id = eu.id
           and minha.e_gestor
           and dele.membro_id = p_responsavel_id
       )
  );
$$;

create or replace function public.pode_ver_contato_linha(p_empresa_id uuid, p_contato_id uuid, p_criado_por uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_acesso_comercial(p_empresa_id)
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or p_criado_por = public.meu_membro_id(p_empresa_id)
      or exists (
        select 1 from public.negocios n
        where n.contato_id = p_contato_id
          and (public.pode_ver_responsavel(n.empresa_id, n.responsavel_id) or public.e_closer_de_handoff_pendente(n.id))
      )
    );
$$;

-- Joins explícitos handoff → negócio → membro, todos na mesma empresa: segura também
-- diante de dado legado inconsistente (o gatilho validar_handoff_empresa só cobre inserts novos).
create or replace function public.e_closer_de_handoff_pendente(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.handoffs h
    join public.negocios n on n.id = h.negocio_id and n.empresa_id = h.empresa_id
    join public.empresa_membros m on m.id = h.para_membro_id and m.empresa_id = h.empresa_id
    where h.negocio_id = p_negocio_id
      and h.status = 'pendente'
      and m.user_id = (select auth.uid())
      and m.ativo
      and m.papel = any ('{admin,gestor,vendedor,sdr}'::public.papel_membro[])
  );
$$;

-- Perfis (nome, e-mail, telefone) dos colegas: só para quem tem papel comercial na empresa
-- em comum. `operacao` vê só o próprio perfil (primeira condição da policy de perfis);
-- vale também para a leitura de avatares (pode_ver_avatar usa esta função).
create or replace function public.compartilha_empresa(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros meu
    join public.empresa_membros outro on outro.empresa_id = meu.empresa_id
    where meu.user_id = (select auth.uid())
      and meu.ativo
      and meu.papel = any ('{admin,gestor,vendedor,sdr}'::public.papel_membro[])
      and outro.user_id = p_user_id
  );
$$;

-- Ranking: lista positiva de quem compete e só quem tem acesso comercial consulta.
-- Mesmo resultado de antes para os papéis atuais; nenhuma regra/pontuação muda.
create or replace function public.ranking_gamificacao(
  p_empresa_id uuid,
  p_perfil public.perfil_gamificacao,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns table (membro_id uuid, total_xp bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.xp)::bigint as total_xp
  from public.point_ledger l
  join public.empresa_membros m on m.id = l.membro_id
  where l.empresa_id = p_empresa_id
    and l.profile_at_event = p_perfil
    and (p_desde is null or l.created_at >= p_desde)
    and (p_ate is null or l.created_at < p_ate)
    and (
      case when p_ate is null
        then not l.estornado
        else (l.estornado_em is null or l.estornado_em > p_ate)
      end
    )
    and public.tem_acesso_comercial(p_empresa_id)
    and m.papel in ('vendedor', 'sdr')
  group by l.membro_id
  order by total_xp desc;
$$;

-- ---------------------------------------------------------------------------
-- Responsáveis comerciais e reatribuição de tarefa
-- (gatilhos separados, sem redefinir preparar_negocio/preparar_tarefa; o nome faz
-- rodarem depois de negocios_preparar/tarefas_preparar, que preenchem o responsável)
-- ---------------------------------------------------------------------------

create or replace function public.exigir_responsavel_comercial()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.responsavel_id is not null
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id)
     and not public.e_membro_comercial(new.empresa_id, new.responsavel_id) then
    raise exception 'O responsável precisa ter papel comercial (admin, gestor, vendedor ou SDR).'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger negocios_responsavel_comercial
  before insert or update on public.negocios
  for each row execute function public.exigir_responsavel_comercial();

create trigger tarefas_responsavel_comercial
  before insert or update on public.tarefas
  for each row execute function public.exigir_responsavel_comercial();

-- Reatribuir tarefa a terceiro é poder de gestão. Vendedor/SDR podem assumir a tarefa para
-- si; concluir tarefa de terceiro (sem trocar o responsável) continua livre. Sem usuário
-- logado (sistema/script), não há ator a conferir.
create or replace function public.restringir_reatribuicao_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
begin
  if new.responsavel_id is distinct from old.responsavel_id
     and (select auth.uid()) is not null
     and new.responsavel_id is distinct from v_eu
     and not public.tem_papel(new.empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor podem atribuir a tarefa a outra pessoa.'
      using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger tarefas_restringir_reatribuicao
  before update on public.tarefas
  for each row execute function public.restringir_reatribuicao_tarefa();

-- Handoff: tudo da mesma empresa. Negócio da empresa do handoff, contato desse negócio,
-- destinatário e remetente (se houver) membros ativos e comerciais da mesma empresa.
-- Mantém os 4 papéis comerciais como destinatários possíveis.
create or replace function public.validar_handoff_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_contato uuid;
begin
  select contato_id into v_contato from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id;
  if not found then
    raise exception 'Negócio de outra empresa.' using errcode = 'check_violation';
  end if;
  if new.contato_id is distinct from v_contato then
    raise exception 'O contato do handoff precisa ser o contato do negócio.' using errcode = 'check_violation';
  end if;
  if not public.e_membro_comercial(new.empresa_id, new.para_membro_id) then
    raise exception 'O destinatário precisa ser um membro ativo da empresa com papel comercial.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if new.de_membro_id is not null and not public.e_membro_comercial(new.empresa_id, new.de_membro_id) then
    raise exception 'O remetente precisa ser um membro ativo da empresa com papel comercial.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger handoffs_validar_empresa
  before insert on public.handoffs
  for each row execute function public.validar_handoff_empresa();

revoke all on function public.exigir_responsavel_comercial() from public, anon, authenticated, service_role;
revoke all on function public.restringir_reatribuicao_tarefa() from public, anon, authenticated, service_role;
revoke all on function public.validar_handoff_empresa() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Membros da empresa: `operacao` vê só a própria linha
-- (empresas continua com membro_ativo: cada um lê a empresa da qual participa)
-- ---------------------------------------------------------------------------

drop policy "ver membros da empresa" on public.empresa_membros;
create policy "ver membros da empresa" on public.empresa_membros for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.tem_acesso_comercial(empresa_id)
    or public.e_plataforma_admin()
  );

-- ---------------------------------------------------------------------------
-- Policies comerciais: membro_ativo() → tem_acesso_comercial()
-- (texto de cada policy igual ao estado atual, só a função trocada; em handoffs e
-- handoffs_feedback, o EXISTS também exige a mesma empresa, com a coluna da tabela
-- qualificada: sem isso, `empresa_id` dentro do subselect resolve para a tabela interna)
-- ---------------------------------------------------------------------------

-- public.anexos
drop policy "enviar anexos" on public.anexos;
create policy "enviar anexos" on public.anexos for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.calculos_solares
drop policy "criar cálculo" on public.calculos_solares;
create policy "criar cálculo" on public.calculos_solares for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.conquistas
drop policy "ver conquistas" on public.conquistas;
create policy "ver conquistas" on public.conquistas for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.contatos
drop policy "criar contatos" on public.contatos;
create policy "criar contatos" on public.contatos for insert to authenticated with check (public.tem_acesso_comercial(empresa_id));
drop policy "editar contatos" on public.contatos;
create policy "editar contatos" on public.contatos for update to authenticated using (public.pode_ver_contato_linha(empresa_id, id, criado_por)) with check (public.tem_acesso_comercial(empresa_id));

-- public.contratos
drop policy "criar contrato" on public.contratos;
create policy "criar contrato" on public.contratos for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.equipe_membros
drop policy "ver composição das equipes" on public.equipe_membros;
create policy "ver composição das equipes" on public.equipe_membros for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.equipes
drop policy "ver equipes da empresa" on public.equipes;
create policy "ver equipes da empresa" on public.equipes for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.etapas
drop policy "ver etapas" on public.etapas;
create policy "ver etapas" on public.etapas for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.etiquetas
drop policy "ver etiquetas" on public.etiquetas;
create policy "ver etiquetas" on public.etiquetas for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.formularios
drop policy "ver formularios" on public.formularios;
create policy "ver formularios" on public.formularios for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.funis
drop policy "ver funis" on public.funis;
create policy "ver funis" on public.funis for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.handoffs
drop policy "handoffs: criar quem vê o negócio" on public.handoffs;
create policy "handoffs: criar quem vê o negócio" on public.handoffs for insert to authenticated with check ( public.tem_acesso_comercial(empresa_id) and exists ( select 1 from public.negocios n where n.id = negocio_id and n.empresa_id = handoffs.empresa_id and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id) ) );
drop policy "handoffs: ver quem vê o negócio" on public.handoffs;
create policy "handoffs: ver quem vê o negócio" on public.handoffs for select to authenticated using ( public.tem_acesso_comercial(empresa_id) and exists ( select 1 from public.negocios n where n.id = negocio_id and n.empresa_id = handoffs.empresa_id and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id) ) );

-- public.handoffs_feedback
drop policy "handoffs_feedback: criar quem recebeu o handoff" on public.handoffs_feedback;
create policy "handoffs_feedback: criar quem recebeu o handoff" on public.handoffs_feedback for insert to authenticated with check ( public.tem_acesso_comercial(empresa_id) and autor_id = public.meu_membro_id(empresa_id) and exists ( select 1 from public.handoffs h where h.id = handoff_id and h.empresa_id = handoffs_feedback.empresa_id and h.para_membro_id = autor_id ) );
drop policy "handoffs_feedback: editar o próprio" on public.handoffs_feedback;
create policy "handoffs_feedback: editar o próprio" on public.handoffs_feedback for update to authenticated using (public.tem_acesso_comercial(empresa_id) and autor_id = public.meu_membro_id(empresa_id)) with check (public.tem_acesso_comercial(empresa_id) and autor_id = public.meu_membro_id(empresa_id));
drop policy "handoffs_feedback: ver admin/gestor ou o próprio autor" on public.handoffs_feedback;
create policy "handoffs_feedback: ver admin/gestor ou o próprio autor" on public.handoffs_feedback for select to authenticated using ( public.tem_acesso_comercial(empresa_id) and (public.tem_papel(empresa_id, '{admin,gestor}') or autor_id = public.meu_membro_id(empresa_id)) );

-- public.kit_componentes
drop policy "gerenciar componentes do kit" on public.kit_componentes;
create policy "gerenciar componentes do kit" on public.kit_componentes for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.kits_solares
drop policy "ver kits" on public.kits_solares;
create policy "ver kits" on public.kits_solares for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.modelos_contrato
drop policy "ver modelo de contrato" on public.modelos_contrato;
create policy "ver modelo de contrato" on public.modelos_contrato for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.motivos_perda
drop policy "ver motivos" on public.motivos_perda;
create policy "ver motivos" on public.motivos_perda for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.negocios
drop policy "criar negócios" on public.negocios;
create policy "criar negócios" on public.negocios for insert to authenticated with check ( public.tem_acesso_comercial(empresa_id) and (responsavel_id is null or public.pode_ver_responsavel(empresa_id, responsavel_id)) );

-- public.niveis_gamificacao
drop policy "ver niveis" on public.niveis_gamificacao;
create policy "ver niveis" on public.niveis_gamificacao for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.notas
drop policy "criar notas" on public.notas;
create policy "criar notas" on public.notas for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.origens
drop policy "ver origens" on public.origens;
create policy "ver origens" on public.origens for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.parametros_calculadora
drop policy "ver parâmetros" on public.parametros_calculadora;
create policy "ver parâmetros" on public.parametros_calculadora for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.proposta_identidades
drop policy "ver identidade da proposta" on public.proposta_identidades;
create policy "ver identidade da proposta" on public.proposta_identidades for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.proposta_modelo_blocos
drop policy "ver blocos de proposta" on public.proposta_modelo_blocos;
create policy "ver blocos de proposta" on public.proposta_modelo_blocos for select to authenticated using (exists ( select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_acesso_comercial(m.empresa_id) and (m.status = 'publicado' or public.tem_papel(m.empresa_id, '{admin}')) ));

-- public.proposta_modelos
drop policy "ver modelos de proposta" on public.proposta_modelos;
create policy "ver modelos de proposta" on public.proposta_modelos for select to authenticated using (public.tem_acesso_comercial(empresa_id) and (status = 'publicado' or public.tem_papel(empresa_id, '{admin}')));

-- public.propostas
drop policy "criar proposta" on public.propostas;
create policy "criar proposta" on public.propostas for insert to authenticated with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));

-- public.recompensas
drop policy "membro ve catalogo de recompensas" on public.recompensas;
create policy "membro ve catalogo de recompensas" on public.recompensas for select to authenticated using (public.tem_acesso_comercial(empresa_id));

-- public.tarefas
drop policy "criar tarefas" on public.tarefas;
create policy "criar tarefas" on public.tarefas for insert to authenticated with check ( public.tem_acesso_comercial(empresa_id) and responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id) and (negocio_id is null or public.pode_ver_negocio(negocio_id)) );
drop policy "editar tarefas" on public.tarefas;
create policy "editar tarefas" on public.tarefas for update to authenticated using ( public.tem_acesso_comercial(empresa_id) and ( (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id)) or (negocio_id is not null and public.pode_ver_negocio(negocio_id)) ) ) with check ( public.tem_acesso_comercial(empresa_id) and ( (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id)) or (negocio_id is not null and public.pode_ver_negocio(negocio_id)) ) );
drop policy "ver tarefas" on public.tarefas;
create policy "ver tarefas" on public.tarefas for select to authenticated using ( public.tem_acesso_comercial(empresa_id) and ( (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id)) or (negocio_id is not null and public.pode_ver_negocio(negocio_id)) ) );

-- storage.objects
drop policy "marca: ler" on storage.objects;
create policy "marca: ler" on storage.objects for select to authenticated using (bucket_id = 'proposta-marca' and public.tem_acesso_comercial(public.empresa_da_pasta_marca(name)));
drop policy "recompensas: ler" on storage.objects;
create policy "recompensas: ler" on storage.objects for select to authenticated using (bucket_id = 'recompensas' and public.tem_acesso_comercial(public.empresa_da_pasta_marca(name)));
