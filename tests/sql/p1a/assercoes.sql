-- v6: asserções fail-closed (funções temporárias da sessão; somem com ela). Qualquer asserção que falha levanta
-- exceção: com ON_ERROR_STOP o psql para com código diferente de zero e o executor reprova a suíte.
-- SQLSTATE próprio: TF001 = resultado errado; TF002 = erro diferente do esperado.

-- Resultado: falso ou nulo reprova.
create function pg_temp.confere(p_ok boolean, p_descricao text) returns text
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALHA: %', p_descricao using errcode = 'TF001';
  end if;
  raise notice 'ok: %', p_descricao;
  return 'ok';
end;
$$;

-- Erro esperado: usado no tratador dos blocos DO. Erro com outra mensagem reprova (não conta como "recusado").
create function pg_temp.erro_esperado(p_erro text, p_esperado text, p_rotulo text) returns void
language plpgsql as $$
begin
  if p_erro is distinct from p_esperado then
    raise exception 'FALHA (erro inesperado em "%"): esperado [%], veio [%]', p_rotulo, p_esperado, p_erro using errcode = 'TF002';
  end if;
  raise notice 'ok (%): %', p_rotulo, p_erro;
end;
$$;

grant execute on function pg_temp.confere(boolean, text) to anon, authenticated, service_role;
grant execute on function pg_temp.erro_esperado(text, text, text) to anon, authenticated, service_role;
