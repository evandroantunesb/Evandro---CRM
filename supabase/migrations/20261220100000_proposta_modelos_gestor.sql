-- Modelos de proposta também pelo gestor (pedido do Evandro, 24/11/2026): o gestor da empresa escolhe o que aparece
-- na proposta (blocos ligados ou desligados, conteúdo, publicação e modelo padrão), como o admin. A identidade
-- visual da proposta (logo, cores e foto de capa, `proposta_identidades` e o bucket `proposta-marca`) continua só do
-- admin. Muda só o papel exigido: `{admin}` vira `{admin,gestor}`, com as mesmas condições de antes, inclusive o
-- acesso comercial da leitura (20261007100100_blindagem_comercial.sql). Vendedor e SDR seguem vendo só os publicados.

drop policy "ver modelos de proposta" on public.proposta_modelos;
create policy "ver modelos de proposta" on public.proposta_modelos for select to authenticated
  using (public.tem_acesso_comercial(empresa_id) and (status = 'publicado' or public.tem_papel(empresa_id, '{admin,gestor}')));

drop policy "admin cria modelos de proposta" on public.proposta_modelos;
create policy "admin e gestor criam modelos de proposta" on public.proposta_modelos for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));

drop policy "admin edita modelos de proposta" on public.proposta_modelos;
create policy "admin e gestor editam modelos de proposta" on public.proposta_modelos for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}')) with check (public.tem_papel(empresa_id, '{admin,gestor}'));

drop policy "admin apaga modelos de proposta" on public.proposta_modelos;
create policy "admin e gestor apagam modelos de proposta" on public.proposta_modelos for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'));

drop policy "ver blocos de proposta" on public.proposta_modelo_blocos;
create policy "ver blocos de proposta" on public.proposta_modelo_blocos for select to authenticated
  using (exists (
    select 1 from public.proposta_modelos m
    where m.id = modelo_id and public.tem_acesso_comercial(m.empresa_id) and (m.status = 'publicado' or public.tem_papel(m.empresa_id, '{admin,gestor}'))
  ));

drop policy "admin cria blocos de proposta" on public.proposta_modelo_blocos;
create policy "admin e gestor criam blocos de proposta" on public.proposta_modelo_blocos for insert to authenticated
  with check (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin,gestor}')));

drop policy "admin edita blocos de proposta" on public.proposta_modelo_blocos;
create policy "admin e gestor editam blocos de proposta" on public.proposta_modelo_blocos for update to authenticated
  using (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin,gestor}')))
  with check (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin,gestor}')));

drop policy "admin apaga blocos de proposta" on public.proposta_modelo_blocos;
create policy "admin e gestor apagam blocos de proposta" on public.proposta_modelo_blocos for delete to authenticated
  using (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin,gestor}')));
