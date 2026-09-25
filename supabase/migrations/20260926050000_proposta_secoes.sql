-- Entrega 5 (continuação): o vendedor escolhe quais seções aparecem na
-- proposta pública. O preço já tinha seu próprio controle (modo_preco); isto
-- cobre as duas seções de conteúdo que sempre apareciam fixas.

alter table public.propostas
  add column mostrar_sistema boolean not null default true,
  add column mostrar_economia boolean not null default true;
