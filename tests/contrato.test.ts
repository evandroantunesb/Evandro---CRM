/**
 * Modelo de contrato: variáveis novas com dados já existentes, validação ao salvar,
 * bloqueio de contrato com campo sem resolver ou essencial ausente, atalho "Editar modelo"
 * só para admin, e regressão dos 14 campos que já existiam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLACEHOLDERS_CONTRATO,
  camposSemDado,
  camposUsadosNoModelo,
  contratoProntoParaCliente,
  formatarItensKit,
  marcadoresPendentes,
  montarDadosContrato,
  preencherModeloContrato,
  validarModeloContrato,
  type FontesContrato,
} from "@/lib/contrato";
import { formatarMoeda } from "@/lib/formatacao";
import { EDITAR_MODELO_CONTRATO, pode } from "@/lib/permissoes";

const fontes = (extra: Partial<FontesContrato> = {}): FontesContrato => ({
  empresa: { nome: "Raion Solar", cnpj: "12.345.678/0001-90" },
  negocio: {
    titulo: "Sistema 5 kWp",
    numero: 42,
    valor: 30000,
    unidade_consumidora: "UC-123",
    qualif_distribuidora: "Copel",
    consumo_medio_kwh: 400,
  },
  contato: {
    nome: "Maria Silva",
    documento: "123.456.789-09",
    endereco: "Rua A, 10",
    cidade: "Cascavel",
    uf: "PR",
    email: "maria@exemplo.com",
    telefone: "(45) 99999-0000",
    telefone2: "(45) 98888-0000",
  },
  calculo: { kit_nome: "Kit 5,5", kit_potencia_kwp: 5.5, tipo_ligacao: "bifasico", consumo_medio_kwh: 450, geracao_estimada_kwh_mes: 680 },
  itensKit: [
    { descricao: "Módulo Canadian 550 W", quantidade: 10, potencia_w: 550 },
    { descricao: "Inversor Growatt", quantidade: 1, potencia_w: 5000 },
    { descricao: "  ", quantidade: 3, potencia_w: null },
  ],
  vendedorNome: "Carlos",
  agora: new Date("2026-10-07T15:00:00Z"),
  formatarMoeda: (v) => formatarMoeda(v),
  ...extra,
});

describe("campos disponíveis", () => {
  it("chaves únicas e todas preenchidas por montarDadosContrato", () => {
    const chaves = PLACEHOLDERS_CONTRATO.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(Object.keys(montarDadosContrato(fontes())).sort()).toEqual([...chaves].sort());
  });

  it("regressão: os 14 campos antigos continuam com o mesmo valor", () => {
    const d = montarDadosContrato(fontes());
    expect({
      empresa_nome: d.empresa_nome,
      empresa_cnpj: d.empresa_cnpj,
      cliente_nome: d.cliente_nome,
      cliente_documento: d.cliente_documento,
      cliente_endereco: d.cliente_endereco,
      cliente_cidade: d.cliente_cidade,
      cliente_uf: d.cliente_uf,
      cliente_email: d.cliente_email,
      cliente_telefone: d.cliente_telefone,
      negocio_titulo: d.negocio_titulo,
      negocio_valor: d.negocio_valor,
      kit_nome: d.kit_nome,
      kit_potencia_kwp: d.kit_potencia_kwp,
      data_hoje: d.data_hoje,
    }).toEqual({
      empresa_nome: "Raion Solar",
      empresa_cnpj: "12.345.678/0001-90",
      cliente_nome: "Maria Silva",
      cliente_documento: "123.456.789-09",
      cliente_endereco: "Rua A, 10",
      cliente_cidade: "Cascavel",
      cliente_uf: "PR",
      cliente_email: "maria@exemplo.com",
      cliente_telefone: "(45) 99999-0000",
      negocio_titulo: "Sistema 5 kWp",
      negocio_valor: formatarMoeda(30000),
      kit_nome: "Kit 5,5",
      kit_potencia_kwp: `${(5.5).toLocaleString("pt-BR")} kWp`,
      data_hoje: new Date("2026-10-07T15:00:00Z").toLocaleDateString("pt-BR"),
    });
  });

  it("variáveis novas vêm de dados que já existem", () => {
    const d = montarDadosContrato(fontes());
    expect(d.cliente_telefone2).toBe("(45) 98888-0000");
    expect(d.negocio_numero).toBe("42");
    expect(d.negocio_uc).toBe("UC-123");
    expect(d.distribuidora).toBe("Copel");
    expect(d.vendedor_nome).toBe("Carlos");
    expect(d.tipo_ligacao).toBe("Bifásico");
    expect(d.consumo_medio_kwh).toBe("450 kWh/mês");
    expect(d.geracao_estimada_kwh_mes).toBe("680 kWh/mês");
    expect(d.data_hoje_extenso).toBe("7 de outubro de 2026");
    expect(d.kit_itens).toBe("10 × Módulo Canadian 550 W\n1 × Inversor Growatt (5.000 W)");
  });

  it("sem cálculo: consumo cai para o do negócio; ligação desconhecida fica vazia", () => {
    expect(montarDadosContrato(fontes({ calculo: null })).consumo_medio_kwh).toBe("400 kWh/mês");
    const d = montarDadosContrato(fontes({ calculo: { ...fontes().calculo!, tipo_ligacao: "quadrifasico" } }));
    expect(d.tipo_ligacao).toBe("");
  });

  it("itens do kit ignoram descrição vazia e quantidade inválida", () => {
    expect(formatarItensKit([{ descricao: "Cabo solar", quantidade: 0, potencia_w: null }])).toBe("Cabo solar");
    expect(formatarItensKit([])).toBe("");
  });
});

describe("preenchimento", () => {
  it("troca os campos e marca sem dado com —", () => {
    const d = montarDadosContrato(fontes({ vendedorNome: null }));
    const texto = preencherModeloContrato("{{cliente_nome}} / {{ vendedor_nome }} / {{negocio_valor}}", d);
    expect(texto).toBe(`Maria Silva / — / ${formatarMoeda(30000)}`);
  });
});

describe("validação do modelo ao salvar", () => {
  it("modelo só com campos conhecidos passa (aceita espaços)", () => {
    expect(validarModeloContrato("Contrato {{cliente_nome}} e {{ empresa_nome }}.")).toEqual({ desconhecidos: [], chavesSoltas: false });
  });

  it("recusa campos desconhecidos ou malformados", () => {
    const r = validarModeloContrato("{{cliente_nom}} {{cliente-nome}} {{ }} {{cliente_nome}}");
    expect(r.desconhecidos).toEqual(["{{cliente_nom}}", "{{cliente-nome}}", "{{ }}"]);
  });

  it("detecta chaves sem par", () => {
    expect(validarModeloContrato("Texto {{cliente_nome").chavesSoltas).toBe(true);
    expect(validarModeloContrato("Texto cliente_nome}}").chavesSoltas).toBe(true);
    expect(validarModeloContrato("Texto sem campo").chavesSoltas).toBe(false);
  });

  it("lista os campos usados (só conhecidos, sem repetição)", () => {
    expect(camposUsadosNoModelo("{{cliente_nome}} {{cliente_nome}} {{x}} {{negocio_valor}}").sort()).toEqual(["cliente_nome", "negocio_valor"]);
  });
});

describe("contrato para o cliente", () => {
  it("texto com marcador sobrando não está pronto", () => {
    expect(contratoProntoParaCliente("Tudo certo, Maria.")).toBe(true);
    expect(contratoProntoParaCliente("Cliente {{cliente_nom}}")).toBe(false);
    expect(marcadoresPendentes("{{a}} e {{a}} e {{ b }}")).toEqual(["{{a}}", "{{ b }}"]);
  });

  it("chaves malformadas ou isoladas nunca contam como contrato pronto", () => {
    for (const texto of ["Cliente {{cliente", "Cliente cliente_nome}}", "{{ }}", "{{cliente-nome}}", "Fim }}", "{{{cliente_nome}}}", "a {{ b"]) {
      expect(contratoProntoParaCliente(texto), texto).toBe(false);
    }
  });

  it("modelo antigo com campo desconhecido: o preenchimento deixa o marcador e o contrato é bloqueado", () => {
    const texto = preencherModeloContrato("Cliente {{cliente_nom}}", montarDadosContrato(fontes()));
    expect(contratoProntoParaCliente(texto)).toBe(false);
  });

  it("qualquer campo usado e sem dado bloqueia (inclusive não essencial), na ordem do modelo", () => {
    const d = montarDadosContrato(
      fontes({ contato: { ...fontes().contato!, documento: null, telefone2: "" }, vendedorNome: null, itensKit: [] }),
    );
    expect(camposSemDado("{{cliente_nome}} {{cliente_documento}} {{vendedor_nome}} {{kit_itens}} {{cliente_telefone2}}", d)).toEqual([
      "CPF/CNPJ do cliente",
      "Nome do vendedor responsável",
      "Itens do kit (um por linha)",
      "Segundo telefone do cliente",
    ]);
    expect(camposSemDado("{{cliente_nome}}", d)).toEqual([]);
    const semValor = montarDadosContrato(fontes({ negocio: { ...fontes().negocio, valor: null } }));
    expect(camposSemDado("Valor: {{negocio_valor}}", semValor)).toEqual(["Valor do negócio (R$)"]);
  });

  it("compatibilidade: preencherModeloContrato continua trocando campo vazio por —", () => {
    const d = montarDadosContrato(fontes({ vendedorNome: null }));
    expect(preencherModeloContrato("Vendedor: {{vendedor_nome}}", d)).toBe("Vendedor: —");
  });
});

describe("permissões", () => {
  it("só admin edita o modelo", () => {
    expect(pode("admin", EDITAR_MODELO_CONTRATO)).toBe(true);
    for (const papel of ["gestor", "vendedor", "sdr", "operacao", undefined]) expect(pode(papel, EDITAR_MODELO_CONTRATO)).toBe(false);
  });

  const fonte = (...partes: string[]) => readFileSync(join(__dirname, "..", ...partes), "utf8");

  it("ação de salvar, tela de configuração e atalho usam a lista EDITAR_MODELO_CONTRATO", () => {
    expect(fonte("src", "lib", "acoes", "contratos.ts")).toMatch(/salvarModeloContrato[\s\S]*?exigirPapel\(\.\.\.EDITAR_MODELO_CONTRATO\)/);
    expect(fonte("src", "app", "(app)", "configuracoes", "contrato", "page.tsx")).toContain("exigirPapel(...EDITAR_MODELO_CONTRATO)");
    const aba = fonte("src", "app", "(app)", "propostas-contratos", "page.tsx");
    expect(aba).toContain('pode(atual.papel, EDITAR_MODELO_CONTRATO)');
    expect(aba).toContain('href="/configuracoes/contrato"');
  });

  it("geração e mudança de status checam o contrato antes de chegar ao cliente; página pública também", () => {
    const acoes = fonte("src", "lib", "acoes", "contratos.ts");
    expect(acoes).toMatch(/gerarContrato[\s\S]*?gerarContratoComCliente/);
    expect(acoes).toMatch(/atualizarStatusContrato[\s\S]*?atualizarStatusContratoComCliente/);
    const nucleo = fonte("src", "lib", "contratos-geracao.ts");
    expect(nucleo).toMatch(/gerarContratoComCliente[\s\S]*?validarModeloContrato[\s\S]*?camposSemDado[\s\S]*?contratoProntoParaCliente/);
    expect(nucleo).toMatch(/atualizarStatusContratoComCliente[\s\S]*?contratoProntoParaCliente/);
    expect(fonte("src", "app", "contrato", "[token]", "page.tsx")).toContain("contratoProntoParaCliente(contrato.conteudo)");
  });
});
