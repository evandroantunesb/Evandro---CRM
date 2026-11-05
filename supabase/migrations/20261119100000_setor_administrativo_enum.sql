-- Setor Administrativo na obra (PR A1, aprovado pelo Evandro em 05/11/2026): paga fornecedores e cuida da nota
-- fiscal do cliente. Só o valor do enum nesta migration: `alter type ... add value` não pode ser usado na mesma
-- transação em que o valor novo é referenciado (mesmo padrão de 20260930095800_papel_sdr.sql); as regras ficam em
-- 20261119100100_setor_administrativo.sql.
alter type public.setor_obra add value 'administrativo';
