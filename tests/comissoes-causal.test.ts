/**
 * Comissões: cálculo causal + versionamento de planos + abertura/fechamento (Evandro,
 * 2026-10-02, depois da auditoria read-only de Comissões). Ver
 * `20261002210000_comissoes_causal_versionamento.sql` e `src/lib/comissoes.ts`:
 * - Resultado apurado vem do fechamento causal ATIVO do negócio (mesma fonte de Metas, função
 *   própria `calcular_receita_causal_comissao`), nunca de `negocios` ao vivo.
 * - O plano usado é o VIGENTE no mês calculado (`vigencia_inicio` mais recente <= referência),
 *   não o plano atual — alterar o plano nunca muda retroativamente um mês já calculado com a
 *   versão anterior.
 * - Mês anterior à primeira versão de plano aplicável retorna erro claro, nunca cai pro plano
 *   atual.
 * - `aberta` pode recalcular livremente; `fechada` é snapshot imutável — bloqueado tanto na
 *   lib (mensagem amigável) quanto no banco (trigger, defesa em profundidade).
 *
 * Cada teste usa um `empresa_membros.id` novo (via `novoMembro()`), como no padrão de Metas.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { calcularComissaoMes, type FaixaComissao } from "@/lib/comissoes";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let empresa: string;
let adminMembroId: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  admin = await criarUsuario("cct-admin");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Comissões causal ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: membroAdmin } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" })
    .select("id")
    .single();
  adminMembroId = membroAdmin!.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente comissões causal" }).select("id").single();
  contato = c!.id;
});

let contadorMembro = 0;

async function novoMembro() {
  contadorMembro += 1;
  const usuario = await criarUsuario(`cct-membro-${contadorMembro}`);
  const { data, error } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor" }).select("id").single();
  if (error) throw error;
  return data!.id as string;
}

/** "AAAA-MM-01" do mês atual deslocado por `offset` meses (negativo = passado). */
function inicioMes(offset = 0) {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const FAIXA_UNICA: FaixaComissao[] = [{ resultado_minimo: 0, resultado_maximo: null, valor: 10 }];

async function criarVersaoPlano(membroId: string, vigenciaInicio: string, faixas: FaixaComissao[] = FAIXA_UNICA) {
  const { data, error } = await servico
    .from("planos_comissao")
    .insert({ empresa_id: empresa, membro_id: membroId, vigencia_inicio: vigenciaInicio, tipo_calculo: "percentual", faixas, criado_por: null })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function criarNegocio(responsavelId: string, valor: number) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio comissões ${sufixo}-${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId, valor })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function marcarStatus(negocioId: string, status: "ganho" | "perdido" | "aberto") {
  if (status === "perdido") {
    const { data: motivo } = await servico
      .from("motivos_perda")
      .upsert({ empresa_id: empresa, nome: "Motivo teste comissões" }, { onConflict: "empresa_id,nome" })
      .select("id")
      .single();
    const { error } = await servico.from("negocios").update({ status, motivo_perda_id: motivo!.id }).eq("id", negocioId);
    if (error) throw error;
    return;
  }
  const { error } = await servico.from("negocios").update({ status }).eq("id", negocioId);
  if (error) throw error;
}

describe("cálculo causal", () => {
  it("credita o responsável congelado no deal.won — troca de responsável ao vivo depois não move a comissão", async () => {
    const membroA = await novoMembro();
    const membroB = await novoMembro();
    await criarVersaoPlano(membroA, inicioMes());
    await criarVersaoPlano(membroB, inicioMes());
    const negocioId = await criarNegocio(membroA, 10000);
    await marcarStatus(negocioId, "ganho");

    const resultadoA = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membroA, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(resultadoA).toMatchObject({ ok: true, resultadoApurado: 10000, valorComissao: 1000 });

    await servico.from("negocios").update({ responsavel_id: membroB }).eq("id", negocioId);

    const resultadoB = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membroB, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(resultadoB).toMatchObject({ ok: true, resultadoApurado: 0 });
  });

  it("correção de valor no mesmo ciclo soma o delta ao resultado apurado", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes());
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");

    const { error } = await admin.cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: 15000, p_motivo: "Ajuste de teste" });
    expect(error).toBeNull();

    const resultado = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(resultado).toMatchObject({ ok: true, resultadoApurado: 15000 });
  });

  it("ganho→reaberto invalida o ciclo antigo; o novo ganho é o único considerado", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes());
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");
    await marcarStatus(negocioId, "aberto");
    await servico.from("negocios").update({ valor: 20000 }).eq("id", negocioId);
    await marcarStatus(negocioId, "ganho");

    const resultado = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(resultado).toMatchObject({ ok: true, resultadoApurado: 20000 });
  });
});

describe("plano vigente no mês, não o plano atual", () => {
  it("alterar o plano depois não muda retroativamente o mês já calculado com a versão anterior", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes(), [{ resultado_minimo: 0, resultado_maximo: null, valor: 10 }]);
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");

    const primeiro = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(primeiro).toMatchObject({ ok: true, valorComissao: 1000 });

    // Nova versão, vigente só a partir do mês seguinte — não pode retroagir ao mês atual.
    await criarVersaoPlano(membro, inicioMes(1), [{ resultado_minimo: 0, resultado_maximo: null, valor: 50 }]);

    const recalculo = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(recalculo).toMatchObject({ ok: true, valorComissao: 1000 });
  });

  it("mês anterior a qualquer versão de plano retorna erro claro, nunca usa o plano atual", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes());

    const resultado = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(-1), calculadoPor: adminMembroId });
    expect(resultado).toEqual({ ok: false, mensagem: "Sem plano vigente para este período." });
  });
});

describe("recálculo aberto e bloqueio de comissão fechada", () => {
  it("comissão aberta pode ser recalculada livremente", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes());
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");

    await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });

    await admin.cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: 20000, p_motivo: "Ajuste de teste" });
    const recalculo = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(recalculo).toMatchObject({ ok: true, resultadoApurado: 20000 });
  });

  it("fechar bloqueia recálculo comum (lib) e qualquer UPDATE direto (trigger)", async () => {
    const membro = await novoMembro();
    await criarVersaoPlano(membro, inicioMes());
    const negocioId = await criarNegocio(membro, 10000);
    await marcarStatus(negocioId, "ganho");

    await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    const { data: comissao } = await servico
      .from("comissoes_calculadas")
      .select("id")
      .eq("empresa_id", empresa)
      .eq("membro_id", membro)
      .eq("referencia", inicioMes())
      .single();

    const { error: erroFechar } = await admin.cliente.rpc("fechar_comissao", { p_comissao_id: comissao!.id });
    expect(erroFechar).toBeNull();

    const recalculo = await calcularComissaoMes(admin.cliente, { empresaId: empresa, membroId: membro, referencia: inicioMes(), calculadoPor: adminMembroId });
    expect(recalculo).toEqual({ ok: false, mensagem: "Esta comissão já está fechada e não pode ser recalculada." });

    const { error: erroUpdate } = await servico.from("comissoes_calculadas").update({ valor_total: 999999 }).eq("id", comissao!.id);
    expect(erroUpdate).not.toBeNull();
  });
});
