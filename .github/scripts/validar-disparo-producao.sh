#!/usr/bin/env bash
# Valida um disparo manual de workflow de produção ANTES de qualquer credencial.
#
# Fail-closed: variável ausente, valor inesperado ou divergência encerra com erro. As entradas do
# operador chegam por variável de ambiente (nunca interpoladas no shell) e não são repetidas no log;
# as mensagens citam só valores do próprio GitHub (ref e SHA).
#
# Variáveis do GitHub Actions: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_REF_NAME, GITHUB_REF_TYPE, GITHUB_SHA.
# Variáveis do workflow:
#   ENTRADA_REF, ENTRADA_SHA      ref e SHA completo confirmados pelo operador
#   PERMITIR_TAG_MIGRACAO         sim | nao   (tags migracao-<nome>, como no environment producao-banco)
#   EXIGIR_MODO                   sim | nao   (sim: ENTRADA_MODO conferir|aplicar e ENTRADA_CONFIRMACAO)
#   VERIFICAR_CHECKOUT            sim | nao   (sim: o HEAD do checkout precisa ser GITHUB_SHA)
set -euo pipefail

falhar() {
  echo "::error::$1" >&2
  exit 1
}

for v in GITHUB_EVENT_NAME GITHUB_REF GITHUB_REF_NAME GITHUB_REF_TYPE GITHUB_SHA \
  PERMITIR_TAG_MIGRACAO EXIGIR_MODO VERIFICAR_CHECKOUT; do
  [ -n "${!v:-}" ] || falhar "variável $v ausente"
done
for v in PERMITIR_TAG_MIGRACAO EXIGIR_MODO VERIFICAR_CHECKOUT; do
  case "${!v}" in sim | nao) ;; *) falhar "$v deve ser sim ou nao" ;; esac
done

# A validação precisa rodar antes da etapa que recebe credenciais: nenhuma pode estar no ambiente.
for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_PROJECT_ID \
  SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY_PROD SUPABASE_URL; do
  [ -z "${!v:-}" ] || falhar "credencial $v presente durante a validação"
done

[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ] || falhar "só disparo manual (workflow_dispatch); evento: $GITHUB_EVENT_NAME"

# Refs permitidas: a branch main e, quando permitido, tags migracao-<nome> sem '/'.
if [ "$GITHUB_REF_TYPE" = "branch" ] && [ "$GITHUB_REF" = "refs/heads/main" ]; then
  :
elif [ "$PERMITIR_TAG_MIGRACAO" = "sim" ] && [ "$GITHUB_REF_TYPE" = "tag" ] &&
  [[ "$GITHUB_REF" =~ ^refs/tags/migracao-[A-Za-z0-9._-]+$ ]]; then
  :
else
  falhar "ref não permitida: $GITHUB_REF"
fi

[ "${ENTRADA_REF:-}" = "$GITHUB_REF_NAME" ] || falhar "a ref confirmada não é a ref selecionada ($GITHUB_REF_NAME)"

[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || falhar "GITHUB_SHA em formato inesperado"
[[ "${ENTRADA_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || falhar "o SHA confirmado deve ter 40 caracteres hexadecimais minúsculos"
[ "$ENTRADA_SHA" = "$GITHUB_SHA" ] || falhar "o SHA confirmado não é o commit da ref selecionada ($GITHUB_SHA)"

descricao=""
if [ "$EXIGIR_MODO" = "sim" ]; then
  case "${ENTRADA_MODO:-}" in
    conferir)
      [ -z "${ENTRADA_CONFIRMACAO:-}" ] || falhar "a confirmação só é usada no modo aplicar: deixe-a vazia para conferir"
      ;;
    aplicar)
      [ "${ENTRADA_CONFIRMACAO:-}" = "aplicar-${GITHUB_SHA:0:7}" ] ||
        falhar "para aplicar, a confirmação deve ser exatamente aplicar-${GITHUB_SHA:0:7}"
      ;;
    *) falhar "modo inválido: use conferir ou aplicar" ;;
  esac
  descricao=", modo ${ENTRADA_MODO}"
fi

if [ "$VERIFICAR_CHECKOUT" = "sim" ]; then
  atual="$(git rev-parse HEAD)"
  [ "$atual" = "$GITHUB_SHA" ] || falhar "o checkout ($atual) não é o commit $GITHUB_SHA"
fi

echo "Disparo válido: $GITHUB_REF @ $GITHUB_SHA$descricao."
