-- Sequência de dias produtivos ("streak"), pedida por Evandro em 2026-10-04 pra
-- reproduzir o card "N dias produtivos consecutivos" da referência visual da Gamificação.
-- Diagnóstico read-only prévio (`/mnt/project-files/auditorias/diagnostico-kpis-
-- funcionais-gamificacao-2026-10-04.md`) e correções aprovadas na sequência.
--
-- Dia produtivo = existe pelo menos um lançamento ativo (`not estornado`) com `xp > 0`
-- e `referencia_tipo <> 'conquista'` naquele dia (fuso fixo America/Sao_Paulo, o mesmo
-- já usado em todo `src/lib/formatacao.ts` — não existe nem foi pedido timezone
-- configurável por empresa). O filtro de `referencia_tipo` reaproveita exatamente o
-- mesmo usado por `avaliar_conquistas_pontos()` pra elegibilidade de `xp_acumulado`
-- (`20260926110000_gamificacao_niveis_conquistas.sql`) — bônus de conquista não conta
-- como dia produtivo. Resgate nunca precisa de exclusão própria: `referencia_tipo =
-- 'resgate'` sempre tem `xp = 0` (invariante gravada em `20261002110000_gamificacao_
-- xp_moedas.sql`), então já cai fora do filtro `xp > 0`.
--
-- Recalculado puro a cada chamada, direto do ledger imutável — sem cache/snapshot.
-- Isso já resolve sozinho "se todos os créditos do dia forem estornados depois, o dia
-- deixa de contar": o estorno é só `point_ledger.estornado = true`, refletido na
-- próxima leitura.

-- ---------------------------------------------------------------------------
-- Dias de trabalho por empresa — mesmo padrão já usado pra outros limiares simples
-- configuráveis por empresa (`dias_considerado_parado`, `horas_considerado_sem_
-- contato`, ambos em `empresas` direto, sem tabela de configuração separada).
-- Bitmask de 7 bits: bit 0 = segunda, bit 1 = terça, ..., bit 6 = domingo.
-- Default 31 = 0b0011111 = segunda a sexta (pedido explícito do Evandro).
-- ---------------------------------------------------------------------------

alter table public.empresas
  add column dias_uteis_gamificacao smallint not null default 31
  check (dias_uteis_gamificacao between 1 and 127);

comment on column public.empresas.dias_uteis_gamificacao is
  'Bitmask de 7 bits (bit0=segunda .. bit6=domingo) dos dias considerados "dia útil" '
  'para a sequência produtiva da Gamificação. Default 31 = segunda a sexta.';

-- ---------------------------------------------------------------------------
-- sequencia_produtiva_membro: self-only por construção — recebe só a empresa,
-- nunca um membro_id (mesmo padrão de `meu_membro_id`, que resolve o vínculo do
-- `auth.uid()` chamador). Sem vínculo ativo na empresa, retorna sequência 0 e
-- semana vazia, nunca erro (mesmo padrão de `ranking_gamificacao`/RLS: ausência
-- de acesso vira resultado vazio, não exceção).
--
-- Sem limite artificial de dias pra trás, nem mesmo como trava técnica: a
-- sequência termina naturalmente ao encontrar o primeiro dia útil sem crédito
-- (pedido explícito do Evandro — nenhum "180+"/cap no produto nem no algoritmo).
-- Não há risco real de loop sem fim: cada lançamento de `point_ledger` é um
-- evento real que levou tempo de parede pra existir, então o número de dias
-- distintos com crédito pra um membro é sempre finito e, na prática, limitado
-- pela data de criação da empresa — não existe forma de uma empresa ter dias
-- produtivos "antes de existir", então o laço sempre encontra um dia útil sem
-- crédito (ou esgota os dados reais) em tempo finito.
-- ---------------------------------------------------------------------------

create or replace function public.sequencia_produtiva_membro(p_empresa_id uuid)
returns table (sequencia integer, semana jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_membro_id uuid;
  v_bitmask smallint;
  v_hoje date;
  v_cursor date;
  v_dow integer; -- ISO: 1=segunda .. 7=domingo
  v_bit integer;
  v_dia_util boolean;
  v_produtivo boolean;
  v_sequencia integer := 0;
  v_inicio_semana date;
  v_semana jsonb := '[]'::jsonb;
  v_dia date;
  v_i integer;
begin
  v_membro_id := public.meu_membro_id(p_empresa_id);
  if v_membro_id is null then
    sequencia := 0;
    semana := '[]'::jsonb;
    return next;
    return;
  end if;

  select dias_uteis_gamificacao into v_bitmask from public.empresas where id = p_empresa_id;
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  -- Semana corrente (segunda a domingo), independente de serem dias úteis —
  -- a UI mostra os 7 dias, só marcando quais não são "dia útil".
  v_inicio_semana := v_hoje - ((extract(isodow from v_hoje)::integer) - 1);
  for v_i in 0..6 loop
    v_dia := v_inicio_semana + v_i;
    v_dow := extract(isodow from v_dia)::integer;
    v_bit := 1 << (v_dow - 1);
    v_dia_util := (v_bitmask & v_bit) <> 0;
    v_produtivo := exists (
      select 1 from public.point_ledger
      where membro_id = v_membro_id
        and not estornado
        and xp > 0
        and referencia_tipo <> 'conquista'
        and (created_at at time zone 'America/Sao_Paulo')::date = v_dia
    );
    v_semana := v_semana || jsonb_build_object('data', v_dia, 'dia_util', v_dia_util, 'produtivo', v_produtivo);
  end loop;

  -- Caminha pra trás a partir de hoje, contando dias úteis produtivos consecutivos,
  -- até encontrar o primeiro dia útil sem crédito — sem limite de iterações.
  v_cursor := v_hoje;
  loop
    v_dow := extract(isodow from v_cursor)::integer;
    v_bit := 1 << (v_dow - 1);
    v_dia_util := (v_bitmask & v_bit) <> 0;

    if not v_dia_util then
      -- Dia não útil: não soma nem quebra, só pula.
      v_cursor := v_cursor - 1;
      continue;
    end if;

    v_produtivo := exists (
      select 1 from public.point_ledger
      where membro_id = v_membro_id
        and not estornado
        and xp > 0
        and referencia_tipo <> 'conquista'
        and (created_at at time zone 'America/Sao_Paulo')::date = v_cursor
    );

    if v_produtivo then
      v_sequencia := v_sequencia + 1;
      v_cursor := v_cursor - 1;
      continue;
    end if;

    -- Dia útil sem crédito. Hoje nunca quebra a sequência antes de terminar —
    -- só pula pro dia anterior sem contar (só pode ser verdade na 1ª iteração,
    -- já que v_cursor decresce 1 por volta). Qualquer outro dia útil sem
    -- crédito encerra a contagem.
    if v_cursor = v_hoje then
      v_cursor := v_cursor - 1;
      continue;
    end if;

    exit;
  end loop;

  sequencia := v_sequencia;
  semana := v_semana;
  return next;
end;
$$;

revoke all on function public.sequencia_produtiva_membro(uuid) from public;
grant execute on function public.sequencia_produtiva_membro(uuid) to authenticated;
