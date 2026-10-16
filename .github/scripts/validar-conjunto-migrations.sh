#!/usr/bin/env bash
# Trava do job "aplicar": o conjunto pendente listado pelo dry-run precisa ser EXATAMENTE o conjunto
# autorizado. `supabase db push --include-all` aplica tudo o que estiver pendente; esta etapa roda
# depois do dry-run e antes da aplicação.
#
# Fail-closed: lista autorizada vazia, saída do dry-run ausente ou vazia, nenhuma migration
# reconhecida, qualquer migration a mais, a menos ou diferente, ou qualquer versão de migration
# que não dê para interpretar encerram com erro.
#
# Uso: validar-conjunto-migrations.sh <arquivo-do-dry-run>
# Variável do workflow:
#   MIGRATIONS_AUTORIZADAS   nomes de arquivo (<14 dígitos>_<nome>.sql) separados por espaço ou quebra de linha
set -euo pipefail

falhar() {
  echo "::error::$1" >&2
  exit 1
}

saida="${1:-}"
[ -n "$saida" ] || falhar "informe o arquivo com a saída do dry-run"
[ -f "$saida" ] || falhar "arquivo do dry-run não encontrado"
[ -s "$saida" ] || falhar "a saída do dry-run está vazia: conjunto não interpretável"

autorizadas="${MIGRATIONS_AUTORIZADAS:-}"
[ -n "${autorizadas//[[:space:]]/}" ] || falhar "MIGRATIONS_AUTORIZADAS ausente ou vazia"

# Conjunto autorizado: cada item precisa ter o formato de migration; duplicado é erro.
esperadas=""
for m in $autorizadas; do
  [[ "$m" =~ ^[0-9]{14}_[A-Za-z0-9_.-]+\.sql$ ]] || falhar "item inválido em MIGRATIONS_AUTORIZADAS"
  esperadas+="$m"$'\n'
done
esperadas=$(printf '%s' "$esperadas" | LC_ALL=C sort)
[ "$(printf '%s\n' "$esperadas" | LC_ALL=C sort -u)" = "$esperadas" ] || falhar "MIGRATIONS_AUTORIZADAS tem item repetido"

# Conjunto listado pelo dry-run. O nome precisa começar num limite (nada de letra, dígito, "_", "." ou
# "-" colado antes), para um prefixo a mais não passar por uma migration autorizada.
listadas=$(grep -oE "(^|[^A-Za-z0-9_.-])[0-9]{14}_[A-Za-z0-9_.-]+\.sql" "$saida" | sed -E "s/^[^0-9]//" | LC_ALL=C sort -u || true)
[ -n "$listadas" ] || falhar "o dry-run não listou nenhuma migration reconhecível: conjunto não interpretável"

if [ "$listadas" != "$esperadas" ]; then
  {
    echo "::error::o conjunto pendente do dry-run não é o autorizado; aplicação interrompida"
    echo "Autorizadas:"
    sed 's/^/  - /' <<< "$esperadas"
    echo "Listadas no dry-run:"
    sed 's/^/  - /' <<< "$listadas"
  } >&2
  exit 1
fi

# Versão (14 dígitos de data) citada sem o nome do arquivo, ou fora do conjunto autorizado, é
# conjunto que não dá para confirmar.
versoes_autorizadas=$(printf '%s\n' "$esperadas" | cut -c1-14)
while IFS= read -r v; do
  grep -qxF "$v" <<< "$versoes_autorizadas" || falhar "versão de migration fora do conjunto autorizado no dry-run: $v"
done < <(grep -oE '(^|[^0-9])20[0-9]{12}([^0-9]|$)' "$saida" | grep -oE '20[0-9]{12}' | LC_ALL=C sort -u || true)

echo "Conjunto confirmado: exatamente as migrations autorizadas."
sed 's/^/  - /' <<< "$listadas"
