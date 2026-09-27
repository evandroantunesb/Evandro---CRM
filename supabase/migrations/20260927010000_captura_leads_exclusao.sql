-- Permite ao admin excluir um formulário de captura (além de só desativar).
-- Nenhuma outra tabela referencia formularios.id, então apagar um formulário
-- não afeta os contatos/negócios já criados a partir dele.

create policy "admin apaga formularios" on public.formularios for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
