-- Entrega 4 do construtor de propostas: liga a proposta emitida ao modelo
-- escolhido pelo vendedor. O modelo e os blocos ficam "congelados" (snapshot)
-- na própria proposta no momento da emissão, pra uma edição futura no modelo
-- não mudar retroativamente uma proposta que já foi enviada a um cliente.
-- Colunas nulas = proposta antiga (sem modelo), continua na renderização
-- legada de sempre.

alter table public.propostas
  add column modelo_id uuid references public.proposta_modelos (id) on delete set null,
  add column capa_variante public.proposta_modelo_capa,
  add column blocos_emitidos jsonb;

comment on column public.propostas.blocos_emitidos is
  'Snapshot dos blocos ativos do modelo no momento da emissão (tipo, ordem, quebra_pagina, config).';
