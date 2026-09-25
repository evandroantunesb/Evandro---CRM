-- Endereço do cliente, usado no formulário de "nova proposta" (nome + consumo
-- médio + endereço já dispara o cálculo do kit).
alter table public.contatos add column endereco text;
