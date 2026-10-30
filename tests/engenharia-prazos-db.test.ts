/**
 * Engenharia — prazos e indicadores (20261030160000_engenharia_prazos_indicadores.sql): dias úteis (feriados nacionais
 * fixos e móveis, feriado da empresa, contagem a partir do dia útil seguinte), prazos padrão por empresa (o admin só
 * muda os dias; ninguém cria nem apaga), feriados só pelo admin, prazos em curso por obra (etapa, exigência, análise da
 * distribuidora só quando configurada) e indicadores agregados (carteira, tempo na etapa, exigência), sem acesso de
 * outra empresa. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Prazos A/B" + sufixo, usuários "pz-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

let admin: Usuario;
let vendedor: Usuario;
let execEng: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;

async function criarVenda(emp: string, responsavel: Usuario, confirmador: Usuario, titulo: string): Promise<string> {
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
  return o!.id;
}

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

/** Data do vencimento calculada pelo próprio banco (os testes não reimplementam o calendário). */
async function vence(inicio: string, dias: number): Promise<string> {
  const [l] = await noBanco("select public.somar_dias_uteis($1, $2::date, $3)::text as d", [empresa, inicio, dias]);
  return l.d;
}

async function prazos(quem: Usuario) {
  const { data, error } = await quem.cliente.rpc("prazos_engenharia", { p_empresa_id: empresa });
  if (error) throw error;
  return (data ?? []).filter((p) => p.obra_id === obra);
}

describe("Engenharia: prazos e indicadores (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let protocolo: string;

  beforeAll(async () => {
    [admin, vendedor, execEng, adminB] = await Promise.all(["pz-admin", "pz-vendedor", "pz-exec-eng", "pz-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Prazos A ${sufixo}` }, { nome: `Prazos B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [execEng, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    ok(
      await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[execEng.id], p_setores: [{ setor: "engenharia", capacidade: "executar" }] as never }),
      "setores",
    );

    obra = await criarVenda(empresa, vendedor, admin, `Prazos ${sufixo}`);
    ok(
      await admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[execEng.id], p_setor: "engenharia", p_funcao: "apoio", p_principal: false }),
      "atribuir",
    );
  });

  it("calendário: Páscoa, feriados nacionais fixos e móveis, contagem do dia útil seguinte", async () => {
    const [l] = await noBanco(
      `select public.data_pascoa(2026)::text as pascoa,
        public.feriado_nacional('2026-02-16') as carnaval, public.feriado_nacional('2026-04-03') as sexta_santa,
        public.feriado_nacional('2026-06-04') as corpus, public.feriado_nacional('2026-11-20') as consciencia,
        public.feriado_nacional('2023-11-20') as consciencia_2023, public.feriado_nacional('2026-11-04') as comum,
        public.somar_dias_uteis($1, '2026-10-30', 1)::text as apos_finados,
        public.somar_dias_uteis($1, '2026-11-03', 0) as zero,
        public.dias_uteis_entre($1, '2026-10-30', '2026-11-06') as uteis,
        public.dias_uteis_entre($1, '2026-11-06', '2026-10-30') as invertido`,
      [empresa],
    );
    expect(l).toEqual({
      pascoa: "2026-04-05",
      carnaval: true,
      sexta_santa: true,
      corpus: true,
      consciencia: true,
      consciencia_2023: false,
      comum: false,
      // Sexta 30/10 → segunda 02/11 é Finados → terça 03/11.
      apos_finados: "2026-11-03",
      zero: null,
      uteis: 4,
      invertido: 0,
    });
  });

  it("feriado da empresa: só o admin cadastra e remove; conta como dia não útil só na empresa dele", async () => {
    expect((await vendedor.cliente.from("empresa_feriados").insert({ empresa_id: empresa, data: "2026-11-03", nome: "Municipal" })).error?.code).toBe("42501");
    expect((await adminB.cliente.from("empresa_feriados").insert({ empresa_id: empresa, data: "2026-11-03", nome: "Municipal" })).error?.code).toBe("42501");
    const { data: f } = ok(
      await admin.cliente.from("empresa_feriados").insert({ empresa_id: empresa, data: "2026-11-03", nome: "Municipal" }).select("id").single(),
      "feriado",
    );
    expect(await vence("2026-10-30", 1)).toBe("2026-11-04");
    const [b] = await noBanco("select public.somar_dias_uteis($1, '2026-10-30', 1)::text as d", [empresaB]);
    expect(b.d).toBe("2026-11-03");
    expect((await admin.cliente.from("empresa_feriados").update({ nome: "Outro" }).eq("id", f!.id)).error?.code).toBe("42501");
    // Vendedor não apaga (RLS: nenhuma linha afetada).
    await vendedor.cliente.from("empresa_feriados").delete().eq("id", f!.id);
    expect((await servico.from("empresa_feriados").select("id").eq("id", f!.id)).data).toHaveLength(1);
    ok(await admin.cliente.from("empresa_feriados").delete().eq("id", f!.id), "remover");
    expect(await vence("2026-10-30", 1)).toBe("2026-11-03");
  });

  it("prazos padrão nascem com a empresa; o admin só muda os dias", async () => {
    const { data } = await admin.cliente.from("engenharia_prazos").select("chave, dias_uteis").eq("empresa_id", empresa).order("chave");
    expect(Object.fromEntries((data ?? []).map((p) => [p.chave, p.dias_uteis]))).toEqual({
      a_iniciar: 2,
      projeto_em_elaboracao: 5,
      exigencia: 3,
      correcao_campo: 5,
      distribuidora_analise: null,
      distribuidora_vistoria: null,
      distribuidora_conexao: null,
    });
    expect((await admin.cliente.from("engenharia_prazos").insert({ empresa_id: empresa, chave: "a_iniciar", dias_uteis: 1 })).error?.code).toBe("42501");
    expect((await admin.cliente.from("engenharia_prazos").delete().eq("empresa_id", empresa)).error?.code).toBe("42501");
    expect((await admin.cliente.from("engenharia_prazos").update({ chave: "exigencia" }).eq("empresa_id", empresa).eq("chave", "a_iniciar")).error?.code).toBe("42501");
    expect((await admin.cliente.from("engenharia_prazos").update({ dias_uteis: 0 }).eq("empresa_id", empresa).eq("chave", "a_iniciar")).error?.code).toBe("23514");
    for (const quem of [vendedor, execEng, adminB]) {
      await quem.cliente.from("engenharia_prazos").update({ dias_uteis: 9 }).eq("empresa_id", empresa).eq("chave", "a_iniciar");
    }
    const { data: igual } = await servico.from("engenharia_prazos").select("dias_uteis").eq("empresa_id", empresa).eq("chave", "a_iniciar").single();
    expect(igual!.dias_uteis).toBe(2);
    ok(await admin.cliente.from("engenharia_prazos").update({ dias_uteis: 10 }).eq("empresa_id", empresa).eq("chave", "distribuidora_analise"), "configurar");
  });

  it("prazo da etapa: obra nova em 'A iniciar' conta 2 dias úteis a partir de hoje", async () => {
    const lista = await prazos(execEng);
    expect(lista).toEqual([{ obra_id: obra, chave: "a_iniciar", inicio: hoje(), limite: await vence(hoje(), 2), dias_restantes: 2 }]);
    // O vendedor vê a etapa da obra dele; o admin de outra empresa, nada.
    expect((await prazos(vendedor)).map((p) => p.chave)).toEqual(["a_iniciar"]);
    const { data: deB } = await adminB.cliente.rpc("prazos_engenharia", { p_empresa_id: empresa });
    expect(deB ?? []).toEqual([]);
  });

  it("protocolo: sai o prazo da etapa e entra o da distribuidora; exigência aberta troca para o prazo interno", async () => {
    ok(await execEng.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
    const r = ok(
      await execEng.cliente.rpc("registrar_protocolo_engenharia", {
        p_obra_id: obra,
        p_distribuidora: "Copel",
        p_canal: "pew",
        p_numero: `PZ-${sufixo}`,
        p_tipo_solicitacao: "nova_conexao",
        p_protocolado_em: hoje(),
      }),
      "protocolo",
    );
    protocolo = r.data as string;
    expect(await prazos(execEng)).toEqual([
      { obra_id: obra, chave: "distribuidora_analise", inicio: hoje(), limite: await vence(hoje(), 10), dias_restantes: 10 },
    ]);
    // Quem não vê os registros da Engenharia não recebe o prazo do protocolo.
    expect(await prazos(vendedor)).toEqual([]);

    ok(
      await execEng.cliente.rpc("registrar_evento_protocolo_engenharia", {
        p_protocolo_id: protocolo,
        p_tipo: "exigencia",
        p_ocorrido_em: hoje(),
        p_categoria: "projeto_eletrico",
        p_descricao: "Diagrama ilegível",
      }),
      "exigência",
    );
    expect(await prazos(execEng)).toEqual([{ obra_id: obra, chave: "exigencia", inicio: hoje(), limite: await vence(hoje(), 3), dias_restantes: 3 }]);
  });

  it("indicadores: carteira, tempo na etapa e protocolos com exigência; só da empresa de quem chama", async () => {
    const desde = hoje();
    const { data, error } = await admin.cliente.rpc("indicadores_engenharia", { p_empresa_id: empresa, p_desde: desde });
    if (error) throw error;
    const ind = data as {
      carteira: { total: number; paradas: number };
      etapas: { etapa: string; mediana: number; n: number }[];
      protocolo_aprovacao: { mediana: number | null; n: number };
      exigencia: { com: number; total: number };
      nao_conformidade: { com: number; total: number };
      conexao: { mediana: number | null; n: number };
    };
    expect(ind.carteira).toEqual({ total: 1, paradas: 0 });
    expect(ind.etapas).toEqual([{ etapa: "a_iniciar", mediana: 0, n: 1 }]);
    expect(ind.exigencia).toEqual({ com: 1, total: 1 });
    expect(ind.protocolo_aprovacao).toEqual({ mediana: null, n: 0 });
    expect(ind.nao_conformidade).toEqual({ com: 0, total: 0 });
    expect(ind.conexao).toEqual({ mediana: null, n: 0 });

    // Quem atua na Engenharia vê a mesma carteira; quem é de outra empresa não consulta.
    const { data: deExec } = await execEng.cliente.rpc("indicadores_engenharia", { p_empresa_id: empresa, p_desde: desde });
    expect((deExec as typeof ind).carteira.total).toBe(1);
    expect((await adminB.cliente.rpc("indicadores_engenharia", { p_empresa_id: empresa, p_desde: desde })).error?.code).toBe("42501");
  });
});
