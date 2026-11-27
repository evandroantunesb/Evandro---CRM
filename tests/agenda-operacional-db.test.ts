/**
 * Agenda operacional (20261217100000_agenda_operacional.sql) com Supabase local: equipes de instalação, agendamento
 * da instalação na obra (permissão, status, motivo, histórico), término sugerido, cronograma e a Agenda do período
 * por visibilidade. Só no PRO.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, anexarDocumentosContrato, criarUsuario, gerarContratoTeste, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario, gestor: Usuario, vendedor: Usuario, outroVendedor: Usuario, operacional: Usuario, compras: Usuario, adminB: Usuario;
let empresa: string, empresaB: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Próxima segunda-feira a partir de daqui a `semanas` semanas. */
const segunda = (semanas: number) => {
  const x = new Date(`${hoje()}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 7 * semanas + ((8 - x.getUTCDay()) % 7 || 7));
  return x.toISOString().slice(0, 10);
};
/**
 * Primeira segunda-feira, a partir de daqui a `semanas` semanas, sem feriado nacional da semana anterior até o fim da
 * seguinte (pela própria `feriado_nacional` do banco): os testes contam dias úteis à mão e consultam a Agenda de 7 dias
 * antes a 7 depois, onde feriado vira evento; não podem depender da data em que rodam (em 23/11/2026 a semana caía no
 * Natal e o teste quebrava).
 */
async function segundaSemFeriado(semanas: number): Promise<string> {
  for (let s = semanas; s < semanas + 12; s++) {
    const seg = segunda(s);
    const dias = Array.from({ length: 21 }, (_, i) => somarDias(seg, i - 7));
    const feriados = await Promise.all(dias.map((d) => admin.cliente.rpc("feriado_nacional", { p_data: d })));
    if (feriados.every((r) => !r.error && r.data === false)) return seg;
  }
  throw new Error(`Nenhuma semana sem feriado nacional a partir de ${semanas} semanas`);
}

async function vincular(empresaId: string, u: Usuario, papel: "admin" | "gestor" | "vendedor" | "operacao") {
  const { data, error } = await servico.from("empresa_membros").insert({ empresa_id: empresaId, user_id: u.id, papel }).select("id").single();
  if (error) throw error;
  membro[`${empresaId}:${u.id}`] = data.id;
}
const m = (empresaId: string, u: Usuario) => membro[`${empresaId}:${u.id}`];

async function criarObra(titulo: string, responsavel: Usuario): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: m(empresa, responsavel), valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await responsavel.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato } = ok(await gerarContratoTeste(responsavel.cliente, { empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato" }), "contrato");
  ok(await responsavel.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const status = async (obra: string) =>
  (await servico.from("obra_fluxos").select("status").eq("obra_id", obra).eq("setor", "operacional").single()).data!.status;
const liberar = async (obra: string) =>
  ok(await admin.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "operacional", p_status: "liberada_agendamento" }), "liberar");

type Agendamento = Partial<{ equipe: string | null; nome: string; telefone: string; inicio: string; termino: string; observacao: string; motivo: string }>;
const agendar = (quem: Usuario, obra: string, a: Agendamento) =>
  quem.cliente.rpc("agendar_instalacao_obra", {
    p_obra_id: obra,
    p_equipe_id: (a.equipe ?? null) as string,
    p_equipe_nome: (a.nome ?? null) as string,
    p_equipe_telefone: (a.telefone ?? null) as string,
    p_inicio: a.inicio as string,
    p_termino: a.termino as string,
    p_observacao: (a.observacao ?? null) as string,
    p_motivo: (a.motivo ?? null) as string,
  });

const agenda = async (quem: Usuario, de: string, ate: string, empresaId = empresa) => {
  const { data, error } = await quem.cliente.rpc("agenda_operacional", { p_empresa_id: empresaId, p_de: de, p_ate: ate });
  if (error) throw error;
  return data ?? [];
};

let equipeSol: string;

beforeAll(async () => {
  [admin, gestor, vendedor, outroVendedor, operacional, compras, adminB] = await Promise.all(
    ["ag-admin", "ag-gestor", "ag-vend", "ag-vend2", "ag-oper", "ag-compras", "ag-adminb"].map(criarUsuario),
  );
  const { data: e } = await servico.from("empresas").insert({ nome: `Agenda ${sufixo}` }).select("id").single();
  empresa = e!.id;
  const { data: eB } = await servico.from("empresas").insert({ nome: `Agenda B ${sufixo}` }).select("id").single();
  empresaB = eB!.id;
  await vincular(empresa, admin, "admin");
  await vincular(empresa, gestor, "gestor");
  await vincular(empresa, vendedor, "vendedor");
  await vincular(empresa, outroVendedor, "vendedor");
  await vincular(empresa, operacional, "operacao");
  await vincular(empresa, compras, "operacao");
  await vincular(empresaB, adminB, "admin");
  ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: m(empresa, operacional), p_setores: [{ setor: "operacional", capacidade: "coordenar" }] as never }), "setor op");
  ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: m(empresa, compras), p_setores: [{ setor: "compras", capacidade: "coordenar" }] as never }), "setor compras");
});

describe("equipes de instalação", () => {
  it("Operacional, gestor e admin cadastram e editam; Compras e vendedor não; outra empresa não vê", async () => {
    const { data, error } = await operacional.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: "Equipe Sol Forte", telefone: "(45) 99999-0001" }).select("id").single();
    expect(error).toBeNull();
    equipeSol = data!.id;
    expect((await gestor.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: "Irmãos Telhado" })).error).toBeNull();
    expect((await compras.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: "Equipe de Compras" })).error).not.toBeNull();
    expect((await vendedor.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: "Equipe do Vendedor" })).error).not.toBeNull();
    // Nome repetido (sem diferença de maiúsculas) é recusado.
    expect((await admin.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: " equipe sol forte " })).error).not.toBeNull();
    expect((await operacional.cliente.from("equipes_instalacao").update({ telefone: "(45) 99999-0009" }).eq("id", equipeSol).select("id")).data).toHaveLength(1);
    expect((await adminB.cliente.from("equipes_instalacao").select("id").eq("empresa_id", empresa)).data).toEqual([]);
    expect((await vendedor.cliente.from("equipes_instalacao").select("id").eq("empresa_id", empresa)).data).toEqual([]);
    // Não se apaga: inativa.
    expect((await admin.cliente.from("equipes_instalacao").delete().eq("id", equipeSol)).error).not.toBeNull();
  });
});

describe("término sugerido", () => {
  it("3 dias úteis contando o início, pulando fim de semana e feriado da empresa", async () => {
    const seg = await segundaSemFeriado(3);
    const sugerir = async (inicio: string) => (await admin.cliente.rpc("sugerir_termino_instalacao", { p_empresa_id: empresa, p_inicio: inicio })).data;
    expect(await sugerir(seg)).toBe(somarDias(seg, 2)); // seg → qua
    expect(await sugerir(somarDias(seg, 4))).toBe(somarDias(seg, 8)); // sex → ter
    ok(await admin.cliente.from("empresa_feriados").insert({ empresa_id: empresa, data: somarDias(seg, 1), nome: "Feriado municipal" }), "feriado");
    expect(await sugerir(seg)).toBe(somarDias(seg, 3)); // seg → (ter feriado) → qui
    expect((await adminB.cliente.rpc("sugerir_termino_instalacao", { p_empresa_id: empresa, p_inicio: seg })).data).toBeNull();
  });
});

describe("agendar a instalação", () => {
  let obra: string, inicio: string, termino: string;

  beforeAll(async () => {
    inicio = await segundaSemFeriado(5);
    termino = somarDias(inicio, 2);
    obra = await criarObra("Fazenda Santa Luzia", vendedor);
  });

  it("antes de liberar para agendamento, ninguém agenda", async () => {
    const r = await agendar(admin, obra, { equipe: equipeSol, inicio, termino });
    expect(r.error?.message).toContain("Liberada para agendamento");
  });

  it("vendedor e Compras não agendam; o Operacional agenda e o status vira Agendada, com histórico", async () => {
    await liberar(obra);
    expect((await agendar(vendedor, obra, { equipe: equipeSol, inicio, termino })).error?.code).toBe("42501");
    expect((await agendar(compras, obra, { equipe: equipeSol, inicio, termino })).error?.code).toBe("42501");
    expect((await agendar(operacional, obra, { equipe: equipeSol, inicio, termino, observacao: "Escada de 8 m" })).error).toBeNull();
    expect(await status(obra)).toBe("agendada");
    const { data: a } = await servico.from("obra_instalacoes").select("equipe_nome, equipe_telefone, inicio, termino, observacao, agendado_por").eq("obra_id", obra).single();
    expect(a).toEqual({ equipe_nome: "Equipe Sol Forte", equipe_telefone: "(45) 99999-0009", inicio, termino, observacao: "Escada de 8 m", agendado_por: m(empresa, operacional) });
    const { data: h } = await servico.from("obra_historico").select("dados, autor_membro_id").eq("obra_id", obra).eq("tipo", "instalacao_agendamento");
    expect(h).toHaveLength(1);
    expect(h![0]).toMatchObject({ autor_membro_id: m(empresa, operacional), dados: { acao: "agendada", equipe: "Equipe Sol Forte", inicio, termino } });
  });

  it("reagendar exige motivo; trocar só a equipe não; repetir igual não grava nada", async () => {
    const novoInicio = somarDias(inicio, 7);
    const novoTermino = somarDias(novoInicio, 2);
    expect((await agendar(gestor, obra, { equipe: equipeSol, inicio: novoInicio, termino: novoTermino })).error?.message).toContain("motivo");
    expect((await agendar(gestor, obra, { equipe: equipeSol, inicio: novoInicio, termino: novoTermino, observacao: "Escada de 8 m", motivo: "Chuva prevista" })).error).toBeNull();
    expect((await agendar(gestor, obra, { nome: "Montagens Avulsas", telefone: "(45) 3333-0000", inicio: novoInicio, termino: novoTermino, observacao: "Escada de 8 m" })).error).toBeNull();
    expect((await agendar(gestor, obra, { nome: "Montagens Avulsas", telefone: "(45) 3333-0000", inicio: novoInicio, termino: novoTermino, observacao: "Escada de 8 m" })).error).toBeNull();
    const { data: h } = await servico.from("obra_historico").select("dados").eq("obra_id", obra).eq("tipo", "instalacao_agendamento").order("created_at");
    expect(h!.map((l) => (l.dados as { acao: string }).acao)).toEqual(["agendada", "reagendada", "equipe_trocada"]);
    expect(h![1].dados).toMatchObject({ motivo: "Chuva prevista", inicio_antes: inicio, inicio: novoInicio });
    expect(h![2].dados).toMatchObject({ equipe_antes: "Equipe Sol Forte", equipe: "Montagens Avulsas" });
    const { data: a } = await servico.from("obra_instalacoes").select("equipe_id, equipe_nome").eq("obra_id", obra).single();
    expect(a).toEqual({ equipe_id: null, equipe_nome: "Montagens Avulsas" });
  });

  it("datas e equipe inválidas são recusadas; equipe inativa não entra em obra nova", async () => {
    expect((await agendar(admin, obra, { nome: "X", inicio, termino })).error).not.toBeNull();
    expect((await agendar(admin, obra, { nome: "Equipe Ok", inicio: termino, termino: inicio, motivo: "teste" })).error).not.toBeNull();
    expect((await agendar(admin, obra, { nome: "Equipe Ok", inicio: somarDias(hoje(), 400), termino: somarDias(hoje(), 401), motivo: "teste" })).error).not.toBeNull();
    const { data: inativa } = await admin.cliente.from("equipes_instalacao").insert({ empresa_id: empresa, nome: "Montagens Oeste", ativa: false }).select("id").single();
    expect((await agendar(admin, obra, { equipe: inativa!.id, inicio: somarDias(inicio, 7), termino: somarDias(inicio, 9) })).error?.message).toContain("equipe ativa");
    const { data: deB } = await adminB.cliente.from("equipes_instalacao").insert({ empresa_id: empresaB, nome: "Equipe da B" }).select("id").single();
    expect((await agendar(admin, obra, { equipe: deB!.id, inicio: somarDias(inicio, 7), termino: somarDias(inicio, 9) })).error).not.toBeNull();
  });

  it("o cronograma prevê a Instalação pelas datas agendadas", async () => {
    const { data } = await admin.cliente.rpc("cronograma_obra", { p_obra_id: obra });
    const instalacao = (data ?? []).find((e) => e.etapa === "instalacao")!;
    expect(instalacao).toMatchObject({ previsao_inicio: somarDias(inicio, 7), previsao_fim: somarDias(inicio, 9), situacao: "a_iniciar" });
  });

  it("a app não grava o agendamento direto", async () => {
    expect((await admin.cliente.from("obra_instalacoes").update({ termino: somarDias(inicio, 20) }).eq("obra_id", obra)).error).not.toBeNull();
    expect((await admin.cliente.from("obra_instalacoes").insert({ obra_id: obra, empresa_id: empresa, equipe_nome: "Direto", inicio, termino })).error).not.toBeNull();
  });
});

describe("Agenda do período", () => {
  let obraVendedor: string, obraOutro: string, inicio: string;

  beforeAll(async () => {
    inicio = await segundaSemFeriado(9);
    obraVendedor = await criarObra("Usina Marcos", vendedor);
    obraOutro = await criarObra("Mercado Bom Preço", outroVendedor);
    for (const o of [obraVendedor, obraOutro]) await liberar(o);
    ok(await agendar(operacional, obraVendedor, { equipe: equipeSol, inicio, termino: somarDias(inicio, 2) }), "agenda 1");
    ok(await agendar(operacional, obraOutro, { nome: "Irmãos Avulsos", inicio: somarDias(inicio, 1), termino: somarDias(inicio, 3) }), "agenda 2");
    ok(await admin.cliente.rpc("definir_entrega_material_prevista", { p_obra_id: obraVendedor, p_data: somarDias(inicio, -3) }), "material");
    ok(await admin.cliente.rpc("ajustar_entrega_contratada_obra", { p_obra_id: obraVendedor, p_data: somarDias(inicio, 1), p_motivo: "Combinado com o cliente" }), "entrega");
  });

  it("admin, gestor e Operacional veem tudo; instalação cobre o período; entrega contratada avisa quando a previsão passa", async () => {
    for (const quem of [admin, gestor, operacional]) {
      const eventos = await agenda(quem, somarDias(inicio, -7), somarDias(inicio, 7));
      const obras = new Set(eventos.map((e) => e.obra_id));
      expect(obras.has(obraVendedor) && obras.has(obraOutro)).toBe(true);
    }
    const eventos = (await agenda(admin, somarDias(inicio, -7), somarDias(inicio, 7))).filter((e) => e.obra_id === obraVendedor);
    expect(eventos.find((e) => e.tipo === "instalacao")).toMatchObject({ inicio, fim: somarDias(inicio, 2), detalhe: "Equipe Sol Forte", equipe_id: equipeSol, situacao: "agendada" });
    expect(eventos.find((e) => e.tipo === "entrega_material")).toMatchObject({ inicio: somarDias(inicio, -3) });
    // A instalação termina depois da entrega contratada: alerta.
    expect(eventos.find((e) => e.tipo === "entrega_contratada")).toMatchObject({ inicio: somarDias(inicio, 1), alerta: true });
  });

  it("vendedor vê só as obras dos próprios clientes; outra empresa e período longo não trazem nada", async () => {
    // Outras obras do vendedor criadas neste arquivo podem cair na janela (a entrega contratada conta a partir do dia
    // em que o teste roda): o que importa é ver a própria obra, não ver a do outro vendedor e só ver clientes dele.
    const doVendedor = new Set((await agenda(vendedor, somarDias(inicio, -7), somarDias(inicio, 7))).map((e) => e.obra_id));
    expect(doVendedor.has(obraVendedor)).toBe(true);
    expect(doVendedor.has(obraOutro)).toBe(false);
    const { data: dele } = ok(
      await servico.from("obras").select("id, negocios!inner(responsavel_id)").eq("negocios.responsavel_id", m(empresa, vendedor)),
      "obras do vendedor",
    );
    const obrasDele = new Set(dele!.map((o) => o.id));
    expect([...doVendedor].every((id) => obrasDele.has(id))).toBe(true);
    expect(await agenda(adminB, somarDias(inicio, -7), somarDias(inicio, 7))).toEqual([]);
    expect(await agenda(adminB, somarDias(inicio, -7), somarDias(inicio, 7), empresaB)).toEqual([]);
    expect(await agenda(admin, inicio, somarDias(inicio, 90))).toEqual([]);
  });

  it("instalação fora do período não aparece", async () => {
    const eventos = await agenda(admin, somarDias(inicio, 14), somarDias(inicio, 20));
    expect(eventos.some((e) => e.tipo === "instalacao" && (e.obra_id === obraVendedor || e.obra_id === obraOutro))).toBe(false);
  });
});

describe("feriados do período", () => {
  it("nacionais com nome (inclusive móveis) e os da empresa; quem não é da empresa não recebe", async () => {
    ok(await admin.cliente.from("empresa_feriados").insert({ empresa_id: empresa, data: "2027-06-15", nome: "Aniversário da cidade" }), "feriado");
    const { data } = await admin.cliente.rpc("feriados_periodo", { p_empresa_id: empresa, p_de: "2027-03-20", p_ate: "2027-05-20" });
    expect(data).toEqual([
      { data: "2027-03-26", nome: "Sexta-feira Santa" },
      { data: "2027-04-21", nome: "Tiradentes" },
      { data: "2027-05-01", nome: "Dia do Trabalho" },
    ]);
    const { data: junho } = await admin.cliente.rpc("feriados_periodo", { p_empresa_id: empresa, p_de: "2027-06-01", p_ate: "2027-06-30" });
    expect(junho).toEqual([{ data: "2027-06-15", nome: "Aniversário da cidade" }]);
    expect((await adminB.cliente.rpc("feriados_periodo", { p_empresa_id: empresa, p_de: "2027-03-20", p_ate: "2027-05-20" })).data).toEqual([]);
  });
});
