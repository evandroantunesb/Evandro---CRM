-- v6, sequência: aplicar a P1a-1 SEM a P1a-0 deve falhar na trava, antes de criar qualquer objeto.
-- O executor confere que o psql terminou com erro, que a mensagem é a da trava e que nada ficou no banco.
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-02.sql
\echo 'FALHA: a P1a-1 foi aplicada sem a P1a-0'
rollback;
