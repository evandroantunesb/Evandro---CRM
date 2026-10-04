/**
 * Sequência de dias produtivos ("streak"), pedida por Evandro em 2026-10-04.
 * `sequencia_produtiva_membro()` é self-only (resolve o membro via `meu_membro_id`,
 * nunca recebe `p_membro_id`) — por isso todo teste chama a RPC como o próprio membro,
 * nunca como admin em nome de outro.
 *
 * `point_ledger` só pode ser escrito pelas próprias funções do motor (insert/update
 * revogados até de `service_role` em `20260926100000_gamificacao_pontos.sql`, proteção
 * antifraude da #128) — por isso todo crédito aqui vem do pipeline real (regra genérica
 * via `eventos`, ou negócio ganho/reaberto pra exercitar o estorno automático), nunca de
 * insert direto em `point_ledger`.
 *
 * Limitação conhecida, reportada a Evandro: como `point_ledger.created_at` é sempre o
 * instante real do crédito (nenhum caminho legítimo aceita uma data no passado), um teste
 * automatizado não consegue reproduzir "sexta produtiva → fim de semana → segunda produtiva"
 * sem esperar dias de calendário reais. Os testes abaixo cobrem o que É possível provar de
 * ponta a ponta no mesmo dia real (hoje conta, estorno retroativo remove o dia, bônus de
 * conquista não conta, self-only) e a marcação correta de `dia_util` pros 7 dias da semana
 * (bitmask), que juntos validam toda a lógica exceto a travessia de múltiplos dias.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  admin = await criarUsuario("sk-admin");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Streak ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente streak", telefone: "45999993333" }).select("id").single();
  contato = c!.id;
});

async function criarMembro(nomeBase: string) {
  const usuario = await criarUsuario(nomeBase);
  const { data, error } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor", perfil_gamificacao: "closer" })
    .select("id")
    .single();
  if (error) throw error;
  return { usuario, membroId: data!.id as string };
}

type DiaSemana = { data: string; dia_util: boolean; produtivo: boolean };

async function sequencia(usuario: Usuario) {
  const { data, error } = await usuario.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresa });
  if (error) throw error;
  const linha = data![0];
  return { sequencia: linha.sequencia, semana: linha.semana as unknown as DiaSemana[] };
}

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "Hoje" em America/Sao_Paulo, como a RPC calcula (Brasil não observa DST desde 2019). */
function hojeSaoPaulo(): string {
  const comOffset = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return formatarData(new Date(Date.UTC(comOffset.getUTCFullYear(), comOffset.getUTCMonth(), comOffset.getUTCDate())));
}

async function criarRegraGenerica(nome: string, tipo: string, xp: number) {
  const { error } = await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome, evento_tipo: tipo, xp, moedas: 0 });
  if (error) throw error;
}

async function emitirEventoGenerico(tipo: string, atorUserId: string) {
  const { error } = await servico.from("eventos").insert({ empresa_id: empresa, tipo, ator_id: atorUserId, entidade: "teste", entidade_id: randomUUID() });
  if (error) throw error;
}

async function criarEGanharNegocio(titulo: string, responsavelUsuario: Usuario, membroId: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await responsavelUsuario.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id as string;
}

async function reabrirNegocio(negocioId: string, responsavelUsuario: Usuario) {
  const { error } = await responsavelUsuario.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
  if (error) throw error;
}

describe("sequencia_produtiva_membro: crédito real de hoje entra na sequência", () => {
  it("membro novo sem histórico: sem crédito, sequência 0; depois de um crédito real hoje, sequência 1", async () => {
    // Bitmask 127 (todos os dias) garante que 'hoje' é dia útil nesta empresa,
    // independente do dia real em que o CI roda — evita um teste não-determinístico.
    await servico.from("empresas").update({ dias_uteis_gamificacao: 127 }).eq("id", empresa);

    const { usuario } = await criarMembro("sk-credito-hoje");
    expect((await sequencia(usuario)).sequencia).toBe(0);

    await criarRegraGenerica("Crédito real hoje", "sk.credito-hoje", 10);
    await emitirEventoGenerico("sk.credito-hoje", usuario.id);

    expect((await sequencia(usuario)).sequencia).toBe(1); // hoje produtivo; ontem sem histórico (membro novo) encerra a sequência

    await servico.from("empresas").update({ dias_uteis_gamificacao: 31 }).eq("id", empresa); // restaura default
  });
});

describe("sequencia_produtiva_membro: configuração de dias úteis por empresa", () => {
  it("empresa com sábado como dia útil (bitmask inclui bit 6) exige crédito no sábado pra não quebrar", async () => {
    // bit0=segunda..bit6=domingo: segunda a sábado = 0b0111111 = 63.
    await servico.from("empresas").update({ dias_uteis_gamificacao: 63 }).eq("id", empresa);
    const { usuario } = await criarMembro("sk-sabado-util");

    const r = await sequencia(usuario);
    const sabado = r.semana.find((d) => new Date(`${d.data}T12:00:00Z`).getUTCDay() === 6);
    expect(sabado).toBeDefined();
    expect(sabado!.dia_util).toBe(true); // sábado agora é dia útil nesta empresa

    await servico.from("empresas").update({ dias_uteis_gamificacao: 31 }).eq("id", empresa); // restaura default
  });
});

describe("sequencia_produtiva_membro: estorno retroativo remove o dia produtivo", () => {
  it("reabrir o negócio ganho hoje (estorno automático) faz o dia deixar de contar como produtivo", async () => {
    const { usuario, membroId } = await criarMembro("sk-estorno-hoje");
    await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome: "Venda (streak estorno)", evento_tipo: "deal.won", xp: 20, moedas: 0 });
    const negocioId = await criarEGanharNegocio("Venda streak estorno", usuario, membroId);

    const hoje = hojeSaoPaulo();
    const antes = await sequencia(usuario);
    expect(antes.semana.find((d) => d.data === hoje)?.produtivo).toBe(true);

    await reabrirNegocio(negocioId, usuario); // estorno automático (deal.won) do XP desse negócio

    const depois = await sequencia(usuario);
    expect(depois.semana.find((d) => d.data === hoje)?.produtivo).toBe(false); // todo o crédito do dia foi estornado — deixa de contar
  });
});

describe("sequencia_produtiva_membro: bônus de conquista não cria dia produtivo", () => {
  it("desbloquear uma conquista (marco_contagem) credita só o bônus (referencia_tipo = 'conquista'), que não torna o dia produtivo", async () => {
    // Empresa dedicada e isolada: precisa ficar SEM nenhuma gamification_rule pra
    // 'deal.won' pra garantir que ganhar o negócio não gere XP comum — só o bônus da
    // conquista (motor de marco é independente de gamification_rules/point_ledger,
    // confirmado em gamificacao-conquistas-marco.test.ts). Reaproveitar a empresa
    // compartilhada contaminaria esse isolamento com a regra criada no teste de estorno.
    const outroAdmin = await criarUsuario("sk-bonus-admin");
    const { data: outraEmpresa } = await servico.from("empresas").insert({ nome: `Streak bônus conquista ${sufixo}` }).select("id").single();
    const empresaIsolada = outraEmpresa!.id;
    await servico.from("empresa_membros").insert({ empresa_id: empresaIsolada, user_id: outroAdmin.id, papel: "admin" });
    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresaIsolada).single();
    const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem");
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresaIsolada, nome: "Cliente streak bônus", telefone: "45999994444" }).select("id").single();

    const usuario = await criarUsuario("sk-bonus-conquista");
    const { data: vinculo } = await servico
      .from("empresa_membros")
      .insert({ empresa_id: empresaIsolada, user_id: usuario.id, papel: "vendedor", perfil_gamificacao: "closer" })
      .select("id")
      .single();
    const membroId = vinculo!.id as string;

    await outroAdmin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresaIsolada, nome: "1ª venda (bônus streak)", criterio: { metrica: "marco_contagem", marco: "deal.won", valor: 1 }, xp_bonus: 50, ativa_desde: "1970-01-01T00:00:00Z" });

    const { data: negocio, error } = await servico
      .from("negocios")
      .insert({ empresa_id: empresaIsolada, titulo: "Venda bônus conquista", contato_id: c!.id, funil_id: f!.id, etapa_id: etapas![0].id, responsavel_id: membroId })
      .select("id")
      .single();
    if (error) throw error;
    const { error: erroGanho } = await usuario.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", negocio!.id);
    if (erroGanho) throw erroGanho;

    const hoje = hojeSaoPaulo();
    const { data, error: erroRpc } = await usuario.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresaIsolada });
    if (erroRpc) throw erroRpc;
    const semana = data![0].semana as unknown as DiaSemana[];
    expect(semana.find((d) => d.data === hoje)?.produtivo).toBe(false); // só bônus de conquista — não conta
  });
});

describe("sequencia_produtiva_membro: self-only", () => {
  it("quem não é membro da empresa recebe sequência 0 e semana vazia, nunca erro", async () => {
    const semEmpresa = await criarUsuario("sk-sem-empresa");
    const { data, error } = await semEmpresa.cliente.rpc("sequencia_produtiva_membro", { p_empresa_id: empresa });
    expect(error).toBeNull();
    expect(data![0].sequencia).toBe(0);
    expect(data![0].semana).toEqual([]);
  });

  it("a função não aceita p_membro_id — não há forma de consultar a sequência de outro membro", async () => {
    // A assinatura da RPC só tem p_empresa_id — tentar passar p_membro_id é rejeitado pelo
    // PostgREST antes mesmo de chegar na função (parâmetro desconhecido não declarado nela).
    const { usuario } = await criarMembro("sk-self-only");
    const args: Record<string, string> = { p_empresa_id: empresa, p_membro_id: "00000000-0000-0000-0000-000000000000" };
    const { error } = await usuario.cliente.rpc("sequencia_produtiva_membro", args as { p_empresa_id: string });
    expect(error).not.toBeNull();
  });
});
