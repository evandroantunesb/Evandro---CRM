/** Regras da operação: tarefas, notas, anexos, etiquetas, ganho/perda e campos obrigatórios. */
import { beforeAll, describe, expect, it } from "vitest";
import { carregarLeadsParados } from "@/lib/leads-parados";
import { carregarLeadsSemContato } from "@/lib/leads-sem-contato";
import { carregarPropostasParadas } from "@/lib/propostas-paradas";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor1: Usuario;
let vendedor2: Usuario;
let adminOutra: Usuario;
let empresa: string;
let outra: string;
const membro: Record<string, string> = {};
let funil: string;
let etapas: { id: string; nome: string }[];
let contato: string;
let negocio: string; // do vendedor1

beforeAll(async () => {
  [admin, vendedor1, vendedor2, adminOutra] = await Promise.all(["op-admin", "op-v1", "op-v2", "op-outra"].map(criarUsuario));
  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Operação ${sufixo}` }, { nome: `Operação outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor1.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: vendedor2.id, papel: "vendedor" },
      { empresa_id: outra, user_id: adminOutra.id, papel: "admin" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id, nome").eq("funil_id", funil).order("ordem");
  etapas = et!;

  const { data: c } = await vendedor1.cliente
    .from("contatos")
    .insert({ empresa_id: empresa, nome: "Cliente Operação", telefone: "44 91234-5678" })
    .select("id")
    .single();
  contato = c!.id;
  const { data: n, error } = await vendedor1.cliente
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Usina 8 kWp", contato_id: contato, funil_id: funil, etapa_id: etapas[0].id })
    .select("id")
    .single();
  if (error) throw error;
  negocio = n!.id;
});

describe("ganho e perda", () => {
  it("empresa nasce com motivos de perda padrão", async () => {
    const { data } = await vendedor1.cliente.from("motivos_perda").select("nome").eq("empresa_id", empresa);
    expect(data!.map((m) => m.nome)).toContain("Preço");
  });

  it("perda exige motivo e registra na linha do tempo", async () => {
    const semMotivo = await vendedor1.cliente.from("negocios").update({ status: "perdido" }).eq("id", negocio);
    expect(semMotivo.error?.message).toContain("motivo");
    expect(semMotivo.error?.hint).toBe("mensagem_usuario");

    const { data: motivo } = await servico.from("motivos_perda").select("id").eq("empresa_id", empresa).eq("nome", "Preço").single();
    const { error } = await vendedor1.cliente
      .from("negocios")
      .update({ status: "perdido", motivo_perda_id: motivo!.id, motivo_perda_detalhe: "Achou caro" })
      .eq("id", negocio);
    expect(error).toBeNull();
    const { data: ativ } = await servico.from("atividades").select("tipo, dados").eq("negocio_id", negocio).eq("tipo", "motivo_perda");
    expect(ativ).toHaveLength(1);
  });

  it("motivo de outra empresa é recusado", async () => {
    const { data: motivoOutra } = await servico.from("motivos_perda").select("id").eq("empresa_id", outra).limit(1).single();
    const { error } = await vendedor1.cliente
      .from("negocios")
      .update({ status: "perdido", motivo_perda_id: motivoOutra!.id })
      .eq("id", negocio);
    expect(error).not.toBeNull();
  });

  it("reabrir limpa o motivo; ganho exige valor", async () => {
    await vendedor1.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocio);
    const { data } = await servico.from("negocios").select("motivo_perda_id, fechado_em").eq("id", negocio).single();
    expect(data).toEqual({ motivo_perda_id: null, fechado_em: null });

    const semValor = await vendedor1.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocio);
    expect(semValor.error?.message).toContain("valor");
    const comValor = await vendedor1.cliente.from("negocios").update({ status: "ganho", valor: 32000 }).eq("id", negocio);
    expect(comValor.error).toBeNull();
    await vendedor1.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocio);
  });
});

describe("campos obrigatórios por etapa", () => {
  it("vendedor não configura, admin configura", async () => {
    await vendedor1.cliente.from("etapas").update({ campos_obrigatorios: ["valor"] }).eq("id", etapas[2].id);
    const { data } = await servico.from("etapas").select("campos_obrigatorios").eq("id", etapas[2].id).single();
    expect(data!.campos_obrigatorios).toEqual([]);

    const { error } = await admin.cliente
      .from("etapas")
      .update({ campos_obrigatorios: ["valor", "contato_email", "contato_cidade"] })
      .eq("id", etapas[2].id);
    expect(error).toBeNull();
  });

  it("campo desconhecido é recusado", async () => {
    const { error } = await admin.cliente.from("etapas").update({ campos_obrigatorios: ["qualquer"] }).eq("id", etapas[2].id);
    expect(error).not.toBeNull();
  });

  it("mover para a etapa sem os campos lista o que falta; depois de preencher, passa", async () => {
    await vendedor1.cliente.from("negocios").update({ valor: null }).eq("id", negocio);
    const { error } = await vendedor1.cliente.from("negocios").update({ etapa_id: etapas[2].id }).eq("id", negocio);
    expect(error?.message).toBe('Para entrar em "Visita agendada", preencha: valor, e-mail do contato, cidade do contato.');

    await vendedor1.cliente.from("contatos").update({ email: "cliente@op.com", cidade: "Maringá" }).eq("id", contato);
    const ok = await vendedor1.cliente.from("negocios").update({ etapa_id: etapas[2].id, valor: 30000 }).eq("id", negocio);
    expect(ok.error).toBeNull();
  });
});

describe("tarefas", () => {
  let tarefa: string;

  it("vendedor cria tarefa no próprio negócio e vira responsável", async () => {
    const { data, error } = await vendedor1.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, negocio_id: negocio, titulo: "Ligar", tipo: "ligacao", vence_em: new Date(Date.now() - 3600e3).toISOString() })
      .select("id, responsavel_id")
      .single();
    expect(error).toBeNull();
    expect(data!.responsavel_id).toBe(membro[vendedor1.id]);
    tarefa = data!.id;
  });

  it("vendedor não cria tarefa para outro vendedor nem em negócio que não vê", async () => {
    const paraOutro = await vendedor1.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, titulo: "X", vence_em: new Date().toISOString(), responsavel_id: membro[vendedor2.id] });
    expect(paraOutro.error).not.toBeNull();
    const negocioAlheio = await vendedor2.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, negocio_id: negocio, titulo: "X", vence_em: new Date().toISOString() });
    expect(negocioAlheio.error).not.toBeNull();
  });

  it("outro vendedor e outra empresa não veem a tarefa", async () => {
    const { data: v2 } = await vendedor2.cliente.from("tarefas").select("id").eq("id", tarefa);
    const { data: fora } = await adminOutra.cliente.from("tarefas").select("id").eq("id", tarefa);
    const { data: adm } = await admin.cliente.from("tarefas").select("id").eq("id", tarefa);
    expect(v2).toHaveLength(0);
    expect(fora).toHaveLength(0);
    expect(adm).toHaveLength(1);
  });

  it("concluir registra quem concluiu, a linha do tempo e o evento", async () => {
    const { error } = await vendedor1.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" })
      .eq("id", tarefa);
    expect(error).toBeNull();
    const { data } = await servico.from("tarefas").select("concluida_por").eq("id", tarefa).single();
    expect(data!.concluida_por).toBe(membro[vendedor1.id]);
    const { data: ev } = await servico.from("eventos").select("payload").eq("entidade_id", tarefa).eq("tipo", "task.completed");
    expect(ev).toHaveLength(1);
    expect((ev![0].payload as { no_prazo: boolean }).no_prazo).toBe(false);
    const { data: ativ } = await servico.from("atividades").select("tipo").eq("negocio_id", negocio).eq("tipo", "tarefa_concluida");
    expect(ativ).toHaveLength(1);
  });
});

describe("notas", () => {
  let nota: string;

  it("quem vê o negócio escreve; autor é gravado pelo banco", async () => {
    const { data, error } = await vendedor1.cliente
      .from("notas")
      .insert({ empresa_id: empresa, negocio_id: negocio, texto: "Cliente pediu visita sábado" })
      .select("id, autor_id")
      .single();
    expect(error).toBeNull();
    expect(data!.autor_id).toBe(membro[vendedor1.id]);
    nota = data!.id;
  });

  it("outro vendedor não lê nem escreve; admin lê mas não edita nota alheia", async () => {
    const { data: v2 } = await vendedor2.cliente.from("notas").select("id").eq("negocio_id", negocio);
    expect(v2).toHaveLength(0);
    const escrita = await vendedor2.cliente.from("notas").insert({ empresa_id: empresa, negocio_id: negocio, texto: "intruso" });
    expect(escrita.error).not.toBeNull();

    const { data: adm } = await admin.cliente.from("notas").select("id").eq("id", nota);
    expect(adm).toHaveLength(1);
    await admin.cliente.from("notas").update({ texto: "editado pelo admin" }).eq("id", nota);
    const { data } = await servico.from("notas").select("texto").eq("id", nota).single();
    expect(data!.texto).toBe("Cliente pediu visita sábado");
  });
});

describe("leads parados", () => {
  async function criarNegocioBackdatado(cliente: Usuario["cliente"], titulo: string, diasAtras: number) {
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: titulo }).select("id").single();
    const { data: n, error } = await cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapas[0].id })
      .select("id")
      .single();
    if (error) throw error;
    await servico
      .from("negocios")
      .update({ etapa_desde: new Date(Date.now() - diasAtras * 86_400_000).toISOString() })
      .eq("id", n!.id);
    return n!.id;
  }

  it("sinaliza negócio aberto sem mudança de etapa nem nota há mais de 7 dias", async () => {
    const id = await criarNegocioBackdatado(vendedor1.cliente, "Negócio parado 8 dias", 8);
    const parados = await carregarLeadsParados(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).toContain(id);
  });

  it("não sinaliza se teve nota recente, mesmo com etapa antiga", async () => {
    const id = await criarNegocioBackdatado(vendedor1.cliente, "Negócio com nota recente", 8);
    await servico.from("notas").insert({ empresa_id: empresa, negocio_id: id, texto: "Retomei contato hoje" });
    const parados = await carregarLeadsParados(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).not.toContain(id);
  });

  it("não sinaliza negócio ainda dentro do prazo", async () => {
    const id = await criarNegocioBackdatado(vendedor1.cliente, "Negócio recente", 2);
    const parados = await carregarLeadsParados(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).not.toContain(id);
  });

  it("respeita o filtro por responsável", async () => {
    const id = await criarNegocioBackdatado(vendedor2.cliente, "Negócio parado do vendedor2", 8);

    const paradosVendedor1 = await carregarLeadsParados(servico, empresa, { diasLimite: 7, responsavelId: membro[vendedor1.id] });
    expect(paradosVendedor1.map((p) => p.id)).not.toContain(id);

    const paradosVendedor2 = await carregarLeadsParados(servico, empresa, { diasLimite: 7, responsavelId: membro[vendedor2.id] });
    expect(paradosVendedor2.map((p) => p.id)).toContain(id);
  });
});

describe("leads sem contato", () => {
  async function criarLeadBackdatado(cliente: Usuario["cliente"], titulo: string, horasAtras: number) {
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: titulo }).select("id").single();
    const { data: n, error } = await cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapas[0].id })
      .select("id")
      .single();
    if (error) throw error;
    await servico
      .from("negocios")
      .update({ created_at: new Date(Date.now() - horasAtras * 3_600_000).toISOString() })
      .eq("id", n!.id);
    return n!.id;
  }

  it("sinaliza lead novo, na etapa inicial, sem nenhuma nota há mais de 3 horas", async () => {
    const id = await criarLeadBackdatado(vendedor1.cliente, "Lead sem contato 4h", 4);
    const semContato = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3 });
    expect(semContato.map((p) => p.id)).toContain(id);
  });

  it("não sinaliza se já tem alguma nota registrada", async () => {
    const id = await criarLeadBackdatado(vendedor1.cliente, "Lead com nota", 4);
    await servico.from("notas").insert({ empresa_id: empresa, negocio_id: id, texto: "Já liguei" });
    const semContato = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3 });
    expect(semContato.map((p) => p.id)).not.toContain(id);
  });

  it("não sinaliza lead ainda dentro do prazo", async () => {
    const id = await criarLeadBackdatado(vendedor1.cliente, "Lead recente", 1);
    const semContato = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3 });
    expect(semContato.map((p) => p.id)).not.toContain(id);
  });

  it("não sinaliza negócio que já saiu da etapa inicial", async () => {
    const id = await criarLeadBackdatado(vendedor1.cliente, "Lead avançado", 4);
    await servico.from("negocios").update({ etapa_id: etapas[1].id }).eq("id", id);
    const semContato = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3 });
    expect(semContato.map((p) => p.id)).not.toContain(id);
  });

  it("respeita o filtro por responsável", async () => {
    const id = await criarLeadBackdatado(vendedor2.cliente, "Lead sem contato do vendedor2", 4);

    const semContatoVendedor1 = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3, responsavelId: membro[vendedor1.id] });
    expect(semContatoVendedor1.map((p) => p.id)).not.toContain(id);

    const semContatoVendedor2 = await carregarLeadsSemContato(servico, empresa, { horasLimite: 3, responsavelId: membro[vendedor2.id] });
    expect(semContatoVendedor2.map((p) => p.id)).toContain(id);
  });
});

describe("propostas paradas", () => {
  async function criarNegocioComProposta(cliente: Usuario["cliente"], titulo: string, diasEtapa: number, diasProposta: number) {
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: titulo }).select("id").single();
    const { data: n, error } = await cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapas[0].id })
      .select("id")
      .single();
    if (error) throw error;
    await servico
      .from("negocios")
      .update({ etapa_desde: new Date(Date.now() - diasEtapa * 86_400_000).toISOString() })
      .eq("id", n!.id);

    const { data: p, error: erroProposta } = await servico
      .from("propostas")
      .insert({ empresa_id: empresa, negocio_id: n!.id })
      .select("id")
      .single();
    if (erroProposta) throw erroProposta;
    await servico
      .from("propostas")
      .update({ created_at: new Date(Date.now() - diasProposta * 86_400_000).toISOString() })
      .eq("id", p!.id);

    return { negocioId: n!.id, propostaId: p!.id };
  }

  it("sinaliza negócio com proposta gerada há mais de 7 dias, sem abertura", async () => {
    const { negocioId } = await criarNegocioComProposta(vendedor1.cliente, "Proposta parada 9 dias", 10, 9);
    const parados = await carregarPropostasParadas(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).toContain(negocioId);
  });

  it("não sinaliza se o cliente abriu o link recentemente, mesmo com proposta antiga", async () => {
    const { negocioId, propostaId } = await criarNegocioComProposta(vendedor1.cliente, "Proposta reaberta", 10, 9);
    await servico.from("propostas_aberturas").insert({ proposta_id: propostaId });
    const parados = await carregarPropostasParadas(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).not.toContain(negocioId);
  });

  it("não sinaliza negócio ainda dentro do prazo", async () => {
    const { negocioId } = await criarNegocioComProposta(vendedor1.cliente, "Proposta recente", 1, 1);
    const parados = await carregarPropostasParadas(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).not.toContain(negocioId);
  });

  it("não sinaliza negócio sem proposta gerada, mesmo parado há muito tempo", async () => {
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Sem proposta" }).select("id").single();
    const { data: n, error } = await vendedor1.cliente
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: "Sem proposta", contato_id: c!.id, funil_id: funil, etapa_id: etapas[0].id })
      .select("id")
      .single();
    if (error) throw error;
    await servico
      .from("negocios")
      .update({ etapa_desde: new Date(Date.now() - 30 * 86_400_000).toISOString() })
      .eq("id", n!.id);

    const parados = await carregarPropostasParadas(servico, empresa, { diasLimite: 7 });
    expect(parados.map((p) => p.id)).not.toContain(n!.id);
  });

  it("respeita o filtro por responsável", async () => {
    const { negocioId } = await criarNegocioComProposta(vendedor2.cliente, "Proposta parada do vendedor2", 10, 9);

    const paradosVendedor1 = await carregarPropostasParadas(servico, empresa, { diasLimite: 7, responsavelId: membro[vendedor1.id] });
    expect(paradosVendedor1.map((p) => p.id)).not.toContain(negocioId);

    const paradosVendedor2 = await carregarPropostasParadas(servico, empresa, { diasLimite: 7, responsavelId: membro[vendedor2.id] });
    expect(paradosVendedor2.map((p) => p.id)).toContain(negocioId);
  });
});

describe("etiquetas", () => {
  it("admin cria, vendedor marca no próprio negócio, outro vendedor não", async () => {
    const { data: et, error } = await admin.cliente.from("etiquetas").insert({ empresa_id: empresa, nome: "Urgente" }).select("id").single();
    expect(error).toBeNull();
    const marca = await vendedor1.cliente.from("negocio_etiquetas").insert({ negocio_id: negocio, etiqueta_id: et!.id, empresa_id: empresa });
    expect(marca.error).toBeNull();
    const { data: v2 } = await vendedor2.cliente.from("negocio_etiquetas").select("etiqueta_id").eq("negocio_id", negocio);
    expect(v2).toHaveLength(0);
  });

  it("etiqueta de outra empresa é recusada", async () => {
    const { data: alheia } = await servico.from("etiquetas").insert({ empresa_id: outra, nome: `X ${sufixo}` }).select("id").single();
    const { error } = await vendedor1.cliente
      .from("negocio_etiquetas")
      .insert({ negocio_id: negocio, etiqueta_id: alheia!.id, empresa_id: empresa });
    expect(error).not.toBeNull();
  });
});

describe("anexos", () => {
  const arquivo = () => new Blob(["conta de luz"], { type: "text/plain" });

  it("envia só dentro da pasta do negócio que vê", async () => {
    const caminho = `${empresa}/${negocio}/${sufixo}-fatura.txt`;
    const envio = await vendedor1.cliente.storage.from("anexos").upload(caminho, arquivo());
    expect(envio.error).toBeNull();
    const { error } = await vendedor1.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocio, nome: "fatura.txt", caminho, tamanho: 12, tipo_mime: "text/plain" });
    expect(error).toBeNull();

    const alheio = await vendedor2.cliente.storage.from("anexos").upload(`${empresa}/${negocio}/${sufixo}-x.txt`, arquivo());
    expect(alheio.error).not.toBeNull();
    const foraDaPasta = await vendedor1.cliente.storage.from("anexos").upload(`${empresa}/${sufixo}.txt`, arquivo());
    expect(foraDaPasta.error).not.toBeNull();
  });

  it("outro vendedor não baixa; o responsável baixa", async () => {
    const caminho = `${empresa}/${negocio}/${sufixo}-fatura.txt`;
    const v2 = await vendedor2.cliente.storage.from("anexos").download(caminho);
    expect(v2.error).not.toBeNull();
    const v1 = await vendedor1.cliente.storage.from("anexos").download(caminho);
    expect(await v1.data!.text()).toBe("conta de luz");
  });

  it("caminho fora da pasta é recusado no registro", async () => {
    const { error } = await vendedor1.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocio, nome: "x", caminho: `${outra}/${negocio}/x`, tamanho: 1 });
    expect(error).not.toBeNull();
  });

  it("categoria nasce 'geral' por padrão e aceita CNH/faturas; rejeita valor fora da lista", async () => {
    const caminho = `${empresa}/${negocio}/${sufixo}-categoria.txt`;
    await vendedor1.cliente.storage.from("anexos").upload(caminho, arquivo());
    const { data } = await vendedor1.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocio, nome: "categoria.txt", caminho, tamanho: 12 })
      .select("categoria")
      .single();
    expect(data!.categoria).toBe("geral");

    const caminhoCnh = `${empresa}/${negocio}/${sufixo}-cnh.txt`;
    await vendedor1.cliente.storage.from("anexos").upload(caminhoCnh, arquivo());
    const { error: erroCnh } = await vendedor1.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocio, nome: "cnh.txt", caminho: caminhoCnh, tamanho: 12, categoria: "cnh" });
    expect(erroCnh).toBeNull();

    const caminhoInvalido = `${empresa}/${negocio}/${sufixo}-invalido.txt`;
    await vendedor1.cliente.storage.from("anexos").upload(caminhoInvalido, arquivo());
    const { error: erroInvalido } = await vendedor1.cliente
      .from("anexos")
      .insert({ empresa_id: empresa, negocio_id: negocio, nome: "x.txt", caminho: caminhoInvalido, tamanho: 12, categoria: "outra_coisa" });
    expect(erroInvalido).not.toBeNull();
  });
});
