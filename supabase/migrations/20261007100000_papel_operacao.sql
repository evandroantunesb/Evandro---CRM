-- Papel `operacao` (PR 3b-1). Migration isolada: um valor novo de enum não pode ser usado
-- na mesma transação em que é criado (mesmo padrão de 20260930095800_papel_sdr.sql).
-- O papel nasce sem nenhum acesso comercial: ver 20261007100100_blindagem_comercial.sql.
alter type public.papel_membro add value 'operacao';
