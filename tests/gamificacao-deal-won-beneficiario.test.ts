/**
 * Correção do beneficiário de `deal.won` (Evandro, 2026-10-02, PR 1 antes da correção causal
 * de valor pós-ganho): a auditoria read-only encontrou que `beneficiario_id` ficava `null` em
 * `deal.won`, e o motor (`coalesce(new.beneficiario_id, new.ator_id)`) acabava creditando XP/
 * moedas pra quem clicou em "ganho" (`ator_id`) — não pro responsável comercial do negócio.
 * Isso diverge do próprio `profile_at_event`, que já era (corretamente) o perfil do responsável.
 *
 * A partir de `20261002160000_gamificacao_deal_won_beneficiario.sql`, `deal.won` passa a
 * gravar `beneficiario_id` = responsável comercial do negócio no momento do ganho — mesmo
 * quando quem executa a ação é outra pessoa (gestor/admin fechando pelo closer).
 * `deal.lost`/`deal.reopened` continuam sem beneficiario_id (fora do escopo deste pedido).
 * Sem backfill: eventos antigos não são tocados.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let closer: Usuario;
let gestor: Usuario;
let admin: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [closer, gestor, admin] = await Promise.all(["bw-closer", "bw-gestor", "bw-admin"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Beneficiário deal.won ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe beneficiário" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer.id], e_gestor: false },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente beneficiário" }).select("id").single();
  contato = c!.id;
});

async function criarNegocio(titulo: string, responsavelId: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function criarRegraDealWon(valor = 10) {
  const { data, error } = await admin.cliente
    .from("gamification_rules")
    .insert({ empresa_id: empresa, nome: `deal.won ${sufixo}-${Math.random()}`, evento_tipo: "deal.won", xp: valor, moedas: valor })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

describe("deal.won: beneficiario_id passa a ser o responsável comercial, não quem clicou", () => {
  it("closer fecha o próprio negócio: ator = beneficiário = closer", async () => {
    const regraId = await criarRegraDealWon();
    const negocioId = await criarNegocio("Negócio closer fecha o próprio", membro[closer.id]);

    const { error } = await closer.cliente.from("negocios").update({ status: "ganho", valor: 50000 }).eq("id", negocioId);
    expect(error).toBeNull();

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.won")
      .single();
    expect(evento!.ator_id).toBe(closer.id);
    expect(evento!.beneficiario_id).toBe(closer.id);
    expect(evento!.profile_at_event).toBe("closer");

    const { data: ledger } = await servico
      .from("point_ledger")
      .select("membro_id, xp, estornado")
      .eq("regra_id", regraId)
      .eq("referencia_id", negocioId)
      .single();
    expect(ledger!.membro_id).toBe(membro[closer.id]);
    expect(ledger!.estornado).toBe(false);
  });

  it("gestor fecha o negócio do closer: ator = gestor, beneficiário = closer (não o gestor)", async () => {
    const regraId = await criarRegraDealWon();
    const negocioId = await criarNegocio("Negócio gestor fecha pelo closer", membro[closer.id]);

    const { error } = await gestor.cliente.from("negocios").update({ status: "ganho", valor: 60000 }).eq("id", negocioId);
    expect(error).toBeNull();

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.won")
      .single();
    expect(evento!.ator_id).toBe(gestor.id);
    expect(evento!.beneficiario_id).toBe(closer.id);
    expect(evento!.profile_at_event).toBe("closer");

    // XP/moedas vão pro closer (beneficiário), nunca pro gestor que executou a ação.
    const { data: ledger } = await servico
      .from("point_ledger")
      .select("membro_id, xp, moedas, estornado")
      .eq("regra_id", regraId)
      .eq("referencia_id", negocioId)
      .single();
    expect(ledger!.membro_id).toBe(membro[closer.id]);
    expect(ledger!.xp).toBeGreaterThan(0);
    expect(ledger!.moedas).toBeGreaterThan(0);

    const { data: ledgerGestor } = await servico
      .from("point_ledger")
      .select("id")
      .eq("regra_id", regraId)
      .eq("referencia_id", negocioId)
      .eq("membro_id", membro[gestor.id]);
    expect(ledgerGestor).toHaveLength(0);
  });

  it("admin fecha o negócio do closer: ator = admin, beneficiário = closer (não o admin)", async () => {
    const regraId = await criarRegraDealWon();
    const negocioId = await criarNegocio("Negócio admin fecha pelo closer", membro[closer.id]);

    const { error } = await admin.cliente.from("negocios").update({ status: "ganho", valor: 70000 }).eq("id", negocioId);
    expect(error).toBeNull();

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.won")
      .single();
    expect(evento!.ator_id).toBe(admin.id);
    expect(evento!.beneficiario_id).toBe(closer.id);
    expect(evento!.profile_at_event).toBe("closer");

    const { data: ledger } = await servico
      .from("point_ledger")
      .select("membro_id, estornado")
      .eq("regra_id", regraId)
      .eq("referencia_id", negocioId)
      .single();
    expect(ledger!.membro_id).toBe(membro[closer.id]);
  });

  it("deal.lost e deal.reopened continuam sem beneficiario_id (fora do escopo desta correção)", async () => {
    const negocioId = await criarNegocio("Negócio deal.lost/deal.reopened sem beneficiário", membro[closer.id]);

    await closer.cliente.from("negocios").update({ status: "ganho", valor: 10000 }).eq("id", negocioId);
    await closer.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    const { data: motivos } = await servico.from("motivos_perda").select("id").eq("empresa_id", empresa).limit(1);
    await closer.cliente
      .from("negocios")
      .update({ status: "perdido", motivo_perda_id: motivos![0].id })
      .eq("id", negocioId);

    const { data: eventoReaberto } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.reopened")
      .single();
    expect(eventoReaberto!.beneficiario_id).toBeNull();

    const { data: eventoPerdido } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.lost")
      .single();
    expect(eventoPerdido!.beneficiario_id).toBeNull();
  });
});
