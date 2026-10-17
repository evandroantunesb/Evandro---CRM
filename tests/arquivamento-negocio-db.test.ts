/**
 * Arquivamento de negócio pela API (20261016200000_negocios_arquivamento.sql): admin/gestor arquivam e desarquivam
 * com motivo, registrado em logs_auditoria; arquivado fica somente leitura pela API (notas continuam); tarefa aberta
 * impede o arquivamento informando quantas; o atalho direto nas colunas é recusado até para service_role; distribuição
 * de lead e contrato não entram no arquivado por UPDATE (volta a pendente, troca de negocio_id).
 * A disputa entre sessões está em `arquivamento-concorrencia-db.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const SOMENTE_LEITURA = "Negócio arquivado é somente leitura: desarquive antes de alterar.";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let funil: string;
let etapa: string;
let contato: string;
let membroVendedor: string;

beforeAll(async () => {
  admin = await criarUsuario("arq-admin");
  vendedor = await criarUsuario("arq-vendedor");
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Arquivamento ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });
  const { data: mv } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" }).select("id").single();
  membroVendedor = mv!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapa = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente arquivamento" }).select("id").single();
  contato = c!.id;
});

async function novoNegocio() {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Arquivamento ${sufixo} ${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapa, responsavel_id: membroVendedor })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

describe("arquivar e desarquivar pela API", () => {
  it("só admin/gestor arquiva, com motivo; o arquivamento fica na auditoria", async () => {
    const negocio = await novoNegocio();

    const { error: erroVendedor } = await vendedor.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "teste" });
    expect(erroVendedor?.message).toBe("Negócio não encontrado.");

    const { error: semMotivo } = await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "  " });
    expect(semMotivo?.message).toBe("Informe o motivo do arquivamento.");

    const { error } = await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "Cliente desistiu" });
    expect(error).toBeNull();
    const { data: n } = await servico.from("negocios").select("arquivado_em, motivo_arquivamento").eq("id", negocio).single();
    expect(n!.arquivado_em).not.toBeNull();
    expect(n!.motivo_arquivamento).toBe("Cliente desistiu");

    const { data: logs } = await admin.cliente.from("logs_auditoria").select("acao, dados_depois").eq("entidade", "negocios").eq("entidade_id", negocio);
    expect(logs).toHaveLength(1);
    expect(logs![0].acao).toBe("arquivar");
    expect((logs![0].dados_depois as { motivo: string }).motivo).toBe("Cliente desistiu");
  });

  it("arquivado é somente leitura pela API, mas notas continuam", async () => {
    const negocio = await novoNegocio();
    await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "Duplicado" });

    const { error: erroEdicao } = await vendedor.cliente.from("negocios").update({ valor: 1000 }).eq("id", negocio);
    expect(erroEdicao?.message).toBe(SOMENTE_LEITURA);
    const { error: erroTarefa } = await vendedor.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, negocio_id: negocio, titulo: "Ligar", vence_em: new Date(Date.now() + 86_400_000).toISOString() });
    expect(erroTarefa?.message).toBe(SOMENTE_LEITURA);

    const { error: erroNota } = await vendedor.cliente.from("notas").insert({ empresa_id: empresa, negocio_id: negocio, texto: "Observação no arquivado" });
    expect(erroNota).toBeNull();
  });

  it("o atalho direto nas colunas de arquivamento é recusado, inclusive para service_role", async () => {
    const negocio = await novoNegocio();
    const { error } = await servico.from("negocios").update({ arquivado_em: new Date().toISOString(), motivo_arquivamento: "atalho" }).eq("id", negocio);
    expect(error?.message).toBe("Use arquivar ou desarquivar para mudar o arquivamento.");
  });

  it("tarefa aberta impede o arquivamento e a mensagem diz quantas; nada é concluído sozinho", async () => {
    const negocio = await novoNegocio();
    const vence = new Date(Date.now() + 86_400_000).toISOString();
    await vendedor.cliente.from("tarefas").insert([
      { empresa_id: empresa, negocio_id: negocio, titulo: "Retornar", vence_em: vence, responsavel_id: membroVendedor },
      { empresa_id: empresa, negocio_id: negocio, titulo: "Enviar documentos", vence_em: vence, responsavel_id: membroVendedor },
    ]);
    const { error } = await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "teste" });
    expect(error?.message).toBe("Há 2 tarefas abertas neste negócio: conclua ou exclua as tarefas antes de arquivar.");
    const { count } = await servico.from("tarefas").select("id", { count: "exact", head: true }).eq("negocio_id", negocio).is("concluida_em", null);
    expect(count).toBe(2);
  });

  it("desarquivar exige motivo e devolve o negócio à edição; fica na auditoria", async () => {
    const negocio = await novoNegocio();
    await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "Pausa" });

    const { error: semMotivo } = await admin.cliente.rpc("desarquivar_negocio", { p_negocio_id: negocio, p_motivo: "" });
    expect(semMotivo?.message).toBe("Informe o motivo do desarquivamento.");
    const { error } = await admin.cliente.rpc("desarquivar_negocio", { p_negocio_id: negocio, p_motivo: "Cliente voltou" });
    expect(error).toBeNull();

    const { error: erroEdicao } = await vendedor.cliente.from("negocios").update({ valor: 1000 }).eq("id", negocio);
    expect(erroEdicao).toBeNull();
    const { data: logs } = await admin.cliente
      .from("logs_auditoria")
      .select("acao")
      .eq("entidade", "negocios")
      .eq("entidade_id", negocio)
      .order("id");
    expect(logs!.map((l) => l.acao)).toEqual(["arquivar", "desarquivar"]);
  });
});

describe("vínculos do negócio arquivado", () => {
  const amanha = () => new Date(Date.now() + 86_400_000).toISOString();

  it("service_role não devolve a pendente a distribuição decidida do arquivado nem transfere distribuição ou contrato para ele", async () => {
    const arquivado = await novoNegocio();
    const ativo = await novoNegocio();
    const { data: decidida } = await servico
      .from("atribuicoes_leads")
      .insert({ empresa_id: empresa, negocio_id: arquivado, membro_sugerido_id: membroVendedor, expira_em: amanha() })
      .select("id")
      .single();
    expect((await admin.cliente.rpc("decidir_atribuicao_lead", { p_id: decidida!.id, p_membro_final_id: membroVendedor, p_automatico: false })).error).toBeNull();
    expect((await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: arquivado, p_motivo: "Vínculos" })).error).toBeNull();

    const { error: devolver } = await servico
      .from("atribuicoes_leads")
      .update({ status: "pendente", membro_final_id: null, decidido_por: null, decidido_em: null, expira_em: amanha() })
      .eq("id", decidida!.id);
    expect(devolver?.message).toBe(SOMENTE_LEITURA);

    const { data: pendente } = await servico
      .from("atribuicoes_leads")
      .insert({ empresa_id: empresa, negocio_id: ativo, membro_sugerido_id: membroVendedor, expira_em: amanha() })
      .select("id")
      .single();
    const { error: transferirDistribuicao } = await servico.from("atribuicoes_leads").update({ negocio_id: arquivado }).eq("id", pendente!.id);
    expect(transferirDistribuicao?.message).toBe(SOMENTE_LEITURA);

    const { data: contrato, error: erroContrato } = await servico.from("contratos").insert({ empresa_id: empresa, negocio_id: ativo, conteudo: "Contrato" }).select("id").single();
    expect(erroContrato).toBeNull();
    const { error: transferirContrato } = await servico.from("contratos").update({ negocio_id: arquivado }).eq("id", contrato!.id);
    expect(transferirContrato?.message).toBe(SOMENTE_LEITURA);

    const [{ count: pendentes }, { count: contratos }, { data: atual }] = await Promise.all([
      servico.from("atribuicoes_leads").select("id", { count: "exact", head: true }).eq("negocio_id", arquivado).eq("status", "pendente"),
      servico.from("contratos").select("id", { count: "exact", head: true }).eq("negocio_id", arquivado),
      servico.from("atribuicoes_leads").select("status").eq("id", decidida!.id).single(),
    ]);
    expect({ pendentes, contratos, status: atual!.status }).toEqual({ pendentes: 0, contratos: 0, status: "aprovada" });
  });

  it("membro apagado: o banco ainda anula sozinho a referência na distribuição decidida do arquivado", async () => {
    const gestor = await criarUsuario("arq-gestor");
    const { data: mg } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: gestor.id, papel: "gestor" }).select("id").single();
    const negocio = await novoNegocio();
    const { data: atribuicao } = await servico
      .from("atribuicoes_leads")
      .insert({ empresa_id: empresa, negocio_id: negocio, membro_sugerido_id: membroVendedor, expira_em: amanha() })
      .select("id")
      .single();
    expect((await gestor.cliente.rpc("decidir_atribuicao_lead", { p_id: atribuicao!.id, p_membro_final_id: membroVendedor, p_automatico: false })).error).toBeNull();
    expect((await admin.cliente.rpc("arquivar_negocio", { p_negocio_id: negocio, p_motivo: "Anulação automática" })).error).toBeNull();

    expect((await servico.from("empresa_membros").delete().eq("id", mg!.id)).error).toBeNull();
    const { data: a } = await servico.from("atribuicoes_leads").select("status, decidido_por").eq("id", atribuicao!.id).single();
    expect(a).toEqual({ status: "aprovada", decidido_por: null });
    const { data: n } = await servico.from("negocios").select("arquivado_em").eq("id", negocio).single();
    expect(n!.arquivado_em).not.toBeNull();
  });
});
