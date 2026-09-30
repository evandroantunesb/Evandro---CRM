-- Novo papel "SDR" (pré-vendas), pedido do Evandro em 2026-09-30 (spec RAION_SDR_REGRAS_PERMISSOES).
-- Só o valor do enum nesta migration: `alter type ... add value` não pode ser usado na mesma
-- transação em que o valor novo é referenciado, então as regras que usam 'sdr' ficam na próxima.
alter type public.papel_membro add value 'sdr';
