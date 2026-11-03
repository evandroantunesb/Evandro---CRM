-- REVERSÃO DE EMERGÊNCIA da migration 20261023240000 (contração). NÃO é migration: não fica em supabase/migrations.
--
-- Use SÓ se for preciso voltar o app para uma versão que grava `calculos_solares` direto com o cliente do usuário
-- (qualquer versão anterior a src/lib/calculo-gravacao.ts). REABRE a brecha do financeiro forjado: aplique só pelo
-- tempo da reversão e reaplique a contração (o conteúdo da 20261023240000) assim que a versão nova voltar ao ar.
-- Recria exatamente as policies e privilégios do estado anterior (20260926000100_calculadora.sql e
-- 20261007100100_blindagem_comercial.sql). SELECT, DELETE, histórico e triggers das migrations 22000/23000 ficam.

begin;
grant insert, update on public.calculos_solares to authenticated;
create policy "criar cálculo" on public.calculos_solares for insert to authenticated
  with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar cálculo" on public.calculos_solares for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
commit;
