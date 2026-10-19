# Suíte SQL da P1a (arquivamento de negócio + versões de proposta)

420 verificações em SQL puro (as 340 originais + 80 de emissão fechada) sobre as migrations `20261016200000_negocios_arquivamento.sql` (P1a-0) e
`20261019120000_proposta_versoes.sql` (P1a-1). Cada teste roda numa transação que termina em `ROLLBACK`.

**Só para banco descartável.** O `executar-testes.sh` roda antes `verificar-destino.mjs`, que só libera o destino se tudo bater e, em qualquer falta ou inconsistência, sai com código 2 **sem gravar nada** (só lê: `docker port` e um `SELECT` na marca da fixture):

- exige `DB_CONTAINER`, `DB_NAME`, `SUPABASE_DB_URL`, `SUPABASE_API_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) e `P1A_DESCARTAVEL=1`;
- as duas URLs têm de ser locais (produção e hosts remotos são recusados, assim como `?host=`);
- o banco da URL é o `DB_NAME`, a porta da URL do banco é a publicada pelo `DB_CONTAINER`, e a porta da API é a publicada pelo container `supabase_kong_<mesmo projeto>` (banco e API do mesmo projeto);
- o container do banco local compartilhado (`supabase_db_evandro---crm`) é recusado, exceto dentro do GitHub Actions (stack nova do job);
- o banco precisa ter a marca criada por `fixture.sql` (que só entra em banco vazio) e no máximo 10 empresas.

## Preparar o banco

1. Banco no estado **anterior** às duas migrations (migrations até `20261015110000`): `supabase db reset --local --version 20261015110000` numa stack descartável.
2. `psql -f tests/sql/p1a/fixture.sql` no banco vazio: cria 2 empresas, 6 usuários, 4 negócios (principal, sem versão, legado com contrato e obra, e um com repasse pendente), cálculos, kit e a marca de ambiente descartável. IDs fixos; recusa rodar duas vezes ou em banco com dados.

## Como rodar

```bash
DB_CONTAINER=<container-db-descartavel> DB_NAME=postgres SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:<porta-db>/postgres SUPABASE_API_URL=http://127.0.0.1:<porta-api> P1A_DESCARTAVEL=1 bash tests/sql/p1a/executar-testes.sh [saida.txt]
# MIG_DIR=<pasta> usa outras cópias das duas migrations (comparação de versões)
```

No CI é o job independente `sql-p1a` de `.github/workflows/ci.yml`. Sai com código 0 só se: nenhum erro do psql, nenhuma linha `FALHA`/`REGRESSÃO`, a trava de sequência agir, o hash do texto canônico recalculado fora do banco bater, e o esquema e os dados ficarem idênticos aos de antes.

## Arquivos

| Arquivo | Papel |
|---|---|
| `t01-arquivamento.sql` | só a P1a-0 |
| `t02-sem-01.sql` | P1a-1 sem a P1a-0 deve ser recusada |
| `t12-arquivamento.sql`, `t12-comportamento.sql`, `t12-legado.sql`, `t12-permissoes.sql` | P1a-0 + P1a-1 |
| `arquivamento-corpo.sql`, `somente-leitura-corpo.sql` | corpos compartilhados da P1a-0 |
| `assercoes.sql`, `cenario.sql` | auxiliares e escolha do cenário |
| `emissao-fechada.sql` | logo após a migration: confere que emitir e reconstruir estão fechadas para todos os papéis da aplicação (ACL, EXECUTE efetivo, tentativas reais por perfil) e depois concede EXECUTE a authenticated **só dentro da transação de teste** (ROLLBACK) para exercitar as regras internas |
| `fixture.sql` | dados determinísticos que `cenario.sql` escolhe, mais a marca de ambiente descartável |
| `verificar-destino.mjs` | trava fail-closed do destino (ver acima) |
| `sonda-dono-updated.sql` | sonda manual do dono e do `updated_at` (não roda no executor) |

Os testes por API/concorrência da P1a-0 já estão em `tests/arquivamento-negocio-db.test.ts` e
`tests/arquivamento-concorrencia-db.test.ts` (Vitest, no CI).

## Ressalva conhecida

Apagar uma empresa com negócio arquivado é recusado de duas formas, conforme a ordem das cascatas (que depende dos OIDs
das FKs): a mensagem "não pode ser apagado" ou a de "somente leitura". O teste aceita as duas.
