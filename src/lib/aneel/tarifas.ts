/**
 * Leitura e validação dos dados abertos de tarifas da ANEEL (preparação do catálogo tarifário, M2-1).
 *
 * Funções puras: não acessam rede, banco nem arquivo. Recebem as linhas do CSV (o chamador pode ler
 * em streaming, linha a linha) e devolvem registros normalizados + um relatório de portões. Qualquer
 * portão reprovado torna a carga inválida: o catálogo aprovado anterior continua valendo.
 *
 * Fontes (licença ODbL, atribuição à ANEEL):
 * - "Tarifas de aplicação das distribuidoras" (TE e TUSD): conjunto `tarifas-distribuidoras-energia-eletrica`.
 * - "Componentes tarifárias" (inclui `TUSD_FioB`): conjunto `componentes-tarifarias`, um arquivo por ano.
 *
 * Só "Tarifa de Aplicação" (a usada no faturamento, segundo o dicionário da ANEEL). Linhas `SCEE`,
 * modalidades especiais e subclasses fora do escopo são contadas, nunca interpretadas.
 */

export type Conjunto = "tarifas" | "componentes";

/** Cabeçalhos exatos publicados pela ANEEL (qualquer mudança reprova a carga). */
export const CABECALHOS: Record<Conjunto, readonly string[]> = {
  tarifas: [
    "DatGeracaoConjuntoDados", "DscREH", "SigAgente", "NumCNPJDistribuidora", "DatInicioVigencia", "DatFimVigencia",
    "DscBaseTarifaria", "DscSubGrupo", "DscModalidadeTarifaria", "DscClasse", "DscSubClasse", "DscDetalhe",
    "NomPostoTarifario", "DscUnidadeTerciaria", "SigAgenteAcessante", "VlrTUSD", "VlrTE",
  ],
  componentes: [
    "DatGeracaoConjuntoDados", "DscResolucaoHomologatoria", "SigNomeAgente", "NumCPFCNPJ", "DatInicioVigencia",
    "DatFimVigencia", "DscBaseTarifaria", "DscSubGrupoTarifario", "DscModalidadeTarifaria", "DscClasseConsumidor",
    "DscSubClasseConsumidor", "DscDetalheConsumidor", "DscPostoTarifario", "DscUnidade", "SigNomeAgenteAcessante",
    "DscComponenteTarifario", "VlrComponenteTarifario",
  ],
};

/** Combinações tarifárias atendidas. B2 rural fica preparado e desligado até validar as particularidades. */
export type Escopo = {
  id: string;
  subgrupo: string;
  modalidade: string;
  classe: string;
  subclasse: string;
};

export const ESCOPO_INICIAL: readonly Escopo[] = [
  { id: "B1_RESIDENCIAL_CONVENCIONAL", subgrupo: "B1", modalidade: "Convencional", classe: "Residencial", subclasse: "Residencial" },
  // A ANEEL não separa o comercial dentro do B3: a tarifa B3 ("demais classes") vem com classe "Não se aplica".
  { id: "B3_DEMAIS_CLASSES_CONVENCIONAL", subgrupo: "B3", modalidade: "Convencional", classe: "Não se aplica", subclasse: "Não se aplica" },
];

export const ESCOPO_B2_RURAL: Escopo = {
  id: "B2_RURAL_CONVENCIONAL", subgrupo: "B2", modalidade: "Convencional", classe: "Rural", subclasse: "Não se aplica",
};

export const COMPONENTES = ["TE", "TUSD", "TUSD_FioB"] as const;
export type Componente = (typeof COMPONENTES)[number];

export type RegistroTarifario = {
  conjunto: Conjunto;
  escopo: string;
  cnpj: string;
  agente: string;
  resolucao: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  componente: Componente;
  /** Valor como publicado, em R$/MWh. */
  valorMwh: number;
  /** R$/kWh = R$/MWh ÷ 1.000 (arredondado em 9 casas para evitar ruído de ponto flutuante). */
  valorKwh: number;
};

export type Portao = { id: string; ok: boolean; detalhes: string[] };

export type ResultadoLeitura = {
  registros: RegistroTarifario[];
  portoes: Portao[];
  /** Todos os portões aprovados. */
  valida: boolean;
  contagens: {
    linhas: number;
    noEscopo: number;
    duplicadasIdenticas: number;
    foraDoEscopo: number;
    scceIgnoradas: number;
  };
};

const LIMITE_DETALHES = 20;

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

/**
 * Separa uma linha `"a";"b";"c"` (aspas duplas, separador `;`, aspas internas dobradas).
 * Também aceita campo sem aspas. Devolve null se as aspas não fecharem (linha malformada ou cortada).
 */
export function separarLinha(linha: string): string[] | null {
  const campos: string[] = [];
  let i = 0;
  const n = linha.length;
  while (true) {
    let valor = "";
    if (linha[i] === '"') {
      i++;
      let fechou = false;
      while (i < n) {
        if (linha[i] === '"') {
          if (linha[i + 1] === '"') {
            valor += '"';
            i += 2;
            continue;
          }
          i++;
          fechou = true;
          break;
        }
        valor += linha[i++];
      }
      if (!fechou) return null;
      if (i < n && linha[i] !== ";") return null;
    } else {
      while (i < n && linha[i] !== ";") valor += linha[i++];
    }
    campos.push(valor);
    if (i >= n) return campos;
    i++; // pula o ";"
  }
}

/**
 * Número no formato da ANEEL: vírgula decimal, sem separador de milhar, parte inteira opcional
 * (",00" = 0, "-,51" = -0,51). Vazio, ponto, espaço interno ou texto devolvem null.
 */
export function lerNumeroAneel(texto: string): number | null {
  const t = texto.trim();
  if (!/^-?\d*(,\d+)?$/.test(t) || t === "" || t === "-") return null;
  // ",51" vira ".51" e "-,51" vira "-.51": formas que Number() lê corretamente.
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** CNPJ com 14 dígitos e dígitos verificadores válidos (rejeita sequências repetidas). */
export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Data ISO `AAAA-MM-DD` que existe no calendário. */
export function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

/** Integridade do arquivo baixado: tamanho igual ao anunciado e última linha completa. */
export function verificarIntegridadeArquivo(info: {
  bytesRecebidos: number;
  contentLength: number | null;
  terminaComQuebraDeLinha: boolean;
}): Portao {
  const detalhes: string[] = [];
  if (info.contentLength == null) detalhes.push("servidor não informou o tamanho (Content-Length): integridade não comprovável");
  else if (info.bytesRecebidos !== info.contentLength) {
    detalhes.push(`arquivo incompleto: ${info.bytesRecebidos} de ${info.contentLength} bytes`);
  }
  if (!info.terminaComQuebraDeLinha) detalhes.push("última linha sem quebra de linha: arquivo possivelmente cortado");
  return { id: "integridade", ok: detalhes.length === 0, detalhes };
}

const arredondar9 = (v: number) => Math.round(v * 1e9) / 1e9;

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

type Campos = {
  agente: string; cnpj: string; resolucao: string; inicio: string; fim: string; base: string; subgrupo: string;
  modalidade: string; classe: string; subclasse: string; detalhe: string; posto: string; unidade: string;
  valores: { componente: string; texto: string }[];
};

function extrair(conjunto: Conjunto, c: string[]): Campos {
  if (conjunto === "tarifas") {
    return {
      resolucao: c[1], agente: c[2], cnpj: c[3], inicio: c[4], fim: c[5], base: c[6], subgrupo: c[7], modalidade: c[8],
      classe: c[9], subclasse: c[10], detalhe: c[11], posto: c[12], unidade: c[13],
      valores: [{ componente: "TUSD", texto: c[15] }, { componente: "TE", texto: c[16] }],
    };
  }
  return {
    resolucao: c[1], agente: c[2], cnpj: c[3], inicio: c[4], fim: c[5], base: c[6], subgrupo: c[7], modalidade: c[8],
    classe: c[9], subclasse: c[10], detalhe: c[11], posto: c[12], unidade: c[13],
    valores: [{ componente: c[15], texto: c[16] }],
  };
}

/** Unidade de energia publicada: "MWh" no conjunto de tarifas, "R$/MWh" no de componentes. */
const unidadeEnergia = (conjunto: Conjunto, unidade: string) => (conjunto === "tarifas" ? unidade === "MWh" : unidade === "R$/MWh");

/**
 * Lê as linhas de um arquivo (cabeçalho na primeira) e aplica os portões linha a linha.
 * `escopos` define o que entra no catálogo; o resto é contado como fora do escopo.
 */
export function lerArquivoAneel(
  conjunto: Conjunto,
  linhas: Iterable<string>,
  escopos: readonly Escopo[] = ESCOPO_INICIAL,
): ResultadoLeitura {
  const falhas = {
    cabecalho: [] as string[],
    estrutura: [] as string[],
    cnpj: [] as string[],
    unidades: [] as string[],
    valores: [] as string[],
    vigencia: [] as string[],
    duplicidades: [] as string[],
  };
  const anotar = (lista: string[], msg: string) => {
    if (lista.length < LIMITE_DETALHES) lista.push(msg);
    else if (lista.length === LIMITE_DETALHES) lista.push("… (mais ocorrências omitidas)");
  };

  const registros: RegistroTarifario[] = [];
  const vistos = new Map<string, number>(); // chave completa (com vigência) -> valor
  const contagens = { linhas: 0, noEscopo: 0, duplicadasIdenticas: 0, foraDoEscopo: 0, scceIgnoradas: 0 };
  const esperado = CABECALHOS[conjunto];
  let cabecalhoLido = false;
  let numeroLinha = 0;

  for (const bruta of linhas) {
    numeroLinha++;
    // Variações de formatação aceitas sem mudar o conteúdo: BOM no início e CR no fim da linha.
    const linha = (numeroLinha === 1 ? bruta.replace(/^﻿/, "") : bruta).replace(/\r$/, "");
    if (linha === "") continue;

    if (!cabecalhoLido) {
      cabecalhoLido = true;
      const cab = separarLinha(linha);
      if (!cab || cab.length !== esperado.length || cab.some((c, i) => c !== esperado[i])) {
        anotar(falhas.cabecalho, `cabeçalho diferente do esperado para "${conjunto}"`);
        break; // formato mudou: não interpretar nada
      }
      continue;
    }

    contagens.linhas++;
    const campos = separarLinha(linha);
    if (!campos || campos.length !== esperado.length) {
      anotar(falhas.estrutura, `linha ${numeroLinha}: ${campos ? `${campos.length} colunas` : "aspas sem fechamento"}`);
      continue;
    }
    const f = extrair(conjunto, campos);

    if (f.base !== "Tarifa de Aplicação") {
      contagens.foraDoEscopo++;
      continue;
    }
    if (f.detalhe === "SCEE") {
      contagens.scceIgnoradas++;
      continue;
    }
    const escopo = escopos.find(
      (e) => e.subgrupo === f.subgrupo && e.modalidade === f.modalidade && e.classe === f.classe && e.subclasse === f.subclasse,
    );
    if (!escopo || f.detalhe !== "Não se aplica" || f.posto !== "Não se aplica") {
      contagens.foraDoEscopo++;
      continue;
    }

    if (!cnpjValido(f.cnpj)) anotar(falhas.cnpj, `linha ${numeroLinha}: CNPJ inválido "${f.cnpj}" (${f.agente})`);
    if (!unidadeEnergia(conjunto, f.unidade)) anotar(falhas.unidades, `linha ${numeroLinha}: unidade inesperada "${f.unidade}"`);
    if (!dataValida(f.inicio) || !dataValida(f.fim)) {
      anotar(falhas.vigencia, `linha ${numeroLinha}: data de vigência inválida (${f.inicio} → ${f.fim})`);
    } else if (f.fim < f.inicio) {
      anotar(falhas.vigencia, `linha ${numeroLinha}: fim da vigência antes do início (${f.inicio} → ${f.fim})`);
    }

    for (const { componente, texto } of f.valores) {
      if (!(COMPONENTES as readonly string[]).includes(componente)) continue; // outras componentes: fora do catálogo
      const valor = lerNumeroAneel(texto);
      if (valor == null) {
        anotar(falhas.valores, `linha ${numeroLinha}: ${componente} com valor ilegível "${texto}"`);
        continue;
      }
      if (valor < 0) {
        anotar(falhas.valores, `linha ${numeroLinha}: ${componente} negativo (${texto}) em tarifa de aplicação`);
        continue;
      }
      const chave = [conjunto, f.cnpj, escopo.id, componente, f.inicio, f.fim].join("|");
      const anterior = vistos.get(chave);
      if (anterior !== undefined) {
        if (anterior === valor) contagens.duplicadasIdenticas++;
        else anotar(falhas.duplicidades, `${f.agente} ${componente} ${f.inicio}: valores conflitantes (${anterior} e ${valor})`);
        continue;
      }
      vistos.set(chave, valor);
      contagens.noEscopo++;
      registros.push({
        conjunto, escopo: escopo.id, cnpj: f.cnpj, agente: f.agente, resolucao: f.resolucao,
        vigenciaInicio: f.inicio, vigenciaFim: f.fim, componente: componente as Componente,
        valorMwh: valor, valorKwh: arredondar9(valor / 1000),
      });
    }
  }

  if (!cabecalhoLido) falhas.cabecalho.push("arquivo vazio");

  // Vigências sobrepostas para a mesma distribuidora, escopo e componente.
  const porChave = new Map<string, RegistroTarifario[]>();
  for (const r of registros) {
    const k = [r.cnpj, r.escopo, r.componente].join("|");
    porChave.set(k, [...(porChave.get(k) ?? []), r]);
  }
  for (const lista of porChave.values()) {
    const ordenada = [...lista].sort((a, b) => a.vigenciaInicio.localeCompare(b.vigenciaInicio));
    for (let i = 1; i < ordenada.length; i++) {
      if (ordenada[i].vigenciaInicio <= ordenada[i - 1].vigenciaFim) {
        anotar(
          falhas.vigencia,
          `${ordenada[i].agente} ${ordenada[i].componente}: vigências sobrepostas (${ordenada[i - 1].vigenciaInicio}→${ordenada[i - 1].vigenciaFim} e ${ordenada[i].vigenciaInicio}→${ordenada[i].vigenciaFim})`,
        );
      }
    }
  }

  const portoes: Portao[] = Object.entries(falhas).map(([id, detalhes]) => ({ id, ok: detalhes.length === 0, detalhes }));
  return { registros, portoes, valida: portoes.every((p) => p.ok), contagens };
}

// ---------------------------------------------------------------------------
// Cobertura e consistência entre os dois conjuntos
// ---------------------------------------------------------------------------

const vigenteEm = (r: RegistroTarifario, data: string) => r.vigenciaInicio <= data && r.vigenciaFim >= data;

/**
 * Para cada distribuidora e escopo com vigência cobrindo `data`, exige TE e TUSD (conjunto de tarifas) e
 * `TUSD_FioB` > 0 (conjunto de componentes), e confere TE/TUSD iguais nos dois conjuntos (tolerância em R$/MWh).
 * Faltas viram pendência listada (a distribuidora precisará de valor manual justificado), nunca valor inventado.
 */
export function verificarCobertura(
  tarifas: RegistroTarifario[],
  componentes: RegistroTarifario[],
  data: string,
  toleranciaMwh = 0.01,
): { cobertura: Portao; consistencia: Portao } {
  const chave = (r: RegistroTarifario) => `${r.cnpj}|${r.escopo}`;
  const atuais = (lista: RegistroTarifario[]) => {
    const m = new Map<string, Map<Componente, RegistroTarifario>>();
    for (const r of lista.filter((x) => vigenteEm(x, data))) {
      const porComp = m.get(chave(r)) ?? new Map();
      porComp.set(r.componente, r);
      m.set(chave(r), porComp);
    }
    return m;
  };
  const t = atuais(tarifas);
  const c = atuais(componentes);
  const faltas: string[] = [];
  const divergencias: string[] = [];

  for (const [k, compsTarifas] of t) {
    const nome = [...compsTarifas.values()][0].agente;
    const escopo = k.split("|")[1];
    for (const comp of ["TE", "TUSD"] as const) if (!compsTarifas.has(comp)) faltas.push(`${nome} ${escopo}: sem ${comp} vigente`);
    const compsComponentes = c.get(k);
    const fioB = compsComponentes?.get("TUSD_FioB");
    if (!fioB || fioB.valorMwh <= 0) faltas.push(`${nome} ${escopo}: sem TUSD Fio B utilizável (exigirá valor manual justificado)`);
    for (const comp of ["TE", "TUSD"] as const) {
      const a = compsTarifas.get(comp);
      const b = compsComponentes?.get(comp);
      if (a && b && Math.abs(a.valorMwh - b.valorMwh) > toleranciaMwh) {
        divergencias.push(`${nome} ${escopo} ${comp}: ${a.valorMwh} (tarifas) × ${b.valorMwh} (componentes)`);
      }
    }
  }
  return {
    cobertura: { id: "cobertura", ok: faltas.length === 0, detalhes: faltas },
    consistencia: { id: "consistencia_entre_conjuntos", ok: divergencias.length === 0, detalhes: divergencias },
  };
}

// ---------------------------------------------------------------------------
// Comparação com o catálogo aprovado
// ---------------------------------------------------------------------------

export type Diferencas = {
  novas: RegistroTarifario[];
  alteradas: { antes: RegistroTarifario; depois: RegistroTarifario }[];
  removidas: RegistroTarifario[];
  zeradas: RegistroTarifario[];
};

/**
 * Compara a carga nova com o catálogo aprovado. Vigência já publicada não pode mudar nem sumir, e valor
 * válido não pode virar zero: qualquer um desses casos reprova o portão `regressoes` (exige revisão humana).
 * Vigências novas entram em `novas` (é o caso normal de um reajuste).
 */
export function compararComAprovado(aprovado: RegistroTarifario[], novo: RegistroTarifario[]): { diferencas: Diferencas; regressoes: Portao } {
  const k = (r: RegistroTarifario) => [r.conjunto, r.cnpj, r.escopo, r.componente, r.vigenciaInicio, r.vigenciaFim].join("|");
  const antes = new Map(aprovado.map((r) => [k(r), r]));
  const depois = new Map(novo.map((r) => [k(r), r]));
  const diferencas: Diferencas = { novas: [], alteradas: [], removidas: [], zeradas: [] };

  for (const [chave, r] of depois) {
    const a = antes.get(chave);
    if (!a) diferencas.novas.push(r);
    else if (a.valorMwh !== r.valorMwh) {
      if (r.valorMwh === 0 && a.valorMwh > 0) diferencas.zeradas.push(r);
      else diferencas.alteradas.push({ antes: a, depois: r });
    }
  }
  for (const [chave, r] of antes) if (!depois.has(chave)) diferencas.removidas.push(r);

  const detalhes = [
    ...diferencas.removidas.map((r) => `removida: ${r.agente} ${r.componente} ${r.vigenciaInicio}`),
    ...diferencas.zeradas.map((r) => `zerada: ${r.agente} ${r.componente} ${r.vigenciaInicio}`),
    ...diferencas.alteradas.map((d) => `vigência já publicada alterada: ${d.depois.agente} ${d.depois.componente} ${d.depois.vigenciaInicio} (${d.antes.valorMwh} → ${d.depois.valorMwh})`),
  ];
  return { diferencas, regressoes: { id: "regressoes", ok: detalhes.length === 0, detalhes } };
}
