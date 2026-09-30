-- Notas do negócio (comentários) viram um histórico imutável: depois de criada,
-- uma nota não pode mais ser apagada por ninguém (nem pelo próprio autor), só editada.
drop policy if exists "autor apaga nota" on public.notas;
