/**
 * Verificação da transição banco × app da gravação de `calculos_solares` (M2 P0). SÓ banco LOCAL descartável: recusa
 * qualquer URL que não seja 127.0.0.1/localhost. Cria dados fictícios novos e não apaga nada.
 *
 *   node .aurora/revisao/calc-gd2/integracao/verificar-transicao.mjs expansao   (migrations até 20261023230000)
 *   node .aurora/revisao/calc-gd2/integracao/verificar-transicao.mjs contracao  (com 20261023240000)
 *
 * Expansão: o app ANTIGO (escrita direta com o cliente do usuário) e o NOVO (RPC de autorização) funcionam juntos.
 * Contração: a escrita direta é recusada (42501) e o caminho novo continua autorizando.
 * Variáveis: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (nunca impressas).
 */
import { createClient } from "@supabase/supabase-js";

const fase = process.argv[2];
if (fase !== "expansao" && fase !== "contracao") {
  console.error("uso: verificar-transicao.mjs expansao|contracao");
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) {
  console.error("recusado: só banco local descartável");
  process.exit(2);
}
const servico = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const ok = (cond) => (cond ? "ok" : "FALHOU");
const resultados = [];
const conferir = (nome, cond, detalhe) => resultados.push({ nome, resultado: ok(cond), ...(cond ? {} : { detalhe }) });

const email = `transicao-${sufixo}@exemplo.test`;
const senha = `Senha-${sufixo}`;
const { data: u, error: eu } = await servico.auth.admin.createUser({ email, password: senha, email_confirm: true });
if (eu) throw eu;
const { data: e } = await servico.from("empresas").insert({ nome: `Transição ${sufixo}` }).select("id").single();
const { data: m } = await servico.from("empresa_membros").insert({ empresa_id: e.id, user_id: u.user.id, papel: "vendedor" }).select("id").single();
const { data: f } = await servico.from("funis").select("id").eq("empresa_id", e.id).single();
const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f.id).order("ordem").limit(1).single();
const { data: c } = await servico.from("contatos").insert({ empresa_id: e.id, nome: "Cliente transição", telefone: "44 90000-0000" }).select("id").single();
const { data: n } = await servico
  .from("negocios")
  .insert({ empresa_id: e.id, titulo: "Transição", contato_id: c.id, funil_id: f.id, etapa_id: et.id, responsavel_id: m.id, valor: 20000 })
  .select("id")
  .single();
await servico.from("kit_componentes").insert({ empresa_id: e.id, negocio_id: n.id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });

const usuario = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: el } = await usuario.auth.signInWithPassword({ email, password: senha });
if (el) throw el;

// App ANTIGO: grava a linha (fórmula antiga, `legado`) direto com o cliente do usuário, e depois a atualiza.
const linhaAntiga = {
  empresa_id: e.id,
  negocio_id: n.id,
  kit_nome: "Kit personalizado · 5,5 kWp",
  kit_potencia_kwp: 5.5,
  kit_preco: 20000,
  tipo_ligacao: "bifasico",
  consumo_medio_kwh: 500,
  tarifa_kwh: 0.9,
  produtividade_kwh_kwp_mes: 120,
  percentual_fio_b: 0.45,
  disponibilidade_kwh: 50,
  geracao_estimada_kwh_mes: 660,
  kwh_faturado: 50,
  kwh_compensado: 450,
  custo_fio_b: 182.25,
  conta_sem_solar: 450,
  conta_com_solar: 227.25,
  economia_mensal: 222.75,
  payback_meses: 112.2,
  criado_por: m.id,
  atualizado_por: m.id,
};
const ins = await usuario.from("calculos_solares").insert(linhaAntiga).select("id");
const upd = await usuario.from("calculos_solares").update({ tarifa_kwh: 0.95 }).eq("negocio_id", n.id).select("id");
if (fase === "expansao") {
  conferir("app antigo: INSERT direto aceito", !ins.error && ins.data?.length === 1, ins.error);
  conferir("app antigo: UPDATE direto aceito", !upd.error && upd.data?.length === 1, upd.error);
} else {
  conferir("app antigo: INSERT direto recusado (42501)", ins.error?.code === "42501", ins.error ?? ins.data);
  conferir("app antigo: UPDATE direto recusado (42501)", upd.error?.code === "42501", upd.error ?? upd.data);
}

// App NOVO: autorização pela sessão (a gravação em si é da service role, já coberta pelos testes do repositório).
const rpc = await usuario.rpc("autorizar_gravacao_calculo", { p_negocio_id: n.id });
conferir("app novo: RPC de autorização devolve empresa e membro da sessão", !rpc.error && rpc.data?.[0]?.membro_id === m.id, rpc.error);

// `completo` forjado é recusado nas duas fases (trigger de referência oficial ou falta de privilégio).
const forjado = await usuario
  .from("calculos_solares")
  .update({ estado_financeiro: "completo", metodo_calculo: "gd2_piso_655i_v1", pendencias: null, payback_meses: null })
  .eq("negocio_id", n.id);
conferir("`completo` forjado pelo cliente recusado", !!forjado.error, forjado);

console.log(JSON.stringify({ fase, resultados }, null, 2));
process.exit(resultados.every((r) => r.resultado === "ok") ? 0 : 1);
