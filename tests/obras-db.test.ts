/**
 * Obras — PR 1 (base no banco, 20261006220000_obras_base.sql). Arquitetura aprovada pelo
 * Evandro em 2026-10-06: a Obra nasce uma única vez quando negócio ganho + contrato
 * assinado + pagamento confirmado estão presentes, em qualquer ordem. Cobre: criação
 * idempotente, numeração própria, trilhas/marcos/participantes iniciais, histórico com
 * autor real, estorno (aviso, nunca apaga), "dados da venda mudaram", RLS de leitura
 * (valor vendido protegido) e bloqueio de escrita direta.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let gestorFora: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let sdr: Usuario;
let outraEmpresa: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;

beforeAll(async () => {
  [admin, gestor, gestorFora, vendedor, vendedor2, sdr, outraEmpresa] = await Promise.all(
    ["ob-admin", "ob-gestor", "ob-gestor-fora", "ob-vendedor", "ob-vendedor2", "ob-sdr", "ob-outra"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Obras ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorFora.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: vendedor2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: emp2 } = await servico.from("empresas").insert({ nome: `Obras outra ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: emp2!.id, user_id: outraEmpresa.id, papel: "admin" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;

  // Gestor da equipe do vendedor (vê as obras dele); gestorFora não tem equipe.
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe obras" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);
});

// Cada negócio com contato próprio: editar um contato não pode afetar outra obra.
async function criarNegocio(titulo: string, responsavelId: string, valor = 30000) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente ${titulo}`, cidade: "Goiânia", uf: "GO" })
    .select("id")
    .single();
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId, valor })
    .select("id")
    .single();
  if (error) throw error;
  return { negocioId: data!.id, contatoId: c!.id };
}

async function ganhar(negocioId: string, cliente: Usuario["cliente"]) {
  const { error } = await cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioId);
  if (error) throw error;
}

async function assinar(negocioId: string, cliente: Usuario["cliente"]) {
  const { data: contrato, error } = await cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAssinar } = await cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (erroAssinar) throw erroAssinar;
  return contrato!.id;
}

async function confirmar(contratoId: string) {
  const { error } = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
  if (error) throw error;
}

async function obraDoNegocio(negocioId: string) {
  const { data } = await servico.from("obras").select("*").eq("negocio_id", negocioId);
  return data ?? [];
}

/** Venda completa (ganho → assinado → pago) de um negócio do `vendedor`. */
async function vendaCompleta(titulo: string) {
  const { negocioId, contatoId } = await criarNegocio(titulo, membro[vendedor.id]);
  await ganhar(negocioId, vendedor.cliente);
  const contratoId = await assinar(negocioId, vendedor.cliente);
  await confirmar(contratoId);
  const [obra] = await obraDoNegocio(negocioId);
  return { negocioId, contatoId, contratoId, obra };
}

describe("criação da obra", () => {
  it("só nasce com os 3 sinais e cria trilhas, marcos, participantes e histórico", async () => {
    const { negocioId } = await criarNegocio("Três sinais", membro[vendedor.id]);

    await ganhar(negocioId, vendedor.cliente);
    expect(await obraDoNegocio(negocioId)).toHaveLength(0);

    const contratoId = await assinar(negocioId, vendedor.cliente);
    expect(await obraDoNegocio(negocioId)).toHaveLength(0);

    await confirmar(contratoId);
    const obras = await obraDoNegocio(negocioId);
    expect(obras).toHaveLength(1);
    const obra = obras[0];
    expect(obra.numero).toBeGreaterThan(0);
    expect(obra.contrato_id).toBe(contratoId);
    expect(obra.vendedor_id).toBe(membro[vendedor.id]);
    expect(obra.sdr_id).toBeNull();
    expect(obra.cliente_nome).toBe("Cliente Três sinais");
    expect(obra.cidade).toBe("Goiânia");
    expect(obra.venda_alterada_em).toBeNull();

    // Snapshot técnico sem nenhum valor em dinheiro.
    const tecnico = JSON.stringify(obra.snapshot);
    expect(tecnico).not.toContain("kit_preco");
    expect(tecnico).not.toContain("\"valor\"");

    const { data: comercial } = await servico.from("obra_dados_comerciais").select("*").eq("obra_id", obra.id).single();
    expect(Number(comercial!.valor_vendido)).toBe(30000);

    const { data: fluxos } = await servico.from("obra_fluxos").select("setor, status").eq("obra_id", obra.id).order("setor");
    expect(fluxos).toEqual([
      { setor: "compras", status: "a_comprar" },
      { setor: "engenharia", status: "a_iniciar" },
      { setor: "operacional", status: "aguardando_liberacao" },
    ]);

    const { data: marcos } = await servico.from("obra_marcos").select("marco, status").eq("obra_id", obra.id).order("marco");
    expect(marcos).toEqual([
      { marco: "nf_cliente", status: "pendente" },
      { marco: "garantia", status: "pendente" },
    ]);

    const { data: participantes } = await servico.from("obra_participantes").select("membro_id, setor, funcao, principal").eq("obra_id", obra.id);
    expect(participantes).toEqual([{ membro_id: membro[vendedor.id], setor: "comercial", funcao: "vendedor", principal: true }]);

    // Autor real: quem fechou o último sinal (admin confirmou o pagamento), com o papel do momento.
    const { data: historico } = await servico.from("obra_historico").select("tipo, autor_user_id, autor_membro_id, autor_contexto").eq("obra_id", obra.id);
    expect(historico).toEqual([
      { tipo: "obra_criada", autor_user_id: admin.id, autor_membro_id: membro[admin.id], autor_contexto: { papel: "admin" } },
    ]);
  });

  it("ordem diferente: pagamento antes do ganho — o ganho cria a obra", async () => {
    const { negocioId } = await criarNegocio("Ganho por último", membro[vendedor.id]);
    const contratoId = await assinar(negocioId, vendedor.cliente);
    await confirmar(contratoId);
    expect(await obraDoNegocio(negocioId)).toHaveLength(0);

    await ganhar(negocioId, vendedor.cliente);
    const obras = await obraDoNegocio(negocioId);
    expect(obras).toHaveLength(1);
    expect(obras[0].venda_alterada_em).toBeNull();

    const { data: historico } = await servico.from("obra_historico").select("autor_user_id").eq("obra_id", obras[0].id).single();
    expect(historico!.autor_user_id).toBe(vendedor.id);
  });

  it("numeração própria e sequencial por empresa", async () => {
    const a = await vendaCompleta("Numeração A");
    const b = await vendaCompleta("Numeração B");
    expect(b.obra.numero).toBe(a.obra.numero + 1);
  });

  it("SDR de origem (handoff) entra como participante e fica gravado na obra", async () => {
    const { negocioId, contatoId } = await criarNegocio("Com SDR", membro[sdr.id]);
    const { data: handoff, error } = await sdr.cliente
      .from("handoffs")
      .insert({
        empresa_id: empresa,
        negocio_id: negocioId,
        contato_id: contatoId,
        de_membro_id: membro[sdr.id],
        para_membro_id: membro[vendedor.id],
        status_qualificacao: "qualificado",
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: erroAceite } = await vendedor.cliente.rpc("aceitar_handoff", { p_handoff_id: handoff!.id });
    if (erroAceite) throw erroAceite;

    await ganhar(negocioId, vendedor.cliente);
    await confirmar(await assinar(negocioId, vendedor.cliente));

    const [obra] = await obraDoNegocio(negocioId);
    expect(obra.vendedor_id).toBe(membro[vendedor.id]);
    expect(obra.sdr_id).toBe(membro[sdr.id]);

    const { data: participantes } = await servico
      .from("obra_participantes")
      .select("membro_id, funcao, principal")
      .eq("obra_id", obra.id)
      .order("funcao");
    expect(participantes).toEqual([
      { membro_id: membro[vendedor.id], funcao: "vendedor", principal: true },
      { membro_id: membro[sdr.id], funcao: "sdr", principal: false },
    ]);

    // SDR vê a obra, mas não o valor vendido.
    const { data: vista } = await sdr.cliente.from("obras").select("id").eq("id", obra.id);
    expect(vista).toHaveLength(1);
    const { data: valor } = await sdr.cliente.from("obra_dados_comerciais").select("obra_id").eq("obra_id", obra.id);
    expect(valor).toHaveLength(0);
  });
});

describe("estorno e reconfirmação", () => {
  it("estorno liga o aviso sem apagar; nova confirmação limpa e não duplica", async () => {
    const { negocioId, contratoId, obra } = await vendaCompleta("Estorno");

    const { error: erroEstorno } = await admin.cliente.rpc("estornar_confirmacao_pagamento", {
      p_contrato_id: contratoId,
      p_motivo: "Cartão recusado",
    });
    expect(erroEstorno).toBeNull();

    let [atual] = await obraDoNegocio(negocioId);
    expect(atual.id).toBe(obra.id);
    expect(atual.alerta_pagamento_estornado_em).not.toBeNull();

    await confirmar(contratoId);
    const obras = await obraDoNegocio(negocioId);
    expect(obras).toHaveLength(1);
    [atual] = obras;
    expect(atual.alerta_pagamento_estornado_em).toBeNull();
    // A confirmação original continua sendo o fato da criação.
    expect(atual.confirmacao_pagamento_id).toBe(obra.confirmacao_pagamento_id);

    const { data: historico } = await servico.from("obra_historico").select("tipo, dados").eq("obra_id", obra.id).order("id");
    expect(historico!.map((h) => h.tipo)).toEqual(["obra_criada", "pagamento_estornado", "pagamento_reconfirmado"]);
    expect((historico![1].dados as { motivo: string }).motivo).toBe("Cartão recusado");
  });
});

describe("dados da venda mudaram", () => {
  it("salvar os mesmos dados não gera aviso", async () => {
    const { negocioId, obra } = await vendaCompleta("Sem mudança");
    await servico.from("negocios").update({ unidade_consumidora: null }).eq("id", negocioId);
    const [atual] = await obraDoNegocio(negocioId);
    expect(atual.venda_alterada_em).toBeNull();
    expect(atual.snapshot).toEqual(obra.snapshot);
  });

  it("mudança no kit liga o aviso (técnico) e registra no histórico uma vez", async () => {
    const { negocioId, obra } = await vendaCompleta("Kit mudou");
    const { error } = await servico.from("kit_componentes").insert({
      empresa_id: empresa,
      negocio_id: negocioId,
      tipo: "modulo",
      descricao: "Módulo 550 W",
      potencia_w: 550,
      quantidade: 10,
    });
    expect(error).toBeNull();
    await servico.from("kit_componentes").update({ quantidade: 12 }).eq("negocio_id", negocioId);

    const [atual] = await obraDoNegocio(negocioId);
    expect(atual.venda_alterada_em).not.toBeNull();
    // O snapshot guardado não muda sozinho: só a ação "Atualizar dados da obra" (PR futura).
    expect(atual.snapshot).toEqual(obra.snapshot);

    const { data: historico } = await servico.from("obra_historico").select("dados").eq("obra_id", obra.id).eq("tipo", "venda_alterada");
    expect(historico).toEqual([{ dados: { tecnico: true, comercial: false } }]);
  });

  it("mudança no valor liga o aviso (comercial)", async () => {
    const { negocioId, obra } = await vendaCompleta("Valor mudou");
    const { error } = await servico.from("negocios").update({ valor: 31000 }).eq("id", negocioId);
    expect(error).toBeNull();

    const [atual] = await obraDoNegocio(negocioId);
    expect(atual.venda_alterada_em).not.toBeNull();
    const { data: historico } = await servico.from("obra_historico").select("dados").eq("obra_id", obra.id).eq("tipo", "venda_alterada");
    expect(historico).toEqual([{ dados: { tecnico: false, comercial: true } }]);
  });

  it("mudança no contato (endereço) liga o aviso", async () => {
    const { negocioId, contatoId } = await vendaCompleta("Contato mudou");
    await servico.from("contatos").update({ endereco: "Rua Nova, 100" }).eq("id", contatoId);
    const [atual] = await obraDoNegocio(negocioId);
    expect(atual.venda_alterada_em).not.toBeNull();
  });
});

describe("RLS de leitura", () => {
  let obraId: string;

  beforeAll(async () => {
    obraId = (await vendaCompleta("Visibilidade")).obra.id;
  });

  async function enxerga(usuario: Usuario) {
    const [obras, valor, fluxos, historico] = await Promise.all([
      usuario.cliente.from("obras").select("id").eq("id", obraId),
      usuario.cliente.from("obra_dados_comerciais").select("obra_id").eq("obra_id", obraId),
      usuario.cliente.from("obra_fluxos").select("setor").eq("obra_id", obraId),
      usuario.cliente.from("obra_historico").select("id").eq("obra_id", obraId),
    ]);
    return {
      obra: obras.data!.length,
      valor: valor.data!.length,
      fluxos: fluxos.data!.length,
      historico: historico.data!.length,
    };
  }

  it("admin, vendedor da venda e gestor da equipe veem a obra e o valor", async () => {
    for (const usuario of [admin, vendedor, gestor]) {
      expect(await enxerga(usuario)).toEqual({ obra: 1, valor: 1, fluxos: 3, historico: 1 });
    }
  });

  it("gestor fora da equipe, outro vendedor e outra empresa não veem nada", async () => {
    for (const usuario of [gestorFora, vendedor2, outraEmpresa]) {
      expect(await enxerga(usuario)).toEqual({ obra: 0, valor: 0, fluxos: 0, historico: 0 });
    }
  });
});

describe("escrita direta bloqueada", () => {
  it("nem admin nem service_role escrevem nas tabelas da obra", async () => {
    const { obra, negocioId } = await vendaCompleta("Escrita");

    const update = await admin.cliente.from("obras").update({ cliente_nome: "Outro" }).eq("id", obra.id).select("id");
    expect(update.error).not.toBeNull();
    const remover = await admin.cliente.from("obras").delete().eq("id", obra.id).select("id");
    expect(remover.error).not.toBeNull();
    const fluxo = await admin.cliente.from("obra_fluxos").update({ status: "concluido" }).eq("obra_id", obra.id).select("obra_id");
    expect(fluxo.error).not.toBeNull();

    const historico = await servico.from("obra_historico").update({ tipo: "obra_criada" }).eq("obra_id", obra.id).select("id");
    expect(historico.error).not.toBeNull();
    const inserir = await servico.from("obras").insert({ ...obra, id: undefined, numero: 999999 }).select("id");
    expect(inserir.error).not.toBeNull();

    // Criar obra fora dos gatilhos (backfill) exige aprovação: função fechada a clientes.
    const garantir = await admin.cliente.rpc("garantir_obra" as never, { p_negocio_id: negocioId } as never);
    expect(garantir.error).not.toBeNull();

    // Negócio com obra não pode ser apagado.
    const apagar = await servico.from("negocios").delete().eq("id", negocioId);
    expect(apagar.error).not.toBeNull();
    expect(await obraDoNegocio(negocioId)).toHaveLength(1);
  });
});
