-- Cadastro manual completo de equipamento (pedido do Evandro em 2026-09-30,
-- depois de testar a tela "Equipamentos ativos" e ver que só tinha busca no
-- catálogo externo, sem alternativa quando ele não retorna resultado). Campos
-- que faltavam pra cobrir o formulário manual pedido: preço/custo de
-- referência, datasheet (arquivo opcional) e os campos de inversor que ainda
-- não existiam (potência/entrada DC máxima, Isc máximo por entrada, tensão/
-- fases AC — os demais campos elétricos já vieram na migration anterior,
-- 20260930160000).
alter table public.equipamentos_empresa
  add column preco_referencia_brl numeric(10, 2) check (preco_referencia_brl is null or preco_referencia_brl >= 0),
  add column datasheet_caminho text,
  add column datasheet_nome text,
  add column potencia_dc_maxima_entrada_w numeric(7, 2) check (potencia_dc_maxima_entrada_w is null or potencia_dc_maxima_entrada_w > 0),
  add column isc_maximo_entrada_a numeric(5, 2) check (isc_maximo_entrada_a is null or isc_maximo_entrada_a > 0),
  add column tensao_fases_ac text;

-- ---------------------------------------------------------------------------
-- Storage do datasheet: bucket privado, só quem é membro ativo da empresa dona
-- do arquivo pode ler/enviar. Caminho: "{empresa_id}/{arquivo}" (mesmo padrão
-- de pasta-por-empresa usado no bucket "anexos", mas sem negócio no meio —
-- datasheet é do catálogo da empresa, não de um negócio específico).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('datasheets', 'datasheets', false, 10485760)
on conflict (id) do nothing;

create or replace function public.pode_ver_pasta_datasheet(p_caminho text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  begin
    v_empresa := split_part(p_caminho, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.membro_ativo(v_empresa);
end;
$$;

create policy "datasheets: ler" on storage.objects for select to authenticated
  using (bucket_id = 'datasheets' and public.pode_ver_pasta_datasheet(name));
create policy "datasheets: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'datasheets' and public.pode_ver_pasta_datasheet(name));
