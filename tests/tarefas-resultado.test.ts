/**
 * Resultado estruturado em tarefas (Evandro, 2026-10-01): ligação/WhatsApp e reunião/visita
 * exigem um resultado real pra concluir, com os valores corretos por tipo e checagem de
 * horário pra reunião/visita; e-mail/outro continuam concluindo sem exigir nada. Sem
 * pontuação automática — só confirma que o banco valida e registra na timeline/eventos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { TipoTarefa } from "@/lib/tipos";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario;
let empresa: string;
let membroId: string;

beforeAll(async () => {
  vendedor = await criarUsuario("tr-vendedor");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Tarefas resultado ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: vinculo } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" })
    .select("id")
    .single();
  membroId = vinculo!.id;
});

function criarTarefa(tipo: TipoTarefa, venceEmIso: string) {
  return vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: `Tarefa ${tipo} ${sufixo}-${Math.random()}`, tipo, vence_em: venceEmIso, responsavel_id: membroId })
    .select("id")
    .single();
}

const PASSADO = new Date(Date.now() - 3600e3).toISOString();
const FUTURO = new Date(Date.now() + 3600e3).toISOString();

describe("ligação/WhatsApp exigem resultado", () => {
  it("concluir sem resultado é recusado", async () => {
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    const { error } = await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", tarefa!.id);
    expect(error?.message).toContain("resultado do contato");
    expect(error?.hint).toBe("mensagem_usuario");
  });

  it("concluir com resultado fora do conjunto de contato (ex.: 'realizada') é recusado", async () => {
    const { data: tarefa } = await criarTarefa("whatsapp", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error).not.toBeNull();
  });

  it("concluir com resultado válido é aceito e fica registrado na timeline e no evento", async () => {
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "sem_resposta" })
      .eq("id", tarefa!.id);
    expect(error).toBeNull();

    const { data: ev } = await servico.from("eventos").select("payload").eq("entidade_id", tarefa!.id).eq("tipo", "task.completed").single();
    expect((ev!.payload as { resultado: string }).resultado).toBe("sem_resposta");
  });
});

describe("reunião/visita exigem resultado terminal e respeitam o horário", () => {
  it("'realizada' antes do horário previsto é recusado", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", FUTURO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error?.message).toContain("horário previsto");
  });

  it("'no_show' antes do horário previsto também é recusado", async () => {
    const { data: tarefa } = await criarTarefa("visita", FUTURO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "no_show" })
      .eq("id", tarefa!.id);
    expect(error?.message).toContain("horário previsto");
  });

  it("'cancelada' é aceito mesmo antes do horário previsto", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", FUTURO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "cancelada" })
      .eq("id", tarefa!.id);
    expect(error).toBeNull();
  });

  it("'realizada' depois do horário previsto é aceito", async () => {
    const { data: tarefa } = await criarTarefa("visita", PASSADO);
    const { error } = await vendedor.cliente
      .from("tarefas")
      .update({ concluida_em: new Date().toISOString(), resultado: "realizada" })
      .eq("id", tarefa!.id);
    expect(error).toBeNull();
  });

  it("concluir sem resultado é recusado", async () => {
    const { data: tarefa } = await criarTarefa("reuniao", PASSADO);
    const { error } = await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", tarefa!.id);
    expect(error).not.toBeNull();
  });
});

describe("e-mail/outro continuam concluindo sem exigir resultado", () => {
  it("email conclui normalmente, sem resultado", async () => {
    const { data: tarefa } = await criarTarefa("email", PASSADO);
    const { error } = await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", tarefa!.id);
    expect(error).toBeNull();
  });
});

describe("reabrir limpa o resultado", () => {
  it("volta pra pendente e o resultado some", async () => {
    const { data: tarefa } = await criarTarefa("ligacao", PASSADO);
    await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString(), resultado: "contato_realizado" }).eq("id", tarefa!.id);

    const { error } = await vendedor.cliente.from("tarefas").update({ concluida_em: null }).eq("id", tarefa!.id);
    expect(error).toBeNull();

    const { data } = await servico.from("tarefas").select("resultado, concluida_em").eq("id", tarefa!.id).single();
    expect(data!.resultado).toBeNull();
    expect(data!.concluida_em).toBeNull();
  });
});
