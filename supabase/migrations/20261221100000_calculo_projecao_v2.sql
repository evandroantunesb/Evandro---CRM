-- Proposta comercial completa, PR 2b-1 (premissas aprovadas pelo Evandro em 24/11/2026; docs/PROJECT_STATUS.md,
-- seção "Proposta comercial completa"): o cálculo completo ganha tributos, autoconsumo e a projeção de 25 anos com
-- payback (src/lib/projecao-financeira.ts), no método novo `gd2_piso_655i_v2`.
--
-- Só acrescenta: nenhuma linha existente é reescrita. Linhas `completo` do método v1 continuam válidas como estão
-- (payback nulo, sem tributos) até o negócio ser recalculado; não há recálculo em massa (decisão de 24/11/2026).
--
--  1) `parametros_calculadora`: ICMS e PIS/Cofins da empresa, aplicados "por dentro" (padrão 19% e 7,63%, da fatura
--     Copel de maio/2026). O admin muda pela tela de parâmetros (PR 2b-2).
--  2) `negocios.autoconsumo_percentual`: fração da geração consumida na hora; nulo = padrão residencial de 30%.
--  3) `calculos_solares`: o que o v2 usou e produziu (tributos, autoconsumo, preço do inversor, economia do 1º ano e de
--     25 anos, saldo, motivo sem payback e a projeção ano a ano). O payback deixa de ser sempre nulo só no v2.
--  4) A conferência da referência oficial (20261023220000) aceita os dois métodos; a conta continua no código.

-- 1) Tributos da empresa ----------------------------------------------------------------------------------------------
alter table public.parametros_calculadora
  add column icms numeric(5, 4) not null default 0.19 check (icms >= 0 and icms < 0.5),
  add column pis_cofins numeric(5, 4) not null default 0.0763 check (pis_cofins >= 0 and pis_cofins < 0.3),
  add constraint parametros_calculadora_tributos_ck check (icms + pis_cofins < 0.6);

comment on column public.parametros_calculadora.icms is
  'ICMS da energia (fração), aplicado por dentro sobre a tarifa e o Fio B pago; a energia compensada é isenta.';
comment on column public.parametros_calculadora.pis_cofins is
  'PIS + Cofins da distribuidora (fração), aplicado por dentro; varia todo mês na fatura.';

-- 2) Autoconsumo do negócio -------------------------------------------------------------------------------------------
alter table public.negocios
  add column autoconsumo_percentual numeric(5, 4) check (autoconsumo_percentual is null or (autoconsumo_percentual >= 0 and autoconsumo_percentual <= 1));

comment on column public.negocios.autoconsumo_percentual is
  'Fração da geração consumida na hora (autoconsumo simultâneo). Nulo = padrão residencial de 30%.';

-- 3) Resultado do método v2 -------------------------------------------------------------------------------------------
alter table public.calculos_solares
  add column icms numeric(5, 4) check (icms is null or (icms >= 0 and icms < 0.5)),
  add column pis_cofins numeric(5, 4) check (pis_cofins is null or (pis_cofins >= 0 and pis_cofins < 0.3)),
  add column autoconsumo_fracao numeric(5, 4) check (autoconsumo_fracao is null or (autoconsumo_fracao >= 0 and autoconsumo_fracao <= 1)),
  add column preco_inversor numeric(12, 2) check (preco_inversor is null or preco_inversor > 0),
  add column economia_primeiro_ano numeric(12, 2),
  add column economia_25_anos numeric(14, 2),
  add column saldo_25_anos numeric(14, 2),
  add column payback_motivo text check (payback_motivo is null or payback_motivo in ('sem_investimento', 'inversor_sem_preco', 'nao_se_paga_no_horizonte')),
  add column projecao jsonb check (projecao is null or jsonb_typeof(projecao) = 'object');

comment on column public.calculos_solares.projecao is
  'Método v2: premissas e anos da projeção de 25 anos (src/lib/projecao-financeira.ts), como o servidor calculou.';
comment on column public.calculos_solares.payback_motivo is
  'Método v2 sem payback: sem_investimento (sem valor do negócio), inversor_sem_preco ou nao_se_paga_no_horizonte.';

alter table public.calculos_solares drop constraint calculos_solares_estado_coerente_ck;
alter table public.calculos_solares
  add constraint calculos_solares_estado_coerente_ck check (
    case estado_financeiro
      when 'incompleto' then
        kwh_faturado is null and kwh_compensado is null and custo_fio_b is null
        and conta_sem_solar is null and conta_com_solar is null and economia_mensal is null
        and payback_meses is null and metodo_calculo is null and kwh_nao_compensado is null
        and financeiro_desatualizado_em is null
        and coalesce(jsonb_typeof(pendencias) = 'array' and pendencias <> '[]'::jsonb, false)
        and icms is null and pis_cofins is null and autoconsumo_fracao is null and preco_inversor is null
        and economia_primeiro_ano is null and economia_25_anos is null and saldo_25_anos is null
        and payback_motivo is null and projecao is null
      when 'legado' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and metodo_calculo is null and pendencias is null
        and icms is null and pis_cofins is null and autoconsumo_fracao is null and preco_inversor is null
        and economia_primeiro_ano is null and economia_25_anos is null and saldo_25_anos is null
        and payback_motivo is null and projecao is null
      when 'completo' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and length(btrim(coalesce(metodo_calculo, ''))) > 0 and pendencias is null
        -- retrato completo, com a base da tarifa igual à do Fio B (contrato, seção 5)
        and data_referencia is not null and tarifa_origem is not null and tarifa_gd_id is not null
        and distribuidora is not null and enquadramento is not null and fio_b_rs_mwh is not null and percentual_legal_fio_b is not null
        and fio_b_vigencia_inicio is not null and fio_b_vigencia_fim is not null
        and data_referencia between fio_b_vigencia_inicio and fio_b_vigencia_fim
        and autoconsumo_kwh is not null and kwh_nao_compensado is not null
        and tarifa_base_tributaria is not null and tarifa_base_tributaria = fio_b_base_tributaria
        and case metodo_calculo
          -- v1 (P0): payback indisponível e nada do v2.
          when 'gd2_piso_655i_v1' then
            payback_meses is null
            and icms is null and pis_cofins is null and autoconsumo_fracao is null and preco_inversor is null
            and economia_primeiro_ano is null and economia_25_anos is null and saldo_25_anos is null
            and payback_motivo is null and projecao is null
          -- v2: tributos, autoconsumo e projeção sempre; payback ou o motivo de não ter, nunca os dois.
          when 'gd2_piso_655i_v2' then
            icms is not null and pis_cofins is not null and autoconsumo_fracao is not null
            and economia_primeiro_ano is not null and economia_25_anos is not null and projecao is not null
            and (payback_meses is null) = (payback_motivo is not null)
            and (payback_meses is null or payback_meses > 0)
            and (saldo_25_anos is null) = (payback_motivo is not null and payback_motivo <> 'nao_se_paga_no_horizonte')
            -- Motivo "inversor_sem_preco" só sem o preço; sem o preço, só sem payback (sem preço ou sem investimento).
            and (payback_motivo is distinct from 'inversor_sem_preco' or preco_inversor is null)
            and (preco_inversor is not null or payback_motivo in ('sem_investimento', 'inversor_sem_preco'))
          else false
        end
      else false
    end
  );

-- 4) Referência oficial: os dois métodos aceitos ----------------------------------------------------------------------
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
     -- Métodos aceitos (src/lib/fio-b-gd2.ts, METODO_GD2_PISO_V1; src/lib/calculadora.ts, METODO_GD2_PISO_V2).
     or new.metodo_calculo not in ('gd2_piso_655i_v1', 'gd2_piso_655i_v2')
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
