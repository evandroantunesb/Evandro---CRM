/**
 * Gravação do negócio com Supabase local (roda no CI), pelo mesmo núcleo das ações
 * (`@/lib/negocios-gravacao`) e com o cliente autenticado de cada papel (RLS real).
 * Ciclo completo: criar → salvar → reabrir (mesma leitura da ficha) → editar → salvar → reabrir.
 * Cobre contato novo e existente, kit com e sem tarifa (com restauração e reenvio seguro),
 * anexos (validação, conferência do Storage e RLS), falhas parciais (nunca como sucesso) e a etapa fora do formulário de
 * edição (SDR não fecha negócio por ali). O caminho pelas ações fica em negocios-acoes-db.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  criarNegocioComCliente,
  editarContatoComCliente,
  editarNegocioComCliente,
  atualizarPrecoCalculoComCliente,
  salvarKitComCliente,
  type Atual,
} from "@/lib/negocios-gravacao";
import { conferirArquivos } from "@/lib/anexos-servidor";
import { linhasParaComponentes } from "@/components/kit-componentes";
import { mensagemEstimativaIncompleta, pendenciasDaEntrada } from "@/lib/calculo-reproduzivel";
import { MENSAGEM_PRECO_CALCULO_INCOMPLETO, MENSAGEM_PRECO_CALCULO_LEGADO } from "@/lib/calculo-vigencia";
import { MENSAGEM_NUMERO_BR } from "@/lib/formatacao";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";
import { MENSAGEM_CALCULO_NAO_CONFERIDO, MENSAGEM_REMOCAO_COM_CALCULO, MENSAGEM_REMOCAO_SEM_CONFIRMACAO } from "@/lib/negocio-dados";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { comFalha } from "./falhas";

let admin: Usuario;
let vendedor: Usuario;
let sdr: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let etapaGanho: string;
const atual: Record<string, Atual> = {};

const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;

beforeAll(async () => {
  [admin, vendedor, sdr] = await Promise.all(["ng-admin", "ng-vendedor", "ng-sdr"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Gravação ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: membros, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id, papel");
  if (error) throw error;
  for (const m of membros!) atual[m.user_id] = { empresaId: empresa, membroId: m.id, papel: m.papel };
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  etapaGanho = etapas![etapas!.length - 1].id;
  await servico.from("etapas").update({ fecha_como: "ganho" }).eq("id", etapaGanho);
});

/** FormData como o formulário manda (strings; arquivos à parte). */
function fd(campos: Record<string, string | undefined>, arquivos: Record<string, File[]> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  for (const [k, lista] of Object.entries(arquivos)) for (const a of lista) f.append(k, a);
  return f;
}

const arquivo = (nome: string, bytes = 16, tipo = "image/png") => new File([new Uint8Array(bytes)], nome, { type: tipo });

const KIT = JSON.stringify([
  { tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 10 },
  { tipo: "inversor", descricao: "Inversor 5 kW", potenciaW: 5000, quantidade: 1 },
]);

const novoNegocio = (extra: Record<string, string | undefined> = {}) =>
  fd({
    funil_id: funil,
    titulo: `Negócio ${Math.random().toString(36).slice(2, 7)}`,
    valor: "25.000,00",
    contato_tipo: "pf",
    contato_nome: `Cliente ${Math.random().toString(36).slice(2, 7)}`,
    contato_telefone: "(45) 99999-0000",
    contato_email: "",
    tipo_ligacao: "trifasico",
    componentes: "[]",
    ...extra,
  });

async function criar(u: Usuario, dados: FormData) {
  const r = await criarNegocioComCliente(cliente(u), atual[u.id], dados);
  if (!r.ok) throw new Error(r.mensagem);
  return r;
}

/** Reabre como a ficha: mesmas tabelas, com o cliente (RLS) de quem está olhando. */
async function reabrir(u: Usuario, negocioId: string) {
  const c = u.cliente;
  const [{ data: negocio }, { data: calculo }, { data: kit }, { data: anexos }] = await Promise.all([
    c
      .from("negocios")
      .select(
        "titulo, valor, descricao, status, etapa_id, unidade_consumidora, padrao_cliente, tipo_telhado, estrutura_telhado, consumo_medio_kwh, consumo_estimado_kwh, tarifa_efetiva_kwh, valor_conta_energia, contatos(id, nome, endereco, cidade, uf, documento)",
      )
      .eq("id", negocioId)
      .single(),
    c.from("calculos_solares").select("tarifa_kwh, valor_fatura_medio, tipo_ligacao, kit_potencia_kwp").eq("negocio_id", negocioId).maybeSingle(),
    c.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", negocioId).order("ordem"),
    c.from("anexos").select("nome, categoria").eq("negocio_id", negocioId).order("nome"),
  ]);
  const contato = negocio!.contatos as unknown as { id: string; nome: string; endereco: string | null; cidade: string | null; uf: string | null; documento: string | null };
  return { negocio: negocio!, contato, calculo, kit: kit ?? [], anexos: anexos ?? [] };
}

const SO_MODULO = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 12 }]);

const SUFIXO_INCOMPLETO = " O cálculo anterior foi mantido, mas não vale como resultado atual.";

/**
 * Resultado técnico INCOMPLETO gravado (migration 20261023200000): entradas e geração presentes, parte financeira e
 * payback nulos, pendências gravadas. Nulo = nenhuma linha.
 */
async function linhaGravada(negocioId: string) {
  const { data, error } = await servico
    .from("calculos_solares")
    .select(
      "estado_financeiro, consumo_medio_kwh, valor_fatura_medio, tarifa_kwh, geracao_estimada_kwh_mes, kwh_faturado, kwh_compensado, custo_fio_b, conta_sem_solar, conta_com_solar, economia_mensal, payback_meses, metodo_calculo, pendencias",
    )
    .eq("negocio_id", negocioId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
const SEM_FINANCEIRO = {
  estado_financeiro: "incompleto",
  kwh_faturado: null,
  kwh_compensado: null,
  custo_fio_b: null,
  conta_sem_solar: null,
  conta_com_solar: null,
  economia_mensal: null,
  payback_meses: null,
  metodo_calculo: null,
};

async function contarCalculos(negocioId: string): Promise<number> {
  const { count, error } = await servico.from("calculos_solares").select("id", { count: "exact", head: true }).eq("negocio_id", negocioId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Linha LEGADA (fórmula antiga, não validada) inserida direto como fixture: o motor atual não gera mais linhas.
 * Valores já derivados à mão (5,5 kWp = 10 x 550 W, 120 kWh/kWp/mês): geração 660; consumo 700, tarifa 0,95 =>
 * conta sem solar 665; os demais resultados são só fixture (nenhum teste os recalcula).
 */
async function inserirLinhaLegada(negocioId: string, extra: Record<string, number | string | null> = {}) {
  const { error } = await servico.from("calculos_solares").insert({
    empresa_id: empresa,
    negocio_id: negocioId,
    kit_nome: "Kit personalizado · 5,5 kWp",
    kit_potencia_kwp: 5.5,
    kit_preco: 25000,
    tipo_ligacao: "trifasico",
    consumo_medio_kwh: 700,
    valor_fatura_medio: null,
    tarifa_kwh: 0.95,
    produtividade_kwh_kwp_mes: 120,
    percentual_fio_b: 0.45,
    disponibilidade_kwh: 100,
    geracao_estimada_kwh_mes: 660,
    kwh_faturado: 100,
    kwh_compensado: 560,
    custo_fio_b: 239.4,
    conta_sem_solar: 665,
    conta_com_solar: 334.4,
    economia_mensal: 330.6,
    payback_meses: 75.6,
    ...extra,
  });
  if (error) throw error;
}

/** O que a tela de edição manda de volta (valores atuais nos campos). */
function edicaoAtual(negocioId: string, n: Awaited<ReturnType<typeof reabrir>>["negocio"], mudar: Record<string, string> = {}) {
  return fd({
    negocioId,
    titulo: n.titulo,
    origem_id: "",
    valor: n.valor != null ? String(n.valor).replace(".", ",") : "",
    descricao: n.descricao ?? "",
    unidade_consumidora: n.unidade_consumidora ?? "",
    padrao_cliente: n.padrao_cliente ?? "",
    tipo_telhado: n.tipo_telhado ?? "",
    consumo_medio_kwh: n.consumo_medio_kwh != null ? String(n.consumo_medio_kwh).replace(".", ",") : "",
    tarifa_efetiva_kwh: n.tarifa_efetiva_kwh != null ? String(n.tarifa_efetiva_kwh).replace(".", ",") : "",
    valor_conta_energia: n.valor_conta_energia != null ? String(n.valor_conta_energia).replace(".", ",") : "",
    ...mudar,
  });
}

describe("ciclo completo com contato novo", () => {
  it("separa tarifa efetiva da base: cria estimativa, reabre, recalcula e troca por kWh informado", async () => {
    const r = await criar(vendedor, novoNegocio({
      consumo_medio_kwh: "", valor_fatura_medio: "450,00", tarifa_efetiva_kwh: "0,9000",
      tarifa_kwh: "0,76802", componentes: KIT,
    }));
    let f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: null, consumo_estimado_kwh: 500, tarifa_efetiva_kwh: 0.9, valor_conta_energia: 450 });
    expect(await linhaGravada(r.negocioId)).toMatchObject({ consumo_medio_kwh: 500, tarifa_kwh: 0.76802, estado_financeiro: "incompleto" });

    const kit = fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "", valorFaturaMedio: "",
      tarifaKwh: "0,76802", tarifaBaseTributaria: "sem_tributos", estruturaTelhado: "", componentes: KIT, observacoes: "" });
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kit)).ok).toBe(true);
    f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: null, consumo_estimado_kwh: 500, tarifa_efetiva_kwh: 0.9 });

    expect((await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, f.negocio, {
      valor_conta_energia: "459,00",
    }))).ok).toBe(true);
    f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: null, consumo_estimado_kwh: 510, tarifa_efetiva_kwh: 0.9 });
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kit)).ok).toBe(true);
    expect(await linhaGravada(r.negocioId)).toMatchObject({ consumo_medio_kwh: 510, tarifa_kwh: 0.76802 });

    const kitComKwh = fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "505", valorFaturaMedio: "",
      tarifaKwh: "0,76802", tarifaBaseTributaria: "sem_tributos", estruturaTelhado: "", componentes: KIT, observacoes: "" });
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitComKwh)).ok).toBe(true);
    f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: 505, consumo_estimado_kwh: null, tarifa_efetiva_kwh: null });

    expect((await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, f.negocio, {
      consumo_medio_kwh: "506",
    }))).ok).toBe(true);
    f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: 506, consumo_estimado_kwh: null, tarifa_efetiva_kwh: null });
  });
  it("criar → reabrir → editar negócio e contato → reabrir preserva tudo", async () => {
    const r = await criar(
      vendedor,
      novoNegocio({
        contato_endereco: "Rua A, 10, Centro, CEP 85800-000",
        contato_cidade: "Cascavel",
        contato_uf: "pr",
        unidade_consumidora: "UC-1",
        padrao_cliente: "Bifásico 63 A",
        tipo_telhado: "cerâmico",
        estrutura_telhado: "gancho",
        descricao: "Telhado voltado ao norte",
        consumo_medio_kwh: "450",
        valor_fatura_medio: "300,00",
      }),
    );
    expect(r.avisos).toEqual([]);

    let f = await reabrir(vendedor, r.negocioId);
    expect(f.contato).toMatchObject({ endereco: "Rua A, 10, Centro, CEP 85800-000", cidade: "Cascavel", uf: "PR" });
    expect(f.negocio).toMatchObject({
      valor: 25000,
      unidade_consumidora: "UC-1",
      padrao_cliente: "Bifásico 63 A",
      tipo_telhado: "cerâmico",
      estrutura_telhado: "gancho",
      descricao: "Telhado voltado ao norte",
      consumo_medio_kwh: 450,
      valor_conta_energia: 300,
    });

    // Edita só o título pela tela (os demais campos voltam com o valor atual).
    expect(await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, f.negocio, { titulo: "Residência 5 kWp" }))).toMatchObject({ ok: true });
    f = await reabrir(vendedor, r.negocioId);
    expect(f.negocio).toMatchObject({ titulo: "Residência 5 kWp", estrutura_telhado: "gancho", consumo_medio_kwh: 450, valor_conta_energia: 300, unidade_consumidora: "UC-1" });
    expect(f.contato).toMatchObject({ endereco: "Rua A, 10, Centro, CEP 85800-000", cidade: "Cascavel", uf: "PR" });

    // Edita o contato (endereço agora é editável) e confere que nada mais se perde.
    const contatoForm = (endereco: string) =>
      fd({ contatoId: f.contato.id, tipo: "pf", nome: f.contato.nome, telefone: "(45) 99999-0000", telefone2: "", email: "", documento: "123.456.789-09", endereco, cidade: "Cascavel", uf: "PR" });
    expect(await editarContatoComCliente(cliente(vendedor), contatoForm("Rua B, 20"))).toEqual({ ok: true, mensagem: "Contato salvo." });
    f = await reabrir(vendedor, r.negocioId);
    expect(f.contato).toMatchObject({ endereco: "Rua B, 20", cidade: "Cascavel", uf: "PR", documento: "123.456.789-09" });

    // Salvar de novo sem mudar nada mantém os mesmos valores.
    expect((await editarContatoComCliente(cliente(vendedor), contatoForm("Rua B, 20"))).ok).toBe(true);
    expect((await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, f.negocio))).ok).toBe(true);
    const de_novo = await reabrir(vendedor, r.negocioId);
    expect(de_novo.negocio).toEqual(f.negocio);
  });

  it("edição recusada pela validação não grava nada", async () => {
    const r = await criar(vendedor, novoNegocio());
    const antes = await reabrir(vendedor, r.negocioId);
    const res = await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, antes.negocio, { titulo: "", descricao: "mudou" }));
    expect(res.ok).toBe(false);
    expect((await reabrir(vendedor, r.negocioId)).negocio).toEqual(antes.negocio);
  });
});

describe("contato já cadastrado", () => {
  it("completa só o que está vazio e avisa quando mantém um dado diferente", async () => {
    const { data: c } = await vendedor.cliente
      .from("contatos")
      .insert({ empresa_id: empresa, nome: "Contato existente", telefone: "(45) 98888-1111", cidade: "Toledo" })
      .select("id")
      .single();
    const r = await criar(
      vendedor,
      novoNegocio({ contato_id: c!.id, contato_endereco: "Rua C, 30", contato_cidade: "Cascavel", contato_uf: "PR" }),
    );
    expect(r.avisos).toEqual(["contato_mantido"]);
    const f = await reabrir(vendedor, r.negocioId);
    expect(f.contato).toMatchObject({ id: c!.id, nome: "Contato existente", cidade: "Toledo", uf: "PR", endereco: "Rua C, 30" });

    // Mesmo dado (sem diferença de maiúsculas/espaços) não gera aviso nem muda nada.
    const r2 = await criar(vendedor, novoNegocio({ contato_id: c!.id, contato_endereco: "rua c,  30", contato_cidade: "toledo", contato_uf: "PR" }));
    expect(r2.avisos).toEqual([]);
    expect((await reabrir(vendedor, r2.negocioId)).contato).toMatchObject({ cidade: "Toledo", endereco: "Rua C, 30" });
  });

  it("negócio que falha depois de criar o contato devolve o contato (o reenvio não duplica)", async () => {
    const nome = `Cliente recuperado ${sufixo}`;
    // Responsável inexistente: o banco recusa o negócio depois de o contato novo já existir.
    const falha = await criarNegocioComCliente(cliente(admin), atual[admin.id], novoNegocio({ contato_nome: nome, responsavel_id: crypto.randomUUID() }));
    expect(falha.ok).toBe(false);
    const contatoId = !falha.ok ? falha.contatoId : undefined;
    expect(contatoId).toBeTruthy();

    const r = await criar(admin, novoNegocio({ contato_id: contatoId, contato_nome: nome }));
    expect((await reabrir(admin, r.negocioId)).contato.id).toBe(contatoId);
    const { count } = await servico.from("contatos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa).eq("nome", nome);
    expect(count).toBe(1);
  });
});

describe("kit", () => {
  it("itens sem tarifa são salvos; com tarifa viram cálculo; salvar de novo mantém o valor da conta", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
    expect(r.avisos).toEqual([]);
    let f = await reabrir(vendedor, r.negocioId);
    expect(f.kit).toHaveLength(2);
    expect(f.calculo).toBeNull();

    const kitForm = (extra: Record<string, string> = {}) =>
      // consumo informado (300 / 0,95 = 315,79 kWh, o valor que antes era derivado da fatura): conta em R$ sozinha é estimativa incompleta.
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "315,79", valorFaturaMedio: "300,00", tarifaKwh: "0,95", estruturaTelhado: "gancho", componentes: KIT, observacoes: "", ...extra });
    // ANTES: com tarifa o salvamento criava o cálculo ("Kit e cálculo salvos."). AGORA: a estimativa é sempre incompleta,
    // os itens são salvos, consumo e fatura vão ao negócio e a linha gravada é só o RESULTADO TÉCNICO (estado
    // `incompleto`: entradas e geração; economia, contas, Fio B e payback nulos; pendências gravadas).
    const pendencias = pendenciasDaEntrada({ consumoMedioKwh: 315.79, valorFaturaMedio: 300, tarifaKwh: 0.95 });
    const salvo = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm());
    expect(salvo).toMatchObject({ ok: true, negocioId: r.negocioId, mensagem: `Kit e resultado técnico salvos. ${mensagemEstimativaIncompleta(pendencias)}` });
    expect(salvo.mensagem).toContain("Estimativa financeira incompleta: Informe o tipo de cliente na Qualificação SDR");
    expect(salvo.mensagem).toContain("Declare se a tarifa informada inclui tributos.");
    expect(salvo.mensagem).not.toContain("O cálculo anterior");
    expect(salvo.pendencias?.map((p) => p.codigo)).toEqual(["enquadramento_ausente", "distribuidora_ausente", "base_tributaria_ausente"]);
    f = await reabrir(vendedor, r.negocioId);
    expect(await contarCalculos(r.negocioId)).toBe(1);
    // Reabrir: o resultado técnico salvo volta igual (5,5 kWp × 120 = 660 kWh/mês), sem nenhum número financeiro.
    const tecnico = { ...SEM_FINANCEIRO, consumo_medio_kwh: 315.79, valor_fatura_medio: 300, tarifa_kwh: 0.95, geracao_estimada_kwh_mes: 660, pendencias };
    expect(await linhaGravada(r.negocioId)).toEqual(tecnico);
    expect(f.calculo).toMatchObject({ tarifa_kwh: 0.95, valor_fatura_medio: 300, kit_potencia_kwp: 5.5 });
    expect(f.kit).toHaveLength(2);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: 315.79, valor_conta_energia: 300, estrutura_telhado: "gancho" });

    // Salvar de novo (a tela traz consumo e conta do negócio): mesmo resultado e a mesma linha técnica.
    const de_novo = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm());
    expect(de_novo).toMatchObject({ ok: true, mensagem: salvo.mensagem });
    f = await reabrir(vendedor, r.negocioId);
    expect(await linhaGravada(r.negocioId)).toEqual(tecnico);
    expect(f.kit).toHaveLength(2);
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: 315.79, valor_conta_energia: 300 });

    // Sem tarifa também salva (os itens trocam); sem tarifa não há linha nova: a técnica anterior fica e não vale como atual.
    const semTarifa = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ tarifaKwh: "", componentes: SO_MODULO }));
    expect(semTarifa.ok).toBe(true);
    expect(semTarifa.mensagem).toBe(
      `Itens do kit salvos. ${mensagemEstimativaIncompleta(pendenciasDaEntrada({ consumoMedioKwh: 315.79, valorFaturaMedio: 300, tarifaKwh: null }))}${SUFIXO_INCOMPLETO}`,
    );
    const depois = await reabrir(vendedor, r.negocioId);
    expect(depois.kit).toEqual([{ tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 12 }]);
    expect(await linhaGravada(r.negocioId)).toEqual(tecnico);
    expect(await contarCalculos(r.negocioId)).toBe(1);
  });

  it("conta em R$ sem consumo em kWh: salva o kit, não cria cálculo e, havendo cálculo prévio, o mantém intacto (estimativa incompleta)", async () => {
    const kitForm = (negocioId: string, extra: Record<string, string> = {}) =>
      fd({ negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "", valorFaturaMedio: "300,00", tarifaKwh: "0,95", estruturaTelhado: "", componentes: KIT, observacoes: "", ...extra });
    const calculoCompleto = async (negocioId: string) => {
      const { data } = await servico.from("calculos_solares").select("*").eq("negocio_id", negocioId).maybeSingle();
      return data;
    };

    // Negócio sem cálculo prévio: itens gravados, nenhum cálculo criado.
    const r1 = await criar(vendedor, novoNegocio());
    const sem = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm(r1.negocioId));
    const pendenciasSem = pendenciasDaEntrada({ consumoMedioKwh: null, valorFaturaMedio: 300, tarifaKwh: 0.95 });
    expect(sem).toEqual({
      ok: true,
      negocioId: r1.negocioId,
      pendencias: pendenciasSem,
      mensagem: `Itens do kit salvos. ${mensagemEstimativaIncompleta(pendenciasSem)}`,
    });
    // Pendências: qualificação (enquadramento, distribuidora), consumo e base tributária da tarifa.
    expect(pendenciasSem.map((p) => p.codigo)).toEqual([
      "enquadramento_ausente",
      "distribuidora_ausente",
      "consumo_ausente",
      "consumo_estimado_pela_tarifa_base",
      "base_tributaria_ausente",
    ]);
    const f1 = await reabrir(vendedor, r1.negocioId);
    expect(f1.kit).toHaveLength(2);
    expect(f1.calculo).toBeNull();
    expect(await calculoCompleto(r1.negocioId)).toBeNull();
    expect(f1.negocio).toMatchObject({ consumo_medio_kwh: null, valor_conta_energia: 300 });

    // Negócio com linha LEGADA (fixture): reenvio incompleto troca o kit, mas não toca na linha.
    const r2 = await criar(vendedor, novoNegocio({ componentes: KIT })); // o banco exige o kit antes de aceitar a linha
    await inserirLinhaLegada(r2.negocioId);
    const antes = await calculoCompleto(r2.negocioId);
    expect(antes).not.toBeNull();
    expect(antes!.kit_potencia_kwp).toBe(5.5);

    const outroKit = JSON.stringify([
      { tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 20 },
      { tipo: "inversor", descricao: "Inversor 10 kW", potenciaW: 10000, quantidade: 1 },
    ]);
    const com = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm(r2.negocioId, { componentes: outroKit }));
    expect(com).toEqual({
      ok: true,
      negocioId: r2.negocioId,
      pendencias: pendenciasSem,
      mensagem: `Itens do kit salvos. ${mensagemEstimativaIncompleta(pendenciasSem)} O cálculo anterior foi marcado como desatualizado: as entradas mudaram e ainda não há resultado novo.`,
    });
    const f2 = await reabrir(vendedor, r2.negocioId);
    expect(f2.kit).toEqual([
      { tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 20 },
      { tipo: "inversor", descricao: "Inversor 10 kW", potencia_w: 10000, quantidade: 1 },
    ]);
    // R6.2: sem resultado novo (só conta em R$), a linha legada fica (números iguais) com a marca explícita de desatualizada.
    const depois = await calculoCompleto(r2.negocioId);
    expect({ ...depois, financeiro_desatualizado_em: null, financeiro_desatualizado_motivo: null, updated_at: antes!.updated_at }).toEqual(antes);
    expect(depois).toMatchObject({ estado_financeiro: "legado", financeiro_desatualizado_motivo: "entradas_alteradas_sem_resultado_novo" });
    expect(depois!.financeiro_desatualizado_em).not.toBeNull();
    expect((await servico.from("calculos_solares_historico").select("id").eq("negocio_id", r2.negocioId)).data).toEqual([]);
  });

  describe("kWh e fatura do kit: vazio preserva o gravado no negócio (contrato M2-P0-K1)", () => {
    const salvarKit = (negocioId: string, extra: Record<string, string> = {}) =>
      salvarKitComCliente(
        cliente(vendedor),
        atual[vendedor.id],
        fd({ negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "", valorFaturaMedio: "", tarifaKwh: "0,95", estruturaTelhado: "", componentes: KIT, observacoes: "", ...extra }),
      );
    /**
     * Saída esperada: as pendências refletem os valores efetivos (nunca o campo cru). Com tarifa e consumo em kWh o
     * resultado técnico é gravado; sem linha nova e com linha anterior, o sufixo diz que ela não vale como atual.
     */
    const esperada = (
      negocioId: string,
      consumoMedioKwh: number | null,
      valorFaturaMedio: number | null,
      tarifaKwh: number | null,
      sufixo = "",
    ) => {
      const pendencias = pendenciasDaEntrada({ consumoMedioKwh, valorFaturaMedio, tarifaKwh });
      const inicio = tarifaKwh != null && consumoMedioKwh != null ? "Kit e resultado técnico salvos." : "Itens do kit salvos.";
      return { ok: true, negocioId, pendencias, mensagem: `${inicio} ${mensagemEstimativaIncompleta(pendencias)}${sufixo}` };
    };

    it("kWh e fatura vazios no kit (com e sem tarifa) preservam 450 e 300 do negócio; pendências usam os efetivos; linha só técnica", async () => {
      const r = await criar(vendedor, novoNegocio({ consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
      for (const tarifaKwh of ["0,95", ""]) {
        // Com tarifa: grava o resultado técnico com os efetivos (450 / 300). Sem tarifa: nada novo, a técnica fica.
        const esp = esperada(r.negocioId, 450, 300, tarifaKwh ? 0.95 : null, tarifaKwh ? "" : SUFIXO_INCOMPLETO);
        expect(esp.pendencias.map((p) => p.codigo)).not.toContain("consumo_ausente");
        expect(await salvarKit(r.negocioId, { tarifaKwh })).toEqual(esp);
        const f = await reabrir(vendedor, r.negocioId);
        expect(f.negocio).toMatchObject({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
        expect(f.kit).toHaveLength(2);
        expect(await linhaGravada(r.negocioId)).toMatchObject({ ...SEM_FINANCEIRO, consumo_medio_kwh: 450, valor_fatura_medio: 300, tarifa_kwh: 0.95 });
        expect(await contarCalculos(r.negocioId)).toBe(1);
      }
    });

    it("kWh e fatura preenchidos substituem; depois, kit vazio de novo mantém os novos valores", async () => {
      const r = await criar(vendedor, novoNegocio({ consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
      expect(await salvarKit(r.negocioId, { consumoMedioKwh: "520", valorFaturaMedio: "410,50" })).toEqual(esperada(r.negocioId, 520, 410.5, 0.95));
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 520, valor_conta_energia: 410.5 });
      expect(await salvarKit(r.negocioId)).toEqual(esperada(r.negocioId, 520, 410.5, 0.95));
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 520, valor_conta_energia: 410.5 });
      expect(await linhaGravada(r.negocioId)).toMatchObject({ ...SEM_FINANCEIRO, consumo_medio_kwh: 520, valor_fatura_medio: 410.5 });
    });

    it("limpeza explícita em Dados do negócio zera os dois; kit vazio depois não os recria e as pendências incluem consumo_ausente", async () => {
      const r = await criar(vendedor, novoNegocio({ consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
      const antes = await reabrir(vendedor, r.negocioId);
      const res = await editarNegocioComCliente(
        cliente(vendedor),
        atual[vendedor.id],
        edicaoAtual(r.negocioId, antes.negocio, { consumo_medio_kwh: "", valor_conta_energia: "" }),
      );
      expect(res.ok).toBe(true);
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: null, valor_conta_energia: null });

      // Com tarifa e sem consumo nem fatura (nem no negócio), o kit é recusado como antes desta rodada: nada muda.
      expect(await salvarKit(r.negocioId)).toEqual({ ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura. Nada foi alterado." });
      expect((await reabrir(vendedor, r.negocioId)).kit).toHaveLength(0);

      // Sem tarifa, o kit é salvo; consumo e fatura continuam vazios e a pendência de consumo aparece.
      const esp = esperada(r.negocioId, null, null, null);
      expect(esp.pendencias.map((p) => p.codigo)).toContain("consumo_ausente");
      expect(await salvarKit(r.negocioId, { tarifaKwh: "" })).toEqual(esp);
      const f = await reabrir(vendedor, r.negocioId);
      expect(f.negocio).toMatchObject({ consumo_medio_kwh: null, valor_conta_energia: null });
      expect(f.kit).toHaveLength(2);
      expect(await contarCalculos(r.negocioId)).toBe(0);
    });

    it("só um dos dois vazio: kWh vazio preserva o consumo e a fatura nova substitui; e o inverso", async () => {
      const r = await criar(vendedor, novoNegocio({ consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
      expect(await salvarKit(r.negocioId, { valorFaturaMedio: "410,50" })).toEqual(esperada(r.negocioId, 450, 410.5, 0.95));
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 450, valor_conta_energia: 410.5 });

      expect(await salvarKit(r.negocioId, { consumoMedioKwh: "520" })).toEqual(esperada(r.negocioId, 520, 410.5, 0.95));
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 520, valor_conta_energia: 410.5 });
      expect(await linhaGravada(r.negocioId)).toMatchObject({ ...SEM_FINANCEIRO, consumo_medio_kwh: 520, valor_fatura_medio: 410.5 });
    });

    // Abre como a ficha (estadoSalvoDoKit com a linha legada e os valores atuais do negócio) e salva sem editar.
    const abrirESalvarSemEditar = async (negocioId: string) => {
      const f = await reabrir(vendedor, negocioId);
      const { data: linha } = await servico.from("calculos_solares").select("consumo_medio_kwh, valor_fatura_medio, tarifa_kwh").eq("negocio_id", negocioId).single();
      const estado = estadoSalvoDoKit({
        componentesSalvos: f.kit.map((i) => ({ tipo: i.tipo, descricao: i.descricao, potenciaW: i.potencia_w, quantidade: i.quantidade })),
        calculo: { tipoLigacao: "trifasico", consumoMedioKwh: linha!.consumo_medio_kwh, valorFaturaMedio: linha!.valor_fatura_medio, tarifaKwh: linha!.tarifa_kwh },
        estruturaTelhado: null,
        consumoMedioKwhPadrao: f.negocio.consumo_medio_kwh,
        valorFaturaMedioPadrao: f.negocio.valor_conta_energia,
      });
      const res = await salvarKit(negocioId, {
        consumoMedioKwh: estado.consumoMedioKwh,
        valorFaturaMedio: estado.valorFaturaMedio,
        tarifaKwh: estado.tarifaKwh,
        componentes: JSON.stringify(linhasParaComponentes(estado.linhas)),
      });
      return { estado, res };
    };
    const linhaLegada = async (negocioId: string) =>
      (await servico.from("calculos_solares").select("consumo_medio_kwh, valor_fatura_medio").eq("negocio_id", negocioId).single()).data;

    it("negócio 450 kWh / R$ 300 e cálculo legado 700 kWh / R$ 900: abrir mostra 450 e 300; salvar sem editar mantém 450 e 300", async () => {
      const r = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
      await inserirLinhaLegada(r.negocioId, { consumo_medio_kwh: 700, valor_fatura_medio: 900 });

      const { estado, res } = await abrirESalvarSemEditar(r.negocioId);
      expect(estado).toMatchObject({ consumoMedioKwh: "450", valorFaturaMedio: "300" });
      expect(res.ok).toBe(true);
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
      // R6.1/R6.2: a linha atual passa a ter as entradas atuais (resultado técnico incompleto); a legada 700/900 vai
      // inteira para o histórico, marcada como desatualizada (nunca apagada nem exibida como atual).
      expect(await linhaLegada(r.negocioId)).toEqual({ consumo_medio_kwh: 450, valor_fatura_medio: 300 });
      const { data: hist } = await servico.from("calculos_solares_historico").select("motivo, linha").eq("negocio_id", r.negocioId);
      expect(hist).toHaveLength(1);
      expect(hist![0].motivo).toBe("desatualizado_por_entradas");
      expect(hist![0].linha).toMatchObject({ estado_financeiro: "legado", consumo_medio_kwh: 700, valor_fatura_medio: 900 });
    });

    it("negócio sem kWh nem fatura e cálculo legado 700 / 900: os campos abrem vazios e nada do cálculo vai ao negócio", async () => {
      const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
      await inserirLinhaLegada(r.negocioId, { consumo_medio_kwh: 700, valor_fatura_medio: 900 });

      const { estado, res } = await abrirESalvarSemEditar(r.negocioId);
      expect(estado).toMatchObject({ consumoMedioKwh: "", valorFaturaMedio: "" });
      // A tarifa reabre do cálculo; sem consumo nem fatura, o servidor recusa como antes e nada muda.
      expect(res).toEqual({ ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura. Nada foi alterado." });
      expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ consumo_medio_kwh: null, valor_conta_energia: null });
      expect(await linhaLegada(r.negocioId)).toEqual({ consumo_medio_kwh: 700, valor_fatura_medio: 900 });
    });
  });

  it("números no padrão brasileiro: 1.200 kWh grava 1200; reabrir e salvar sem editar mantém tudo (M2-a)", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, valor: "25.000" }));
    expect((await reabrir(vendedor, r.negocioId)).negocio.valor).toBe(25000);

    const calculo = async () => {
      const { data } = await servico
        .from("calculos_solares")
        .select("consumo_medio_kwh, valor_fatura_medio, tarifa_kwh, kit_potencia_kwp, geracao_estimada_kwh_mes, kwh_faturado, custo_fio_b, conta_sem_solar, conta_com_solar, economia_mensal, payback_meses")
        .eq("negocio_id", r.negocioId)
        .single();
      return data!;
    };
    const kitForm = (campos: Record<string, string>) =>
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", valorFaturaMedio: "", estruturaTelhado: "", componentes: KIT, observacoes: "", ...campos });

    // ANTES: salvar criava a linha completa (consumo 1200, tarifa 0,9512, geração 660). AGORA: grava o resultado técnico
    // incompleto com a mesma escala (1.200 -> 1200; 5,5 kWp x 120 = 660) e nenhum número financeiro; reabrir e salvar
    // sem editar mantém tudo, inclusive a linha.
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ consumoMedioKwh: "1.200", tarifaKwh: "0,9512" }))).ok).toBe(true);
    expect((await reabrir(vendedor, r.negocioId)).negocio.consumo_medio_kwh).toBe(1200);
    const primeiro = await calculo();
    expect(primeiro).toEqual({
      consumo_medio_kwh: 1200,
      valor_fatura_medio: null,
      tarifa_kwh: 0.9512,
      kit_potencia_kwp: 5.5,
      geracao_estimada_kwh_mes: 660,
      kwh_faturado: null,
      custo_fio_b: null,
      conta_sem_solar: null,
      conta_com_solar: null,
      economia_mensal: null,
      payback_meses: null,
    });

    // Reabre como a ficha (estadoSalvoDoKit) e salva de novo o que os campos mostram, sem editar.
    const { data: itens } = await vendedor.cliente.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", r.negocioId).order("ordem");
    const estado = estadoSalvoDoKit({
      componentesSalvos: itens!.map((i) => ({ tipo: i.tipo, descricao: i.descricao, potenciaW: i.potencia_w, quantidade: i.quantidade })),
      calculo: { tipoLigacao: "trifasico", consumoMedioKwh: primeiro.consumo_medio_kwh, valorFaturaMedio: primeiro.valor_fatura_medio, tarifaKwh: primeiro.tarifa_kwh },
      estruturaTelhado: null,
      // A ficha passa os valores atuais do negócio (1200 kWh, sem conta); o editor não herda o cálculo.
      consumoMedioKwhPadrao: 1200,
      valorFaturaMedioPadrao: null,
    });
    expect(estado.consumoMedioKwh).toBe("1.200");
    const componentesReabertos = JSON.stringify(linhasParaComponentes(estado.linhas));
    for (let i = 0; i < 2; i++) {
      const salvo = await salvarKitComCliente(
        cliente(vendedor),
        atual[vendedor.id],
        kitForm({ consumoMedioKwh: estado.consumoMedioKwh, valorFaturaMedio: estado.valorFaturaMedio, tarifaKwh: estado.tarifaKwh, componentes: componentesReabertos }),
      );
      expect(salvo.ok).toBe(true);
      expect(await calculo()).toEqual(primeiro);
    }

    // Ambíguo ("1.2") é recusado com mensagem e nada muda.
    const ambiguo = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ consumoMedioKwh: "1.2", tarifaKwh: "0,9512" }));
    expect(ambiguo).toMatchObject({ ok: false, mensagem: MENSAGEM_NUMERO_BR });
    expect(await calculo()).toEqual(primeiro);
    expect((await reabrir(vendedor, r.negocioId)).negocio.consumo_medio_kwh).toBe(1200);
  });

  it("falha ao gravar itens não apaga o kit anterior e não mostra sucesso", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
    // Potência acima do limite da coluna: passa na validação da tela e o banco recusa.
    const ruim = JSON.stringify([{ tipo: "outro", descricao: "Item inválido", potenciaW: 10_000_000, quantidade: 1 }]);
    const res = await salvarKitComCliente(
      cliente(vendedor),
      atual[vendedor.id],
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", tarifaKwh: "", componentes: ruim }),
    );
    expect(res.ok).toBe(false);
    expect((await reabrir(vendedor, r.negocioId)).kit.map((k) => k.descricao)).toEqual(["Módulo 550 W", "Inversor 5 kW"]);

    // Na criação, a mesma falha cria o negócio e avisa que o kit não foi salvo.
    const r2 = await criar(vendedor, novoNegocio({ componentes: ruim }));
    expect(r2.avisos).toEqual(["kit"]);
    expect((await reabrir(vendedor, r2.negocioId)).kit).toEqual([]);
  });

  // ANTES ("cálculo recusado pelo banco restaura o kit anterior e só então diz que nada mudou"): a tarifa 100000 fazia o
  // banco recusar a linha e o kit era restaurado. Com linha LEGADA o app não grava resultado incompleto por cima, então
  // esse caminho não ocorre aqui (sem linha anterior, ver o teste seguinte). Aqui: a mesma entrada não é recusada, não
  // toca na linha legada e salva o kit.
  // Desde que a linha nova é sempre gravada (R6), a tarifa fora do limite da coluna segue o mesmo caminho de "sem linha
  // anterior": o banco recusa a instrução (o arquivamento do trigger é desfeito junto), o kit volta e nada muda.
  it("tarifa acima do limite da coluna com linha legada: o banco recusa, o kit volta, a legada fica intocada e sem histórico", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450" }));
    await inserirLinhaLegada(r.negocioId);
    const kitForm = (extra: Record<string, string>) =>
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "0,95", componentes: KIT, ...extra });
    const { data: linhaAntes } = await servico.from("calculos_solares").select("*").eq("negocio_id", r.negocioId).single();

    const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const res = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ tarifaKwh: "100000", componentes: outroKit }));
    expect(res.ok).toBe(false);
    expect(res.mensagem).toContain("Nada foi alterado");
    expect((await reabrir(vendedor, r.negocioId)).kit.map((k) => k.descricao)).toEqual(["Módulo 550 W", "Inversor 5 kW"]);
    const { data: linhaDepois } = await servico.from("calculos_solares").select("*").eq("negocio_id", r.negocioId).single();
    expect(linhaDepois).toEqual(linhaAntes);
    expect((await servico.from("calculos_solares_historico").select("id").eq("negocio_id", r.negocioId)).data).toEqual([]);
  });

  // Sem linha anterior, o resultado técnico é gravado (migration 20261023200000) e volta o caminho original: a tarifa
  // 100000 não cabe na coluna, o banco recusa a linha técnica e o kit anterior é restaurado.
  it("sem linha anterior: o banco recusa a linha técnica fora do limite, o kit anterior volta e nada é gravado", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450" }));
    const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const res = await salvarKitComCliente(
      cliente(vendedor),
      atual[vendedor.id],
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "100000", componentes: outroKit }),
    );
    expect(res.ok).toBe(false);
    expect(res.mensagem).toContain("Nada foi alterado");
    expect((await reabrir(vendedor, r.negocioId)).kit.map((k) => k.descricao)).toEqual(["Módulo 550 W", "Inversor 5 kW"]);
    expect(await contarCalculos(r.negocioId)).toBe(0);
  });

  it("reenviar é seguro: substitui a lista inteira, mesmo com itens repetidos de uma falha anterior", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
    // Simula o pior caso de uma falha sem restauração: itens repetidos.
    await servico.from("kit_componentes").insert({ empresa_id: empresa, negocio_id: r.negocioId, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
    const form = () => fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", tarifaKwh: "", componentes: KIT });
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], form())).ok).toBe(true);
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], form())).ok).toBe(true);
    expect((await reabrir(vendedor, r.negocioId)).kit.map((k) => k.descricao)).toEqual(["Módulo 550 W", "Inversor 5 kW"]);
  });

  it("falha ao apagar os itens antigos: restaura o kit inteiro; se nem a restauração fecha, avisa e o reenvio corrige", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
    const lerKit = async () =>
      (await servico.from("kit_componentes").select("id, descricao, ordem").eq("negocio_id", r.negocioId).order("ordem").order("id")).data!;
    const antes = await lerKit();
    const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const form = () => fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", tarifaKwh: "", componentes: outroKit });

    // 1) A exclusão dos antigos falha; a restauração funciona: kit idêntico (mesmos ids).
    const res1 = await salvarKitComCliente(comFalha(vendedor.cliente, { apagarKit: 1 }), atual[vendedor.id], form());
    expect(res1).toMatchObject({ ok: false, mensagem: "Não foi possível substituir os itens do kit. Nada foi alterado." });
    expect(await lerKit()).toEqual(antes);

    // 2) A exclusão falha e a restauração também: não promete "nada foi alterado".
    const res2 = await salvarKitComCliente(comFalha(vendedor.cliente, { apagarKit: 2 }), atual[vendedor.id], form());
    expect(res2.ok).toBe(false);
    expect(res2.mensagem).not.toContain("Nada foi alterado");
    expect(res2.mensagem).toContain("salve de novo");
    expect((await lerKit()).length).toBe(3); // antigos + novo

    // 3) Reenvio sem falha: exatamente a lista da tela.
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], form())).ok).toBe(true);
    expect((await reabrir(vendedor, r.negocioId)).kit.map((k) => k.descricao)).toEqual(["Módulo 600 W"]);
  });

  it("remover kit salvo: sem confirmação é recusado; com confirmação remove; com cálculo nunca", async () => {
    // Sem cálculo.
    const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
    const remover = (negocioId: string, extra: Record<string, string> = {}) =>
      salvarKitComCliente(cliente(vendedor), atual[vendedor.id], fd({ negocioId, tipoLigacao: "trifasico", tarifaKwh: "", componentes: "[]", ...extra }));
    expect(await remover(r.negocioId)).toEqual({ ok: false, mensagem: MENSAGEM_REMOCAO_SEM_CONFIRMACAO });
    expect((await reabrir(vendedor, r.negocioId)).kit).toHaveLength(2);
    expect((await remover(r.negocioId, { confirmarRemocao: "sim" })).ok).toBe(true);
    expect((await reabrir(vendedor, r.negocioId)).kit).toEqual([]);

    // Com cálculo associado (técnico incompleto, gravado na criação, ou legado): recusa mesmo com confirmação e mesmo
    // informando a tarifa.
    const c = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450", tarifa_kwh: "0,95" }));
    expect(await linhaGravada(c.negocioId)).toMatchObject(SEM_FINANCEIRO); // criar grava o resultado técnico
    const c2 = await criar(vendedor, novoNegocio({ componentes: KIT }));
    await inserirLinhaLegada(c2.negocioId); // fixture: linha legada associada
    const tentativas: Record<string, string>[] = [{ confirmarRemocao: "sim" }, { confirmarRemocao: "sim", tarifaKwh: "0,95", consumoMedioKwh: "450" }];
    for (const negocioId of [c.negocioId, c2.negocioId]) {
      const antes = await reabrir(vendedor, negocioId);
      expect(antes.calculo).not.toBeNull();
      for (const extra of tentativas) {
        expect(await remover(negocioId, extra)).toEqual({ ok: false, mensagem: MENSAGEM_REMOCAO_COM_CALCULO });
      }
      const depois = await reabrir(vendedor, negocioId);
      expect(depois.kit).toEqual(antes.kit);
      expect(depois.calculo).toEqual(antes.calculo);
    }
  });

  it("falha ao ler o cálculo: recusa antes de gravar ou apagar; kit e cálculo intactos", async () => {
    const c = await criar(vendedor, novoNegocio({ componentes: KIT }));
    await inserirLinhaLegada(c.negocioId); // fixture: linha legada associada
    const antes = await reabrir(vendedor, c.negocioId);
    expect(antes.calculo).not.toBeNull();
    const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 12 }]);
    // Remoção confirmada (seria a brecha) e troca de itens com tarifa: ambas recusadas.
    const tentativas: Record<string, string>[] = [
      { componentes: "[]", tarifaKwh: "", confirmarRemocao: "sim" },
      { componentes: outroKit, tarifaKwh: "0,95", consumoMedioKwh: "450" },
    ];
    for (const extra of tentativas) {
      const quebrado = comFalha(vendedor.cliente, { lerCalculo: 1 });
      const res = await salvarKitComCliente(quebrado, atual[vendedor.id], fd({ negocioId: c.negocioId, tipoLigacao: "trifasico", ...extra }));
      expect(res).toEqual({ ok: false, mensagem: MENSAGEM_CALCULO_NAO_CONFERIDO });
    }
    const depois = await reabrir(vendedor, c.negocioId);
    expect(depois.kit).toEqual(antes.kit);
    expect(depois.calculo).toEqual(antes.calculo);
  });

  it("editar itens de um kit salvo (sem esvaziar) não pede confirmação", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT }));
    const soModulo = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 550 W", potenciaW: 550, quantidade: 12 }]);
    const res = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", tarifaKwh: "", componentes: soModulo }));
    expect(res.ok).toBe(true);
    expect((await reabrir(vendedor, r.negocioId)).kit).toEqual([{ tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 12 }]);
  });

  it("criar com kit, consumo e tarifa: estimativa incompleta é informação, não aviso de falha; kit, consumo e resultado técnico salvos", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, tarifa_kwh: "0,95", consumo_medio_kwh: "450", valor_fatura_medio: "300,00" }));
    expect(r.avisos).toEqual([]);
    expect(r.estimativa?.estado).toBe("incompleta");
    const pendencias = pendenciasDaEntrada({ consumoMedioKwh: 450, valorFaturaMedio: 300, tarifaKwh: 0.95 });
    expect(r.estimativa?.mensagem).toBe(mensagemEstimativaIncompleta(pendencias));
    expect(r.estimativa?.pendencias.map((p) => p.codigo)).toContain("enquadramento_ausente");
    const f = await reabrir(vendedor, r.negocioId);
    expect(f.kit).toHaveLength(2);
    expect(await contarCalculos(r.negocioId)).toBe(1);
    // 5,5 kWp × 120 kWh/kWp/mês = 660 kWh/mês; nenhum número financeiro (ausência nunca vira zero).
    expect(await linhaGravada(r.negocioId)).toEqual({
      ...SEM_FINANCEIRO,
      consumo_medio_kwh: 450,
      valor_fatura_medio: 300,
      tarifa_kwh: 0.95,
      geracao_estimada_kwh_mes: 660,
      pendencias,
    });
    expect(f.negocio).toMatchObject({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
  });

  it("cálculo que não fecha na criação vira aviso; os itens ficam salvos", async () => {
    const soInversor = JSON.stringify([{ tipo: "inversor", descricao: "Inversor 5 kW", potenciaW: 5000, quantidade: 1 }]);
    const r = await criar(vendedor, novoNegocio({ componentes: soInversor, tarifa_kwh: "0,95", consumo_medio_kwh: "450" }));
    expect(r.avisos).toEqual(["calculo"]);
    const f = await reabrir(vendedor, r.negocioId);
    expect(f.kit).toHaveLength(1);
    expect(f.calculo).toBeNull();
  });
});

describe("anexos: validação, conferência do Storage e RLS", () => {
  const meta = (campo: string, nome: string, tamanho: number, tipoMime = "image/png") => ({ campo, nome, tamanho, tipoMime });

  it("arquivo vazio ou acima de 20 MB é recusado antes de criar qualquer coisa", async () => {
    for (const [nome, tamanho] of [["vazio.png", 0], ["grande.pdf", 20 * 1024 * 1024 + 1]] as const) {
      const titulo = `Recusado ${nome} ${sufixo}`;
      const r = await criarNegocioComCliente(
        cliente(vendedor),
        atual[vendedor.id],
        novoNegocio({ titulo, anexos: JSON.stringify([meta("anexo_geral", nome, tamanho)]) }),
      );
      expect(r.ok, nome).toBe(false);
      const { count } = await servico.from("negocios").select("id", { count: "exact", head: true }).eq("titulo", titulo);
      expect(count, nome).toBe(0);
    }
  });

  it("criar não registra anexo nem escreve na linha do tempo antes de o arquivo chegar", async () => {
    const r = await criar(vendedor, novoNegocio({ anexos: JSON.stringify([meta("anexo_geral", "foto.png", 16)]) }));
    expect((await reabrir(vendedor, r.negocioId)).anexos).toEqual([]);
    const { count } = await servico
      .from("atividades")
      .select("id", { count: "exact", head: true })
      .eq("negocio_id", r.negocioId)
      .eq("tipo", "anexo_adicionado");
    expect(count).toBe(0);
  });

  it("confere a pasta: arquivo sem registro e registro sem arquivo; listagem com falha nunca vira 'tudo certo'", async () => {
    const r = await criar(vendedor, novoNegocio());
    const pasta = `${empresa}/${r.negocioId}`;
    // Chegou ao Storage, mas o navegador fechou antes do registro.
    expect((await vendedor.cliente.storage.from("anexos").upload(`${pasta}/orfao.png`, arquivo("orfao.png"))).error).toBeNull();
    // Registro sem arquivo (dado antigo ou arquivo removido do Storage).
    await servico.from("anexos").insert({ empresa_id: empresa, negocio_id: r.negocioId, caminho: `${pasta}/sumiu.png`, nome: "sumiu.png", tamanho: 16 });
    const { data: registros } = await vendedor.cliente.from("anexos").select("id, caminho").eq("negocio_id", r.negocioId);

    const c = await conferirArquivos(cliente(vendedor), empresa, r.negocioId, registros!);
    expect(c.conferido).toBe(true);
    if (!c.conferido) return;
    expect(c.semRegistro).toEqual([{ caminho: `${pasta}/orfao.png`, nome: "orfao.png", tamanho: 16, tipoMime: "image/png" }]);
    expect([...c.semArquivo]).toEqual([registros!.find((a) => a.caminho.endsWith("sumiu.png"))!.id]);

    // Falha injetada na listagem: a ficha recebe "não conferido", não uma lista vazia.
    const quebrado = comFalha(vendedor.cliente, { listar: 1 });
    expect(await conferirArquivos(quebrado, empresa, r.negocioId, registros!)).toEqual({ conferido: false });
  });

  it("RLS: outra empresa e SDR sem acesso ao negócio não enviam, não listam, não registram e ninguém apaga direto no Storage", async () => {
    const r = await criar(vendedor, novoNegocio());
    const pasta = `${empresa}/${r.negocioId}`;
    expect((await vendedor.cliente.storage.from("anexos").upload(`${pasta}/doc.png`, arquivo("doc.png"))).error).toBeNull();

    const [fora] = await Promise.all([criarUsuario("ng-fora")]);
    const { data: outra } = await servico.from("empresas").insert({ nome: `Outra ${sufixo}` }).select("id").single();
    await servico.from("empresa_membros").insert({ empresa_id: outra!.id, user_id: fora.id, papel: "admin" });

    for (const [quem, u] of [["outra empresa", fora], ["SDR sem o negócio", sdr]] as const) {
      expect((await u.cliente.storage.from("anexos").upload(`${pasta}/${quem}.png`, arquivo("x.png"))).error, quem).not.toBeNull();
      const { data: lista } = await u.cliente.storage.from("anexos").list(pasta);
      expect(lista ?? [], quem).toEqual([]);
      const { error } = await u.cliente
        .from("anexos")
        .insert({ empresa_id: empresa, negocio_id: r.negocioId, caminho: `${pasta}/doc.png`, nome: "doc.png", tamanho: 16 });
      expect(error, quem).not.toBeNull();
    }
    // Sem política de exclusão no Storage: nem quem enviou apaga direto (só o servidor, depois do banco autorizar).
    await vendedor.cliente.storage.from("anexos").remove([`${pasta}/doc.png`]);
    const { data: ainda } = await vendedor.cliente.storage.from("anexos").list(pasta);
    expect(ainda!.map((o) => o.name)).toContain("doc.png");
  });
});

describe("etapa fora do formulário de edição", () => {
  it("SDR não muda a etapa nem fecha o negócio pela edição, e não altera o valor", async () => {
    const r = await criar(sdr, novoNegocio({ valor: "1.000,00" }));
    const antes = await reabrir(sdr, r.negocioId);
    expect(antes.negocio).toMatchObject({ etapa_id: etapaInicial, status: "aberto" });

    const res = await editarNegocioComCliente(
      cliente(sdr),
      atual[sdr.id],
      edicaoAtual(r.negocioId, antes.negocio, { etapa_id: etapaGanho, valor: "99.000,00", titulo: "Editado pelo SDR" }),
    );
    expect(res.ok).toBe(true);
    const depois = await reabrir(sdr, r.negocioId);
    expect(depois.negocio).toMatchObject({ titulo: "Editado pelo SDR", etapa_id: etapaInicial, status: "aberto", valor: 1000 });
  });

  it("vendedor também não muda etapa pela edição (só pelo Mover etapa/Kanban)", async () => {
    const r = await criar(vendedor, novoNegocio());
    const antes = await reabrir(vendedor, r.negocioId);
    await editarNegocioComCliente(cliente(vendedor), atual[vendedor.id], edicaoAtual(r.negocioId, antes.negocio, { etapa_id: etapaGanho }));
    expect((await reabrir(vendedor, r.negocioId)).negocio).toMatchObject({ etapa_id: etapaInicial, status: "aberto" });
  });
});

describe("preço do cálculo x valor do negócio", () => {
  async function negocioComCalculo() {
    // Sem tarifa na criação: nenhuma linha técnica, para a fixture legada ocupar o lugar.
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, valor: "25.000,00", consumo_medio_kwh: "700", tipo_ligacao: "trifasico" }));
    await inserirLinhaLegada(r.negocioId); // fixture legada
    const { data: calculo } = await servico.from("calculos_solares").select("id, kit_preco, economia_mensal, payback_meses, geracao_estimada_kwh_mes").eq("negocio_id", r.negocioId).single();
    expect(calculo).toMatchObject({ kit_preco: 25000 });
    return { negocioId: r.negocioId, calculo: calculo! };
  }
  const lerCalculo = async (negocioId: string) =>
    (await servico.from("calculos_solares").select("kit_preco, payback_meses, economia_mensal, geracao_estimada_kwh_mes").eq("negocio_id", negocioId).single()).data!;

  // ANTES: "atualizar leva só preço e payback" (kit_preco 28000, payback recalculado). AGORA: com linha legada (fórmula
  // antiga, não validada) atualizar o preço é recusado com a mensagem exata e a linha não muda; editar o valor continua
  // sem mexer no cálculo.
  it("editar o valor do negócio não mexe no cálculo; atualizar o preço de linha legada é recusado e nada muda", async () => {
    const { negocioId, calculo } = await negocioComCalculo();
    const editado = await editarNegocioComCliente(
      cliente(admin),
      atual[admin.id],
      fd({ negocioId, titulo: "Valor corrigido", valor: "28.000,00", consumo_medio_kwh: "700" }),
    );
    expect(editado.ok).toBe(true);
    expect(await lerCalculo(negocioId)).toMatchObject({ kit_preco: 25000, payback_meses: calculo.payback_meses });

    // Preço divergente (28000 x 25000) e linha legada: recusa, sem alterar preço, payback, economia nem geração.
    for (let i = 0; i < 2; i++) {
      const r = await atualizarPrecoCalculoComCliente(cliente(vendedor), atual[vendedor.id], negocioId);
      expect(r).toEqual({ ok: false, mensagem: MENSAGEM_PRECO_CALCULO_LEGADO });
    }
    expect(await lerCalculo(negocioId)).toEqual({
      kit_preco: 25000,
      payback_meses: calculo.payback_meses,
      economia_mensal: calculo.economia_mensal,
      geracao_estimada_kwh_mes: calculo.geracao_estimada_kwh_mes,
    });
  });

  it("resultado técnico incompleto: atualizar o preço é recusado (não há economia nem payback) e nada muda", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, valor: "25.000,00", consumo_medio_kwh: "700", tipo_ligacao: "trifasico", tarifa_kwh: "0,95" }));
    const antes = await lerCalculo(r.negocioId);
    expect(antes).toEqual({ kit_preco: 25000, payback_meses: null, economia_mensal: null, geracao_estimada_kwh_mes: 660 });
    const editado = await editarNegocioComCliente(
      cliente(admin),
      atual[admin.id],
      fd({ negocioId: r.negocioId, titulo: "Valor corrigido", valor: "28.000,00", consumo_medio_kwh: "700" }),
    );
    expect(editado.ok).toBe(true);
    for (let i = 0; i < 2; i++) {
      expect(await atualizarPrecoCalculoComCliente(cliente(vendedor), atual[vendedor.id], r.negocioId)).toEqual({
        ok: false,
        mensagem: MENSAGEM_PRECO_CALCULO_INCOMPLETO,
      });
    }
    expect(await lerCalculo(r.negocioId)).toEqual(antes);
  });

  it("negócio sem cálculo: recusa sem criar nada", async () => {
    const r = await criar(vendedor, novoNegocio());
    expect(await atualizarPrecoCalculoComCliente(cliente(vendedor), atual[vendedor.id], r.negocioId)).toMatchObject({ ok: false });
    expect((await servico.from("calculos_solares").select("id").eq("negocio_id", r.negocioId)).data).toHaveLength(0);
  });
});
