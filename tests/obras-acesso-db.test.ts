/**
 * Obras — PR 3b-2 (20261007200000_obras_acesso_operacao.sql): acesso do papel `operacao`
 * a Obras (participante ativo ou coordenador de setor), identidade básica dos colegas
 * (nome + avatar, sem e-mail/telefone) e a tabela `membro_setores_obra`. Valor vendido
 * continua fechado para `operacao`; os 4 papéis comerciais veem exatamente o que viam;
 * quem não é `operacao` não ganha acesso só por constar em obra_participantes.
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

let admin: Usuario;
let gestor: Usuario;
let gestorFora: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let sdr: Usuario;
let opSemSetor: Usuario;
let opParticipante: Usuario;
let opParticipanteEncerrado: Usuario;
let opCoordena: Usuario;
let opExecuta: Usuario;
let opInativoParticipante: Usuario;
let opInativoCoordena: Usuario;
let opAlvo: Usuario;
let adminB: Usuario;
let opCoordenaB: Usuario;
let vendedorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let funilB: string;
let etapaInicialB: string;
let obraA: string;
let obraB: string;
let obraDeB: string;

async function noBanco(sql: string, params: unknown[]) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    await banco.query(sql, params);
  } finally {
    await banco.end();
  }
}

// Ninguém escreve em obra_participantes pela API (nem service_role): o cenário entra pelo
// dono do banco local, mesmo método das invariantes de obras-db.test.ts.
async function participar(
  obraId: string,
  empresaId: string,
  membroId: string,
  opcoes: { encerrado?: boolean } = {},
) {
  await noBanco(
    `insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, fim)
     values ($1, $2, $3, 'engenharia', 'apoio', ${opcoes.encerrado ? "now()" : "null"})`,
    [obraId, empresaId, membroId],
  );
}

async function criarVenda(
  emp: string,
  f: string,
  etapa: string,
  responsavelId: string,
  ator: Usuario,
  confirmador: Usuario,
  titulo: string,
) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ empresa_id: emp, nome: `Cliente ${titulo}`, cidade: "Goiânia", uf: "GO" })
    .select("id")
    .single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: emp,
      titulo,
      contato_id: c!.id,
      funil_id: f,
      etapa_id: etapa,
      responsavel_id: responsavelId,
      valor: 25000,
    })
    .select("id")
    .single();
  if (error) throw error;
  const negocioId = neg!.id;
  const ganho = await ator.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioId);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: erroContrato } = await ator.cliente
    .from("contratos")
    .insert({ empresa_id: emp, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (erroContrato) throw erroContrato;
  const assinado = await ator.cliente
    .from("contratos")
    .update({ status: "assinado" })
    .eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  // Só gestor/admin confirma pagamento; o vendedor segue como ator comercial.
  const { error: erroPagamento } = await confirmador.cliente.rpc("confirmar_pagamento", {
    p_contrato_id: contrato!.id,
  });
  if (erroPagamento) throw erroPagamento;
  const { data: obra } = await servico
    .from("obras")
    .select("id")
    .eq("negocio_id", negocioId)
    .single();
  return obra!.id;
}

beforeAll(async () => {
  [
    admin,
    gestor,
    gestorFora,
    vendedor,
    vendedor2,
    sdr,
    opSemSetor,
    opParticipante,
    opParticipanteEncerrado,
    opCoordena,
    opExecuta,
    opInativoParticipante,
    opInativoCoordena,
    opAlvo,
    adminB,
    opCoordenaB,
    vendedorB,
  ] = await Promise.all(
    [
      "oa-admin",
      "oa-gestor",
      "oa-gestor-fora",
      "oa-vendedor",
      "oa-vendedor2",
      "oa-sdr",
      "oa-op-sem-setor",
      "oa-op-participante",
      "oa-op-encerrado",
      "oa-op-coordena",
      "oa-op-executa",
      "oa-op-inativo-part",
      "oa-op-inativo-coord",
      "oa-op-alvo",
      "oa-admin-b",
      "oa-op-coordena-b",
      "oa-vendedor-b",
    ].map(criarUsuario),
  );

  const { data: empresas } = await servico
    .from("empresas")
    .insert([{ nome: `Acesso A ${sufixo}` }, { nome: `Acesso B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  empresa = empresas![0].id;
  empresaB = empresas![1].id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorFora.id, papel: "gestor" },
      {
        empresa_id: empresa,
        user_id: vendedor.id,
        papel: "vendedor",
        perfil_gamificacao: "closer",
      },
      {
        empresa_id: empresa,
        user_id: vendedor2.id,
        papel: "vendedor",
        perfil_gamificacao: "closer",
      },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: opSemSetor.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opParticipante.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opParticipanteEncerrado.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opCoordena.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opExecuta.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opInativoParticipante.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opInativoCoordena.id, papel: "operacao" },
      { empresa_id: empresa, user_id: opAlvo.id, papel: "operacao" },
      { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
      { empresa_id: empresaB, user_id: opCoordenaB.id, papel: "operacao" },
      {
        empresa_id: empresaB,
        user_id: vendedorB.id,
        papel: "vendedor",
        perfil_gamificacao: "closer",
      },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const primeiraEtapa = async (emp: string) => {
    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
    const { data: et } = await servico
      .from("etapas")
      .select("id")
      .eq("funil_id", f!.id)
      .order("ordem")
      .limit(1)
      .single();
    return { funil: f!.id, etapa: et!.id };
  };
  ({ funil, etapa: etapaInicial } = await primeiraEtapa(empresa));
  ({ funil: funilB, etapa: etapaInicialB } = await primeiraEtapa(empresaB));

  // Gestor da equipe do vendedor; gestorFora não tem equipe.
  const { data: equipe } = await servico
    .from("equipes")
    .insert({ empresa_id: empresa, nome: "Equipe acesso" })
    .select("id")
    .single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);

  // Obras pelo mecanismo real (ganho + contrato assinado + pagamento confirmado).
  obraA = await criarVenda(
    empresa,
    funil,
    etapaInicial,
    membro[vendedor.id],
    vendedor,
    admin,
    "Obra A",
  );
  obraB = await criarVenda(
    empresa,
    funil,
    etapaInicial,
    membro[vendedor.id],
    vendedor,
    admin,
    "Obra B",
  );
  obraDeB = await criarVenda(
    empresaB,
    funilB,
    etapaInicialB,
    membro[vendedorB.id],
    vendedorB,
    adminB,
    "Obra da empresa B",
  );

  // Setores (via RPC do admin, a única porta de escrita).
  const coordena = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[opCoordena.id],
    p_setores: [{ setor: "engenharia", capacidade: "coordenar" }],
  });
  if (coordena.error) throw coordena.error;
  const executa = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[opExecuta.id],
    p_setores: [{ setor: "compras", capacidade: "executar" }],
  });
  if (executa.error) throw executa.error;
  const coordenaInativo = await admin.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[opInativoCoordena.id],
    p_setores: [{ setor: "operacional", capacidade: "coordenar" }],
  });
  if (coordenaInativo.error) throw coordenaInativo.error;
  const coordenaB = await adminB.cliente.rpc("definir_setores_membro", {
    p_membro_id: membro[opCoordenaB.id],
    p_setores: [{ setor: "compras", capacidade: "coordenar" }],
  });
  if (coordenaB.error) throw coordenaB.error;

  // Participantes da obra A: operacao ativo, operacao com participação encerrada, operacao
  // que ficará inativo e quem NÃO é operacao (vendedor de outra carteira, gestor fora da
  // equipe, SDR que não é a origem).
  await participar(obraA, empresa, membro[opParticipante.id]);
  await participar(obraA, empresa, membro[opParticipanteEncerrado.id], { encerrado: true });
  await participar(obraA, empresa, membro[opInativoParticipante.id]);
  await participar(obraA, empresa, membro[vendedor2.id]);
  await participar(obraA, empresa, membro[gestorFora.id]);
  await participar(obraA, empresa, membro[sdr.id]);

  // Desligamento/inativação depois de definidos os vínculos.
  await servico
    .from("empresa_membros")
    .update({ status: "inativo" })
    .eq("id", membro[opInativoParticipante.id]);
  await servico
    .from("empresa_membros")
    .update({ status: "desligado" })
    .eq("id", membro[opInativoCoordena.id]);
});

async function enxerga(usuario: Usuario, obraId: string) {
  const [obras, valor, fluxos, marcos, participantes, historico] = await Promise.all([
    usuario.cliente.from("obras").select("id").eq("id", obraId),
    usuario.cliente.from("obra_dados_comerciais").select("obra_id").eq("obra_id", obraId),
    usuario.cliente.from("obra_fluxos").select("setor").eq("obra_id", obraId),
    usuario.cliente.from("obra_marcos").select("marco").eq("obra_id", obraId),
    usuario.cliente.from("obra_participantes").select("id").eq("obra_id", obraId),
    usuario.cliente.from("obra_historico").select("id").eq("obra_id", obraId),
  ]);
  return {
    obra: obras.data!.length,
    valor: valor.data!.length,
    fluxos: fluxos.data!.length,
    marcos: marcos.data!.length,
    participantes: participantes.data!.length,
    historico: historico.data!.length,
  };
}

const NADA = { obra: 0, valor: 0, fluxos: 0, marcos: 0, participantes: 0, historico: 0 };

async function totalParticipantes(obraId: string) {
  const { count } = await servico
    .from("obra_participantes")
    .select("id", { count: "exact", head: true })
    .eq("obra_id", obraId);
  return count!;
}

describe("papéis comerciais: visibilidade inalterada", () => {
  it("admin, vendedor da venda e gestor da equipe veem a obra, as tabelas filhas e o valor vendido", async () => {
    const participantes = await totalParticipantes(obraA);
    for (const usuario of [admin, vendedor, gestor]) {
      expect(await enxerga(usuario, obraA)).toEqual({
        obra: 1,
        valor: 1,
        fluxos: 3,
        marcos: 2,
        participantes,
        historico: 1,
      });
    }
  });

  it("outro vendedor e gestor fora da equipe não veem, mesmo constando como participantes", async () => {
    for (const usuario of [vendedor2, gestorFora]) {
      expect(await enxerga(usuario, obraA)).toEqual(NADA);
    }
  });

  it("SDR que só é participante (não é o SDR de origem) não vê; nenhum comercial vê obra de outra empresa", async () => {
    expect(await enxerga(sdr, obraA)).toEqual(NADA);
    for (const usuario of [admin, vendedor, gestor]) {
      expect(await enxerga(usuario, obraDeB)).toEqual(NADA);
    }
  });
});

describe("operacao: visibilidade de obras", () => {
  it("sem setor e sem participação não vê nenhuma obra", async () => {
    expect(await enxerga(opSemSetor, obraA)).toEqual(NADA);
    expect(await enxerga(opSemSetor, obraB)).toEqual(NADA);
    const { data } = await opSemSetor.cliente.from("obras").select("id");
    expect(data).toEqual([]);
  });

  it("participante ativo vê só aquela obra e as tabelas filhas dela, sem valor vendido", async () => {
    const participantes = await totalParticipantes(obraA);
    expect(await enxerga(opParticipante, obraA)).toEqual({
      obra: 1,
      valor: 0,
      fluxos: 3,
      marcos: 2,
      participantes,
      historico: 1,
    });
    expect(await enxerga(opParticipante, obraB)).toEqual(NADA);
    expect(await enxerga(opParticipante, obraDeB)).toEqual(NADA);
    const { data } = await opParticipante.cliente.from("obras").select("id");
    expect(data).toEqual([{ id: obraA }]);
  });

  it("participação encerrada (fim preenchido) não dá acesso", async () => {
    expect(await enxerga(opParticipanteEncerrado, obraA)).toEqual(NADA);
  });

  it("coordenador vê todas as obras da própria empresa, nenhuma de outra, sem valor vendido", async () => {
    const { data } = await opCoordena.cliente.from("obras").select("id, empresa_id");
    expect(data!.length).toBeGreaterThanOrEqual(2);
    expect(data!.every((o) => o.empresa_id === empresa)).toBe(true);
    expect(data!.map((o) => o.id)).toEqual(expect.arrayContaining([obraA, obraB]));

    for (const obra of [obraA, obraB]) {
      const v = await enxerga(opCoordena, obra);
      expect(v).toMatchObject({ obra: 1, valor: 0, fluxos: 3, marcos: 2, historico: 1 });
    }
    expect(await enxerga(opCoordena, obraDeB)).toEqual(NADA);

    // E o coordenador da empresa B vê só as obras da B.
    const { data: deB } = await opCoordenaB.cliente.from("obras").select("id, empresa_id");
    expect(deB!.map((o) => o.id)).toEqual([obraDeB]);
    expect(await enxerga(opCoordenaB, obraA)).toEqual(NADA);
  });

  it("quem só executa (sem participação) não vê", async () => {
    expect(await enxerga(opExecuta, obraA)).toEqual(NADA);
    expect(await enxerga(opExecuta, obraB)).toEqual(NADA);
  });

  it("operacao inativo ou desligado não vê, nem como participante nem como coordenador", async () => {
    expect(await enxerga(opInativoParticipante, obraA)).toEqual(NADA);
    for (const obra of [obraA, obraB]) {
      expect(await enxerga(opInativoCoordena, obra)).toEqual(NADA);
    }
  });
});

describe("identidade_membros", () => {
  beforeAll(async () => {
    await servico.from("perfis").update({ nome: "Vendedora Teste" }).eq("id", vendedor.id);
    await servico
      .from("perfis")
      .update({ avatar_caminho: `${vendedor.id}/${randomUUID()}.webp` })
      .eq("id", vendedor.id);
  });

  it("operacao e os papéis comerciais recebem só membro_id, nome e avatar_caminho dos membros ativos", async () => {
    for (const usuario of [opSemSetor, admin, vendedor, sdr]) {
      const { data, error } = await usuario.cliente.rpc("identidade_membros", {
        p_empresa_id: empresa,
      });
      expect(error).toBeNull();
      const ids = data!.map((r) => r.membro_id);
      expect(ids).toEqual(
        expect.arrayContaining([
          membro[admin.id],
          membro[vendedor.id],
          membro[opParticipante.id],
          membro[opSemSetor.id],
        ]),
      );
      // Inativos e desligados não aparecem.
      expect(ids).not.toContain(membro[opInativoParticipante.id]);
      expect(ids).not.toContain(membro[opInativoCoordena.id]);
      // Nada de outra empresa.
      expect(ids).not.toContain(membro[adminB.id]);
      expect(ids).not.toContain(membro[opCoordenaB.id]);
      for (const linha of data!)
        expect(Object.keys(linha).sort()).toEqual(["avatar_caminho", "membro_id", "nome"]);
      const dela = data!.find((r) => r.membro_id === membro[vendedor.id])!;
      expect(dela.nome).toBe("Vendedora Teste");
      expect(dela.avatar_caminho).toMatch(new RegExp(`^${vendedor.id}/[0-9a-f-]{36}\\.webp$`));
      expect(JSON.stringify(data)).not.toContain("@teste.raion");
    }
  });

  it("empresa que não é a sua, ou membro inativo, recebe lista vazia", async () => {
    for (const [usuario, emp] of [
      [admin, empresaB],
      [adminB, empresa],
      [opCoordenaB, empresa],
      [opInativoParticipante, empresa],
      [opInativoCoordena, empresa],
    ] as const) {
      const { data, error } = await usuario.cliente.rpc("identidade_membros", {
        p_empresa_id: emp,
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const { data } = await admin.cliente.rpc("identidade_membros", { p_empresa_id: randomUUID() });
    expect(data).toEqual([]);
  });

  it("devolve só membros da empresa pedida", async () => {
    const { data } = await adminB.cliente.rpc("identidade_membros", { p_empresa_id: empresaB });
    expect(data!.map((r) => r.membro_id).sort()).toEqual(
      [membro[adminB.id], membro[opCoordenaB.id], membro[vendedorB.id]].sort(),
    );
  });
});

describe("avatares e perfis", () => {
  const BUCKET = "avatares";
  const imagem = () => new Blob([new Uint8Array(64)], { type: "image/png" });
  const caminhos: Record<string, string> = {};

  beforeAll(async () => {
    for (const usuario of [admin, vendedor, sdr, opParticipante, opInativoParticipante, adminB]) {
      const caminho = `${usuario.id}/${randomUUID()}.png`;
      const { error } = await servico.storage
        .from(BUCKET)
        .upload(caminho, imagem(), { contentType: "image/png" });
      expect(error).toBeNull();
      caminhos[usuario.id] = caminho;
    }
  });

  const le = async (leitor: Usuario, dono: Usuario) =>
    (await leitor.cliente.storage.from(BUCKET).download(caminhos[dono.id])).error;

  it("operacao lê avatar de colega ativo da mesma empresa e o próprio", async () => {
    expect(await le(opSemSetor, vendedor)).toBeNull();
    expect(await le(opSemSetor, admin)).toBeNull();
    expect(await le(opParticipante, opParticipante)).toBeNull();
    expect(await le(opSemSetor, opParticipante)).toBeNull();
  });

  it("operacao não lê avatar de outra empresa nem de colega inativo", async () => {
    expect(await le(opSemSetor, adminB)).not.toBeNull();
    expect(await le(opSemSetor, opInativoParticipante)).not.toBeNull();
  });

  it("operacao inativo não lê avatar de colegas", async () => {
    expect(await le(opInativoParticipante, vendedor)).not.toBeNull();
  });

  it("os 4 papéis comerciais continuam lendo avatar de colegas da empresa; outra empresa não", async () => {
    expect(await le(admin, vendedor)).toBeNull();
    expect(await le(gestor, vendedor)).toBeNull();
    expect(await le(vendedor, admin)).toBeNull();
    expect(await le(sdr, admin)).toBeNull();
    expect(await le(vendedor, opParticipante)).toBeNull();
    expect(await le(vendedor, adminB)).not.toBeNull();
    expect(await le(adminB, vendedor)).not.toBeNull();
  });

  it("perfis continua fechado para operacao: só o próprio", async () => {
    const { data } = await opParticipante.cliente.from("perfis").select("id");
    expect(data).toEqual([{ id: opParticipante.id }]);
    const { data: colegas } = await opParticipante.cliente
      .from("perfis")
      .select("id")
      .in("id", [admin.id, vendedor.id]);
    expect(colegas).toEqual([]);
  });
});

describe("membro_setores_obra", () => {
  it("escrita direta é negada a authenticated e service_role", async () => {
    const linha = {
      empresa_id: empresa,
      membro_id: membro[opAlvo.id],
      setor: "compras" as const,
      capacidade: "coordenar" as const,
    };
    for (const cliente of [admin.cliente, opAlvo.cliente, servico]) {
      expect((await cliente.from("membro_setores_obra").insert(linha)).error).not.toBeNull();
      expect(
        (
          await cliente
            .from("membro_setores_obra")
            .update({ capacidade: "coordenar" })
            .eq("membro_id", membro[opExecuta.id])
        ).error,
      ).not.toBeNull();
      expect(
        (await cliente.from("membro_setores_obra").delete().eq("membro_id", membro[opExecuta.id]))
          .error,
      ).not.toBeNull();
    }
    const { data } = await servico
      .from("membro_setores_obra")
      .select("setor, capacidade")
      .eq("membro_id", membro[opExecuta.id]);
    expect(data).toEqual([{ setor: "compras", capacidade: "executar" }]);
  });

  it("SELECT: o próprio vê suas linhas, o admin vê as da empresa, outro operacao e outra empresa não", async () => {
    const proprio = await opCoordena.cliente.from("membro_setores_obra").select("membro_id, setor");
    expect(proprio.data).toEqual([{ membro_id: membro[opCoordena.id], setor: "engenharia" }]);

    const doAdmin = await admin.cliente
      .from("membro_setores_obra")
      .select("membro_id")
      .eq("empresa_id", empresa);
    const ids = doAdmin.data!.map((l) => l.membro_id);
    expect(ids).toEqual(expect.arrayContaining([membro[opCoordena.id], membro[opExecuta.id]]));
    expect(ids).not.toContain(membro[opCoordenaB.id]);

    const alheias = await opExecuta.cliente
      .from("membro_setores_obra")
      .select("membro_id")
      .eq("membro_id", membro[opCoordena.id]);
    expect(alheias.data).toEqual([]);
    const outraEmpresa = await adminB.cliente
      .from("membro_setores_obra")
      .select("membro_id")
      .eq("empresa_id", empresa);
    expect(outraEmpresa.data).toEqual([]);
    for (const usuario of [vendedor, gestor, sdr]) {
      const { data } = await usuario.cliente.from("membro_setores_obra").select("membro_id");
      expect(data).toEqual([]);
    }
  });

  const setoresDoAlvo = async () => {
    const { data } = await servico
      .from("membro_setores_obra")
      .select("setor, capacidade")
      .eq("membro_id", membro[opAlvo.id])
      .order("setor");
    return data;
  };
  const definir = (cliente: Usuario["cliente"], membroId: string, setores: unknown) =>
    cliente.rpc("definir_setores_membro", { p_membro_id: membroId, p_setores: setores as never });

  it("admin define, substitui e limpa os setores de um operacao ativo da mesma empresa", async () => {
    const um = await definir(admin.cliente, membro[opAlvo.id], [
      { setor: "engenharia", capacidade: "coordenar" },
      { setor: "compras", capacidade: "executar" },
    ]);
    expect(um.error).toBeNull();
    expect(await setoresDoAlvo()).toEqual([
      { setor: "compras", capacidade: "executar" },
      { setor: "engenharia", capacidade: "coordenar" },
    ]);
    const { data: autor } = await servico
      .from("membro_setores_obra")
      .select("definido_por_user_id")
      .eq("membro_id", membro[opAlvo.id]);
    expect(autor!.every((l) => l.definido_por_user_id === admin.id)).toBe(true);

    // Substitui: compras muda de capacidade, engenharia sai, operacional entra.
    const dois = await definir(admin.cliente, membro[opAlvo.id], [
      { setor: "compras", capacidade: "coordenar" },
      { setor: "operacional", capacidade: "executar" },
    ]);
    expect(dois.error).toBeNull();
    expect(await setoresDoAlvo()).toEqual([
      { setor: "compras", capacidade: "coordenar" },
      { setor: "operacional", capacidade: "executar" },
    ]);

    const vazio = await definir(admin.cliente, membro[opAlvo.id], []);
    expect(vazio.error).toBeNull();
    expect(await setoresDoAlvo()).toEqual([]);
  });

  it("negada para não-admin, membro de outra empresa, inativo e papel comercial", async () => {
    await definir(admin.cliente, membro[opAlvo.id], [{ setor: "compras", capacidade: "executar" }]);
    const valido = [{ setor: "engenharia", capacidade: "coordenar" }];
    const casos: [string, Usuario["cliente"], string][] = [
      ["gestor", gestor.cliente, membro[opAlvo.id]],
      ["vendedor", vendedor.cliente, membro[opAlvo.id]],
      ["o próprio operacao (coordenador)", opCoordena.cliente, membro[opAlvo.id]],
      ["o próprio alvo", opAlvo.cliente, membro[opAlvo.id]],
      ["admin de outra empresa", adminB.cliente, membro[opAlvo.id]],
      ["admin sobre membro de outra empresa", admin.cliente, membro[opCoordenaB.id]],
      ["admin sobre membro inativo", admin.cliente, membro[opInativoParticipante.id]],
      ["admin sobre membro desligado", admin.cliente, membro[opInativoCoordena.id]],
      ["admin sobre vendedor", admin.cliente, membro[vendedor.id]],
      ["admin sobre gestor", admin.cliente, membro[gestor.id]],
      ["admin sobre membro inexistente", admin.cliente, randomUUID()],
    ];
    for (const [rotulo, cliente, alvo] of casos) {
      expect((await definir(cliente, alvo, valido)).error, rotulo).not.toBeNull();
    }
    expect(await setoresDoAlvo()).toEqual([{ setor: "compras", capacidade: "executar" }]);
    const { data: coord } = await servico
      .from("membro_setores_obra")
      .select("setor")
      .eq("membro_id", membro[opInativoCoordena.id]);
    expect(coord).toEqual([{ setor: "operacional" }]);
  });

  it("rejeita setor comercial, valores inválidos, setor repetido e formato errado, sem alterar nada", async () => {
    const invalidos = [
      [{ setor: "comercial", capacidade: "coordenar" }],
      [{ setor: "financeiro", capacidade: "executar" }],
      [{ setor: "compras", capacidade: "dono" }],
      [{ setor: "compras" }],
      [{ capacidade: "executar" }],
      [
        { setor: "compras", capacidade: "executar" },
        { setor: "compras", capacidade: "coordenar" },
      ],
      [
        { setor: "compras", capacidade: "executar" },
        { setor: "comercial", capacidade: "executar" },
      ],
      ["compras"],
      { setor: "compras", capacidade: "executar" },
      null,
    ];
    for (const setores of invalidos) {
      expect(
        (await definir(admin.cliente, membro[opAlvo.id], setores)).error,
        JSON.stringify(setores),
      ).not.toBeNull();
    }
    expect(await setoresDoAlvo()).toEqual([{ setor: "compras", capacidade: "executar" }]);
    await definir(admin.cliente, membro[opAlvo.id], []);
  });

  it("a constraint da tabela também impede setor comercial", async () => {
    await expect(
      noBanco(
        "insert into public.membro_setores_obra (empresa_id, membro_id, setor, capacidade) values ($1, $2, 'comercial', 'executar')",
        [empresa, membro[opAlvo.id]],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("funções novas: privilégios", () => {
  /** Quem tem EXECUTE na função (PUBLIC = grantee 0). proacl nulo significaria o padrão (PUBLIC executa). */
  async function quemExecuta(assinatura: string) {
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      const { rows: acl } = await banco.query(
        "select proacl is null as padrao from pg_proc where oid = $1::regprocedure",
        [assinatura],
      );
      expect(acl[0].padrao, `${assinatura} com privilégio padrão (PUBLIC executa)`).toBe(false);
      const { rows } = await banco.query(
        "select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel " +
          "from pg_proc p cross join lateral aclexplode(p.proacl) a " +
          "where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'",
        [assinatura],
      );
      return rows.map((r) => r.papel as string);
    } finally {
      await banco.end();
    }
  }

  it("RPCs e funções de policy: só authenticated executa", async () => {
    for (const fn of [
      "definir_setores_membro(uuid, jsonb)",
      "identidade_membros(uuid)",
      "compartilha_empresa_identidade(uuid)",
    ]) {
      const papeis = await quemExecuta(`public.${fn}`);
      expect(papeis, fn).toContain("authenticated");
      for (const papel of ["PUBLIC", "anon", "service_role"])
        expect(papeis, fn).not.toContain(papel);
    }
  });

  it("anon não chama as RPCs", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await anon.rpc("identidade_membros", { p_empresa_id: empresa })).error).not.toBeNull();
    expect(
      (await anon.rpc("definir_setores_membro", { p_membro_id: membro[opAlvo.id], p_setores: [] }))
        .error,
    ).not.toBeNull();
  });
});
