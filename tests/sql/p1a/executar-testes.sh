#!/usr/bin/env bash
# Suíte SQL da P1a (P1a-0 arquivamento + P1a-1 versões de proposta). Cada teste roda numa transação que termina em ROLLBACK.
# SÓ para banco DESCARTÁVEL: veja verificar-destino.mjs. Exige DB_CONTAINER, DB_NAME, SUPABASE_DB_URL, SUPABASE_API_URL e
#   P1A_DESCARTAVEL=1, e a marca criada por fixture.sql. O banco deve estar no estado ANTERIOR às migrations da P1a
#   (migrations até 20261015110000), com a fixture carregada.
# FAIL-CLOSED: sai com código 0 SÓ se tudo passar. Qualquer um destes reprova (código 1; cenário ausente = 2):
#   erro do psql (inclui asserção falsa e erro diferente do esperado, que param o psql), teste que não chega ao fim,
#   linha FALHA/REGRESSÃO na saída, trava de sequência que não age, hash divergente ou ausente, objeto residual,
#   esquema ou dados diferentes depois dos testes.
# Uso: DB_CONTAINER=… DB_NAME=… SUPABASE_DB_URL=… SUPABASE_API_URL=… P1A_DESCARTAVEL=1 bash executar-testes.sh [saida.txt]
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
REPO="$(cd "$AQUI/../../.." && { pwd -W 2>/dev/null || pwd; })"
MIG="${MIG_DIR:-$REPO/supabase/migrations}"
RAIZ="$AQUI"
DB="${DB_CONTAINER:-}"
NOME_BANCO="${DB_NAME:-}"
# Trava fail-closed: confere container, banco, URLs do banco e da API, correspondência entre eles e a marca da fixture.
# Só lê; qualquer falta ou inconsistência sai com código 2 antes de gravar qualquer coisa.
DB_CONTAINER="$DB" DB_NAME="$NOME_BANCO" node "$AQUI/verificar-destino.mjs" || exit 2
SAIDA="${1:-${TMPDIR:-/tmp}/p1a-resultado-testes.txt}"
PSQL=(env MSYS_NO_PATHCONV=1 docker exec -i "$DB" psql -U postgres -d "$NOME_BANCO" -X -q)
REPROVADO=0
reprovar() { echo "REPROVADO: $1" | tee -a "$SAIDA" >&2; REPROVADO=1; }

# Retrato do esquema e dos dados tocados pelos testes, para provar que nada ficou gravado.
retrato() {
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -At <<'SQL'
select md5(string_agg(x, '|' order by x)) from (
  select 'rel:' || c.relname from pg_class c where c.relnamespace = 'public'::regnamespace
  union all select 'fn:' || p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'con:' || conname from pg_constraint where connamespace = 'public'::regnamespace
  union all select 'trg:' || tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not tgisinternal
  union all select 'col:' || column_name from information_schema.columns where table_schema = 'public' and table_name = 'negocios'
  union all select 'bucket:' || id from storage.buckets
  union all select 'dados:' || (select md5(string_agg(n::text, '' order by n.id)) from public.negocios n)
  union all select 'dados:' || (select md5(string_agg(p::text, '' order by p.id)) from public.propostas p)
  union all select 'dados:' || (select md5(string_agg(m::text, '' order by m.id)) from public.empresa_membros m)
  union all select 'dados:' || (select md5(string_agg(i::text, '' order by i.empresa_id)) from public.proposta_identidades i)
  union all select 'dados:' || (select count(*)::text from public.logs_auditoria)
  union all select 'dados:' || (select count(*)::text from public.eventos)
  union all select 'dados:' || (select count(*)::text from public.notas)
  union all select 'dados:' || (select count(*)::text from public.empresas)
  union all select 'dados:' || (select count(*)::text from storage.objects)
) t(x);
SQL
}

# Objetos que só existem se uma migration do P1 tiver ficado no banco.
residuos() {
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -At <<'SQL'
select coalesce(string_agg(x, ', '), '') from (
  select 'tabela proposta_versoes' x where to_regclass('public.proposta_versoes') is not null
  union all select 'coluna ' || column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'negocios' and column_name in ('arquivado_em', 'arquivado_por', 'motivo_arquivamento')
  union all select 'função ' || proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('arquivar_negocio', 'desarquivar_negocio',
    'negocios_proteger_arquivamento', 'negocios_arquivado_somente_leitura', 'negocio_arquivado_bloquear_filho', 'arquivado_so_anulacao_automatica',
    'emitir_proposta_versao', 'proposta_parametros_economicos_validados', 'obter_proposta_versao_publica')
  union all select 'restrição ' || conname from pg_constraint where conname in ('propostas_id_negocio_empresa_key', 'negocios_arquivamento_coerente')
  union all select 'gatilho ' || tgname from pg_trigger where tgname like '%arquivado_somente_leitura' or tgname = 'negocios_proteger_arquivamento'
  union all select 'bucket proposta-emitidas' where exists (select 1 from storage.buckets where id = 'proposta-emitidas')
) t;
SQL
}

: > "$SAIDA"
for f in "$MIG/20261016200000_negocios_arquivamento.sql|p1v10-01.sql" "$MIG/20261019120000_proposta_versoes.sql|p1v10-02.sql" \
         "$AQUI/assercoes.sql|p1v10-assercoes.sql" "$AQUI/cenario.sql|p1v10-cenario.sql" \
         "$AQUI/arquivamento-corpo.sql|p1v10-arquivamento-corpo.sql" "$AQUI/somente-leitura-corpo.sql|p1v10-somente-leitura-corpo.sql" \
         "$AQUI/emissao-fechada.sql|p1v10-emissao-fechada.sql"; do
  docker cp "${f%%|*}" "$DB:/tmp/${f##*|}" >/dev/null || { echo "falha ao copiar ${f%%|*}" >&2; exit 1; }
done
MSYS_NO_PATHCONV=1 docker exec "$DB" rm -f /tmp/p1-canonico.txt

ANTES="$(retrato)" || { echo "falha ao tirar o retrato inicial" >&2; exit 1; }
RES_ANTES="$(residuos)" || exit 1
if [ -n "$RES_ANTES" ]; then echo "o banco local já tem objetos do P1 antes dos testes: $RES_ANTES" >&2; exit 1; fi

# Cenário: resolvido numa transação revertida; preenche os marcadores {{...}} dos testes herdados da v4.
CEN="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -At -F '|' <<'SQL'
begin;
\i /tmp/p1v10-cenario.sql
select neg, neg_sem_versao, empresa, vendedor, sdr, outro, outro_membro, empresa_outra, neg_legado, vendedor_legado from cen
 where (select bool_and(neg is not null and sdr is not null and neg_sem_versao is not null and outro is not null
        and superadmin is not null and neg_legado is not null) from cen);
rollback;
SQL
)" || { echo "falha ao resolver o cenário" >&2; exit 2; }
CEN="$(printf '%s\n' "$CEN" | grep -E '^[0-9a-f-]{36}(\|[0-9a-f-]{36}){9}$' | tail -1)"
IFS='|' read -r NEG NEG_SEM EMP VEND SDR OUTRO OUTRO_M EMP_OUTRA NEG_LEG VEND_LEG <<<"$CEN"
if [ -z "${VEND_LEG:-}" ]; then echo "cenário incompleto no banco local" >&2; exit 2; fi
preencher() {
  sed -e "s/{{NEG}}/$NEG/g; s/{{NEG_SEM_VERSAO}}/$NEG_SEM/g; s/{{EMPRESA}}/$EMP/g; s/{{VENDEDOR}}/$VEND/g; s/{{SDR}}/$SDR/g" \
      -e "s/{{OUTRO}}/$OUTRO/g; s/{{OUTRO_MEMBRO}}/$OUTRO_M/g; s/{{EMPRESA_OUTRA}}/$EMP_OUTRA/g" \
      -e "s/{{NEG_LEGADO}}/$NEG_LEG/g; s/{{VENDEDOR_LEGADO}}/$VEND_LEG/g" "$1"
}

{
  echo "P1a SQL — saída integral dos testes no Supabase LOCAL ($(date '+%d/%m/%Y %H:%M')). Todas as transações terminam em ROLLBACK."
  echo "Executor FAIL-CLOSED: qualquer asserção falsa, erro inesperado, hash divergente, resíduo ou mudança no banco reprova (código ≠ 0)."
  echo "Migrations em sequência: 20261016200000_negocios_arquivamento.sql (P1a-0) e 20261019120000_proposta_versoes.sql (P1a-1)."
  echo "Cenário (dados do banco local, escolhidos por testes/cenario.sql): empresa=$EMP negócio=$NEG vendedor=$VEND"
  echo "  sdr=$SDR negócio_sem_versão=$NEG_SEM outra_empresa=$EMP_OUTRA vendedor_outra=$OUTRO negócio_legado=$NEG_LEG"
  echo "Retrato do esquema e dos dados ANTES: $ANTES"
} >> "$SAIDA"

rodar() { # rótulo, arquivo pronto no container
  local tmp rc
  echo "" >> "$SAIDA"; echo "################ $1" >> "$SAIDA"
  tmp="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f "/tmp/$2" 2>&1)"; rc=$?
  printf '%s\n' "$tmp" >> "$SAIDA"
  echo "(saída do psql: $rc)" >> "$SAIDA"
  [ $rc -eq 0 ] || reprovar "$1 terminou com erro (psql $rc)"
  grep -q -- '--- ROLLBACK feito' <<<"$tmp" || reprovar "$1 não chegou ao fim"
}

docker cp "$AQUI/t01-arquivamento.sql" "$DB:/tmp/p1v10-t01.sql" >/dev/null
rodar "t01-arquivamento.sql — INDIVIDUAL: só a P1a-0" p1v10-t01.sql

docker cp "$AQUI/t02-sem-01.sql" "$DB:/tmp/p1v10-t02.sql" >/dev/null
echo "" >> "$SAIDA"; echo "################ t02-sem-01.sql — SEQUÊNCIA: P1a-1 sem a P1a-0 deve ser recusada" >> "$SAIDA"
T02="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -f /tmp/p1v10-t02.sql 2>&1)"; RC02=$?
printf '%s\n' "$T02" >> "$SAIDA"
SOBROU="$(residuos)" || SOBROU="(erro ao conferir)"
if [ $RC02 -ne 0 ] && grep -q 'Aplique antes a migration de arquivamento de negócio (P1a-0).' <<<"$T02" && [ -z "$SOBROU" ]; then
  echo "ok: recusada pela trava (saída do psql: $RC02) e nenhum objeto do P1 ficou no banco" >> "$SAIDA"
else
  reprovar "trava de sequência (psql $RC02; resíduos: ${SOBROU:-nenhum})"
fi

docker cp "$AQUI/t12-arquivamento.sql" "$DB:/tmp/p1v10-t12-arq.sql" >/dev/null
rodar "t12-arquivamento.sql — CONJUNTO: P1a-0 + P1a-1" p1v10-t12-arq.sql

for t in comportamento legado permissoes; do
  preencher "$AQUI/t12-$t.sql" > "$SAIDA.t12-$t.pronto.sql"
  if grep -qE '\{\{[A-Z_]+\}\}' "$SAIDA.t12-$t.pronto.sql"; then reprovar "marcador não preenchido em t12-$t.sql"; fi
  docker cp "$SAIDA.t12-$t.pronto.sql" "$DB:/tmp/p1v10-t12-$t.sql" >/dev/null
  rm -f "$SAIDA.t12-$t.pronto.sql"
  rodar "t12-$t.sql — CONJUNTO: P1a-0 + P1a-1 (teste da v4, fail-closed)" "p1v10-t12-$t.sql"
done

# Hash recalculado FORA do banco sobre o texto canônico exportado pelo t12-permissoes (item 15).
HASH_EXT="$(MSYS_NO_PATHCONV=1 docker exec "$DB" sh -c "test -s /tmp/p1-canonico.txt && printf '%s' \"\$(cat /tmp/p1-canonico.txt)\" | sha256sum | cut -d' ' -f1")" || HASH_EXT=""
HASH_DB="$(grep -A2 'hash_guardado_versao_3' "$SAIDA" | grep -oE '[0-9a-f]{64}' | head -1)"
DEPOIS="$(retrato)" || DEPOIS="(erro)"
RES_DEPOIS="$(residuos)" || RES_DEPOIS="(erro ao conferir)"
OKS="$(grep -cE 'NOTICE:  (ok|sem regressão)|^ok:' "$SAIDA")"
FALHAS="$(grep -cE 'FALHA|REGRESSÃO' "$SAIDA" || true)"
{
  echo ""; echo "################ resumo"
  echo "Hash recalculado fora do banco (sha256sum): ${HASH_EXT:-(ausente)}"
  echo "Hash guardado na versão 3:                 ${HASH_DB:-(ausente)}"
} >> "$SAIDA"
if [ -n "$HASH_DB" ] && [ "$HASH_EXT" = "$HASH_DB" ]; then echo "ok: hashes iguais" >> "$SAIDA"; else reprovar "hash ausente ou divergente"; fi
echo "Retrato DEPOIS: $DEPOIS" >> "$SAIDA"
if [ "$ANTES" = "$DEPOIS" ]; then echo "ok: esquema e dados idênticos aos de antes dos testes (nada gravado)" >> "$SAIDA"; else reprovar "o banco mudou"; fi
if [ -z "$RES_DEPOIS" ]; then echo "ok: nenhum objeto residual do P1" >> "$SAIDA"; else reprovar "objetos residuais: $RES_DEPOIS"; fi
[ "$FALHAS" -eq 0 ] || reprovar "$FALHAS linha(s) com FALHA/REGRESSÃO na saída"
echo "Verificações ok: $OKS | linhas com falha: $FALHAS" >> "$SAIDA"
if [ $REPROVADO -eq 0 ]; then echo "RESULTADO: APROVADO (código 0)" >> "$SAIDA"; else echo "RESULTADO: REPROVADO (código 1)" >> "$SAIDA"; fi
tail -10 "$SAIDA"
exit $REPROVADO
