/**
 * Anexos das tarefas de setor (20261029230000_tarefas_setor_anexos.sql): bucket privado `tarefas-setor`, pasta
 * `empresa/tarefa/objeto`. Quem vê a tarefa vê e baixa; quem vê anexa com a tarefa aberta; registro só pela RPC
 * (confere o objeto enviado por quem chama); remover: quem enviou ou o admin, com a tarefa aberta.
 * Precisa do Supabase local (roda no CI). Os testes seguem em ordem (cada um parte do estado do anterior).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "tarefas-setor";
const arquivo = (tamanho = 64) => new Blob([new Uint8Array(tamanho)], { type: "image/jpeg" });
const enviar = (u: Usuario, caminho: string, tamanho = 64) =>
  u.cliente.storage.from(BUCKET).upload(caminho, arquivo(tamanho), { contentType: "image/jpeg" });

let admin: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let engExec: Usuario;
let comprasExec: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let tarefa: string;
let pasta: string;
let anexoVendedor: string;
let anexoEng: string;

const amanha = () => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const caminho = () => `${pasta}/${randomUUID()}-foto.jpg`;
const veAnexo = async (u: Usuario, id: string) => ((await u.cliente.from("tarefas_setor_anexos").select("id").eq("id", id)).data ?? []).length === 1;

describe("anexos das tarefas de setor (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, vendedor2, engExec, comprasExec, adminB] = await Promise.all(
      ["tsa-admin", "tsa-vendedor", "tsa-vendedor2", "tsa-eng", "tsa-compras", "tsa-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Anexos tarefa A ${sufixo}` }, { nome: `Anexos tarefa B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [vendedor2, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engExec, empresa, { papel: "operacao" }],
      [comprasExec, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [alvo, setor] of [
      [engExec, "engenharia"],
      [comprasExec, "compras"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", {
        p_membro_id: membro[alvo.id],
        p_setores: [{ setor, capacidade: "executar" }] as never,
      });
      if (e) throw e;
    }

    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
    const { data: c } = await servico
      .from("contatos")
      .insert({ empresa_id: empresa, nome: `Cliente anexos ${sufixo}`, ...CLIENTE_CONTRATO })
      .select("id")
      .single();
    const { data: neg, error: eNeg } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: `Anexos ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single();
    if (eNeg) throw eNeg;
    const { data: id, error: eTarefa } = await vendedor.cliente.rpc("criar_tarefa_setor", {
      p_setor: "engenharia",
      p_titulo: "Projeto 3D do telhado",
      p_prazo: amanha(),
      p_negocio_id: neg!.id,
    });
    if (eTarefa) throw eTarefa;
    tarefa = id as string;
    pasta = `${empresa}/${tarefa}`;
  });

  it("bucket privado de 20 MB", async () => {
    const { data, error } = await servico.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data).toMatchObject({ public: false, file_size_limit: 20971520 });
  });

  it("quem pediu envia e registra; tamanho e tipo vêm do Storage", async () => {
    const c = caminho();
    expect((await enviar(vendedor, c, 128)).error).toBeNull();
    const { data, error } = await vendedor.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: c, p_nome: "Foto do telhado.jpg" });
    expect(error).toBeNull();
    anexoVendedor = data as string;
    const { data: linha } = await servico.from("tarefas_setor_anexos").select("*").eq("id", anexoVendedor).single();
    expect(linha).toMatchObject({ tarefa_id: tarefa, empresa_id: empresa, nome: "Foto do telhado.jpg", tamanho: 128, tipo_mime: "image/jpeg", enviado_por: membro[vendedor.id] });
  });

  it("quem vê a tarefa vê e baixa; Compras, outro vendedor e outra empresa, não", async () => {
    const { data: linha } = await servico.from("tarefas_setor_anexos").select("caminho").eq("id", anexoVendedor).single();
    for (const u of [vendedor, engExec, admin]) {
      expect(await veAnexo(u, anexoVendedor)).toBe(true);
      expect((await u.cliente.storage.from(BUCKET).download(linha!.caminho)).error).toBeNull();
    }
    for (const u of [comprasExec, vendedor2, adminB]) {
      expect(await veAnexo(u, anexoVendedor)).toBe(false);
      expect((await u.cliente.storage.from(BUCKET).download(linha!.caminho)).data).toBeNull();
    }
  });

  it("quem não vê a tarefa não envia; caminho fora do formato ou de outra empresa é recusado", async () => {
    for (const u of [comprasExec, vendedor2]) expect((await enviar(u, caminho())).error).not.toBeNull();
    expect((await enviar(vendedor, `${empresaB}/${tarefa}/${randomUUID()}-x.jpg`)).error).not.toBeNull();
    expect((await enviar(vendedor, `${pasta}/sub/${randomUUID()}-x.jpg`)).error).not.toBeNull();
    expect((await enviar(vendedor, `${empresa}/${randomUUID()}/${randomUUID()}-x.jpg`)).error).not.toBeNull();
  });

  it("registro confere o objeto: inexistente, de outra pessoa, vazio ou repetido é recusado", async () => {
    const inexistente = await vendedor.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: caminho(), p_nome: "x.jpg" });
    expect(inexistente.error?.message).toBe("Arquivo não encontrado no armazenamento. Envie de novo.");

    const doEng = caminho();
    expect((await enviar(engExec, doEng)).error).toBeNull();
    const alheio = await vendedor.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: doEng, p_nome: "x.jpg" });
    expect(alheio.error?.message).toBe("Arquivo não encontrado no armazenamento. Envie de novo.");

    const vazio = caminho();
    // Se o Storage aceitar arquivo vazio, o registro recusa.
    if (!(await vendedor.cliente.storage.from(BUCKET).upload(vazio, new Blob([]), { contentType: "image/jpeg" })).error) {
      expect((await vendedor.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: vazio, p_nome: "x.jpg" })).error?.message).toBe("O arquivo está vazio.");
    }

    const { data: linha } = await servico.from("tarefas_setor_anexos").select("caminho").eq("id", anexoVendedor).single();
    expect((await vendedor.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: linha!.caminho, p_nome: "x.jpg" })).error?.message).toBe(
      "Este arquivo já está registrado.",
    );

    const fora = await comprasExec.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: doEng, p_nome: "x.jpg" });
    expect(fora.error?.message).toBe("Tarefa não encontrada.");
  });

  it("a Engenharia devolve o 3D como anexo; ninguém grava direto na tabela", async () => {
    const c = caminho();
    expect((await enviar(engExec, c)).error).toBeNull();
    const { data, error } = await engExec.cliente.rpc("registrar_anexo_tarefa_setor", { p_caminho: c, p_nome: "3D.pdf" });
    expect(error).toBeNull();
    anexoEng = data as string;
    expect(await veAnexo(vendedor, anexoEng)).toBe(true);

    const direto = await admin.cliente.from("tarefas_setor_anexos").insert({ tarefa_id: tarefa, empresa_id: empresa, caminho: caminho(), nome: "x", tamanho: 1 });
    expect(direto.error).not.toBeNull();
    const pelaChave = await servico.from("tarefas_setor_anexos").delete().eq("id", anexoEng);
    expect(pelaChave.error).not.toBeNull();
  });

  it("remover: quem enviou ou o admin; outro membro, não", async () => {
    const naoDono = await engExec.cliente.rpc("remover_anexo_tarefa_setor", { p_anexo_id: anexoVendedor });
    expect(naoDono.error?.message).toBe("Só quem enviou ou o admin remove o arquivo.");
    const { data: c, error } = await engExec.cliente.rpc("remover_anexo_tarefa_setor", { p_anexo_id: anexoEng });
    expect(error).toBeNull();
    expect(c).toMatch(new RegExp(`^${pasta}/`));
    expect(await veAnexo(admin, anexoEng)).toBe(false);
  });

  it("tarefa concluída: anexos ficam como registro; não recebe nem perde arquivo", async () => {
    expect((await engExec.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: tarefa, p_resposta: "3D em anexo" })).error).toBeNull();
    expect((await enviar(vendedor, caminho())).error).not.toBeNull();
    const remover = await vendedor.cliente.rpc("remover_anexo_tarefa_setor", { p_anexo_id: anexoVendedor });
    expect(remover.error?.message).toBe("Tarefa encerrada: os anexos ficam como registro.");
    expect(await veAnexo(vendedor, anexoVendedor)).toBe(true);
  });
});
