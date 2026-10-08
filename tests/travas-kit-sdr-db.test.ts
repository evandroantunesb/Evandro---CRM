/**
 * PR A — travas de segurança no banco (migration 20261009100000_travas_kit_e_fechamento_sdr),
 * com Supabase local (roda no CI) e o cliente autenticado de cada papel (RLS real), sem passar
 * pelo app. Duas regras:
 * 1) kit com cálculo solar salvo nunca fica vazio (inclusive acesso de serviço e transações
 *    concorrentes); exclusão do negócio e remoção do cálculo continuam livres;
 * 2) SDR não muda status, motivo de perda nem valor — também pelo fechamento automático por
 *    etapa, sem alteração parcial. Os demais papéis e os fluxos de etapa/aceite seguem iguais.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { criarNegocioComCliente, salvarKitComCliente, type Atual } from "@/lib/negocios-gravacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { comFalha } from "./falhas";

const URL_BANCO = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Trava: teste direto no Postgres só contra banco local, nunca remoto/produção.
function urlBancoLocal() {
  const host = new URL(URL_BANCO).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Teste direto no banco recusado: host "${host}" não é local.`);
  }
  return URL_BANCO;
}

async function conectar() {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  return banco;
}

const MENSAGEM_KIT = "Este kit tem cálculo solar salvo e não pode ficar sem equipamentos.";
const MENSAGEM_SDR = "SDR não pode fechar, reabrir nem alterar o valor do negócio.";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let sdr: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let etapaComum: string;
let etapaGanho: string;
let etapaPerdido: string;
const atual: Record<string, Atual> = {};

const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;

beforeAll(async () => {
  [admin, gestor, vendedor, sdr] = await Promise.all(["tv-admin", "tv-gestor", "tv-vendedor", "tv-sdr"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Travas ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: membros, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id, papel");
  if (error) throw error;
  for (const m of membros!) atual[m.user_id] = { empresaId: empresa, membroId: m.id, papel: m.papel };

  // Gestor da equipe do vendedor e do SDR (vê os negócios deles pela RLS).
  const { data: eq } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe travas" }).select("id").single();
  const { error: erroEquipe } = await servico.from("equipe_membros").insert([
    { equipe_id: eq!.id, empresa_id: empresa, membro_id: atual[gestor.id].membroId, e_gestor: true },
    { equipe_id: eq!.id, empresa_id: empresa, membro_id: atual[vendedor.id].membroId, e_gestor: false },
    { equipe_id: eq!.id, empresa_id: empresa, membro_id: atual[sdr.id].membroId, e_gestor: false },
  ]);
  if (erroEquipe) throw erroEquipe;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  if (!etapas || etapas.length < 4) throw new Error("Funil padrão com menos de 4 etapas.");
  etapaInicial = etapas[0].id;
  etapaComum = etapas[1].id;
  etapaPerdido = etapas[etapas.length - 2].id;
  etapaGanho = etapas[etapas.length - 1].id;
  await servico.from("etapas").update({ fecha_como: "ganho" }).eq("id", etapaGanho);
  await servico.from("etapas").update({ fecha_como: "perdido" }).eq("id", etapaPerdido);
});

function fd(campos: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  return f;
}

const KIT = JSON.stringify([
  { tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 10 },
  { tipo: "inversor", descricao: "Inversor 5 kW", potenciaW: 5000, quantidade: 1 },
]);

async function criarNegocio(u: Usuario, extra: Record<string, string> = {}) {
  const r = await criarNegocioComCliente(
    cliente(u),
    atual[u.id],
    fd({
      funil_id: funil,
      titulo: `Trava ${Math.random().toString(36).slice(2, 7)}`,
      valor: "25.000,00",
      contato_tipo: "pf",
      contato_nome: `Cliente ${Math.random().toString(36).slice(2, 7)}`,
      contato_telefone: "(45) 99999-0000",
      contato_email: "",
      tipo_ligacao: "trifasico",
      componentes: "[]",
      ...extra,
    }),
  );
  if (!r.ok) throw new Error(r.mensagem);
  return r.negocioId;
}

/** Negócio do vendedor com kit de 2 itens e cálculo solar salvo (pelo fluxo do app). */
async function negocioComCalculo(u: Usuario = vendedor) {
  const negocioId = await criarNegocio(u, { componentes: KIT, consumo_medio_kwh: "450", tarifa_kwh: "0,95" });
  const { data: calculo } = await servico.from("calculos_solares").select("id").eq("negocio_id", negocioId).single();
  expect(calculo).not.toBeNull();
  return negocioId;
}

const lerKit = async (negocioId: string) =>
  (await servico.from("kit_componentes").select("id, descricao").eq("negocio_id", negocioId).order("ordem").order("id")).data!;

const temCalculo = async (negocioId: string) =>
  !!(await servico.from("calculos_solares").select("id").eq("negocio_id", negocioId).maybeSingle()).data;

describe("kit com cálculo solar nunca fica vazio", () => {
  it("acesso direto: apagar todos os itens com cálculo é recusado; kit e cálculo intactos", async () => {
    const negocioId = await negocioComCalculo();
    const antes = await lerKit(negocioId);
    const { error } = await vendedor.cliente.from("kit_componentes").delete().eq("negocio_id", negocioId);
    expect(error?.message).toContain(MENSAGEM_KIT);
    expect(error?.hint).toBe("mensagem_usuario");
    expect(await lerKit(negocioId)).toEqual(antes);
    expect(await temCalculo(negocioId)).toBe(true);
  });

  it("acesso direto: apagar um a um até esvaziar é recusado no último", async () => {
    const negocioId = await negocioComCalculo();
    const [primeiro, segundo] = await lerKit(negocioId);
    expect((await vendedor.cliente.from("kit_componentes").delete().eq("id", primeiro.id)).error).toBeNull();
    const { error } = await vendedor.cliente.from("kit_componentes").delete().eq("id", segundo.id);
    expect(error?.message).toContain(MENSAGEM_KIT);
    expect(await lerKit(negocioId)).toEqual([segundo]);
  });

  it("acesso direto: mover os itens para outro negócio é recusado", async () => {
    const negocioId = await negocioComCalculo();
    const outro = await criarNegocio(vendedor);
    const antes = await lerKit(negocioId);
    const { error } = await vendedor.cliente.from("kit_componentes").update({ negocio_id: outro }).eq("negocio_id", negocioId);
    expect(error?.message).toContain(MENSAGEM_KIT);
    expect(await lerKit(negocioId)).toEqual(antes);
    expect(await lerKit(outro)).toEqual([]);
  });

  it("acesso de serviço também é barrado (integridade, não permissão)", async () => {
    const negocioId = await negocioComCalculo();
    const antes = await lerKit(negocioId);
    const { error } = await servico.from("kit_componentes").delete().eq("negocio_id", negocioId);
    expect(error?.message).toContain(MENSAGEM_KIT);
    expect(await lerKit(negocioId)).toEqual(antes);
  });

  it("permitido: apagar parte dos itens, apagar kit sem cálculo e editar quantidade", async () => {
    const comCalculo = await negocioComCalculo();
    const [modulo] = await lerKit(comCalculo);
    expect((await vendedor.cliente.from("kit_componentes").update({ quantidade: 12 }).eq("id", modulo.id)).error).toBeNull();
    expect((await vendedor.cliente.from("kit_componentes").delete().eq("id", modulo.id)).error).toBeNull();
    expect(await lerKit(comCalculo)).toHaveLength(1);

    const semCalculo = await criarNegocio(vendedor, { componentes: KIT });
    expect(await temCalculo(semCalculo)).toBe(false);
    expect((await vendedor.cliente.from("kit_componentes").delete().eq("negocio_id", semCalculo)).error).toBeNull();
    expect(await lerKit(semCalculo)).toEqual([]);
  });

  it("permitido: trocar o kit pelo fluxo do app (novos antes de apagar os antigos)", async () => {
    const negocioId = await negocioComCalculo();
    const novo = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const r = await salvarKitComCliente(
      cliente(vendedor),
      atual[vendedor.id],
      fd({ negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "0,95", componentes: novo }),
    );
    expect(r.ok).toBe(true);
    expect((await lerKit(negocioId)).map((k) => k.descricao)).toEqual(["Módulo 600 W"]);
  });

  it("permitido: remover o cálculo e depois o kit (apagarCalculo), pelo vendedor e pelo serviço", async () => {
    for (const quem of ["vendedor", "servico"] as const) {
      const negocioId = await negocioComCalculo();
      const c = quem === "vendedor" ? vendedor.cliente : servico;
      const { data: apagado, error } = await c.from("calculos_solares").delete().eq("negocio_id", negocioId).select("id");
      expect(error).toBeNull();
      expect(apagado).toHaveLength(1);
      expect((await c.from("kit_componentes").delete().eq("negocio_id", negocioId)).error).toBeNull();
      expect(await lerKit(negocioId)).toEqual([]);
    }
  });

  it("permitido: admin e serviço excluem o negócio inteiro com kit e cálculo (cascata)", async () => {
    for (const c of [admin.cliente, servico]) {
      const negocioId = await negocioComCalculo();
      const { data, error } = await c.from("negocios").delete().eq("id", negocioId).select("id");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(await lerKit(negocioId)).toEqual([]);
      expect(await temCalculo(negocioId)).toBe(false);
    }
  });

  it("restauração após falha no cálculo devolve o kit anterior com a trava ligada", async () => {
    const negocioId = await negocioComCalculo();
    const antes = await lerKit(negocioId);
    const novo = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    // Tarifa acima do limite da coluna: itens trocados, cálculo recusado → restaura (reinserir antes de apagar).
    const r = await salvarKitComCliente(
      cliente(vendedor),
      atual[vendedor.id],
      fd({ negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "100000", componentes: novo }),
    );
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("Nada foi alterado");
    expect(await lerKit(negocioId)).toEqual(antes);
    expect(await temCalculo(negocioId)).toBe(true);
  });

  it("falha parcial com cálculo: exclusão falha → restaura; restauração falha → avisa; reenvio corrige", async () => {
    const negocioId = await negocioComCalculo();
    const antes = await lerKit(negocioId);
    const novo = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const form = () => fd({ negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "0,95", componentes: novo });

    const r1 = await salvarKitComCliente(comFalha(vendedor.cliente, { apagarKit: 1 }), atual[vendedor.id], form());
    expect(r1).toMatchObject({ ok: false, mensagem: "Não foi possível substituir os itens do kit. Nada foi alterado." });
    expect(await lerKit(negocioId)).toEqual(antes);

    const r2 = await salvarKitComCliente(comFalha(vendedor.cliente, { apagarKit: 2 }), atual[vendedor.id], form());
    expect(r2.ok).toBe(false);
    expect(r2.mensagem).toContain("salve de novo");
    expect(await lerKit(negocioId)).toHaveLength(3);

    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], form())).ok).toBe(true);
    expect((await lerKit(negocioId)).map((k) => k.descricao)).toEqual(["Módulo 600 W"]);
    expect(await temCalculo(negocioId)).toBe(true);
  });

  it("concorrência: duas transações apagando itens diferentes não esvaziam o kit", async () => {
    const negocioId = await negocioComCalculo();
    const [a, b] = await lerKit(negocioId);
    const t1 = await conectar();
    const t2 = await conectar();
    const observador = await conectar();
    try {
      await t1.query("begin");
      await t2.query("begin");
      const pidT2 = (await t2.query("select pg_backend_pid() as pid")).rows[0].pid as number;
      // T1 apaga A: a conferência trava o negócio e passa (vê B, ainda presente).
      await t1.query("delete from public.kit_componentes where id = $1", [a.id]);
      // T2 apaga B com T1 ainda aberta: sem a trava, veria A (exclusão de T1 não confirmada) e
      // passaria também, deixando o kit vazio. Com a trava, espera T1 terminar.
      const conferenciaT2 = t2.query("delete from public.kit_componentes where id = $1", [b.id]).then(
        () => null,
        (e: Error) => e,
      );
      let esperando = false;
      for (let i = 0; i < 50 && !esperando; i++) {
        const { rows } = await observador.query("select wait_event_type from pg_stat_activity where pid = $1", [pidT2]);
        esperando = rows[0]?.wait_event_type === "Lock";
        if (!esperando) await new Promise((ok) => setTimeout(ok, 100));
      }
      expect(esperando).toBe(true);
      await t1.query("commit");
      const erro = await conferenciaT2;
      expect(erro?.message).toContain(MENSAGEM_KIT);
      await t2.query("rollback");
    } finally {
      await Promise.all([t1.end(), t2.end(), observador.end()]);
    }
    expect(await lerKit(negocioId)).toEqual([b]);
    expect(await temCalculo(negocioId)).toBe(true);
  });
});

describe("SDR não fecha, não reabre e não muda o valor", () => {
  const ler = async (negocioId: string) =>
    (
      await servico
        .from("negocios")
        .select("titulo, status, etapa_id, etapa_desde, fechado_em, valor, motivo_perda_id, motivo_perda_detalhe, responsavel_id, updated_at")
        .eq("id", negocioId)
        .single()
    ).data!;

  it("gatilho da trava roda depois de negocios_preparar (ordem alfabética dos BEFORE)", async () => {
    const banco = await conectar();
    try {
      const { rows } = await banco.query(
        `select tgname from pg_trigger
          where tgrelid = 'public.negocios'::regclass and not tgisinternal
            and (tgtype & 2) = 2 and (tgtype & 16) = 16
          order by tgname`,
      );
      const nomes = rows.map((r: { tgname: string }) => r.tgname);
      expect(nomes).toContain("negocios_preparar");
      expect(nomes.indexOf("negocios_preparar")).toBeLessThan(nomes.indexOf("negocios_travar_fechamento_sdr"));
    } finally {
      await banco.end();
    }
  });

  it("acesso direto: status, motivo de perda e valor são recusados sem alteração parcial", async () => {
    const negocioId = await criarNegocio(sdr);
    const { data: motivo } = await servico.from("motivos_perda").insert({ empresa_id: empresa, nome: `Motivo ${sufixo}` }).select("id").single();
    const antes = await ler(negocioId);
    const tentativas = [
      { titulo: "Junto com o ganho", status: "ganho" as const },
      { titulo: "Junto com a perda", status: "perdido" as const, motivo_perda_id: motivo!.id },
      { titulo: "Só o motivo", motivo_perda_detalhe: "Detalhe" },
      { titulo: "Junto com o valor", valor: 99999 },
    ];
    for (const t of tentativas) {
      const { data, error } = await sdr.cliente.from("negocios").update(t).eq("id", negocioId).select("id");
      expect(error?.message).toContain(MENSAGEM_SDR);
      expect(error?.hint).toBe("mensagem_usuario");
      expect(data).toBeNull();
    }
    expect(await ler(negocioId)).toEqual(antes);
  });

  it("reabrir negócio fechado também é recusado ao SDR", async () => {
    const negocioId = await criarNegocio(sdr);
    expect((await servico.from("negocios").update({ status: "ganho" }).eq("id", negocioId)).error).toBeNull();
    const antes = await ler(negocioId);
    const { error } = await sdr.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    expect(error?.message).toContain(MENSAGEM_SDR);
    expect(await ler(negocioId)).toEqual(antes);
  });

  it("etapa que fecha sozinha (ganho e perdido): recusada; etapa, datas e motivo padrão intactos", async () => {
    const negocioId = await criarNegocio(sdr);
    const antes = await ler(negocioId);
    const motivoPadrao = () =>
      servico.from("motivos_perda").select("id", { count: "exact", head: true }).eq("empresa_id", empresa).eq("nome", "Perdido automaticamente pela etapa");
    const motivosAntes = (await motivoPadrao()).count;
    for (const etapa of [etapaGanho, etapaPerdido]) {
      const { error } = await sdr.cliente.from("negocios").update({ etapa_id: etapa }).eq("id", negocioId);
      expect(error?.message).toContain(MENSAGEM_SDR);
    }
    expect(await ler(negocioId)).toEqual(antes);
    expect((await motivoPadrao()).count).toBe(motivosAntes);
  });

  it("permitido ao SDR: mover para etapa comum, editar dados e qualificação, criar com valor", async () => {
    const negocioId = await criarNegocio(sdr);
    expect((await ler(negocioId)).valor).toBe(25000);
    const { data, error } = await sdr.cliente
      .from("negocios")
      .update({ etapa_id: etapaComum, titulo: "Editado pelo SDR", valor: 25000 })
      .eq("id", negocioId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await ler(negocioId)).toMatchObject({ etapa_id: etapaComum, titulo: "Editado pelo SDR", status: "aberto", valor: 25000 });
  });

  it("vendedor, gestor e admin: fechamento por etapa (Kanban), ganho, perda, reabrir e valor seguem livres", async () => {
    const { data: motivo } = await servico.from("motivos_perda").insert({ empresa_id: empresa, nome: `Outro ${sufixo}` }).select("id").single();
    for (const u of [vendedor, gestor, admin]) {
      const negocioId = await criarNegocio(vendedor);
      const c = u.cliente;
      expect((await c.from("negocios").update({ valor: 30000 }).eq("id", negocioId)).error).toBeNull();
      expect((await c.from("negocios").update({ etapa_id: etapaGanho }).eq("id", negocioId)).error).toBeNull();
      expect(await ler(negocioId)).toMatchObject({ status: "ganho", valor: 30000 });
      expect((await c.from("negocios").update({ status: "aberto", etapa_id: etapaInicial }).eq("id", negocioId)).error).toBeNull();
      expect(
        (await c.from("negocios").update({ status: "perdido", motivo_perda_id: motivo!.id, motivo_perda_detalhe: "Teste" }).eq("id", negocioId)).error,
      ).toBeNull();
      expect(await ler(negocioId)).toMatchObject({ status: "perdido", motivo_perda_id: motivo!.id });
    }
  });

  it("corrigir valor de negócio ganho pela função própria (admin) continua funcionando", async () => {
    const negocioId = await criarNegocio(vendedor);
    expect((await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioId)).error).toBeNull();
    const { error } = await admin.cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: 18000, p_motivo: "Ajuste de teste" });
    expect(error).toBeNull();
    expect((await ler(negocioId)).valor).toBe(18000);
  });

  it("envio para vendas e aceite: o responsável passa ao vendedor e o vendedor fecha", async () => {
    const negocioId = await criarNegocio(sdr);
    const { data: n } = await servico.from("negocios").select("contato_id").eq("id", negocioId).single();
    const { data: handoff, error } = await sdr.cliente
      .from("handoffs")
      .insert({
        empresa_id: empresa,
        negocio_id: negocioId,
        contato_id: n!.contato_id,
        de_membro_id: atual[sdr.id].membroId,
        para_membro_id: atual[vendedor.id].membroId,
        status_qualificacao: "qualificado",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: erroAceite } = await vendedor.cliente.rpc("aceitar_handoff", { p_handoff_id: handoff!.id });
    expect(erroAceite).toBeNull();
    expect((await ler(negocioId)).responsavel_id).toBe(atual[vendedor.id].membroId);
    expect((await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioId)).error).toBeNull();
    expect((await ler(negocioId)).status).toBe("ganho");
  });

  it("acesso de serviço (sem usuário logado) não é afetado", async () => {
    const negocioId = await criarNegocio(sdr);
    expect((await servico.from("negocios").update({ status: "ganho", valor: 1234 }).eq("id", negocioId)).error).toBeNull();
    expect(await ler(negocioId)).toMatchObject({ status: "ganho", valor: 1234 });
  });
});
