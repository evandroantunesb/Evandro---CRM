-- Confirmação da produtividade da calculadora (M2 P0). A geração estimada que a proposta mostra ao cliente é
-- potência do kit × `produtividade_kwh_kwp_mes` da empresa. O padrão (120) é uma simplificação nacional que a própria
-- migration original manda calibrar com o engenheiro responsável antes do uso com clientes. Para uma proposta emitida
-- poder mostrar a geração, o ADMIN da empresa precisa ter confirmado o valor atual informando o VALOR, a FONTE (de onde
-- ele vem) e o RESPONSÁVEL pela validação (quem o calibrou).
--
-- A confirmação vale enquanto a produtividade for igual ao valor confirmado: qualquer mudança no parâmetro a apaga
-- (gatilho). Só a função `confirmar_produtividade_calculadora` grava os campos de confirmação, e só se o valor
-- informado for o valor atual (o admin confirma o que viu). Migration aditiva: nenhum dado existente muda; todas as
-- empresas começam SEM confirmação (sem geração nas propostas emitidas até confirmarem).

alter table public.parametros_calculadora
  add column produtividade_confirmada_valor numeric(6, 2),
  add column produtividade_confirmada_em timestamptz,
  add column produtividade_confirmada_por uuid references public.empresa_membros (id) on delete set null,
  add column produtividade_confirmada_fonte text,
  add column produtividade_confirmada_responsavel text,
  add constraint produtividade_confirmada_completa check (
    (produtividade_confirmada_valor is null and produtividade_confirmada_em is null
      and produtividade_confirmada_fonte is null and produtividade_confirmada_responsavel is null)
    or (produtividade_confirmada_valor is not null and produtividade_confirmada_em is not null
        and produtividade_confirmada_fonte is not null and length(btrim(produtividade_confirmada_fonte)) between 10 and 120
        and produtividade_confirmada_responsavel is not null and length(btrim(produtividade_confirmada_responsavel)) between 3 and 60)
  );

-- Os campos de confirmação só mudam pela função (que liga a bandeira local) ou são apagados quando a produtividade muda.
create or replace function public.guardar_confirmacao_produtividade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.produtividade_kwh_kwp_mes is distinct from old.produtividade_kwh_kwp_mes then
    new.produtividade_confirmada_valor := null;
    new.produtividade_confirmada_em := null;
    new.produtividade_confirmada_por := null;
    new.produtividade_confirmada_fonte := null;
    new.produtividade_confirmada_responsavel := null;
    return new;
  end if;
  -- Apagar o membro que confirmou (ON DELETE SET NULL) só zera o autor; a confirmação em si continua. Vale só quando o
  -- membro já não existe: ninguém apaga o autor de uma confirmação válida por fora da função.
  if (new.produtividade_confirmada_valor, new.produtividade_confirmada_em, new.produtividade_confirmada_fonte, new.produtividade_confirmada_responsavel)
       is not distinct from
     (old.produtividade_confirmada_valor, old.produtividade_confirmada_em, old.produtividade_confirmada_fonte, old.produtividade_confirmada_responsavel)
     and old.produtividade_confirmada_por is not null and new.produtividade_confirmada_por is null
     and not exists (select 1 from public.empresa_membros m where m.id = old.produtividade_confirmada_por) then
    return new;
  end if;
  if (new.produtividade_confirmada_valor, new.produtividade_confirmada_em, new.produtividade_confirmada_por,
      new.produtividade_confirmada_fonte, new.produtividade_confirmada_responsavel)
       is distinct from
     (old.produtividade_confirmada_valor, old.produtividade_confirmada_em, old.produtividade_confirmada_por,
      old.produtividade_confirmada_fonte, old.produtividade_confirmada_responsavel)
     and coalesce(current_setting('raion.confirmando_produtividade', true), '') <> 'on' then
    raise exception 'A confirmação da produtividade só pode ser feita pela função de confirmação.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger parametros_calculadora_confirmacao
  before update on public.parametros_calculadora
  for each row execute function public.guardar_confirmacao_produtividade();

create or replace function public.confirmar_produtividade_calculadora(p_empresa_id uuid, p_valor numeric, p_fonte text, p_responsavel text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fonte text := nullif(btrim(p_fonte), '');
  v_responsavel text := nullif(btrim(p_responsavel), '');
  v_atual numeric;
begin
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o administrador da empresa confirma a produtividade.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_fonte is null or length(v_fonte) < 10 or length(v_fonte) > 120 then
    raise exception 'Informe a fonte do valor (de 10 a 120 caracteres), por exemplo o estudo de irradiação usado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_responsavel is null or length(v_responsavel) < 3 or length(v_responsavel) > 60 then
    raise exception 'Informe quem validou o valor (de 3 a 60 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Trava a linha: o valor lido aqui é o que será confirmado (sem corrida com quem muda a produtividade).
  select produtividade_kwh_kwp_mes into v_atual from public.parametros_calculadora where empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'Parâmetros da calculadora não encontrados.' using errcode = 'no_data_found', hint = 'mensagem_usuario';
  end if;
  -- O admin confirma o valor que viu: se ele mudou nesse meio tempo, a confirmação é recusada.
  if p_valor is null or round(p_valor, 2) <> round(v_atual, 2) then
    raise exception 'O valor informado não é o valor atual da produtividade. Recarregue a página e confirme de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform set_config('raion.confirmando_produtividade', 'on', true);
  update public.parametros_calculadora
     set produtividade_confirmada_valor = produtividade_kwh_kwp_mes,
         produtividade_confirmada_em = now(),
         produtividade_confirmada_por = public.meu_membro_id(p_empresa_id),
         produtividade_confirmada_fonte = v_fonte,
         produtividade_confirmada_responsavel = v_responsavel
   where empresa_id = p_empresa_id;
end;
$$;
revoke all on function public.confirmar_produtividade_calculadora(uuid, numeric, text, text) from public, anon;
grant execute on function public.confirmar_produtividade_calculadora(uuid, numeric, text, text) to authenticated;
