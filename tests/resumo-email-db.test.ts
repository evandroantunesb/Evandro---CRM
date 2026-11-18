/**
 * Resumo diário por e-mail (20261216100000_resumo_diario_email.sql) com Supabase local: quem entra, o que entra, um
 * envio por dia (reserva), nova tentativa depois de falha, janela a partir do último envio, preferência só da própria
 * pessoa e nada disso ao alcance do app. O envio usa um remetente falso.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { executarResumoDiario, type MensagemEmail } from "@/lib/resumo-email-envio";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario, gestor: Usuario, inativo: Usuario, adminB: Usuario;
let empresaA: string, empresaB: string;
const membro: Record<string, string> = {};

async function empresa(nome: string, vinculos: { u: Usuario; papel: "admin" | "gestor" | "vendedor"; status?: "ativo" | "inativo" }[]) {
  const { data: e, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  const { data: m, error: erroM } = await servico
    .from("empresa_membros")
    .insert(vinculos.map((v) => ({ empresa_id: e.id, user_id: v.u.id, papel: v.papel, status: v.status ?? "ativo" })))
    .select("id, user_id");
  if (erroM) throw erroM;
  for (const l of m!) membro[`${e.id}:${l.user_id}`] = l.id;
  return e.id;
}
const m = (empresaId: string, u: Usuario) => membro[`${empresaId}:${u.id}`];

async function aviso(empresaId: string, u: Usuario, tipo: string, mensagem: string, extra: { created_at?: string; lida_em?: string } = {}) {
  const { data, error } = await servico
    .from("notificacoes")
    .insert({ empresa_id: empresaId, membro_id: m(empresaId, u), tipo, mensagem, link: "/negocios", ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const horasAtras = (h: number, base = new Date()) => new Date(base.getTime() - h * 3600_000).toISOString();

/** Pendentes só dos membros deste teste. */
async function pendentes(dia: string, ate: Date) {
  const { data, error } = await servico.rpc("resumo_email_pendentes", { p_dia: dia, p_ate: ate.toISOString() });
  if (error) throw error;
  const meus = new Set(Object.values(membro));
  return (data ?? []).filter((l) => meus.has(l.membro_id));
}

/** Roda o resumo com um remetente falso; devolve só os e-mails para as pessoas deste teste. */
async function rodar(agora: Date, falhar = false) {
  const enviados: MensagemEmail[] = [];
  const emails = new Set([vendedor, gestor, inativo, adminB].map((u) => u.email));
  const resultado = await executarResumoDiario({
    admin: servico,
    agora,
    siteUrl: "https://raion.exemplo",
    enviar: async (msg) => {
      if (!emails.has(msg.para)) return { ok: true };
      enviados.push(msg);
      return falhar ? { ok: false, erro: "Resend 500" } : { ok: true };
    },
  });
  return { resultado, enviados };
}

const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

beforeAll(async () => {
  [vendedor, gestor, inativo, adminB] = await Promise.all(["re-vend", "re-gestor", "re-inativo", "re-adminb"].map(criarUsuario));
  empresaA = await empresa("Resumo A", [
    { u: vendedor, papel: "vendedor" },
    { u: gestor, papel: "gestor" },
    { u: inativo, papel: "vendedor", status: "inativo" },
  ]);
  empresaB = await empresa("Resumo B", [{ u: adminB, papel: "admin" }]);
});

describe("quem e o que entra", () => {
  it("só os tipos que pedem ação, não lidos, nas últimas 24 h, de membro ativo com resumo ligado", async () => {
    const lead = await aviso(empresaA, vendedor, "lead_atribuido", "Lead novo");
    const desconto = await aviso(empresaA, vendedor, "desconto_solicitado", "Desconto pedido", { created_at: horasAtras(5) });
    await aviso(empresaA, vendedor, "tarefa_atribuida", "Tarefa (fora da lista)");
    await aviso(empresaA, vendedor, "lead_atribuido", "Já lido", { lida_em: new Date().toISOString() });
    await aviso(empresaA, vendedor, "lead_atribuido", "Antigo", { created_at: horasAtras(30) });
    await aviso(empresaA, inativo, "lead_atribuido", "Para o inativo");
    await aviso(empresaA, gestor, "handoff_recebido", "Para o gestor");
    await aviso(empresaB, adminB, "pagamento_aviso_devolvido", "Pagamento devolvido B");

    const agora = new Date();
    const linhas = await pendentes(diaSP(agora), agora);
    const doVendedor = linhas.filter((l) => l.membro_id === m(empresaA, vendedor));
    expect(doVendedor.map((l) => l.notificacao_id).sort()).toEqual([lead, desconto].sort());
    expect(doVendedor.every((l) => l.empresa_id === empresaA && l.email === vendedor.email)).toBe(true);
    expect(linhas.some((l) => l.membro_id === m(empresaA, inativo))).toBe(false);
    expect(linhas.filter((l) => l.membro_id === m(empresaB, adminB)).map((l) => l.mensagem)).toEqual(["Pagamento devolvido B"]);
  });

  it("quem desliga o resumo no perfil sai da lista; religando, volta", async () => {
    const agora = new Date();
    expect((await gestor.cliente.rpc("definir_resumo_email", { p_empresa_id: empresaA, p_ligado: false })).error).toBeNull();
    expect((await pendentes(diaSP(agora), agora)).some((l) => l.membro_id === m(empresaA, gestor))).toBe(false);
    expect((await gestor.cliente.rpc("definir_resumo_email", { p_empresa_id: empresaA, p_ligado: true })).error).toBeNull();
    expect((await pendentes(diaSP(agora), agora)).some((l) => l.membro_id === m(empresaA, gestor))).toBe(true);
  });
});

describe("preferência é só da própria pessoa", () => {
  it("cada um vê só a própria linha; quem não é da empresa não grava", async () => {
    expect((await vendedor.cliente.rpc("definir_resumo_email", { p_empresa_id: empresaA, p_ligado: true })).error).toBeNull();
    const vistas = (await gestor.cliente.from("preferencias_resumo_email").select("membro_id")).data ?? [];
    expect(vistas.map((v) => v.membro_id)).toEqual([m(empresaA, gestor)]);
    const fora = await adminB.cliente.rpc("definir_resumo_email", { p_empresa_id: empresaA, p_ligado: false });
    expect(fora.error?.code).toBe("42501");
    expect((await adminB.cliente.from("preferencias_resumo_email").insert({ membro_id: m(empresaA, vendedor), empresa_id: empresaA, ligado: false })).error).not.toBeNull();
  });

  it("o app não lê nem grava envios e não chama as funções do agendador", async () => {
    expect((await vendedor.cliente.from("resumos_email_envios").select("id")).error).not.toBeNull();
    expect((await vendedor.cliente.from("resumos_email_envios").insert({ empresa_id: empresaA, membro_id: m(empresaA, vendedor), dia: "2026-01-01" })).error).not.toBeNull();
    const agora = new Date().toISOString();
    expect((await vendedor.cliente.rpc("resumo_email_pendentes", { p_dia: "2026-01-01", p_ate: agora })).error).not.toBeNull();
    expect(
      (await vendedor.cliente.rpc("reservar_resumo_email", {
        p_empresa_id: empresaA, p_membro_id: m(empresaA, vendedor), p_dia: "2026-01-01", p_janela_inicio: agora, p_janela_fim: agora, p_itens: 1,
      })).error,
    ).not.toBeNull();
  });
});

describe("envio", () => {
  it("falha fica registrada e tenta de novo; depois, um e-mail por pessoa por dia; o dia seguinte só traz o novo", async () => {
    const agora = new Date();

    const falha = await rodar(agora, true);
    expect(falha.enviados.map((e) => e.para).sort()).toEqual([vendedor.email, gestor.email, adminB.email].sort());
    const { data: registro } = await servico.from("resumos_email_envios").select("situacao, erro, itens").eq("membro_id", m(empresaA, vendedor)).single();
    expect(registro).toEqual({ situacao: "falhou", erro: "Resend 500", itens: 2 });

    const certo = await rodar(agora);
    const paraVendedor = certo.enviados.find((e) => e.para === vendedor.email)!;
    expect(paraVendedor.assunto).toBe("Você tem 2 pendências no Raion hoje");
    expect(paraVendedor.texto).toContain("Lead novo");
    expect(paraVendedor.texto).toContain("Desconto pedido");
    expect(paraVendedor.texto).not.toContain("Tarefa (fora da lista)");
    expect(certo.enviados).toHaveLength(3);

    // Mesmo dia de novo: ninguém deste teste recebe outra vez.
    expect((await rodar(agora)).enviados).toEqual([]);

    // Dia seguinte: o aviso já enviado (ainda não lido) não repete; só o que chegou depois entra.
    await aviso(empresaA, vendedor, "handoff_devolvido", "Handoff devolvido depois");
    const amanha = new Date(agora.getTime() + 24 * 3600_000);
    const seguinte = await rodar(amanha);
    expect(seguinte.enviados.map((e) => e.para)).toEqual([vendedor.email]);
    expect(seguinte.enviados[0].assunto).toBe("Você tem 1 pendência no Raion hoje");
    expect(seguinte.enviados[0].texto).toContain("Handoff devolvido depois");
    expect(seguinte.enviados[0].texto).not.toContain("Lead novo");
  });

  it("duas reservas para a mesma pessoa e dia: só uma recebe o id", async () => {
    const agora = new Date().toISOString();
    const args = { p_empresa_id: empresaB, p_membro_id: m(empresaB, adminB), p_dia: "2030-01-01", p_janela_inicio: agora, p_janela_fim: agora, p_itens: 1 };
    const [a, b] = await Promise.all([servico.rpc("reservar_resumo_email", args), servico.rpc("reservar_resumo_email", args)]);
    expect([a.error, b.error]).toEqual([null, null]);
    expect([a.data, b.data].filter(Boolean)).toHaveLength(1);
  });
});
