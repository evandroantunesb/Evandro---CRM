-- PR A: travas de segurança no banco (aprovado pelo Evandro em 2026-10-08).
-- Até aqui as duas regras abaixo existiam só no app; pelo Supabase direto davam para contornar.
--
-- 1) Kit com cálculo solar salvo nunca fica vazio. Mesmo critério do app (só a lista vazia é
--    barrada; kit parcialmente esvaziado continua permitido). Vale para todos, inclusive o
--    acesso de serviço: é integridade do dado, não permissão. Continuam livres: apagar o
--    cálculo e depois o kit, e excluir o negócio inteiro (cascata).
-- 2) SDR não fecha, não reabre e não muda o valor do negócio (spec RAION_SDR_REGRAS_PERMISSOES
--    §39): status, motivo de perda e valor. Mover de etapa continua livre, exceto quando a
--    etapa fecha sozinha. Sem usuário logado (serviço, rotinas), não há ator a conferir.
--
-- Sem alteração de dados, de policies ou de outras funções. Reversão: migration nova que
-- remove os 2 gatilhos e as 2 funções (nenhum dado a restaurar).

-- ---------------------------------------------------------------------------
-- 1) Kit com cálculo nunca vazio
-- ---------------------------------------------------------------------------

-- Gatilho AFTER por linha, não adiado: o Postgres o executa no fim de cada instrução, já com
-- todas as linhas dela aplicadas (ex.: apagar vários itens de uma vez confere o resultado
-- final). Não é adiado para o COMMIT de propósito: erro levantado no COMMIT não chega de forma
-- confiável ao cliente pela API do Supabase. Cada chamada do app é uma instrução, e cada
-- estado entre chamadas precisa ser válido — por isso o app grava os itens novos antes de
-- apagar os antigos (e a restauração reinsere antes de apagar).
--
-- Concorrência: duas transações apagando conjuntos diferentes do mesmo kit enxergariam,
-- cada uma, os itens da outra ainda presentes (não confirmados) e passariam as duas. A trava
-- da linha do negócio (FOR NO KEY UPDATE) serializa as conferências por negócio: a segunda
-- espera a primeira terminar e, em READ COMMITTED, a consulta seguinte já vê o que a primeira
-- apagou. FOR NO KEY UPDATE não conflita com a FOR KEY SHARE que a inserção de itens toma no
-- negócio (chave estrangeira), então gravar itens não espera.
create or replace function public.kit_com_calculo_nao_esvazia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.negocio_id is not distinct from old.negocio_id then
    return null;
  end if;

  perform 1 from public.negocios where id = old.negocio_id for no key update;
  if not found then
    return null; -- negócio excluído (cascata leva kit e cálculo juntos)
  end if;

  if exists (select 1 from public.calculos_solares where negocio_id = old.negocio_id)
     and not exists (select 1 from public.kit_componentes where negocio_id = old.negocio_id) then
    raise exception 'Este kit tem cálculo solar salvo e não pode ficar sem equipamentos. Para trocar o kit, salve os novos itens com a tarifa. Nada foi alterado.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return null;
end;
$$;

revoke all on function public.kit_com_calculo_nao_esvazia() from public, anon, authenticated, service_role;

create trigger kit_componentes_com_calculo_nao_esvazia
  after delete or update of negocio_id on public.kit_componentes
  for each row execute function public.kit_com_calculo_nao_esvazia();

-- ---------------------------------------------------------------------------
-- 2) SDR não fecha, não reabre e não muda o valor
-- ---------------------------------------------------------------------------

-- BEFORE UPDATE com nome posterior a negocios_preparar (gatilhos BEFORE rodam em ordem
-- alfabética): enxerga o status final, inclusive o fechamento automático por etapa
-- (etapas.fecha_como). A exceção desfaz a instrução inteira (etapa, motivo padrão criado
-- pelo preparar_negocio etc.). O papel é lido direto em empresa_membros, sem exigir membro
-- ativo: quem não está ativo já não passa pela RLS.
create or replace function public.travar_fechamento_sdr()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.status is not distinct from old.status
     and new.motivo_perda_id is not distinct from old.motivo_perda_id
     and new.motivo_perda_detalhe is not distinct from old.motivo_perda_detalhe
     and new.valor is not distinct from old.valor then
    return new;
  end if;
  if exists (
    select 1 from public.empresa_membros m
    where m.empresa_id = new.empresa_id
      and m.user_id = (select auth.uid())
      and m.papel = 'sdr'
  ) then
    raise exception 'SDR não pode fechar, reabrir nem alterar o valor do negócio. Use "Enviar para vendas".'
      using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

revoke all on function public.travar_fechamento_sdr() from public, anon, authenticated, service_role;

create trigger negocios_travar_fechamento_sdr
  before update on public.negocios
  for each row execute function public.travar_fechamento_sdr();
