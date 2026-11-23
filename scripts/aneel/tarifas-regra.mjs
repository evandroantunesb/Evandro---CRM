/**
 * Regra de extração da tarifa oficial B1 residencial convencional (sem tributos, R$/MWh) das linhas brutas do conjunto
 * "Componentes Tarifárias" da ANEEL. É a mesma regra aceita para a Copel (.aurora/contratos/m2-p0-decisao-fio-b-copel.md,
 * migration 20261023210000): base "Tarifa de Aplicação"; TE e TUSD do detalhe "Não se aplica"; TUSD_FioB do detalhe SCEE
 * (igual ao "Não se aplica"). Puro, sem I/O: o script `gerar-tarifas.mjs` consulta a API e grava os arquivos.
 *
 * A API entrega os textos em UTF-8 correto; o arquivo antigo da Copel (.aurora/fontes/...-copel-reh3592-b1.json) foi
 * gravado com os acentos perdidos (caractere U+FFFD no lugar). Os campos fixos aceitam as duas formas. Nome de
 * distribuidora com acento perdido ou "Não Informado" é recusado (fail-closed): não se adivinha nome de distribuidora.
 */

/** Caractere que fica no lugar do acento perdido (U+FFFD). */
export const PERDIDO = String.fromCharCode(0xfffd);
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const semAcento = (v) => String(v ?? "").normalize("NFD").replace(ACENTOS, "").toLowerCase().trim();

/** Mesmo texto, ignorando maiúsculas e acentos; aceita o acento perdido (U+FFFD) no lugar de cada letra acentuada. */
function mesmoTexto(valor, esperado) {
  if (semAcento(valor) === semAcento(esperado)) return true;
  return String(valor ?? "").toLowerCase().trim() === esperado.replace(/[^\x00-\x7f]/g, PERDIDO).toLowerCase();
}

const CAMPOS_FIXOS = {
  DscBaseTarifaria: "Tarifa de Aplicação",
  DscSubGrupoTarifario: "B1",
  DscModalidadeTarifaria: "Convencional",
  DscClasseConsumidor: "Residencial",
  DscSubClasseConsumidor: "Residencial",
  DscPostoTarifario: "Não se aplica",
  DscUnidade: "R$/MWh",
  SigNomeAgenteAcessante: "Não se aplica",
};

/** Mesma forma de `normalizarNome` em src/lib/tarifa-gd.ts (minúsculas, sem acento, espaços simples). */
export function normalizarNome(v) {
  return v
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "214,53560037400001" → "214.535600374": arredonda em 9 casas (escala da coluna) em aritmética decimal exata. */
export function decimalAneel(texto) {
  const t = String(texto).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Valor da ANEEL inválido: ${texto}`);
  const negativo = t.startsWith("-");
  const [inteiro, fracao = ""] = t.replace("-", "").split(".");
  const CASAS = 9;
  const digitos = BigInt(inteiro + fracao.padEnd(CASAS + 1, "0").slice(0, CASAS + 1));
  const arredondado = (digitos + 5n) / 10n; // meia unidade para cima no décimo dígito
  const s = arredondado.toString().padStart(CASAS + 1, "0");
  const parteInteira = s.slice(0, -CASAS);
  const parteFracao = s.slice(-CASAS).replace(/0+$/, "");
  const valor = parteFracao ? `${parteInteira}.${parteFracao}` : parteInteira;
  return negativo && arredondado !== 0n ? `-${valor}` : valor;
}

/** "RESOLUÇÃO HOMOLOGATÓRIA Nº 3.592, DE 23 DE JUNHO DE 2026" (com acentos perdidos) → "REH 3.592/2026". */
function atoDaResolucao(texto) {
  const m = /(\d[\d.]*)\s*,\s*DE\s+\d+\s+DE\s+\S+\s+DE\s+(\d{4})/i.exec(String(texto));
  return m ? `REH ${m[1]}/${m[2]}` : null;
}

const COMPONENTES = ["TE", "TUSD", "TUSD_FioB"];

/**
 * Linhas brutas → tarifas por distribuidora e vigência, e as recusadas com o motivo.
 * Motivos: nome_corrompido, nome_nao_informado, ato_ilegivel, sem_te, sem_tusd, sem_fio_b_scee, valores_divergentes, fio_b_divergente,
 * valor_nao_positivo, vigencias_sobrepostas.
 */
export function extrairTarifas(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    if (!Object.entries(CAMPOS_FIXOS).every(([campo, esperado]) => mesmoTexto(l[campo], esperado))) continue;
    if (!COMPONENTES.includes(l.DscComponenteTarifario)) continue;
    const detalhe = mesmoTexto(l.DscDetalheConsumidor, "SCEE") ? "SCEE" : mesmoTexto(l.DscDetalheConsumidor, "Não se aplica") ? "NA" : null;
    if (!detalhe) continue;
    const chave = `${l.SigNomeAgente}\u0000${l.DatInicioVigencia}`;
    if (!grupos.has(chave)) grupos.set(chave, { agente: l.SigNomeAgente, linhas: [] });
    grupos.get(chave).linhas.push({ ...l, detalhe });
  }

  const tarifas = [];
  const recusadas = [];
  for (const { agente, linhas: ls } of grupos.values()) {
    const vigenciaInicio = ls[0].DatInicioVigencia;
    const recusar = (motivo) => recusadas.push({ distribuidora: agente, vigenciaInicio, motivo });

    const distribuidora = agente;
    if (agente.includes(PERDIDO)) {
      recusar("nome_corrompido");
      continue;
    }
    if (semAcento(agente) === "nao informado") {
      recusar("nome_nao_informado");
      continue;
    }

    const valores = (componente, detalhe) => {
      const sel = ls.filter((l) => l.DscComponenteTarifario === componente && l.detalhe === detalhe);
      return { ids: sel.map((l) => l._id), valores: [...new Set(sel.map((l) => decimalAneel(l.VlrComponenteTarifario)))] };
    };
    const te = valores("TE", "NA");
    const tusd = valores("TUSD", "NA");
    const fioBScee = valores("TUSD_FioB", "SCEE");
    const fioBNa = valores("TUSD_FioB", "NA");

    if (!te.ids.length) recusar("sem_te");
    else if (!tusd.ids.length) recusar("sem_tusd");
    else if (!fioBScee.ids.length) recusar("sem_fio_b_scee");
    else if ([te, tusd, fioBScee, fioBNa].some((c) => c.valores.length > 1)) recusar("valores_divergentes");
    else if (fioBNa.valores.length && fioBNa.valores[0] !== fioBScee.valores[0]) recusar("fio_b_divergente");
    else if ([te, tusd, fioBScee].some((c) => Number(c.valores[0]) <= 0)) recusar("valor_nao_positivo");
    else {
      const ato = atoDaResolucao(ls[0].DscResolucaoHomologatoria);
      if (!ato) {
        recusar("ato_ilegivel");
        continue;
      }
      tarifas.push({
        distribuidora,
        cnpj: ls[0].NumCPFCNPJ,
        ato,
        vigenciaInicio,
        vigenciaFim: ls[0].DatFimVigencia,
        teRsMwh: te.valores[0],
        tusdRsMwh: tusd.valores[0],
        fioBRsMwh: fioBScee.valores[0],
        fonteLinhas: { TE: te.ids, TUSD: tusd.ids, TUSD_FioB_SCEE: [...fioBNa.ids, ...fioBScee.ids] },
      });
    }
  }

  // Vigências sobrepostas da mesma distribuidora deixariam o cálculo ambíguo: recusa as duas.
  const sobrepostas = new Set();
  for (const a of tarifas)
    for (const b of tarifas)
      if (a !== b && a.distribuidora === b.distribuidora && a.vigenciaInicio <= b.vigenciaFim && b.vigenciaInicio <= a.vigenciaFim) sobrepostas.add(a);
  for (const t of sobrepostas) recusadas.push({ distribuidora: t.distribuidora, vigenciaInicio: t.vigenciaInicio, motivo: "vigencias_sobrepostas" });

  const ordem = (a, b) => a.distribuidora.localeCompare(b.distribuidora) || a.vigenciaInicio.localeCompare(b.vigenciaInicio);
  return { tarifas: tarifas.filter((t) => !sobrepostas.has(t)).sort(ordem), recusadas: recusadas.sort(ordem) };
}

/**
 * Nomes aceitos por distribuidora (forma de `normalizarNome`): a sigla, com hífen e com espaço; o apelido curto (antes do
 * primeiro hífen ou espaço) só quando nenhuma outra distribuidora tem o mesmo. Nenhum nome fica em duas distribuidoras
 * nem repete um reservado (os da Copel já carregados).
 * @param {string[]} distribuidoras
 * @param {{ reservados?: string[] }} [opcoes]
 * @returns {Map<string, string[]>}
 */
export function nomesAceitos(distribuidoras, { reservados = [] } = {}) {
  const curto = (d) => normalizarNome(d).split(/[-\s]/)[0];
  const contagemCurto = new Map();
  for (const d of new Set(distribuidoras)) contagemCurto.set(curto(d), (contagemCurto.get(curto(d)) ?? 0) + 1);

  const usados = new Set(reservados.map(normalizarNome));
  const resultado = new Map();
  for (const d of [...new Set(distribuidoras)].sort()) {
    const base = normalizarNome(d);
    const candidatos = [base, base.replace(/ /g, "-"), base.replace(/-/g, " ")];
    if (contagemCurto.get(curto(d)) === 1) candidatos.push(curto(d));
    const nomes = [...new Set(candidatos)].filter((n) => n && !usados.has(n));
    for (const n of nomes) usados.add(n);
    resultado.set(d, nomes);
  }
  return resultado;
}

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** Corpo do insert da migration de carga (uma linha por distribuidora/vigência). */
export function sqlCarga(tarifas, nomes, fonte) {
  const linhas = tarifas.map((t) => {
    const aceitos = nomes.get(t.distribuidora);
    if (!aceitos?.length) throw new Error(`Sem nome aceito para ${t.distribuidora}`);
    return `  (${literal(t.distribuidora)}, array[${aceitos.map(literal).join(", ")}], ${literal(t.cnpj)}, ${literal(t.ato)}, 'B1', 'residencial', 'convencional', 'sem_tributos',
   ${t.teRsMwh}, ${t.tusdRsMwh}, ${t.fioBRsMwh}, date '${t.vigenciaInicio}', date '${t.vigenciaFim}',
   ${literal(fonte.recursoId)}, ${literal(JSON.stringify(t.fonteLinhas))}::jsonb, timestamptz ${literal(fonte.extraidaEm)}, ${literal(fonte.sha256)},
   array['tabela4_nao_conferida'])`;
  });
  return `insert into public.tarifas_gd_aneel (
  distribuidora, nomes_aceitos, cnpj, ato, subgrupo, subclasse, modalidade, base_tributaria,
  te_rs_mwh, tusd_rs_mwh, tusd_fio_b_rs_mwh, vigencia_inicio, vigencia_fim,
  fonte_recurso_id, fonte_linhas, fonte_extraida_em, fonte_resposta_sha256, pendencias_fonte
) values
${linhas.join(",\n")};
`;
}
