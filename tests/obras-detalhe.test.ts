/**
 * Detalhe da obra (somente leitura): extração do snapshot técnico, histórico seguro e a leitura de
 * `carregarDetalheObra` com cliente falso (sem banco). Cobre que `operacao` só lê pela RPC
 * `obras_operacao`, que o comercial lê `obras` sob RLS, que as filhas só são lidas depois de
 * confirmado o acesso (e sempre filtradas por obra e empresa) e que nenhum dado sensível
 * (snapshot bruto, cliente, e-mail, motivos do histórico, ids de membro) chega ao view model.
 */
import { describe, expect, it } from "vitest";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import { montarHistorico, type LinhaHistoricoObra } from "@/lib/obras/historico";
import { MAX_ITENS_KIT, MAX_TEXTO_TECNICO, extrairDadosTecnicos } from "@/lib/obras/tecnico";
import type { SupabaseServidor } from "@/lib/supabase/server";

// --- extrairDadosTecnicos --------------------------------------------------------

const snapshotCompleto = {
  negocio: {
    numero: 77,
    titulo: "TITULO-SECRETO",
    status: "ganho",
    unidade_consumidora: "UC-123",
    distribuidora: "Copel",
    tipo_telhado: "Cerâmico",
    estrutura_telhado: "Madeira",
    padrao_cliente: "PADRAO-COMERCIAL-SECRETO",
    consumo_medio_kwh: 450,
  },
  contrato_status: "CONTRATO-SECRETO",
  cliente: { nome: "Maria Segredo", telefone: "45988887777", documento: "999.888.777-66", email: "maria@segredo.com" },
  calculo: {
    kit_nome: "Kit 5 kWp",
    potencia_kwp: 5.4,
    tipo_ligacao: "bifasico",
    consumo_medio_kwh: 500,
    disponibilidade_kwh: 50,
    produtividade_kwh_kwp_mes: 120,
    geracao_estimada_kwh_mes: 650,
  },
  kit: [
    { tipo: "modulo", descricao: "  Módulo 550W  ", potencia_w: 550, quantidade: 10 },
    { tipo: "inversor", descricao: "Inversor 5 kW", potencia_w: 5000, quantidade: 1 },
    { tipo: "estranho", descricao: "Cabos", potencia_w: null, quantidade: 3 },
  ],
};

describe("extrairDadosTecnicos", () => {
  it("snapshot completo: só os campos permitidos, com rótulos", () => {
    const t = extrairDadosTecnicos(snapshotCompleto);
    expect(t).toEqual({
      kit: [
        { tipo: "Módulo", descricao: "Módulo 550W", potenciaW: 550, quantidade: 10 },
        { tipo: "Inversor", descricao: "Inversor 5 kW", potenciaW: 5000, quantidade: 1 },
        { tipo: "Outro", descricao: "Cabos", potenciaW: null, quantidade: 3 },
      ],
      kitNome: "Kit 5 kWp",
      potenciaKwp: 5.4,
      tipoLigacao: "Bifásico",
      consumoMedioKwh: 500,
      geracaoEstimadaKwhMes: 650,
      distribuidora: "Copel",
      tipoTelhado: "Cerâmico",
      estruturaTelhado: "Madeira",
    });
    expect(Object.keys(t).sort()).toEqual(
      ["consumoMedioKwh", "distribuidora", "estruturaTelhado", "geracaoEstimadaKwhMes", "kit", "kitNome", "potenciaKwp", "tipoLigacao", "tipoTelhado"].sort(),
    );
  });

  it("nunca contém cliente, título do negócio, número do negócio, contrato_status nem padrão do cliente", () => {
    const json = JSON.stringify(extrairDadosTecnicos(snapshotCompleto));
    for (const proibido of ["Maria Segredo", "45988887777", "999.888.777-66", "maria@segredo.com", "TITULO-SECRETO", "CONTRATO-SECRETO", "PADRAO-COMERCIAL-SECRETO", "UC-123", "cliente", "email", "padrao"]) {
      expect(json, proibido).not.toContain(proibido);
    }
  });

  it("consumo cai para o do negócio quando o cálculo não tem", () => {
    const t = extrairDadosTecnicos({ negocio: { consumo_medio_kwh: 450 }, calculo: {} });
    expect(t.consumoMedioKwh).toBe(450);
  });

  it("snapshot que não é objeto devolve tudo nulo/vazio, sem lançar", () => {
    for (const s of [null, undefined, "texto", 42, true, [], [1, 2]]) {
      const t = extrairDadosTecnicos(s);
      expect(t.kit).toEqual([]);
      expect(t.kitNome).toBeNull();
      expect(t.potenciaKwp).toBeNull();
      expect(t.distribuidora).toBeNull();
    }
  });

  it("tipos errados e aninhamentos maliciosos viram nulo ou são ignorados", () => {
    const t = extrairDadosTecnicos({
      negocio: { distribuidora: { nome: "x" }, tipo_telhado: 12, estrutura_telhado: ["a"], padrao_cliente: null, consumo_medio_kwh: "450" },
      calculo: { kit_nome: { a: 1 }, potencia_kwp: "5.4", tipo_ligacao: "inventado", consumo_medio_kwh: NaN, geracao_estimada_kwh_mes: Infinity },
      kit: "não é array",
    });
    expect(t).toEqual({
      kit: [],
      kitNome: null,
      potenciaKwp: null,
      tipoLigacao: null,
      consumoMedioKwh: null,
      geracaoEstimadaKwhMes: null,
      distribuidora: null,
      tipoTelhado: null,
      estruturaTelhado: null,
    });
  });

  it("itens do kit: ignora não-objetos e sem descrição; números como string viram nulo", () => {
    const t = extrairDadosTecnicos({
      kit: [
        null,
        "texto",
        7,
        [1],
        { tipo: "modulo" },
        { tipo: "modulo", descricao: "   " },
        { tipo: "modulo", descricao: { aninhado: "SEGREDO-ANINHADO" } },
        { tipo: { x: 1 }, descricao: "Item ok", potencia_w: "550", quantidade: "10" },
        { tipo: "bateria", descricao: "Bateria", potencia_w: Infinity, quantidade: 2.5 },
        { tipo: "bateria", descricao: "Bateria 2", potencia_w: 100, quantidade: 0 },
        { tipo: "bateria", descricao: "Bateria 3", potencia_w: 100, quantidade: -1 },
      ],
    });
    expect(t.kit).toEqual([
      { tipo: "Outro", descricao: "Item ok", potenciaW: null, quantidade: null },
      { tipo: "Bateria", descricao: "Bateria", potenciaW: null, quantidade: null },
      { tipo: "Bateria", descricao: "Bateria 2", potenciaW: 100, quantidade: null },
      { tipo: "Bateria", descricao: "Bateria 3", potenciaW: 100, quantidade: null },
    ]);
    expect(JSON.stringify(t)).not.toContain("SEGREDO-ANINHADO");
  });

  it("descrição gigante é cortada", () => {
    const t = extrairDadosTecnicos({ kit: [{ tipo: "modulo", descricao: "x".repeat(5000) }], negocio: { distribuidora: "y".repeat(5000) } });
    expect(t.kit[0].descricao).toHaveLength(MAX_TEXTO_TECNICO);
    expect(t.distribuidora).toHaveLength(MAX_TEXTO_TECNICO);
  });

  it("limite de itens do kit", () => {
    const kit = Array.from({ length: 250 }, (_, i) => ({ tipo: "modulo", descricao: `Item ${i}`, potencia_w: 1, quantidade: 1 }));
    const t = extrairDadosTecnicos({ kit });
    expect(t.kit).toHaveLength(MAX_ITENS_KIT);
    expect(MAX_ITENS_KIT).toBe(100);
    expect(t.kit[0].descricao).toBe("Item 0");
  });

  it("__proto__ e chaves herdadas não vazam nem lançam", () => {
    const malicioso = JSON.parse(
      '{"__proto__":{"kit_nome":"HERDADO"},"calculo":{"__proto__":{"kit_nome":"HERDADO2"},"constructor":"x"},"negocio":{"distribuidora":"ok"},"kit":[{"__proto__":{"descricao":"HERDADO3"},"descricao":"Item","tipo":"constructor"}]}',
    );
    const t = extrairDadosTecnicos(malicioso);
    expect(t.kitNome).toBeNull();
    expect(t.distribuidora).toBe("ok");
    expect(t.kit).toEqual([{ tipo: "Outro", descricao: "Item", potenciaW: null, quantidade: null }]);
    const herdado = extrairDadosTecnicos(Object.create({ kit: [{ descricao: "HERDADO4" }], negocio: { distribuidora: "HERDADO5" } }));
    expect(herdado.kit).toEqual([]);
    expect(herdado.distribuidora).toBeNull();
    expect(JSON.stringify([t, herdado])).not.toContain("HERDADO");
  });
});

// --- montarHistorico -------------------------------------------------------------

const nomes = new Map([
  ["m-ana", "Ana"],
  ["m-bia", "Bia"],
]);

const linha = (tipo: string, dados: unknown, extra: Partial<LinhaHistoricoObra> = {}): LinhaHistoricoObra => ({
  created_at: "2026-10-01T10:00:00Z",
  tipo,
  setor: null,
  dados,
  autor_membro_id: "m-ana",
  ...extra,
});

const descricaoDe = (l: LinhaHistoricoObra) => montarHistorico([l], nomes)[0].descricao;

describe("montarHistorico", () => {
  it("obra criada e pagamento", () => {
    const [criada] = montarHistorico([linha("obra_criada", {})], nomes);
    expect(criada).toEqual({ quando: "2026-10-01T10:00:00Z", tipoRotulo: "Obra criada", setorRotulo: null, descricao: "", autor: "Ana" });
    expect(montarHistorico([linha("pagamento_estornado", { motivo: "x" })], nomes)[0].tipoRotulo).toBe("Pagamento estornado");
    expect(montarHistorico([linha("pagamento_reconfirmado", {})], nomes)[0].tipoRotulo).toBe("Pagamento reconfirmado");
  });

  it("venda alterada", () => {
    expect(descricaoDe(linha("venda_alterada", { tecnico: true, comercial: true }))).toBe("Dados técnicos e comerciais da venda mudaram");
    expect(descricaoDe(linha("venda_alterada", { tecnico: true, comercial: false }))).toBe("Dados técnicos da venda mudaram");
    expect(descricaoDe(linha("venda_alterada", { tecnico: false, comercial: true }))).toBe("Dados comerciais da venda mudaram");
    expect(descricaoDe(linha("venda_alterada", { tecnico: "sim" }))).toBe("Dados da venda mudaram");
  });

  it("participantes", () => {
    expect(descricaoDe(linha("participante_atribuido", { membro_id: "m-bia", funcao: "responsavel", principal: true }))).toBe(
      "Bia entrou como responsável principal",
    );
    expect(descricaoDe(linha("participante_atribuido", { membro_id: "m-bia", funcao: "apoio", principal: false }))).toBe("Bia entrou como apoio");
    expect(descricaoDe(linha("participante_atribuido", { membro_id: "m-bia", funcao: "inventada" }))).toBe("Bia entrou como participante");
    expect(descricaoDe(linha("participante_encerrado", { membro_id: "m-bia" }))).toBe("Bia saiu");
    expect(descricaoDe(linha("participante_encerrado", { membro_id: "m-fantasma" }))).toBe("Usuário não identificado saiu");
    expect(descricaoDe(linha("participante_encerrado", {}))).toBe("Usuário não identificado saiu");
  });

  it("fluxo: status, parado, aguardando", () => {
    const f = (dados: unknown, setor: string | null = "compras") => descricaoDe(linha("fluxo_alterado", dados, { setor }));
    expect(f({ campo: "status", de: "a_comprar", para: "cotando" })).toBe("Status: A comprar → Cotando");
    expect(f({ campo: "status", de: "aprovado", para: "concluido" }, "engenharia")).toBe("Status: Aprovado → Concluído");
    expect(f({ campo: "parado", de: { parado: false, motivo: null }, para: { parado: true, motivo: "SEGREDO-MOTIVO" } })).toBe("Marcado como parado");
    expect(f({ campo: "parado", de: { parado: true }, para: { parado: false, motivo: null } })).toBe("Retomado");
    expect(f({ campo: "aguardando", de: null, para: "cliente" })).toBe("Aguardando cliente");
    expect(f({ campo: "aguardando", de: "cliente", para: null })).toBe("Sem aguardar");
  });

  it("fluxo: códigos desconhecidos viram texto neutro, nunca o valor cru", () => {
    const f = (dados: unknown, setor: string | null = "compras") => descricaoDe(linha("fluxo_alterado", dados, { setor }));
    expect(f({ campo: "status", de: "SEGREDO-STATUS", para: "OUTRO-SEGREDO" })).toBe("Status alterado");
    expect(f({ campo: "status", de: "SEGREDO-STATUS", para: "cotando" })).toBe("Status alterado para Cotando");
    // Status de outro setor não é código válido para este setor.
    expect(f({ campo: "status", de: "agendada", para: "cotando" })).toBe("Status alterado para Cotando");
    expect(f({ campo: "status", de: "a_comprar", para: "cotando" }, "comercial")).toBe("Status alterado");
    expect(f({ campo: "status", de: "a_comprar", para: "cotando" }, null)).toBe("Status alterado");
    expect(f({ campo: "parado", para: "SEGREDO-PARADO" })).toBe("Situação de parada alterada");
    expect(f({ campo: "aguardando", para: "SEGREDO-AGUARDANDO" })).toBe("Aguardando alterado");
    expect(f({ campo: "aguardando" })).toBe("Aguardando alterado");
    expect(f({ campo: "SEGREDO-CAMPO" })).toBe("Andamento do setor alterado");
    expect(f(null)).toBe("Andamento do setor alterado");
    expect(f("texto")).toBe("Andamento do setor alterado");
  });

  it("marcos", () => {
    const m = (dados: unknown) => descricaoDe(linha("marco_alterado", dados));
    expect(m({ marco: "nf_cliente", de: { status: "pendente", motivo: null }, para: { status: "concluido", motivo: null } })).toBe(
      "NF do cliente: Pendente → Concluído",
    );
    expect(m({ marco: "garantia", de: { status: "pendente" }, para: { status: "nao_se_aplica", motivo: "SEGREDO-MOTIVO" } })).toBe(
      "Garantia: Pendente → Não se aplica",
    );
    expect(m({ marco: "SEGREDO-MARCO", de: { status: "SEGREDO-S" }, para: { status: "SEGREDO-T" } })).toBe("Marco: alterado");
    expect(m({ marco: "garantia", para: { status: "concluido" } })).toBe("Garantia: alterado para Concluído");
    expect(m(undefined)).toBe("Marco: alterado");
  });

  it("tipo desconhecido: rótulo e texto neutros", () => {
    const [i] = montarHistorico([linha("SEGREDO-TIPO", { x: 1 }, { setor: "SEGREDO-SETOR" })], nomes);
    expect(i.tipoRotulo).toBe("Evento");
    expect(i.setorRotulo).toBeNull();
    expect(i.descricao).toBe("Evento registrado");
    expect(JSON.stringify(i)).not.toContain("SEGREDO");
  });

  it("setor conhecido vira rótulo", () => {
    const itens = montarHistorico([linha("fluxo_alterado", { campo: "parado", para: { parado: true } }, { setor: "engenharia" }), linha("venda_alterada", {}, { setor: "comercial" })], nomes);
    expect(itens.map((i) => i.setorRotulo)).toEqual(["Engenharia", "Comercial"]);
  });

  it("autor: nulo é Sistema; id sem nome é 'Usuário não identificado'", () => {
    const [sistema, desconhecido, conhecido] = montarHistorico(
      [linha("obra_criada", {}, { autor_membro_id: null }), linha("obra_criada", {}, { autor_membro_id: "m-fantasma" }), linha("obra_criada", {})],
      nomes,
    );
    expect(sistema.autor).toBe("Sistema");
    expect(desconhecido.autor).toBe("Usuário não identificado");
    expect(conhecido.autor).toBe("Ana");
  });

  it("motivo, autorização, origem e ids nunca aparecem", () => {
    const dadosCheios = {
      motivo: "SEGREDO-MOTIVO",
      autorizacao: "SEGREDO-AUTORIZACAO",
      origem: "SEGREDO-ORIGEM",
      participante_id: "SEGREDO-PARTICIPANTE-ID",
      substitui_id: "SEGREDO-SUBSTITUI-ID",
      membro_id: "m-bia",
      funcao: "apoio",
      principal: false,
      tecnico: true,
      comercial: true,
      campo: "status",
      de: "a_comprar",
      para: "cotando",
    };
    const linhas = [
      "obra_criada",
      "pagamento_estornado",
      "pagamento_reconfirmado",
      "venda_alterada",
      "participante_atribuido",
      "participante_encerrado",
      "fluxo_alterado",
      "marco_alterado",
      "tipo_novo",
    ].map((tipo) => linha(tipo, dadosCheios, { setor: "compras" }));
    const json = JSON.stringify(montarHistorico(linhas, nomes));
    for (const p of ["SEGREDO", "m-bia", "m-ana", "membro", "participante_id", "motivo", "autorizacao", "origem"]) expect(json, p).not.toContain(p);
  });

  it("ordem: mais recente primeiro, sem alterar a entrada", () => {
    const entrada = [
      linha("obra_criada", {}, { created_at: "2026-10-01T10:00:00Z" }),
      linha("venda_alterada", {}, { created_at: "2026-10-03T10:00:00Z" }),
      linha("pagamento_estornado", {}, { created_at: "2026-10-02T10:00:00Z" }),
    ];
    const itens = montarHistorico(entrada, nomes);
    expect(itens.map((i) => i.tipoRotulo)).toEqual(["Venda alterada", "Pagamento estornado", "Obra criada"]);
    expect(entrada[0].tipo).toBe("obra_criada");
  });
});

// --- carregarDetalheObra com cliente falso ---------------------------------------

type Linha = Record<string, unknown>;
type Chamada = { tipo: "from" | "rpc"; nome: string; filtros: Record<string, unknown>; args?: unknown };

/**
 * Cliente encadeável e "thenable" que registra `.from(tabela)` / `.rpc(nome)` com os filtros
 * aplicados (eq/in/is) e devolve as linhas filtradas. `maybeSingle` devolve a primeira ou null.
 */
function criarFake(dados: { tabelas?: Record<string, Linha[]>; rpcs?: Record<string, Linha[]> }) {
  const chamadas: Chamada[] = [];
  const selects: Record<string, string> = {};
  const from = (tabela: string) => {
    const chamada: Chamada = { tipo: "from", nome: tabela, filtros: {} };
    chamadas.push(chamada);
    let linhas = dados.tabelas?.[tabela] ?? [];
    const q = {
      select: (colunas: string) => {
        selects[tabela] = colunas;
        return q;
      },
      eq: (col: string, valor: unknown) => {
        chamada.filtros[col] = valor;
        linhas = linhas.filter((l) => l[col] === valor);
        return q;
      },
      in: (col: string, valores: unknown[]) => {
        chamada.filtros[col] = valores;
        linhas = linhas.filter((l) => valores.includes(l[col]));
        return q;
      },
      is: (col: string, valor: unknown) => {
        chamada.filtros[col] = valor;
        linhas = linhas.filter((l) => (l[col] ?? null) === valor);
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok, falha),
    };
    return q;
  };
  const rpc = (nome: string, args?: Record<string, unknown>) => {
    chamadas.push({ tipo: "rpc", nome, filtros: {}, args });
    let linhas = dados.rpcs?.[nome] ?? [];
    // `obras_operacao(p_obra_id)` devolve no máximo a obra pedida.
    if (nome === "obras_operacao" && args?.p_obra_id) linhas = linhas.filter((l) => l.obra_id === args.p_obra_id);
    return Promise.resolve({ data: linhas, error: null });
  };
  const nomesChamados = () => chamadas.map((c) => `${c.tipo}:${c.nome}`);
  return { cliente: { from, rpc } as unknown as SupabaseServidor, chamadas, nomesChamados, selects };
}

const EMPRESA = "emp-1";
const OUTRA = "emp-2";
const OBRA = "11111111-1111-4111-8111-111111111111";
const NEGOCIO = "22222222-2222-4222-8222-222222222222";

const snapshotObra = {
  ...snapshotCompleto,
  extra_perigoso: { dado: "SNAPSHOT-EXTRA-SECRETO" },
};

const obraTabela = (extra: Linha = {}): Linha => ({
  id: OBRA,
  empresa_id: EMPRESA,
  numero: 12,
  negocio_id: NEGOCIO,
  cliente_nome: "Cliente Doze",
  cidade: "Cascavel",
  uf: "PR",
  potencia_kwp: 5.4,
  tipo_ligacao: "bifasico",
  unidade_consumidora: "UC-9",
  snapshot: snapshotObra,
  pausada_em: null,
  pausa_motivo: "pausa-motivo-secreto",
  cancelada_em: null,
  cancelamento_motivo: "cancelamento-motivo-secreto",
  alerta_pagamento_estornado_em: null,
  venda_alterada_em: null,
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

const obraRpc = (extra: Linha = {}): Linha => ({
  obra_id: OBRA,
  empresa_id: EMPRESA,
  numero: 12,
  cliente_nome: "Cliente Doze",
  cidade: "Cascavel",
  uf: "PR",
  potencia_kwp: 5.4,
  tipo_ligacao: "bifasico",
  unidade_consumidora: "UC-9",
  snapshot: snapshotObra,
  snapshot_versao: 1,
  pausada_em: null,
  pausa_motivo: null,
  cancelada_em: null,
  cancelamento_motivo: null,
  alerta_pagamento_estornado_em: null,
  venda_alterada_em: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  cliente_endereco: null,
  cliente_telefone: null,
  cliente_telefone2: null,
  cliente_documento: null,
  ...extra,
});

const fluxo = (setor: string, status: string, extra: Linha = {}): Linha => ({
  obra_id: OBRA,
  empresa_id: EMPRESA,
  setor,
  status,
  status_desde: "2026-10-02T12:00:00Z",
  parado: false,
  parado_motivo: null,
  aguardando: null,
  ...extra,
});

const filhas = (): Record<string, Linha[]> => ({
  obra_fluxos: [
    fluxo("compras", "faturado_fornecedor"),
    fluxo("engenharia", "aprovado", { parado: true, parado_motivo: "Falta documento" }),
    fluxo("operacional", "agendada", { aguardando: "cliente" }),
    // Outra obra e outra empresa: nunca devem aparecer.
    { ...fluxo("compras", "cotando"), obra_id: "outra-obra" },
    { ...fluxo("compras", "cotando"), empresa_id: OUTRA },
  ],
  obra_marcos: [
    { obra_id: OBRA, empresa_id: EMPRESA, marco: "nf_cliente", status: "concluido", motivo: "motivo-ignorado-1" },
    { obra_id: OBRA, empresa_id: EMPRESA, marco: "garantia", status: "nao_se_aplica", motivo: "Sem garantia estendida" },
  ],
  obra_participantes: [
    { obra_id: OBRA, empresa_id: EMPRESA, setor: "engenharia", membro_id: "m-ana", funcao: "responsavel", principal: true, fim: null },
    { obra_id: OBRA, empresa_id: EMPRESA, setor: "engenharia", membro_id: "m-bia", funcao: "apoio", principal: false, fim: null },
    { obra_id: OBRA, empresa_id: EMPRESA, setor: "compras", membro_id: "m-caio", funcao: "responsavel", principal: true, fim: "2026-10-02" },
    { obra_id: OBRA, empresa_id: EMPRESA, setor: "comercial", membro_id: "m-dani", funcao: "vendedor", principal: true, fim: null },
    { obra_id: OBRA, empresa_id: EMPRESA, setor: "comercial", membro_id: "m-edu", funcao: "sdr", principal: false, fim: null },
  ],
  obra_historico: [
    {
      obra_id: OBRA,
      empresa_id: EMPRESA,
      setor: "engenharia",
      tipo: "fluxo_alterado",
      dados: { campo: "parado", de: { parado: false }, para: { parado: true, motivo: "HIST-MOTIVO-SECRETO" }, autorizacao: "HIST-AUTORIZACAO-SECRETA" },
      autor_membro_id: "m-ana",
      created_at: "2026-10-03T00:00:00Z",
    },
    { obra_id: OBRA, empresa_id: EMPRESA, setor: null, tipo: "obra_criada", dados: {}, autor_membro_id: null, created_at: "2026-10-01T00:00:00Z" },
  ],
  obra_dados_comerciais: [{ obra_id: OBRA, empresa_id: EMPRESA, valor_vendido: 48500.5 }],
});

const identidades = [
  { membro_id: "m-ana", nome: "Ana", avatar_caminho: "x/ana.png" },
  { membro_id: "m-bia", nome: "Bia", avatar_caminho: "x/bia.png" },
  { membro_id: "m-caio", nome: "Caio", avatar_caminho: "x/caio.png" },
  { membro_id: "m-dani", nome: "Dani", avatar_caminho: "x/dani.png" },
  { membro_id: "m-edu", nome: "Edu", avatar_caminho: "x/edu.png" },
];

const SECUNDARIAS = ["from:obra_fluxos", "from:obra_marcos", "from:obra_participantes", "from:obra_historico", "rpc:identidade_membros"];

const comercial = (extraObra: Linha = {}) =>
  criarFake({ tabelas: { obras: [obraTabela(extraObra)], ...filhas() }, rpcs: { identidade_membros: identidades } });
const operacao = (extraRpc: Linha = {}) =>
  criarFake({ rpcs: { obras_operacao: [obraRpc(extraRpc)], identidade_membros: identidades }, tabelas: filhas() });

describe("carregarDetalheObra: acesso", () => {
  it("id que não é UUID devolve null sem nenhuma chamada", async () => {
    for (const papel of ["admin", "operacao"]) {
      for (const id of ["", "abc", "1", "../../etc", "11111111-1111-4111-8111-11111111111", `${OBRA}x`, "11111111-1111-4111-8111-111111111111; drop"]) {
        const f = comercial();
        expect(await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel, obraId: id })).toBeNull();
        expect(f.chamadas).toEqual([]);
      }
    }
  });

  it("papel sem acesso devolve null sem nenhuma chamada", async () => {
    const f = comercial();
    for (const papel of ["visitante", "", undefined, null]) {
      expect(await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel, obraId: OBRA })).toBeNull();
    }
    expect(f.chamadas).toEqual([]);
  });
});

describe("carregarDetalheObra: operacao", () => {
  it("usa só a RPC obras_operacao; nunca from('obras') nem obra_dados_comerciais", async () => {
    const f = operacao();
    const vm = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA });
    expect(vm).not.toBeNull();
    const nomes = f.nomesChamados();
    expect(nomes[0]).toBe("rpc:obras_operacao");
    expect(f.chamadas[0].args).toEqual({ p_obra_id: OBRA });
    expect(nomes).not.toContain("from:obras");
    expect(nomes).not.toContain("from:obra_dados_comerciais");
    expect(nomes).not.toContain("rpc:obras_operacao_lista");
    expect(nomes.slice(1).sort()).toEqual([...SECUNDARIAS].sort());
    expect(vm?.valorVendido).toBeNull();
    expect(vm?.resumo.negocioId).toBeNull();
  });

  it("RPC vazia devolve null e nenhuma consulta secundária", async () => {
    const f = criarFake({ rpcs: { obras_operacao: [], identidade_membros: identidades }, tabelas: filhas() });
    expect(await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA })).toBeNull();
    expect(f.nomesChamados()).toEqual(["rpc:obras_operacao"]);
  });

  it("linha de outra empresa devolve null sem secundárias", async () => {
    const f = operacao({ empresa_id: OUTRA });
    expect(await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA })).toBeNull();
    expect(f.nomesChamados()).toEqual(["rpc:obras_operacao"]);
  });

  it("contato só com os campos não nulos da RPC", async () => {
    const f = operacao({ cliente_endereco: "Rua A, 10", cliente_telefone: "45999990000", cliente_telefone2: null, cliente_documento: null });
    const vm = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA });
    expect(vm?.contatoCliente).toEqual({ endereco: "Rua A, 10", telefone: "45999990000", telefone2: null, documento: null });
  });

  it("sem nenhum campo de contato, contatoCliente é null", async () => {
    const vm = await carregarDetalheObra(operacao().cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA });
    expect(vm?.contatoCliente).toBeNull();
  });

  it("vê vendedor e SDR da obra (decisão: Operação sabe com quem falar no Comercial), só nome e função", async () => {
    const vm = await carregarDetalheObra(operacao().cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA });
    expect(vm?.participantesComerciais).toEqual([
      { nome: "Dani", funcaoRotulo: expect.any(String), principal: true },
      { nome: "Edu", funcaoRotulo: expect.any(String), principal: false },
    ]);
    const json = JSON.stringify(vm?.participantesComerciais);
    for (const proibido of ["m-dani", "m-edu", "avatar", "dani.png"]) expect(json, proibido).not.toContain(proibido);
  });

  it("linha da RPC com outro obra_id não vale", async () => {
    const outraObra = "33333333-3333-4333-8333-333333333333";
    const cliente = { rpc: () => Promise.resolve({ data: [obraRpc({ obra_id: outraObra })], error: null }) } as unknown as SupabaseServidor;
    expect(await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA })).toBeNull();
  });
});

describe("carregarDetalheObra: papéis comerciais", () => {
  it.each(["admin", "gestor", "vendedor", "sdr"])("%s lê from('obras') sob RLS, com colunas explícitas, e nunca chama obras_operacao", async (papel) => {
    const f = comercial();
    const vm = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel, obraId: OBRA });
    expect(vm?.resumo.id).toBe(OBRA);
    expect(f.nomesChamados()).not.toContain("rpc:obras_operacao");
    const obras = f.chamadas.find((c) => c.nome === "obras");
    expect(obras?.filtros).toEqual({ id: OBRA, empresa_id: EMPRESA });
    expect(f.selects.obras).not.toMatch(/\*/);
    expect(f.selects.obras).toMatch(/negocio_id/);
    expect(f.selects.obras).toMatch(/snapshot/);
    expect(vm?.contatoCliente).toBeNull();
    if (papel !== "sdr") expect(vm?.resumo.negocioId).toBe(NEGOCIO);
  });

  it("SDR vê a obra, mas sem o link do negócio (negocioId null); admin, gestor e vendedor têm o link", async () => {
    const sdr = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel: "sdr", obraId: OBRA });
    expect(sdr?.resumo.id).toBe(OBRA);
    expect(sdr?.resumo.negocioId).toBeNull();
    expect(JSON.stringify(sdr)).not.toContain(NEGOCIO);
    for (const papel of ["admin", "gestor", "vendedor"]) {
      const vm = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel, obraId: OBRA });
      expect(vm?.resumo.negocioId, papel).toBe(NEGOCIO);
    }
  });

  it("obra inexistente ou inacessível devolve null e nenhuma consulta secundária", async () => {
    const vazio = criarFake({ tabelas: { obras: [], ...filhas() }, rpcs: { identidade_membros: identidades } });
    expect(await carregarDetalheObra(vazio.cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA })).toBeNull();
    expect(vazio.nomesChamados()).toEqual(["from:obras"]);

    // Obra de outra empresa: o filtro por empresa_id não a encontra.
    const outra = comercial({ empresa_id: OUTRA });
    expect(await carregarDetalheObra(outra.cliente, { empresaId: EMPRESA, papel: "vendedor", obraId: OBRA })).toBeNull();
    expect(outra.nomesChamados()).toEqual(["from:obras"]);
  });

  it("todas as secundárias são filtradas por obra_id e empresa_id", async () => {
    const f = comercial();
    await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    for (const tabela of ["obra_fluxos", "obra_marcos", "obra_participantes", "obra_historico", "obra_dados_comerciais"]) {
      const c = f.chamadas.find((x) => x.nome === tabela);
      expect(c, tabela).toBeDefined();
      expect(c?.filtros.obra_id, tabela).toBe(OBRA);
      expect(c?.filtros.empresa_id, tabela).toBe(EMPRESA);
    }
    // Só participantes ativos.
    expect(f.chamadas.find((x) => x.nome === "obra_participantes")?.filtros.fim).toBeNull();
    const identidade = f.chamadas.find((x) => x.nome === "identidade_membros");
    expect(identidade?.args).toEqual({ p_empresa_id: EMPRESA });
    // O acesso é confirmado antes de qualquer secundária.
    expect(f.chamadas[0].nome).toBe("obras");
  });

  it("valor vendido da RLS aparece; sem linha, fica null", async () => {
    const com = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    expect(com?.valorVendido).toBe(48500.5);

    const f = criarFake({ tabelas: { obras: [obraTabela()], ...filhas(), obra_dados_comerciais: [] }, rpcs: { identidade_membros: identidades } });
    const sem = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "sdr", obraId: OBRA });
    expect(sem?.valorVendido).toBeNull();
  });
});

describe("carregarDetalheObra: view model", () => {
  it("monta resumo, setores, marcos, participantes, técnico e histórico", async () => {
    const vm = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    if (!vm) throw new Error("esperava a obra");

    expect(vm.resumo).toEqual({
      id: OBRA,
      numero: 12,
      clienteNome: "Cliente Doze",
      cidade: "Cascavel",
      uf: "PR",
      potenciaKwp: 5.4,
      tipoLigacao: "Bifásico",
      unidadeConsumidora: "UC-9",
      situacao: "em_andamento",
      alertas: ["parado", "aguardando"],
      pausaMotivo: null,
      cancelamentoMotivo: null,
      criadaEm: "2026-10-01T00:00:00Z",
      negocioId: NEGOCIO,
    });

    expect(vm.setores.map((s) => s.setor)).toEqual(["compras", "engenharia", "operacional"]);
    expect(vm.setores.map((s) => s.statusRotulo)).toEqual(["Faturado pelo fornecedor", "Aprovado", "Agendada"]);
    expect(vm.setores.map((s) => s.estado)).toEqual(["concluido", "parado", "aguardando"]);
    expect(vm.setores.map((s) => s.paradoMotivo)).toEqual([null, "Falta documento", null]);
    expect(vm.setores[2].aguardando).toBe("Aguardando cliente");
    expect(vm.setores[1].statusDesde).toBe("2026-10-02T12:00:00Z");
    // Só participantes ativos, principal primeiro; Caio (encerrado) fora.
    expect(vm.setores[1].participantes).toEqual([
      { nome: "Ana", funcaoRotulo: "Responsável", principal: true },
      { nome: "Bia", funcaoRotulo: "Apoio", principal: false },
    ]);
    expect(vm.setores[0].participantes).toEqual([]);
    expect(vm.participantesComerciais).toEqual([
      { nome: "Dani", funcaoRotulo: "Vendedor", principal: true },
      { nome: "Edu", funcaoRotulo: "SDR", principal: false },
    ]);

    expect(vm.marcos).toEqual([
      { marco: "nf_cliente", rotulo: "NF do cliente", status: "concluido", statusRotulo: "Concluído", motivo: null },
      { marco: "garantia", rotulo: "Garantia", status: "nao_se_aplica", statusRotulo: "Não se aplica", motivo: "Sem garantia estendida" },
    ]);

    expect(vm.tecnico.kitNome).toBe("Kit 5 kWp");
    expect(vm.tecnico.kit).toHaveLength(3);
    expect(vm.historico.map((h) => h.descricao)).toEqual(["Marcado como parado", ""]);
    expect(vm.historico.map((h) => h.autor)).toEqual(["Ana", "Sistema"]);
  });

  it("marcos ausentes aparecem como 'Sem informação'; obra concluída exige os 2 marcos", async () => {
    const tabelas = filhas();
    tabelas.obra_marcos = [];
    tabelas.obra_fluxos = [fluxo("compras", "faturado_fornecedor"), fluxo("engenharia", "concluido"), fluxo("operacional", "concluido")];
    const f = criarFake({ tabelas: { obras: [obraTabela()], ...tabelas }, rpcs: { identidade_membros: identidades } });
    const vm = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "gestor", obraId: OBRA });
    expect(vm?.marcos.map((m) => [m.marco, m.statusRotulo, m.motivo])).toEqual([
      ["nf_cliente", "Sem informação", null],
      ["garantia", "Sem informação", null],
    ]);
    expect(vm?.resumo.situacao).toBe("em_andamento");
  });

  it("setor sem fluxo gravado: 'Sem informação'", async () => {
    const tabelas = filhas();
    tabelas.obra_fluxos = [];
    const f = criarFake({ tabelas: { obras: [obraTabela()], ...tabelas }, rpcs: { identidade_membros: identidades } });
    const vm = await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    expect(vm?.setores.map((s) => [s.status, s.statusRotulo, s.estado])).toEqual([
      [null, "Sem informação", "em_andamento"],
      [null, "Sem informação", "em_andamento"],
      [null, "Sem informação", "em_andamento"],
    ]);
  });

  it("motivo de pausa só se pausada; de cancelamento só se cancelada", async () => {
    const normal = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    expect(normal?.resumo.pausaMotivo).toBeNull();
    expect(normal?.resumo.cancelamentoMotivo).toBeNull();

    const pausada = await carregarDetalheObra(comercial({ pausada_em: "2026-10-04T00:00:00Z" }).cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    expect(pausada?.resumo.situacao).toBe("pausada");
    expect(pausada?.resumo.pausaMotivo).toBe("pausa-motivo-secreto");
    expect(pausada?.resumo.cancelamentoMotivo).toBeNull();

    const cancelada = await carregarDetalheObra(comercial({ cancelada_em: "2026-10-05T00:00:00Z" }).cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    expect(cancelada?.resumo.situacao).toBe("cancelada");
    expect(cancelada?.resumo.cancelamentoMotivo).toBe("cancelamento-motivo-secreto");
    expect(cancelada?.resumo.pausaMotivo).toBeNull();
  });

  it("nenhum VM carrega percentual, progresso, SLA, atraso ou dias", async () => {
    const vm = await carregarDetalheObra(comercial().cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA });
    if (!vm) throw new Error("esperava a obra");
    const chaves = [...Object.keys(vm), ...Object.keys(vm.resumo), ...Object.keys(vm.setores[0]), ...Object.keys(vm.marcos[0])];
    for (const chave of chaves) expect(chave).not.toMatch(/percent|progresso|sla|atraso|dias|semaforo|cor/i);
  });

  it("o payload não contém snapshot bruto, cliente, e-mail, motivos do histórico nem ids de membro (comercial e operacao)", async () => {
    const proibidos = [
      "snapshot",
      "SNAPSHOT-EXTRA-SECRETO",
      "extra_perigoso",
      "Maria Segredo",
      "45988887777",
      "999.888.777-66",
      "maria@segredo.com",
      "TITULO-SECRETO",
      "CONTRATO-SECRETO",
      "HIST-MOTIVO-SECRETO",
      "HIST-AUTORIZACAO-SECRETA",
      "motivo-ignorado-1",
      "m-ana",
      "m-bia",
      "m-caio",
      "m-dani",
      "membro_id",
      "membroId",
      "avatar",
      "x/ana.png",
    ];
    for (const [f, papel] of [
      [comercial({ pausada_em: null }), "admin"],
      [operacao(), "operacao"],
    ] as const) {
      const json = JSON.stringify(await carregarDetalheObra(f.cliente, { empresaId: EMPRESA, papel, obraId: OBRA }));
      for (const p of proibidos) expect(json, `${papel}: ${p}`).not.toContain(p);
      expect(json).toContain("Cliente Doze");
      expect(json).toContain("Ana");
      expect(json).toContain("Kit 5 kWp");
    }
  });

  it("erro de consulta é lançado", async () => {
    const f = comercial();
    const quebrado = {
      from: (t: string) => (t === "obra_fluxos" ? { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: new Error("falhou") }) }) }) } : (f.cliente as unknown as { from: (t: string) => unknown }).from(t)),
      rpc: (n: string, a: unknown) => (f.cliente as unknown as { rpc: (n: string, a: unknown) => unknown }).rpc(n, a),
    } as unknown as SupabaseServidor;
    await expect(carregarDetalheObra(quebrado, { empresaId: EMPRESA, papel: "admin", obraId: OBRA })).rejects.toThrow("falhou");
  });
});
