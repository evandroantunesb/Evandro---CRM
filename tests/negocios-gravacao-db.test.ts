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
  salvarKitComCliente,
  type Atual,
} from "@/lib/negocios-gravacao";
import { conferirArquivos } from "@/lib/anexos-servidor";
import { MENSAGEM_REMOCAO_COM_CALCULO, MENSAGEM_REMOCAO_SEM_CONFIRMACAO } from "@/lib/negocio-dados";
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
        "titulo, valor, descricao, status, etapa_id, unidade_consumidora, padrao_cliente, tipo_telhado, estrutura_telhado, consumo_medio_kwh, valor_conta_energia, contatos(id, nome, endereco, cidade, uf, documento)",
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
    valor_conta_energia: n.valor_conta_energia != null ? String(n.valor_conta_energia).replace(".", ",") : "",
    ...mudar,
  });
}

describe("ciclo completo com contato novo", () => {
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
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "", valorFaturaMedio: "300,00", tarifaKwh: "0,95", estruturaTelhado: "gancho", componentes: KIT, observacoes: "", ...extra });
    expect(await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm())).toMatchObject({ ok: true, mensagem: "Kit e cálculo salvos." });
    f = await reabrir(vendedor, r.negocioId);
    expect(f.calculo).toMatchObject({ tarifa_kwh: 0.95, valor_fatura_medio: 300, kit_potencia_kwp: 5.5 });

    // Reabrir e salvar de novo (a tela agora traz o valor da conta salvo no cálculo).
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm())).ok).toBe(true);
    f = await reabrir(vendedor, r.negocioId);
    expect(f.calculo).toMatchObject({ valor_fatura_medio: 300 });
    expect(f.kit).toHaveLength(2);
    expect(f.negocio.estrutura_telhado).toBe("gancho");

    // Sem tarifa com cálculo já salvo: recusa sem mexer em nada.
    const semTarifa = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ tarifaKwh: "", componentes: "[]" }));
    expect(semTarifa.ok).toBe(false);
    expect((await reabrir(vendedor, r.negocioId)).kit).toHaveLength(2);
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

  it("cálculo recusado pelo banco restaura o kit anterior e só então diz que nada mudou", async () => {
    const r = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450" }));
    const kitForm = (extra: Record<string, string>) =>
      fd({ negocioId: r.negocioId, tipoLigacao: "trifasico", consumoMedioKwh: "450", tarifaKwh: "0,95", componentes: KIT, ...extra });
    expect((await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({}))).ok).toBe(true);
    const { data: antes } = await servico.from("kit_componentes").select("id, descricao").eq("negocio_id", r.negocioId).order("ordem");
    const calculoAntes = (await reabrir(vendedor, r.negocioId)).calculo;

    // Tarifa acima do limite da coluna: o cálculo é montado, mas o banco recusa a gravação.
    const outroKit = JSON.stringify([{ tipo: "modulo", descricao: "Módulo 600 W", potenciaW: 600, quantidade: 8 }]);
    const res = await salvarKitComCliente(cliente(vendedor), atual[vendedor.id], kitForm({ tarifaKwh: "100000", componentes: outroKit }));
    expect(res.ok).toBe(false);
    expect(res.mensagem).toContain("Nada foi alterado");
    const { data: depois } = await servico.from("kit_componentes").select("id, descricao").eq("negocio_id", r.negocioId).order("ordem");
    expect(depois).toEqual(antes);
    expect((await reabrir(vendedor, r.negocioId)).calculo).toEqual(calculoAntes);
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

    // Com cálculo associado: recusa mesmo com confirmação e mesmo informando a tarifa.
    const c = await criar(vendedor, novoNegocio({ componentes: KIT, consumo_medio_kwh: "450", tarifa_kwh: "0,95" }));
    const antes = await reabrir(vendedor, c.negocioId);
    expect(antes.calculo).not.toBeNull();
    const tentativas: Record<string, string>[] = [{ confirmarRemocao: "sim" }, { confirmarRemocao: "sim", tarifaKwh: "0,95", consumoMedioKwh: "450" }];
    for (const extra of tentativas) {
      expect(await remover(c.negocioId, extra)).toEqual({ ok: false, mensagem: MENSAGEM_REMOCAO_COM_CALCULO });
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
