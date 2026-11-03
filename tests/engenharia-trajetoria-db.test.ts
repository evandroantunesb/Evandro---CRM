/**
 * Engenharia — trajetória (20261108100000_engenharia_trajetoria.sql): obras e kWp com a Engenharia concluída, por mês.
 * Conta para quem participou da Engenharia antes da 1ª conclusão (mesmo já fora da obra); obra cancelada depois segue
 * contando; a equipe (totais e por pessoa) é só de admin, gestor e quem coordena a Engenharia; nada de outra empresa.
 * Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Trajetória A/B" + sufixo, usuários "et-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { urlBancoLocal } from "./banco-local";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let eng1: Usuario;
let eng2: Usuario;
let coordEng: Usuario;
let adminB: Usuario;
let vendedorB: Usuario;
let engB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra1: string;
let obra2: string;
let obraAberta: string;
let obraB: string;

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string, kwp: number): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: emp, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[responsavel.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await responsavel.cliente
    .from("contratos")
    .insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (erroContrato) throw erroContrato;
  const assinado = await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (erroPagamento) throw erroPagamento;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  // Sem calculadora no cenário, a potência do snapshot fica vazia: o teste fixa a potência da obra direto no banco.
  await noBanco("update public.obras set potencia_kwp = $2 where id = $1", [o!.id, kwp]);
  return o!.id;
}

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const atribuir = (quem: Usuario, obraId: string, alvo: Usuario, funcao: "responsavel" | "apoio", principal: boolean) =>
  quem.cliente.rpc("atribuir_participante_obra", { p_obra_id: obraId, p_membro_id: membro[alvo.id], p_setor: "engenharia", p_funcao: funcao, p_principal: principal });
const concluir = (obraId: string) => admin.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obraId, p_motivo: "Obra sem conexão nova" });

type Mes = { mes: string; obras: number; kwp: number };
type Resposta = { pessoal: Mes[]; equipe: { meses: Mes[]; pessoas: { membro_id: string; nome: string; obras: number; kwp: number }[] } | null };
const trajetoria = async (quem: Usuario, emp = empresa) => {
  const { data, error } = await quem.cliente.rpc("trajetoria_engenharia", { p_empresa_id: emp });
  if (error) throw error;
  return data as unknown as Resposta;
};
const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const total = (meses: Mes[]) => ({ obras: meses.reduce((s, m) => s + m.obras, 0), kwp: meses.reduce((s, m) => s + Number(m.kwp), 0) });

describe("Engenharia: trajetória (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, eng1, eng2, coordEng, adminB, vendedorB, engB] = await Promise.all(
      ["et-admin", "et-gestor", "et-vendedor", "et-eng1", "et-eng2", "et-coord-eng", "et-admin-b", "et-vendedor-b", "et-eng-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Trajetória A ${sufixo}` }, { nome: `Trajetória B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [eng1, empresa, operacao],
      [eng2, empresa, operacao],
      [coordEng, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
      [vendedorB, empresaB, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engB, empresaB, operacao],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    const setores: [Usuario, Usuario, unknown][] = [
      [admin, eng1, [{ setor: "engenharia", capacidade: "executar" }]],
      [admin, eng2, [{ setor: "engenharia", capacidade: "executar" }]],
      [admin, coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [adminB, engB, [{ setor: "engenharia", capacidade: "executar" }]],
    ];
    for (const [quem, alvo, s] of setores) ok(await quem.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never }), "setores");

    obra1 = await criarVenda(empresa, vendedor, admin, `Trajetória 1 ${sufixo}`, 10.5);
    obra2 = await criarVenda(empresa, vendedor, admin, `Trajetória 2 ${sufixo}`, 6);
    obraAberta = await criarVenda(empresa, vendedor, admin, `Trajetória aberta ${sufixo}`, 8);
    obraB = await criarVenda(empresaB, vendedorB, adminB, `Trajetória B ${sufixo}`, 20);
  });

  it("sem obra concluída: tudo vazio; a equipe só para admin, gestor e quem coordena", async () => {
    for (const quem of [eng1, eng2]) expect(await trajetoria(quem), quem.email).toEqual({ pessoal: [], equipe: null });
    for (const quem of [admin, gestor, coordEng]) expect(await trajetoria(quem), quem.email).toEqual({ pessoal: [], equipe: { meses: [], pessoas: [] } });
  });

  it("conta a obra concluída para quem participou antes da conclusão, com a potência", async () => {
    ok(await atribuir(admin, obra1, eng1, "responsavel", true), "eng1 na obra 1");
    ok(await atribuir(admin, obra1, eng2, "apoio", false), "eng2 na obra 1");
    ok(await atribuir(admin, obra2, eng1, "responsavel", true), "eng1 na obra 2");
    ok(await atribuir(admin, obraAberta, eng2, "responsavel", true), "eng2 na obra aberta");
    ok(await concluir(obra1), "concluir obra 1");
    ok(await concluir(obra2), "concluir obra 2");

    const mes = mesAtual();
    expect((await trajetoria(eng1)).pessoal).toEqual([{ mes, obras: 2, kwp: 16.5 }]);
    // A obra aberta (Engenharia em curso) não conta.
    expect((await trajetoria(eng2)).pessoal).toEqual([{ mes, obras: 1, kwp: 10.5 }]);
  });

  it("equipe: totais do setor e por pessoa, do maior para o menor", async () => {
    const r = await trajetoria(admin);
    expect(r.pessoal).toEqual([]);
    expect(r.equipe!.meses).toEqual([{ mes: mesAtual(), obras: 2, kwp: 16.5 }]);
    expect(r.equipe!.pessoas.map((p) => [p.membro_id, p.obras, Number(p.kwp)])).toEqual([
      [membro[eng1.id], 2, 16.5],
      [membro[eng2.id], 1, 10.5],
    ]);
    expect(r.equipe!.pessoas[0].nome).not.toBe("");
    expect(await trajetoria(gestor)).toEqual(r);
    expect((await trajetoria(coordEng)).equipe).toEqual(r.equipe);
  });

  it("quem entra na obra depois da conclusão não ganha a obra; quem saiu continua com ela", async () => {
    ok(await atribuir(admin, obra2, eng2, "apoio", false), "eng2 depois da conclusão");
    expect(total((await trajetoria(eng2)).pessoal).obras).toBe(1);

    const { data: part } = await servico.from("obra_participantes").select("id").eq("obra_id", obra1).eq("membro_id", membro[eng2.id]).is("fim", null).single();
    ok(await admin.cliente.rpc("encerrar_participante_obra", { p_participante_id: part!.id, p_motivo: "Troca de equipe" }), "encerrar eng2 na obra 1");
    expect(total((await trajetoria(eng2)).pessoal)).toEqual({ obras: 1, kwp: 10.5 });
  });

  it("vale a 1ª conclusão: reabrir e concluir de novo não conta duas vezes", async () => {
    ok(await admin.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra2, p_setor: "engenharia", p_status: "aguardando_vistoria" }), "reabrir");
    ok(await concluir(obra2), "concluir de novo");
    expect(total((await trajetoria(eng1)).pessoal)).toEqual({ obras: 2, kwp: 16.5 });
  });

  it("obra cancelada depois da conclusão continua contando", async () => {
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Teste da trajetória' where id = $1", [obra1]);
    expect(total((await trajetoria(eng1)).pessoal)).toEqual({ obras: 2, kwp: 16.5 });
    expect(total((await trajetoria(admin)).equipe!.meses).obras).toBe(2);
  });

  it("outra empresa: nada vaza e quem não é membro é recusado", async () => {
    ok(await atribuir(adminB, obraB, engB, "responsavel", true), "engB na obra B");
    ok(await adminB.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obraB, p_motivo: "Obra sem conexão nova" }), "concluir obra B");
    const b = await trajetoria(adminB, empresaB);
    expect(b.equipe!.meses).toEqual([{ mes: mesAtual(), obras: 1, kwp: 20 }]);
    expect(b.equipe!.pessoas.map((p) => p.membro_id)).toEqual([membro[engB.id]]);
    expect(total((await trajetoria(admin)).equipe!.meses).obras).toBe(2);

    const { error } = await eng1.cliente.rpc("trajetoria_engenharia", { p_empresa_id: empresaB });
    expect(error?.code).toBe("42501");
  });
});
