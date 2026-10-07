/**
 * Obras — PR 3b-3 (20261008100000_obras_escrita_operacao.sql): escritas controladas do papel
 * `operacao` (participantes, fluxos, marcos), encerramento automático de participações
 * (setor retirado, desativação, troca de papel), auditoria de setores e bloqueios por obra
 * pausada/cancelada. Toda escrita é por RPC; a escrita direta continua revogada.
 * Precisa do Supabase local (roda no CI).
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const URL_BANCO =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Trava: teste direto no Postgres só contra banco local, nunca remoto/produção.
function urlBancoLocal() {
  const host = new URL(URL_BANCO).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Teste direto no banco recusado: host "${host}" não é local.`);
  }
  return URL_BANCO;
}

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

const PESSOAIS = {
  documento: "987.654.321-00",
  telefone: "(62) 97777-0001",
  endereco: "Rua da Escrita, 42",
};

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let vendedorTemp: Usuario;
let sdr: Usuario;
let coordEng: Usuario;
let coordOp: Usuario;
let execEng: Usuario;
let execEng2: Usuario;
let execOp: Usuario;
let execCompras: Usuario;
let opSemSetor: Usuario;
let opInativo: Usuario;
let opDesativar: Usuario;
let opTrocaPapel: Usuario;
let opRemoveSetor: Usuario;
let opConc1: Usuario;
let opConc2: Usuario;
let superAdmin: Usuario;
let adminB: Usuario;
let coordB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obraA: string;
let obraX: string;
let obraP: string;
let obraC: string;
let obraDeB: string;

async function criarVenda(
  emp: string,
  responsavel: Usuario,
  confirmador: Usuario,
  titulo: string,
): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico
    .from("etapas")
    .select("id")
    .eq("funil_id", f!.id)
    .order("ordem")
    .limit(1)
    .single();
  const { data: c } = await servico
    .from("contatos")
    .insert({
      empresa_id: emp,
      nome: `Cliente ${titulo}`,
      cidade: "Goiânia",
      uf: "GO",
      documento: PESSOAIS.documento,
      telefone: PESSOAIS.telefone,
      endereco: PESSOAIS.endereco,
    })
    .select("id")
    .single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: emp,
      titulo,
      contato_id: c!.id,
      funil_id: f!.id,
      etapa_id: et!.id,
      responsavel_id: membro[responsavel.id],
      valor: 30000,
    })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await responsavel.cliente
    .from("negocios")
    .update({ status: "ganho" })
    .eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await responsavel.cliente
    .from("contratos")
    .insert({ empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (erroContrato) throw erroContrato;
  const assinado = await responsavel.cliente
    .from("contratos")
    .update({ status: "assinado" })
    .eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", {
    p_contrato_id: contrato!.id,
  });
  if (erroPagamento) throw erroPagamento;
  const { data: obra } = await servico
    .from("obras")
    .select("id")
    .eq("negocio_id", neg!.id)
    .single();
  return obra!.id;
}

type Setor = "compras" | "engenharia" | "operacional" | "comercial";
type Funcao = "responsavel" | "apoio" | "substituto" | "vendedor" | "sdr";

const atribuir = (
  quem: Usuario,
  obra: string,
  alvo: Usuario,
  setor: Setor,
  opcoes: { funcao?: Funcao; principal?: boolean; substitui?: string } = {},
) =>
  quem.cliente.rpc("atribuir_participante_obra", {
    p_obra_id: obra,
    p_membro_id: membro[alvo.id],
    p_setor: setor,
    p_funcao: opcoes.funcao ?? "apoio",
    p_principal: opcoes.principal ?? false,
    ...(opcoes.substitui ? { p_substitui_id: opcoes.substitui } : {}),
  });

const encerrar = (quem: Usuario, participante: string, motivo = "Troca de equipe") =>
  quem.cliente.rpc("encerrar_participante_obra", {
    p_participante_id: participante,
    p_motivo: motivo,
  });

const status = (quem: Usuario, obra: string, setor: Setor, novo: string) =>
  quem.cliente.rpc("alterar_status_fluxo_obra", {
    p_obra_id: obra,
    p_setor: setor,
    p_status: novo,
  });

const marco = (
  quem: Usuario,
  obra: string,
  qual: "nf_cliente" | "garantia",
  novo: "pendente" | "concluido" | "nao_se_aplica",
  motivo?: string,
) =>
  quem.cliente.rpc("atualizar_marco_obra", {
    p_obra_id: obra,
    p_marco: qual,
    p_status: novo,
    ...(motivo === undefined ? {} : { p_motivo: motivo }),
  });

const definirSetores = (quem: Usuario, alvo: Usuario, setores: unknown) =>
  quem.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[alvo.id],
    p_setores: setores as never,
  });

async function fluxo(obra: string, setor: Setor) {
  const { data } = await servico
    .from("obra_fluxos")
    .select("*")
    .eq("obra_id", obra)
    .eq("setor", setor)
    .single();
  return data!;
}

async function participacoesAtivas(alvo: Usuario) {
  const { data } = await servico
    .from("obra_participantes")
    .select("id, obra_id, setor")
    .eq("membro_id", membro[alvo.id])
    .is("fim", null);
  return data!;
}

async function historico(obra: string, tipo: string) {
  const { data } = await servico
    .from("obra_historico")
    .select("id, tipo, setor, autor_user_id, autor_membro_id, autor_contexto, dados")
    .eq("obra_id", obra)
    .eq("tipo", tipo)
    .order("id");
  return data!;
}

async function documentoVisivel(quem: Usuario, obra: string) {
  const { data } = await quem.cliente.rpc("obras_operacao", { p_obra_id: obra });
  return data?.[0]?.cliente_documento ?? null;
}

beforeAll(async () => {
  [
    admin,
    gestor,
    vendedor,
    vendedorTemp,
    sdr,
    coordEng,
    coordOp,
    execEng,
    execEng2,
    execOp,
    execCompras,
    opSemSetor,
    opInativo,
    opDesativar,
    opTrocaPapel,
    opRemoveSetor,
    opConc1,
    opConc2,
    superAdmin,
    adminB,
    coordB,
    vendedorB,
  ] = await Promise.all(
    [
      "oe-admin",
      "oe-gestor",
      "oe-vendedor",
      "oe-vendedor-temp",
      "oe-sdr",
      "oe-coord-eng",
      "oe-coord-op",
      "oe-exec-eng",
      "oe-exec-eng2",
      "oe-exec-op",
      "oe-exec-compras",
      "oe-op-sem-setor",
      "oe-op-inativo",
      "oe-op-desativar",
      "oe-op-troca-papel",
      "oe-op-remove-setor",
      "oe-op-conc1",
      "oe-op-conc2",
      "oe-super",
      "oe-admin-b",
      "oe-coord-b",
      "oe-vendedor-b",
    ].map(criarUsuario),
  );
  await servico.from("plataforma_admins").insert({ user_id: superAdmin.id });

  const { data: empresas } = await servico
    .from("empresas")
    .insert([{ nome: `Escrita A ${sufixo}` }, { nome: `Escrita B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  empresa = empresas![0].id;
  empresaB = empresas![1].id;

  const closer = { papel: "vendedor" as const, perfil_gamificacao: "closer" as const };
  const operacao = { papel: "operacao" as const };
  const vinculos: [Usuario, string, object][] = [
    [admin, empresa, { papel: "admin" }],
    [gestor, empresa, { papel: "gestor" }],
    [vendedor, empresa, closer],
    [vendedorTemp, empresa, closer],
    [sdr, empresa, { papel: "sdr", perfil_gamificacao: "sdr" }],
    ...[
      coordEng,
      coordOp,
      execEng,
      execEng2,
      execOp,
      execCompras,
      opSemSetor,
      opInativo,
      opDesativar,
      opTrocaPapel,
      opRemoveSetor,
      opConc1,
      opConc2,
    ].map((u): [Usuario, string, object] => [u, empresa, operacao]),
    [adminB, empresaB, { papel: "admin" }],
    [coordB, empresaB, operacao],
    [vendedorB, empresaB, closer],
  ];
  const { data: linhas, error } = await servico
    .from("empresa_membros")
    .insert(
      vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never,
    )
    .select("id, user_id");
  if (error) throw error;
  for (const l of linhas!) membro[l.user_id] = l.id;

  // Setores (admin). coordOp coordena operacional e só executa engenharia.
  const setores: [Usuario, Usuario, unknown][] = [
    [admin, coordEng, [{ setor: "engenharia", capacidade: "coordenar" }]],
    [
      admin,
      coordOp,
      [
        { setor: "operacional", capacidade: "coordenar" },
        { setor: "engenharia", capacidade: "executar" },
      ],
    ],
    [admin, execEng, [{ setor: "engenharia", capacidade: "executar" }]],
    [admin, execEng2, [{ setor: "engenharia", capacidade: "executar" }]],
    [admin, execOp, [{ setor: "operacional", capacidade: "executar" }]],
    [admin, execCompras, [{ setor: "compras", capacidade: "executar" }]],
    [admin, opInativo, [{ setor: "engenharia", capacidade: "executar" }]],
    [admin, opDesativar, [{ setor: "engenharia", capacidade: "executar" }]],
    [admin, opTrocaPapel, [{ setor: "engenharia", capacidade: "executar" }]],
    [
      admin,
      opRemoveSetor,
      [
        { setor: "operacional", capacidade: "executar" },
        { setor: "engenharia", capacidade: "executar" },
      ],
    ],
    [admin, opConc1, [{ setor: "operacional", capacidade: "executar" }]],
    [admin, opConc2, [{ setor: "operacional", capacidade: "executar" }]],
    [adminB, coordB, [{ setor: "engenharia", capacidade: "coordenar" }]],
  ];
  for (const [quem, alvo, s] of setores) {
    const { error: e } = await definirSetores(quem, alvo, s);
    if (e) throw e;
  }
  await servico
    .from("empresa_membros")
    .update({ status: "inativo" })
    .eq("id", membro[opInativo.id]);

  // Obras pelo mecanismo real (#145).
  obraA = await criarVenda(empresa, vendedor, admin, "Obra A");
  obraX = await criarVenda(empresa, vendedorTemp, admin, "Obra X");
  obraP = await criarVenda(empresa, vendedor, admin, "Obra pausada");
  obraC = await criarVenda(empresa, vendedor, admin, "Obra cancelada");
  obraDeB = await criarVenda(empresaB, vendedorB, adminB, "Obra B");
  // Não há RPC de pausa/cancelamento ainda: o estado entra pelo dono do banco local.
  await noBanco(
    "update public.obras set pausada_em = now(), pausa_motivo = 'Aguardando cliente' where id = $1",
    [obraP],
  );
  await noBanco(
    "update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1",
    [obraC],
  );

  // Participações base (admin).
  for (const [obra, alvo, setor] of [
    [obraA, execEng, "engenharia"],
    [obraA, execOp, "operacional"],
    [obraP, execEng, "engenharia"],
    [obraP, execOp, "operacional"],
  ] as [string, Usuario, Setor][]) {
    const { error: e } = await atribuir(admin, obra, alvo, setor);
    if (e) throw e;
  }
});

describe("atribuição de participantes", () => {
  it("admin atribui em qualquer setor operacional, com histórico e autor real", async () => {
    const { data: id, error } = await atribuir(admin, obraX, execCompras, "compras");
    expect(error).toBeNull();
    const [linha] = (await historico(obraX, "participante_atribuido")).filter(
      (h) => (h.dados as { participante_id: string }).participante_id === id,
    );
    expect(linha).toMatchObject({
      setor: "compras",
      autor_user_id: admin.id,
      autor_membro_id: membro[admin.id],
      autor_contexto: { papel: "admin" },
      dados: {
        membro_id: membro[execCompras.id],
        funcao: "apoio",
        principal: false,
        autorizacao: "admin",
      },
    });
    const { data: p } = await servico
      .from("obra_participantes")
      .select("criado_por_user_id, fim")
      .eq("id", id!)
      .single();
    expect(p).toEqual({ criado_por_user_id: admin.id, fim: null });
  });

  it("coordenador atribui só no setor que coordena", async () => {
    const ok = await atribuir(coordEng, obraA, execEng2, "engenharia");
    expect(ok.error).toBeNull();
    const [linha] = (await historico(obraA, "participante_atribuido")).filter(
      (h) => (h.dados as { participante_id: string }).participante_id === ok.data,
    );
    expect(linha).toMatchObject({
      autor_user_id: coordEng.id,
      dados: { autorizacao: "coordenar" },
    });
    expect((await atribuir(coordEng, obraA, execOp, "operacional")).error).not.toBeNull();
    expect((await atribuir(coordOp, obraA, execEng2, "engenharia")).error).not.toBeNull();
  });

  it("coordenador não se autoatribui nem atribui outro coordenador; admin atribui coordenador", async () => {
    const proprio = await atribuir(coordEng, obraA, coordEng, "engenharia");
    expect(proprio.error?.message).toContain("Você não pode se atribuir");
    const outroCoord = await atribuir(coordEng, obraA, coordOp, "engenharia");
    expect(outroCoord.error?.message).toContain("Só o admin atribui um coordenador");
    expect((await atribuir(admin, obraA, coordOp, "engenharia")).error).toBeNull();
  });

  it("executor, gestor, vendedor, SDR, super-admin e admin de outra empresa não atribuem", async () => {
    for (const quem of [execEng, gestor, vendedor, sdr, superAdmin, adminB, coordB]) {
      const { error } = await atribuir(quem, obraA, execEng2, "compras");
      expect(error, quem.email).not.toBeNull();
    }
    expect((await atribuir(coordB, obraDeB, execEng, "engenharia")).error).not.toBeNull();
  });

  it("alvo precisa ser operacao ativo da mesma empresa e ter o setor", async () => {
    const casos: [Usuario, Setor, string][] = [
      [vendedor, "engenharia", "papel Operação"],
      [gestor, "engenharia", "papel Operação"],
      [opInativo, "engenharia", "papel Operação"],
      [coordB, "engenharia", "papel Operação"],
      [opSemSetor, "engenharia", "não tem este setor"],
      [execCompras, "engenharia", "não tem este setor"],
    ];
    for (const [alvo, setor, trecho] of casos) {
      const { error } = await atribuir(admin, obraA, alvo, setor);
      expect(error?.message, alvo.email).toContain(trecho);
    }
  });

  it("recusa setor comercial, funções comerciais, principal sem responsável e duplicata", async () => {
    expect((await atribuir(admin, obraA, execEng, "comercial")).error?.message).toContain(
      "Setor inválido",
    );
    for (const funcao of ["vendedor", "sdr"] as Funcao[]) {
      expect(
        (await atribuir(admin, obraA, execEng2, "engenharia", { funcao })).error,
      ).not.toBeNull();
    }
    const semResp = await atribuir(admin, obraA, execEng2, "engenharia", { principal: true });
    expect(semResp.error?.message).toContain("Responsável");
    const dup = await atribuir(admin, obraA, execEng, "engenharia");
    expect(dup.error?.message).toContain("já participa");
  });

  it("principal: único por setor; troca só por substituição atômica", async () => {
    const primeiro = await atribuir(admin, obraA, execOp, "operacional", {
      funcao: "responsavel",
      principal: true,
    });
    expect(primeiro.error).toBeNull();
    const segundo = await atribuir(admin, obraA, opConc1, "operacional", {
      funcao: "responsavel",
      principal: true,
    });
    expect(segundo.error?.message).toContain("informe a substituição");

    const troca = await atribuir(admin, obraA, opConc1, "operacional", {
      funcao: "responsavel",
      principal: true,
      substitui: primeiro.data!,
    });
    expect(troca.error).toBeNull();
    const { data: principais } = await servico
      .from("obra_participantes")
      .select("id, membro_id, substitui_id")
      .eq("obra_id", obraA)
      .eq("setor", "operacional")
      .eq("principal", true)
      .is("fim", null);
    expect(principais).toEqual([
      { id: troca.data, membro_id: membro[opConc1.id], substitui_id: primeiro.data },
    ]);
    const { data: antigo } = await servico
      .from("obra_participantes")
      .select("fim")
      .eq("id", primeiro.data!)
      .single();
    expect(antigo!.fim).not.toBeNull();
    const encerrados = (await historico(obraA, "participante_encerrado")).filter(
      (h) => (h.dados as { participante_id: string }).participante_id === primeiro.data,
    );
    expect(encerrados).toHaveLength(1);
    expect(encerrados[0].dados).toMatchObject({ origem: "substituicao", autorizacao: "admin" });

    // Substituição inválida: participação de outro setor.
    const { data: deEng } = await servico
      .from("obra_participantes")
      .select("id")
      .eq("obra_id", obraA)
      .eq("membro_id", membro[execEng.id])
      .is("fim", null)
      .single();
    const errada = await atribuir(admin, obraA, opConc2, "operacional", { substitui: deEng!.id });
    expect(errada.error?.message).toContain("substituída");
  });

  it("concorrência: dois principais simultâneos no mesmo setor → só um entra", async () => {
    const [a, b] = await Promise.all([
      atribuir(admin, obraX, opConc1, "operacional", { funcao: "responsavel", principal: true }),
      atribuir(admin, obraX, opConc2, "operacional", { funcao: "responsavel", principal: true }),
    ]);
    expect([a.error, b.error].filter((e) => e === null)).toHaveLength(1);
    const { data } = await servico
      .from("obra_participantes")
      .select("id")
      .eq("obra_id", obraX)
      .eq("setor", "operacional")
      .eq("principal", true)
      .is("fim", null);
    expect(data).toHaveLength(1);
  });

  it("obra pausada permite gerir participantes; cancelada bloqueia", async () => {
    const naPausada = await atribuir(admin, obraP, execEng2, "engenharia");
    expect(naPausada.error).toBeNull();
    expect((await encerrar(admin, naPausada.data!)).error).toBeNull();
    const naCancelada = await atribuir(admin, obraC, execEng2, "engenharia");
    expect(naCancelada.error?.message).toContain("cancelada");
  });
});

describe("encerramento de participantes", () => {
  it("participação comercial da #145 não é encerrada por aqui", async () => {
    const { data: comercial } = await servico
      .from("obra_participantes")
      .select("id")
      .eq("obra_id", obraA)
      .eq("setor", "comercial")
      .single();
    expect((await encerrar(admin, comercial!.id)).error?.message).toContain("comerciais");
  });

  it("executor não encerra; ninguém encerra a própria; motivo obrigatório", async () => {
    const { data: alvo } = await atribuir(admin, obraX, execEng2, "engenharia");
    expect((await encerrar(execEng2, alvo!)).error).not.toBeNull();
    expect((await encerrar(execEng, alvo!)).error).not.toBeNull();
    expect((await encerrar(coordEng, alvo!, "  ")).error?.message).toContain("motivo");

    const { data: doCoord } = await atribuir(admin, obraX, coordEng, "engenharia");
    expect((await encerrar(coordEng, doCoord!)).error?.message).toContain("própria");
    expect((await encerrar(admin, doCoord!)).error).toBeNull();
  });

  it("coordenador encerra outro do próprio setor; encerrar remove dados pessoais na hora", async () => {
    const { data: alvo } = await servico
      .from("obra_participantes")
      .select("id")
      .eq("obra_id", obraX)
      .eq("membro_id", membro[execEng2.id])
      .is("fim", null)
      .single();
    expect(await documentoVisivel(execEng2, obraX)).toBe(PESSOAIS.documento);
    expect((await encerrar(coordOp, alvo!.id)).error).not.toBeNull(); // setor alheio
    expect((await encerrar(coordEng, alvo!.id, "Remanejado")).error).toBeNull();
    expect(await documentoVisivel(execEng2, obraX)).toBeNull();
    const [linha] = (await historico(obraX, "participante_encerrado")).filter(
      (h) => (h.dados as { participante_id: string }).participante_id === alvo!.id,
    );
    expect(linha).toMatchObject({
      setor: "engenharia",
      autor_user_id: coordEng.id,
      dados: { origem: "manual", motivo: "Remanejado", autorizacao: "coordenar" },
    });
    expect((await encerrar(coordEng, alvo!.id)).error?.message).toContain("já foi encerrada");
  });
});

describe("fluxos", () => {
  it("executor altera só o setor em que participa; sem participação, não", async () => {
    expect((await status(execEng, obraA, "engenharia", "projeto_em_elaboracao")).error).toBeNull();
    expect((await status(execEng, obraA, "compras", "cotando")).error).not.toBeNull();
    expect((await status(execCompras, obraA, "compras", "cotando")).error).not.toBeNull();
    expect((await status(execEng, obraX, "engenharia", "aprovado")).error).not.toBeNull();
  });

  it("coordenador atua no próprio setor mesmo sem participar, nunca em outro; admin em todos", async () => {
    expect((await status(coordEng, obraX, "engenharia", "projeto_em_elaboracao")).error).toBeNull();
    expect((await status(coordEng, obraX, "operacional", "agendada")).error).not.toBeNull();
    expect((await status(coordOp, obraX, "engenharia", "aprovado")).error).not.toBeNull();
    for (const [setor, alvo] of [
      ["compras", "cotando"],
      ["engenharia", "aprovado"],
      ["operacional", "agendada"],
    ] as [Setor, string][]) {
      expect((await status(admin, obraX, setor, alvo)).error, setor).toBeNull();
    }
  });

  it("gestor, vendedor, SDR, super-admin, outra empresa e comercial não alteram", async () => {
    for (const quem of [gestor, vendedor, sdr, superAdmin, adminB, coordB]) {
      expect(
        (await status(quem, obraA, "engenharia", "aprovado")).error,
        quem.email,
      ).not.toBeNull();
    }
    expect((await status(admin, obraA, "comercial", "aprovado")).error).not.toBeNull();
  });

  it("status inválido ou de outro setor é recusado; só o setor pedido muda", async () => {
    expect((await status(admin, obraA, "engenharia", "cotando")).error?.message).toContain(
      "Status inválido",
    );
    expect((await status(admin, obraA, "compras", "inexistente")).error).not.toBeNull();
    const antes = await Promise.all([fluxo(obraA, "compras"), fluxo(obraA, "operacional")]);
    expect((await status(admin, obraA, "engenharia", "aprovado")).error).toBeNull();
    const depois = await Promise.all([fluxo(obraA, "compras"), fluxo(obraA, "operacional")]);
    expect(depois).toEqual(antes);
  });

  it("datas só no servidor: início uma vez, conclusão entra/sai; retrocesso auditado", async () => {
    const inicial = await fluxo(obraX, "compras");
    expect(inicial.iniciado_em).not.toBeNull(); // saiu de a_comprar no teste do admin
    const iniciado = inicial.iniciado_em;

    expect((await status(admin, obraX, "compras", "faturado_fornecedor")).error).toBeNull();
    const final = await fluxo(obraX, "compras");
    expect(final.concluido_em).not.toBeNull();
    expect(final.iniciado_em).toBe(iniciado);

    const antesRetro = (await historico(obraX, "fluxo_alterado")).length;
    expect((await status(admin, obraX, "compras", "a_comprar")).error).toBeNull();
    const retro = await fluxo(obraX, "compras");
    expect(retro).toMatchObject({ status: "a_comprar", concluido_em: null, iniciado_em: iniciado });
    expect(new Date(retro.status_desde) >= new Date(final.status_desde)).toBe(true);

    const linhas = await historico(obraX, "fluxo_alterado");
    expect(linhas).toHaveLength(antesRetro + 1);
    expect(linhas.at(-1)).toMatchObject({
      setor: "compras",
      autor_user_id: admin.id,
      dados: {
        campo: "status",
        de: "faturado_fornecedor",
        para: "a_comprar",
        autorizacao: "admin",
      },
    });

    // Mesmo status: nada muda, nada é registrado.
    expect((await status(admin, obraX, "compras", "a_comprar")).error).toBeNull();
    expect(await historico(obraX, "fluxo_alterado")).toHaveLength(antesRetro + 1);
  });

  it("parado exige motivo; despausar limpa; tudo auditado", async () => {
    const parar = (quem: Usuario, p: boolean, motivo?: string) =>
      quem.cliente.rpc("marcar_parado_fluxo_obra", {
        p_obra_id: obraA,
        p_setor: "engenharia",
        p_parado: p,
        ...(motivo === undefined ? {} : { p_motivo: motivo }),
      });
    expect((await parar(execEng, true)).error?.message).toContain("motivo");
    expect((await parar(execEng, true, "Chuva")).error).toBeNull();
    expect(await fluxo(obraA, "engenharia")).toMatchObject({
      parado: true,
      parado_motivo: "Chuva",
    });
    expect((await parar(execOp, false)).error).not.toBeNull(); // setor alheio
    expect((await parar(execEng, false)).error).toBeNull();
    expect(await fluxo(obraA, "engenharia")).toMatchObject({ parado: false, parado_motivo: null });
    const ultimas = (await historico(obraA, "fluxo_alterado")).slice(-2);
    expect(ultimas.map((h) => (h.dados as { campo: string }).campo)).toEqual(["parado", "parado"]);
  });

  it("aguardando grava desde no servidor e limpa junto", async () => {
    const aguardar = (valor: "concessionaria" | null) =>
      execEng.cliente.rpc("definir_aguardando_fluxo_obra", {
        p_obra_id: obraA,
        p_setor: "engenharia",
        ...(valor ? { p_aguardando: valor } : {}),
      });
    expect((await aguardar("concessionaria")).error).toBeNull();
    const f = await fluxo(obraA, "engenharia");
    expect(f.aguardando).toBe("concessionaria");
    expect(f.aguardando_desde).not.toBeNull();
    expect((await aguardar(null)).error).toBeNull();
    expect(await fluxo(obraA, "engenharia")).toMatchObject({
      aguardando: null,
      aguardando_desde: null,
    });
  });

  it("obra pausada bloqueia fluxos; cancelada bloqueia tudo", async () => {
    expect((await status(admin, obraP, "engenharia", "aprovado")).error?.message).toContain(
      "pausada",
    );
    expect(
      (
        await execEng.cliente.rpc("marcar_parado_fluxo_obra", {
          p_obra_id: obraP,
          p_setor: "engenharia",
          p_parado: true,
          p_motivo: "x",
        })
      ).error?.message,
    ).toContain("pausada");
    expect(
      (
        await execEng.cliente.rpc("definir_aguardando_fluxo_obra", {
          p_obra_id: obraP,
          p_setor: "engenharia",
          p_aguardando: "cliente",
        })
      ).error?.message,
    ).toContain("pausada");
    expect((await status(admin, obraC, "engenharia", "aprovado")).error?.message).toContain(
      "cancelada",
    );
  });
});

describe("marcos", () => {
  it("só o setor operacional: executor operacional, coordenador operacional e admin", async () => {
    expect((await marco(execEng, obraA, "nf_cliente", "concluido")).error).not.toBeNull();
    expect((await marco(coordEng, obraA, "nf_cliente", "concluido")).error).not.toBeNull();
    expect((await marco(gestor, obraA, "nf_cliente", "concluido")).error).not.toBeNull();
    expect((await marco(execOp, obraA, "nf_cliente", "concluido")).error).toBeNull();
    const { data: m1 } = await servico
      .from("obra_marcos")
      .select("*")
      .eq("obra_id", obraA)
      .eq("marco", "nf_cliente")
      .single();
    expect(m1!.concluido_em).not.toBeNull();
    expect(m1!.concluido_por_membro_id).toBe(membro[execOp.id]);

    expect((await marco(coordOp, obraA, "nf_cliente", "pendente")).error).toBeNull();
    const { data: m2 } = await servico
      .from("obra_marcos")
      .select("*")
      .eq("obra_id", obraA)
      .eq("marco", "nf_cliente")
      .single();
    expect(m2).toMatchObject({
      status: "pendente",
      concluido_em: null,
      concluido_por_membro_id: null,
    });

    expect((await marco(admin, obraA, "garantia", "nao_se_aplica")).error?.message).toContain(
      "não se aplica",
    );
    expect(
      (await marco(admin, obraA, "garantia", "nao_se_aplica", "Sem garantia")).error,
    ).toBeNull();

    const linhas = await historico(obraA, "marco_alterado");
    expect(linhas.map((h) => (h.dados as { autorizacao: string }).autorizacao)).toEqual([
      "executar",
      "coordenar",
      "admin",
    ]);
    expect(linhas[1]).toMatchObject({
      setor: "operacional",
      autor_user_id: coordOp.id,
      dados: { marco: "nf_cliente", de: { status: "concluido" }, para: { status: "pendente" } },
    });
  });

  it("obra pausada e cancelada bloqueiam marcos", async () => {
    expect((await marco(admin, obraP, "garantia", "concluido")).error?.message).toContain(
      "pausada",
    );
    expect((await marco(admin, obraC, "garantia", "concluido")).error?.message).toContain(
      "cancelada",
    );
  });
});

describe("encerramento automático (participação nunca fica adormecida)", () => {
  it("desativar encerra participações e remove dados pessoais; reativar não restaura", async () => {
    const { error } = await atribuir(admin, obraX, opDesativar, "engenharia");
    expect(error).toBeNull();
    expect(await documentoVisivel(opDesativar, obraX)).toBe(PESSOAIS.documento);

    await servico
      .from("empresa_membros")
      .update({ status: "inativo" })
      .eq("id", membro[opDesativar.id]);
    expect(await participacoesAtivas(opDesativar)).toEqual([]);
    const linhas = (await historico(obraX, "participante_encerrado")).filter(
      (h) => (h.dados as { membro_id: string }).membro_id === membro[opDesativar.id],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].dados).toMatchObject({ origem: "membro_desativado" });

    await servico
      .from("empresa_membros")
      .update({ status: "ativo" })
      .eq("id", membro[opDesativar.id]);
    expect(await participacoesAtivas(opDesativar)).toEqual([]);
    expect(await documentoVisivel(opDesativar, obraX)).toBeNull();
    expect((await status(opDesativar, obraX, "engenharia", "aprovado")).error).not.toBeNull();
  });

  it("deixar o papel operacao encerra participações; voltar não restaura", async () => {
    expect((await atribuir(admin, obraX, opTrocaPapel, "engenharia")).error).toBeNull();
    await servico
      .from("empresa_membros")
      .update({ papel: "vendedor", perfil_gamificacao: "closer" })
      .eq("id", membro[opTrocaPapel.id]);
    expect(await participacoesAtivas(opTrocaPapel)).toEqual([]);
    const linhas = (await historico(obraX, "participante_encerrado")).filter(
      (h) => (h.dados as { membro_id: string }).membro_id === membro[opTrocaPapel.id],
    );
    expect(linhas.map((h) => (h.dados as { origem: string }).origem)).toEqual(["papel_alterado"]);

    await servico
      .from("empresa_membros")
      .update({ papel: "operacao", perfil_gamificacao: null })
      .eq("id", membro[opTrocaPapel.id]);
    expect(await participacoesAtivas(opTrocaPapel)).toEqual([]);
    expect(await documentoVisivel(opTrocaPapel, obraX)).toBeNull();
  });

  it("retirar o setor encerra só as participações daquele setor, com histórico e auditoria", async () => {
    expect((await atribuir(admin, obraX, opRemoveSetor, "operacional")).error).toBeNull();
    expect((await atribuir(admin, obraX, opRemoveSetor, "engenharia")).error).toBeNull();
    expect(
      (
        await definirSetores(admin, opRemoveSetor, [
          { setor: "engenharia", capacidade: "executar" },
        ])
      ).error,
    ).toBeNull();

    expect((await participacoesAtivas(opRemoveSetor)).map((p) => p.setor)).toEqual(["engenharia"]);
    const linhas = (await historico(obraX, "participante_encerrado")).filter(
      (h) => (h.dados as { membro_id: string }).membro_id === membro[opRemoveSetor.id],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      setor: "operacional",
      autor_user_id: admin.id,
      dados: { origem: "setor_removido" },
    });
    expect((await status(opRemoveSetor, obraX, "operacional", "agendada")).error).not.toBeNull();

    const { data: aud } = await servico
      .from("membro_setores_obra_historico")
      .select("setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id")
      .eq("membro_id", membro[opRemoveSetor.id])
      .eq("setor", "operacional")
      .order("id");
    expect(aud).toEqual([
      {
        setor: "operacional",
        capacidade_antes: null,
        capacidade_depois: "executar",
        autor_user_id: admin.id,
        autor_membro_id: membro[admin.id],
      },
      {
        setor: "operacional",
        capacidade_antes: "executar",
        capacidade_depois: null,
        autor_user_id: admin.id,
        autor_membro_id: membro[admin.id],
      },
    ]);
  });

  it("participação comercial (vendedor da #145) nunca é encerrada automaticamente", async () => {
    await servico
      .from("empresa_membros")
      .update({ status: "inativo" })
      .eq("id", membro[vendedorTemp.id]);
    const { data } = await servico
      .from("obra_participantes")
      .select("fim")
      .eq("obra_id", obraX)
      .eq("setor", "comercial")
      .eq("membro_id", membro[vendedorTemp.id])
      .single();
    expect(data!.fim).toBeNull();
  });
});

describe("auditoria de setores (membro_setores_obra_historico)", () => {
  it("registra antes/depois só do que mudou, com autor real", async () => {
    const contar = async () => {
      const { count } = await servico
        .from("membro_setores_obra_historico")
        .select("id", { count: "exact", head: true })
        .eq("membro_id", membro[execEng2.id]);
      return count!;
    };
    const antes = await contar();
    await definirSetores(admin, execEng2, [{ setor: "engenharia", capacidade: "executar" }]);
    expect(await contar()).toBe(antes);
    await definirSetores(admin, execEng2, [{ setor: "engenharia", capacidade: "coordenar" }]);
    const { data } = await servico
      .from("membro_setores_obra_historico")
      .select("capacidade_antes, capacidade_depois, autor_user_id")
      .eq("membro_id", membro[execEng2.id])
      .order("id", { ascending: false })
      .limit(1);
    expect(data).toEqual([
      { capacidade_antes: "executar", capacidade_depois: "coordenar", autor_user_id: admin.id },
    ]);
  });

  it("leitura: admin da empresa e super-admin; ninguém mais", async () => {
    const { data: doAdmin } = await admin.cliente
      .from("membro_setores_obra_historico")
      .select("empresa_id");
    expect(doAdmin!.length).toBeGreaterThan(0);
    expect(doAdmin!.every((l) => l.empresa_id === empresa)).toBe(true);
    const { data: doSuper } = await superAdmin.cliente
      .from("membro_setores_obra_historico")
      .select("id")
      .eq("empresa_id", empresa);
    expect(doSuper!.length).toBeGreaterThan(0);
    for (const quem of [gestor, vendedor, sdr, coordEng, execEng, adminB]) {
      const { data } = await quem.cliente
        .from("membro_setores_obra_historico")
        .select("id")
        .eq("empresa_id", empresa);
      expect(data, quem.email).toEqual([]);
    }
  });

  it("imutável e sem escrita direta (nem service_role)", async () => {
    const insert = await servico.from("membro_setores_obra_historico").insert({
      empresa_id: empresa,
      membro_id: membro[execEng.id],
      setor: "compras",
      capacidade_depois: "executar",
    });
    expect(insert.error).not.toBeNull();
    expect(
      (await admin.cliente.from("membro_setores_obra_historico").delete().eq("empresa_id", empresa))
        .error,
    ).not.toBeNull();
    await expect(
      noBanco(
        "update public.membro_setores_obra_historico set setor = 'compras' where empresa_id = $1",
        [empresa],
      ),
    ).rejects.toThrow(/não pode ser alterado/);
  });
});

describe("segurança", () => {
  it("escrita direta nas tabelas de Obras continua revogada (inclusive service_role)", async () => {
    for (const cliente of [admin.cliente, coordEng.cliente, servico]) {
      expect(
        (await cliente.from("obra_fluxos").update({ status: "cotando" }).eq("obra_id", obraA))
          .error,
      ).not.toBeNull();
      expect(
        (
          await cliente.from("obra_participantes").insert({
            obra_id: obraA,
            empresa_id: empresa,
            membro_id: membro[execEng2.id],
            setor: "engenharia",
            funcao: "apoio",
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await cliente.from("obra_marcos").update({ status: "concluido" }).eq("obra_id", obraA))
          .error,
      ).not.toBeNull();
    }
  });

  it("coordenar não vira acesso comercial nem ao valor vendido", async () => {
    for (const quem of [coordEng, coordOp, execEng]) {
      const [valor, negocios, contatos] = await Promise.all([
        quem.cliente.from("obra_dados_comerciais").select("obra_id"),
        quem.cliente.from("negocios").select("id"),
        quem.cliente.from("contatos").select("id"),
      ]);
      expect(valor.data, quem.email).toEqual([]);
      expect(negocios.data, quem.email).toEqual([]);
      expect(contatos.data, quem.email).toEqual([]);
    }
  });

  it("histórico da obra: novos tipos aceitos, tipo desconhecido recusado, imutável", async () => {
    await expect(
      noBanco(
        "insert into public.obra_historico (obra_id, empresa_id, tipo) values ($1, $2, 'inventado')",
        [obraA, empresa],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      noBanco("update public.obra_historico set dados = '{}' where obra_id = $1", [obraA]),
    ).rejects.toThrow(/não pode ser alterado/);
  });

  /** Quem tem EXECUTE na função (PUBLIC = grantee 0). */
  async function quemExecuta(assinatura: string) {
    const [acl] = await noBanco(
      "select proacl is null as padrao from pg_proc where oid = $1::regprocedure",
      [assinatura],
    );
    expect(acl.padrao, `${assinatura} com privilégio padrão`).toBe(false);
    const rows = await noBanco(
      "select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel " +
        "from pg_proc p cross join lateral aclexplode(p.proacl) a " +
        "where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'",
      [assinatura],
    );
    return rows.map((r) => r.papel as string);
  }

  it("RPCs: só authenticated executa; funções internas: nenhum cliente", async () => {
    for (const fn of [
      "atribuir_participante_obra(uuid, uuid, setor_obra, funcao_participante_obra, boolean, uuid)",
      "encerrar_participante_obra(uuid, text)",
      "alterar_status_fluxo_obra(uuid, setor_obra, text)",
      "marcar_parado_fluxo_obra(uuid, setor_obra, boolean, text)",
      "definir_aguardando_fluxo_obra(uuid, setor_obra, aguardando_obra)",
      "atualizar_marco_obra(uuid, marco_obra, status_marco_obra, text)",
      "definir_setores_membro(uuid, jsonb)",
    ]) {
      const papeis = await quemExecuta(`public.${fn}`);
      expect(papeis, fn).toContain("authenticated");
      for (const papel of ["PUBLIC", "anon", "service_role"])
        expect(papeis, fn).not.toContain(papel);
    }
    for (const fn of [
      "autorizacao_setor_obra(uuid, setor_obra)",
      "preparar_escrita_obra(uuid, setor_obra, boolean)",
      "encerrar_participacoes_operacionais(uuid, setor_obra, text, text)",
      "obra_ao_alterar_membro()",
      "proteger_membro_setores_obra_historico()",
    ]) {
      const papeis = await quemExecuta(`public.${fn}`);
      for (const papel of ["PUBLIC", "anon", "authenticated", "service_role"])
        expect(papeis, fn).not.toContain(papel);
    }
    expect(
      (
        await admin.cliente.rpc("autorizacao_setor_obra", {
          p_obra_id: obraA,
          p_setor: "engenharia",
        })
      ).error,
    ).not.toBeNull();
  });

  it("anon não chama as RPCs", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect(
      (
        await anon.rpc("alterar_status_fluxo_obra", {
          p_obra_id: obraA,
          p_setor: "engenharia",
          p_status: "aprovado",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("encerrar_participante_obra", {
          p_participante_id: randomUUID(),
          p_motivo: "x",
        })
      ).error,
    ).not.toBeNull();
  });
});
