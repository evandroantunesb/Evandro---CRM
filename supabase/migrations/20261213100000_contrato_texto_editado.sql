-- Contrato: conferir, editar e enviar (prévia aprovada pelo Evandro em 18/11/2026; desenho em
-- docs/superpowers/specs/2026-11-18-contrato-conferir-editar-design.md).
--
--  1. `contratos.texto_editado_em` / `texto_editado_por`: a marca "texto editado à mão". Só o banco a mantém
--     (gatilho `contratos_texto_editado`): liga quando o texto muda por `editar_texto_contrato`, some quando muda por
--     qualquer outro caminho ("Gerar novamente") e nunca muda por update direto.
--  2. O texto do contrato só muda em rascunho, para qualquer usuário do app (antes só a geração conferia).
--  3. `editar_texto_contrato`: o vendedor responsável, o gestor que vê o negócio e o admin ajustam o texto do
--     rascunho; registra a atividade `contrato_texto_editado`. Valor, pontos e comissão continuam vindo do negócio.
--  4. `negocios.endereco_instalacao`: onde o sistema será instalado, quando não é o endereço do cliente.
--
-- Depende de: meu_membro_id, tem_papel, pode_ver_financeiro_negocio.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------

alter table public.contratos
  add column texto_editado_em timestamptz,
  add column texto_editado_por uuid references public.empresa_membros (id) on delete set null;
create index on public.contratos (texto_editado_por);

alter table public.negocios
  add column endereco_instalacao text,
  add constraint negocios_endereco_instalacao_tamanho check (char_length(endereco_instalacao) <= 300);

-- ---------------------------------------------------------------------------
-- 2. Marca "editado à mão" e trava do texto fora do rascunho
-- ---------------------------------------------------------------------------

create or replace function public.contratos_texto_editado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.texto_editado_em := null;
    new.texto_editado_por := null;
    return new;
  end if;

  if new.conteudo is not distinct from old.conteudo then
    new.texto_editado_em := old.texto_editado_em;
    new.texto_editado_por := old.texto_editado_por;
    return new;
  end if;

  -- Usuário do app = papel `authenticated` no JWT (mesma regra de contratos_exigir_dados_cliente).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
     and old.status <> 'rascunho' then
    raise exception 'O texto só muda com o contrato em rascunho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if coalesce(current_setting('raion.contrato_edicao_manual', true), '') = 'on' then
    new.texto_editado_em := now();
    new.texto_editado_por := public.meu_membro_id(new.empresa_id);
  else
    new.texto_editado_em := null;
    new.texto_editado_por := null;
  end if;
  return new;
end;
$$;
revoke all on function public.contratos_texto_editado() from public, anon, authenticated;

create trigger contratos_texto_editado before insert or update on public.contratos
  for each row execute function public.contratos_texto_editado();

-- ---------------------------------------------------------------------------
-- 3. Edição do texto
-- ---------------------------------------------------------------------------

create or replace function public.editar_texto_contrato(p_negocio_id uuid, p_conteudo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_responsavel uuid;
  v_contato uuid;
  v_eu uuid;
begin
  select c.* into v_contrato from public.contratos c where c.negocio_id = p_negocio_id for update;
  if not found or not public.pode_ver_financeiro_negocio(p_negocio_id) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  select n.responsavel_id, n.contato_id into v_responsavel, v_contato from public.negocios n where n.id = p_negocio_id;
  v_eu := public.meu_membro_id(v_contrato.empresa_id);
  if v_eu is null
     or not (public.tem_papel(v_contrato.empresa_id, '{admin,gestor}')
             or (v_responsavel = v_eu and public.tem_papel(v_contrato.empresa_id, '{vendedor}'))) then
    raise exception 'Sem permissão para editar o texto deste contrato.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if v_contrato.status <> 'rascunho' then
    raise exception 'O texto só muda com o contrato em rascunho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_conteudo is null or btrim(p_conteudo, e' \t\r\n') = '' then
    raise exception 'O texto do contrato não pode ficar vazio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if char_length(p_conteudo) > 60000 then
    raise exception 'O texto do contrato passou do limite de 60.000 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if strpos(p_conteudo, '{{') > 0 or strpos(p_conteudo, '}}') > 0 then
    raise exception 'Tire as chaves {{ ou }} do texto antes de salvar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_conteudo = v_contrato.conteudo then
    return;
  end if;

  perform set_config('raion.contrato_edicao_manual', 'on', true);
  update public.contratos set conteudo = p_conteudo, atualizado_por = v_eu where id = v_contrato.id;
  perform set_config('raion.contrato_edicao_manual', '', true);

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
  values (v_contrato.empresa_id, p_negocio_id, v_contato, 'contrato_texto_editado', (select auth.uid()),
          jsonb_build_object('contrato_id', v_contrato.id));
end;
$$;
revoke all on function public.editar_texto_contrato(uuid, text) from public, anon, authenticated;
grant execute on function public.editar_texto_contrato(uuid, text) to authenticated;

reset lock_timeout;
