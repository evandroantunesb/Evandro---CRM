-- Cálculo solar gravado só pelo servidor (M2 P0, revisão da calculadora GD II; Evandro, 23/10/2026).
--
-- Brecha fechada: as policies "criar cálculo"/"editar cálculo" deixavam qualquer membro que vê o negócio gravar, pelo
-- PostgREST, qualquer coluna de `calculos_solares`: economia, contas, método, percentual, fonte tarifária, autoria e
-- o estado `completo` (ou uma linha `legado` com economia). Provado em .aurora/revisao/calc-gd2/logs/19*.log.
--
-- Mecanismo (o menor que mantém um motor só, em TypeScript, src/lib/calculadora.ts):
--   1) `authenticated` perde INSERT e UPDATE na tabela: fica na migration 20261023240000 (CONTRAÇÃO), aplicada só
--      depois que a versão do app que grava pelo servidor estiver no ar. Esta migration só ACRESCENTA (RPC e trigger)
--      e é compatível com a versão anterior do app, que ainda grava direto (linhas `legado`; nunca `completo`).
--   2) `autorizar_gravacao_calculo(negocio)`: chamada com a sessão do usuário, só CONFERE (acesso comercial à empresa
--      do negócio, ver o negócio, negócio não arquivado) e devolve a empresa e o membro da sessão (autoria real). Não
--      grava nada e não recebe valor nenhum.
--   3) O servidor (src/lib/calculo-gravacao.ts) grava com a service role a linha que ELE montou pelo motor, com as
--      entradas validadas e a referência tarifária lida da tabela oficial; empresa e autoria vêm do passo 2.
--   4) Defesa no banco, para qualquer escritor (inclusive a service role): linha `completo` só com o método aceito e
--      o retrato igual à linha oficial de `tarifas_gd_aneel` (fonte, Fio B, base, vigência, enquadramento), o
--      percentual legal do ano da data de referência e o piso do art. 291 da ligação. Não refaz a conta (isso
--      duplicaria o motor); confere que a REFERÊNCIA usada é a autorizada.

-- ---------------------------------------------------------------------------
-- 2) Autorização (sem escrita)
-- ---------------------------------------------------------------------------
create or replace function public.autorizar_gravacao_calculo(p_negocio_id uuid)
returns table (empresa_id uuid, membro_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_arquivado timestamptz;
  v_membro uuid;
begin
  select n.empresa_id, n.arquivado_em into v_empresa, v_arquivado from public.negocios n where n.id = p_negocio_id;
  if v_empresa is null
     or not public.tem_acesso_comercial(v_empresa)
     or not public.pode_ver_negocio(p_negocio_id) then
    raise exception 'Sem permissão para gravar o cálculo deste negócio.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  if v_arquivado is not null then
    raise exception 'Negócio arquivado: o cálculo é só leitura.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  v_membro := public.meu_membro_id(v_empresa);
  if v_membro is null then
    raise exception 'Sem permissão para gravar o cálculo deste negócio.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  return query select v_empresa, v_membro;
end;
$$;
revoke all on function public.autorizar_gravacao_calculo(uuid) from public, anon, authenticated, service_role;
grant execute on function public.autorizar_gravacao_calculo(uuid) to authenticated;
comment on function public.autorizar_gravacao_calculo(uuid) is
  'Só confere: o usuário da sessão pode gravar o cálculo deste negócio (acesso comercial, vê o negócio, não arquivado). Devolve empresa e membro (autoria). Não grava.';

-- ---------------------------------------------------------------------------
-- 4) Linha `completo` só com a referência oficial
-- ---------------------------------------------------------------------------
create or replace function public.calculos_solares_conferir_referencia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tarifas_gd_aneel%rowtype;
begin
  if new.estado_financeiro is distinct from 'completo' then
    return new;
  end if;
  -- Num UPDATE que não toca o retrato (preço, marca de desatualização, observações), não reconfere.
  if tg_op = 'UPDATE' and old.estado_financeiro = 'completo'
     and (new.metodo_calculo, new.tarifa_gd_id, new.distribuidora, new.enquadramento, new.fio_b_rs_mwh,
          new.fio_b_base_tributaria, new.fio_b_vigencia_inicio, new.fio_b_vigencia_fim, new.percentual_legal_fio_b,
          new.data_referencia, new.disponibilidade_kwh, new.tipo_ligacao, new.tarifa_kwh, new.tarifa_origem,
          new.tarifa_base_tributaria)
     is not distinct from
         (old.metodo_calculo, old.tarifa_gd_id, old.distribuidora, old.enquadramento, old.fio_b_rs_mwh,
          old.fio_b_base_tributaria, old.fio_b_vigencia_inicio, old.fio_b_vigencia_fim, old.percentual_legal_fio_b,
          old.data_referencia, old.disponibilidade_kwh, old.tipo_ligacao, old.tarifa_kwh, old.tarifa_origem,
          old.tarifa_base_tributaria) then
    return new;
  end if;

  select * into t from public.tarifas_gd_aneel where id = new.tarifa_gd_id;
  if not found
     -- Método aceito (src/lib/fio-b-gd2.ts, METODO_GD2_PISO_V1).
     or new.metodo_calculo is distinct from 'gd2_piso_655i_v1'
     or new.distribuidora is distinct from t.distribuidora
     or new.enquadramento is distinct from (t.subgrupo || '/' || t.subclasse || '/' || t.modalidade || '/GD_II')
     or new.fio_b_rs_mwh is distinct from t.tusd_fio_b_rs_mwh
     or new.fio_b_base_tributaria is distinct from t.base_tributaria
     or new.fio_b_vigencia_inicio is distinct from t.vigencia_inicio
     or new.fio_b_vigencia_fim is distinct from t.vigencia_fim
     or new.data_referencia not between t.vigencia_inicio and t.vigencia_fim
     -- Percentual legal do ano (Lei 14.300, art. 27; src/lib/tarifa-gd.ts, PERCENTUAL_LEGAL_FIO_B_GD2).
     or new.percentual_legal_fio_b is distinct from (case extract(year from new.data_referencia)::int when 2026 then 0.6 when 2027 then 0.75 end)
     -- Piso do art. 291 da REN 1.000 pela ligação (src/lib/tarifa-gd.ts, DISPONIBILIDADE_ART_291).
     or new.disponibilidade_kwh is distinct from (case new.tipo_ligacao when 'monofasico' then 30 when 'bifasico' then 50 when 'trifasico' then 100 end)
     -- "Oficial" só quando a tarifa é exatamente TE + TUSD da linha (5 casas).
     or (new.tarifa_origem = 'oficial_aneel' and new.tarifa_kwh is distinct from round((t.te_rs_mwh + t.tusd_rs_mwh) / 1000, 5)) then
    raise exception 'Cálculo completo com referência tarifária diferente da oficial. Nada foi alterado.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.calculos_solares_conferir_referencia() from public, anon, authenticated, service_role;

create trigger calculos_solares_referencia_oficial
  before insert or update on public.calculos_solares
  for each row execute function public.calculos_solares_conferir_referencia();
