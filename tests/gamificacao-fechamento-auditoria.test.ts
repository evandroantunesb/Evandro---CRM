/**
 * Fechamento funcional da Gamificação (Evandro, 2026-10-02), escopo fechado em 6 pontos
 * depois da auditoria integrada read-only + microauditoria de Conquistas — ver
 * `20261002230000_gamificacao_fechamento_auditoria.sql`:
 * 1. `estornar_lancamentos_evento` só é chamável internamente (revoke de public/anon/
 *    authenticated); caminho interno (reabertura de negócio) continua funcionando.
 * 2. `contar_marco_membro` para de aceitar leitura cross-tenant; acesso legítimo continua.
 * 3. Extrato (UI, sem mudança de schema) aplica o mesmo clamp de saldo negativo da Loja —
 *    sem RPC/ledger envolvido, não tem teste de banco aqui.
 * 4. `responsavelCongeladoPorNegocio` (função pura, `src/lib/gamificacao.ts`) é quem
 *    decide a atribuição em "Ganhos recentes" — testada isolada.
 * 5. `ranking_gamificacao` exclui admin/gestor por `papel`, mesmo com `perfil_gamificacao`
 *    preenchido.
 * 6. Grants: migration já revoga insert/update/delete de `service_role` nas 4 tabelas —
 *    confere que escrita via RLS normal (admin autenticado) continua funcionando.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { responsavelCongeladoPorNegocio } from "@/lib/gamificacao";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

describe("responsavelCongeladoPorNegocio: função pura (ganhos recentes)", () => {
  it("negócio ganho uma vez só: usa o responsável congelado no deal.won, mesmo que o responsável atual tenha trocado depois", () => {
    const negocioId = randomUUID();
    const membroOriginal = randomUUID();
    const eventos = [{ entidade_id: negocioId, payload: { responsavel_id: membroOriginal, valor: 1000 }, created_at: "2026-10-01T10:00:00Z" }];
    const mapa = responsavelCongeladoPorNegocio(eventos);
    // negocios.responsavel_id pode ter trocado depois (deal.owner_changed não gera novo
    // deal.won) — a função nunca vê isso, só o que foi congelado no evento.
    expect(mapa.get(negocioId)).toBe(membroOriginal);
  });

  it("negócio reaberto e reganho por outro responsável: usa o deal.won mais recente, não o original", () => {
    const negocioId = randomUUID();
    const membroOriginal = randomUUID();
    const membroNovo = randomUUID();
    // Eventos chegam ordenados por created_at desc (como a query real faz).
    const eventos = [
      { entidade_id: negocioId, payload: { responsavel_id: membroNovo, valor: 1200 }, created_at: "2026-10-02T15:00:00Z" },
      { entidade_id: negocioId, payload: { responsavel_id: membroOriginal, valor: 1000 }, created_at: "2026-10-01T10:00:00Z" },
    ];
    const mapa = responsavelCongeladoPorNegocio(eventos);
    expect(mapa.get(negocioId)).toBe(membroNovo);
  });

  it("evento sem entidade_id é ignorado, sem quebrar o mapeamento dos demais", () => {
    const negocioId = randomUUID();
    const membro = randomUUID();
    const eventos = [
      { entidade_id: null, payload: { responsavel_id: randomUUID() }, created_at: "2026-10-02T15:00:00Z" },
      { entidade_id: negocioId, payload: { responsavel_id: membro }, created_at: "2026-10-01T10:00:00Z" },
    ];
    const mapa = responsavelCongeladoPorNegocio(eventos);
    expect(mapa.size).toBe(1);
    expect(mapa.get(negocioId)).toBe(membro);
  });

  it("payload sem responsavel_id mapeia para null, nunca lança", () => {
    const negocioId = randomUUID();
    const mapa = responsavelCongeladoPorNegocio([{ entidade_id: negocioId, payload: {}, created_at: "2026-10-01T10:00:00Z" }]);
    expect(mapa.get(negocioId)).toBeNull();
  });
});

describe("estornar_lancamentos_evento: só caminho interno, nunca RPC pública", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let empresa: string;
  let membroVendedor: string;
  let funil: string;
  let etapaInicial: string;
  let contato: string;

  beforeAll(async () => {
    [admin, vendedor] = await Promise.all(["efa-admin", "efa-vendedor"].map(criarUsuario));
    const { data: emp } = await servico.from("empresas").insert({ nome: `Fechamento auditoria ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    const { data: vinculos } = await servico
      .from("empresa_membros")
      .insert([
        { empresa_id: empresa, user_id: admin.id, papel: "admin" },
        { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
      ])
      .select("id, user_id");
    membroVendedor = vinculos!.find((v) => v.user_id === vendedor.id)!.id;

    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    funil = f!.id;
    const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
    etapaInicial = etapas![0].id;
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente fechamento" }).select("id").single();
    contato = c!.id;
  });

  it("usuário autenticado não consegue chamar a RPC diretamente (revoke de authenticated)", async () => {
    const { error } = await vendedor.cliente.rpc("estornar_lancamentos_evento", {
      p_entidade_id: randomUUID(),
      p_eventos_tipo: ["deal.won"],
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain("permission denied");
  });

  it("admin também não consegue chamar a RPC diretamente — revoke vale pra qualquer authenticated, não é controle de papel", async () => {
    const { error } = await admin.cliente.rpc("estornar_lancamentos_evento", {
      p_entidade_id: randomUUID(),
      p_eventos_tipo: ["deal.won"],
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain("permission denied");
  });

  it("caminho interno continua funcionando: reabrir um negócio ganho estorna o crédito de deal.won normalmente", async () => {
    const { error: erroRegra } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "efa-deal-won", evento_tipo: "deal.won", xp: 100, moedas: 0, ativa: true });
    if (erroRegra) throw erroRegra;

    const { data: negocio } = await servico
      .from("negocios")
      .insert({
        empresa_id: empresa,
        titulo: `Negócio efa ${sufixo}`,
        contato_id: contato,
        funil_id: funil,
        etapa_id: etapaInicial,
        responsavel_id: membroVendedor,
        valor: 1000,
      })
      .select("id")
      .single();
    const negocioId = negocio!.id as string;

    await servico.from("negocios").update({ status: "ganho" }).eq("id", negocioId);
    const saldoAposGanho = await somaXpAtivo(membroVendedor);
    expect(saldoAposGanho).toBe(100);

    await servico.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    const saldoAposReabertura = await somaXpAtivo(membroVendedor);
    expect(saldoAposReabertura).toBe(0);
  });

  async function somaXpAtivo(membroId: string) {
    const { data } = await servico.from("point_ledger").select("xp").eq("membro_id", membroId).eq("estornado", false);
    return (data ?? []).reduce((soma, l) => soma + l.xp, 0);
  }
});

// Ponto 2 (contar_marco_membro: eliminar leitura cross-tenant) NÃO foi aplicado nesta PR —
// conflito estrutural com tests/gamificacao-conquistas-marco.test.ts (chama a função
// diretamente via RPC autenticada pra testar a contagem isolada) e com o próprio desenho
// do crédito interno (beneficiário pode ser estruturalmente diferente de quem agiu — ver
// comentário na migration e relato ao Evandro). Sem teste aqui porque nenhum código foi
// alterado.

describe("ranking_gamificacao: admin/gestor ficam fora da competição por construção", () => {
  let colab: Usuario;
  let gestorComPerfil: Usuario;
  let empresa: string;
  const membro: Record<string, string> = {};

  beforeAll(async () => {
    [colab, gestorComPerfil] = await Promise.all(["rg-colab", "rg-gestor"].map(criarUsuario));
    const { data: emp } = await servico.from("empresas").insert({ nome: `Ranking exclusão admin/gestor ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    const { data: vinculos } = await servico
      .from("empresa_membros")
      .insert([
        { empresa_id: empresa, user_id: colab.id, papel: "sdr", perfil_gamificacao: "sdr" },
        // Gestor com perfil_gamificacao preenchido indevidamente (nada impede isso hoje) —
        // tem que ficar fora do ranking mesmo assim, por papel, não por ausência de perfil.
        { empresa_id: empresa, user_id: gestorComPerfil.id, papel: "gestor", perfil_gamificacao: "sdr" },
      ])
      .select("id, user_id");
    for (const v of vinculos!) membro[v.user_id] = v.id;

    await admin_criarRegraEEmitir(empresa, "rg.evento", 100, colab.id);
    await admin_criarRegraEEmitir(empresa, "rg.evento", 100, gestorComPerfil.id);
  });

  async function admin_criarRegraEEmitir(empresaId: string, tipo: string, xp: number, atorId: string) {
    const { data: existente } = await servico.from("gamification_rules").select("id").eq("empresa_id", empresaId).eq("evento_tipo", tipo).maybeSingle();
    if (!existente) {
      const umAdmin = await criarUsuario(`rg-admin-regra-${sufixo}`);
      await servico.from("empresa_membros").insert({ empresa_id: empresaId, user_id: umAdmin.id, papel: "admin" });
      const { error } = await umAdmin.cliente.from("gamification_rules").insert({ empresa_id: empresaId, nome: tipo, evento_tipo: tipo, xp, moedas: 0, ativa: true });
      if (error) throw error;
    }
    const { error } = await servico.from("eventos").insert({ empresa_id: empresaId, tipo, ator_id: atorId, entidade: "negocio", entidade_id: randomUUID() });
    if (error) throw error;
  }

  it("colaborador comum (sdr) aparece no ranking normalmente", async () => {
    const { data, error } = await colab.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    expect(error).toBeNull();
    expect(data!.some((r) => r.membro_id === membro[colab.id])).toBe(true);
  });

  it("gestor com perfil_gamificacao preenchido NÃO aparece no ranking, mesmo tendo XP lançado no mesmo perfil", async () => {
    const { data, error } = await colab.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "sdr" });
    expect(error).toBeNull();
    expect(data!.some((r) => r.membro_id === membro[gestorComPerfil.id])).toBe(false);
  });

  it("o XP do gestor continua lançado normalmente no extrato — só sai do ranking, histórico/saldo intactos", async () => {
    const { data } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[gestorComPerfil.id]).eq("estornado", false);
    const total = (data ?? []).reduce((s, l) => s + l.xp, 0);
    expect(total).toBe(100);
  });
});

// Ponto 6 (grants de defesa em profundidade em metas/planos_comissao/comissoes_calculadas/
// recompensas) NÃO foi aplicado nesta PR — conflito estrutural com a suíte de testes
// existente (ver comentário na migration e relato ao Evandro). Sem teste aqui porque
// nenhum código foi alterado.
