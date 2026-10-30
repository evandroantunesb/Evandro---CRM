import type { ObraListaVM } from "@/lib/obras/dados";
import { setorConcluido } from "@/lib/obras/derivados";
import { STATUS_POR_SETOR } from "@/lib/obras/rotulos";

/**
 * Central da Engenharia: obras em andamento por etapa, a próxima ação de cada uma e o que espera terceiros. Só
 * fatos registrados (etapa, desde quando, parado, aguardando, responsável principal); a próxima ação é um texto
 * fixo por etapa, explicável, sem prazo, percentual ou semáforo inventados. Exigência aberta (P3) e vistoria que pede
 * ação (P4) trocam o texto e tiram a obra de "aguardando terceiros".
 */

/** Próxima ação por etapa da Engenharia (aprovada pelo Evandro em 29/10/2026). */
export const PROXIMA_ACAO_ENGENHARIA: Record<string, string> = {
  a_iniciar: "Conferir dados e iniciar o projeto",
  projeto_em_elaboracao: "Concluir projeto e documentação",
  enviado_concessionaria: "Verificar resposta da concessionária",
  aprovado: "Acompanhar instalação e pedir vistoria",
  aguardando_vistoria: "Acompanhar vistoria e troca do medidor",
};
export const ACAO_SEM_RESPONSAVEL = "Definir responsável";
/** Exigência aberta no protocolo (P3): a bola volta para a Engenharia. */
export const acaoExigencia = (n: number) => (n === 1 ? "Responder exigência da concessionária" : `Responder ${n} exigências da concessionária`);

/** Etapas em que a próxima movimentação é da concessionária, mesmo sem a marcação "Aguardando". */
const ETAPAS_COM_CONCESSIONARIA = new Set(["enviado_concessionaria", "aguardando_vistoria"]);

export type ObraNaEngenharia = {
  id: string;
  numero: number;
  clienteNome: string;
  cidadeUf: string;
  potenciaKwp: number | null;
  status: string;
  statusRotulo: string;
  estado: ObraListaVM["setores"][number]["estado"];
  aguardando: string | null;
  principalNome: string | null;
  souPrincipal: boolean;
  /** Texto da próxima ação; null para etapa que a regra não conhece (não se inventa ação). */
  proximaAcao: string | null;
  /** A próxima movimentação é de terceiro: marcação "Aguardando" ou etapa com a concessionária. */
  comTerceiro: boolean;
  /** Desde quando está na etapa ou, se aguarda terceiro marcado, desde quando aguarda. */
  desde: string | null;
};

export type GrupoEngenharia = { status: string; rotulo: string; obras: ObraNaEngenharia[] };

export type CentralEngenharia = {
  /** Obras com ação minha: sou o principal ou, se coordeno, a obra está sem principal. Sem as que esperam terceiro. */
  acoes: ObraNaEngenharia[];
  /** Obras paradas com terceiro (cliente, fornecedor, concessionária…), visíveis a quem vê a carteira. */
  comTerceiros: ObraNaEngenharia[];
  /** Carteira por etapa, na ordem do fluxo, com os grupos vazios. */
  grupos: GrupoEngenharia[];
};

function paraEngenharia(o: ObraListaVM, rotuloStatus: (status: string) => string, exigencias: number, acaoVistoria: string | null): ObraNaEngenharia | null {
  if (o.situacao !== "em_andamento") return null;
  const eng = o.setores.find((s) => s.setor === "engenharia");
  if (!eng?.status || setorConcluido("engenharia", eng.status)) return null;
  // Exigência aberta ou vistoria que pede ação (não conformidade, conexão confirmada): a próxima movimentação é da
  // Engenharia, mesmo na etapa da concessionária. Exigência vem primeiro.
  const acaoRegistro = exigencias > 0 ? acaoExigencia(exigencias) : acaoVistoria;
  const comTerceiro = acaoRegistro == null && (eng.aguardando != null || ETAPAS_COM_CONCESSIONARIA.has(eng.status));
  return {
    id: o.id,
    numero: o.numero,
    clienteNome: o.clienteNome,
    cidadeUf: [o.cidade, o.uf].filter(Boolean).join("/") || "—",
    potenciaKwp: o.potenciaKwp,
    status: eng.status,
    statusRotulo: rotuloStatus(eng.status),
    estado: eng.estado,
    aguardando: eng.aguardando,
    principalNome: eng.principalNome,
    souPrincipal: eng.souPrincipal,
    proximaAcao:
      eng.principalNome == null ? ACAO_SEM_RESPONSAVEL : (acaoRegistro ?? PROXIMA_ACAO_ENGENHARIA[eng.status] ?? null),
    comTerceiro,
    desde: eng.aguardandoDesde ?? eng.statusDesde,
  };
}

/** Mais antigo primeiro: quem está há mais tempo parado na etapa aparece antes. Sem data, no fim; empate pelo número. */
const porAntiguidade = (a: ObraNaEngenharia, b: ObraNaEngenharia) =>
  (a.desde ?? "￿").localeCompare(b.desde ?? "￿") || a.numero - b.numero;

export function montarCentralEngenharia(
  obras: readonly ObraListaVM[],
  rotuloStatus: (status: string) => string,
  {
    coordena,
    exigencias = new Map(),
    acoesVistoria = new Map(),
  }: {
    coordena: boolean;
    /** Exigências abertas por obra (protocolos, P3). */
    exigencias?: ReadonlyMap<string, number>;
    /** Ação que a vistoria mais recente pede, por obra (P4). */
    acoesVistoria?: ReadonlyMap<string, string>;
  },
): CentralEngenharia {
  const grupos = new Map<string, ObraNaEngenharia[]>(
    STATUS_POR_SETOR.engenharia.filter((s) => !setorConcluido("engenharia", s)).map((s) => [s, []]),
  );
  const acoes: ObraNaEngenharia[] = [];
  const comTerceiros: ObraNaEngenharia[] = [];
  for (const o of obras) {
    const item = paraEngenharia(o, rotuloStatus, exigencias.get(o.id) ?? 0, acoesVistoria.get(o.id) ?? null);
    if (!item) continue;
    // Status que o banco aceite e a lista não conheça ainda vira grupo próprio, no fim: nunca some da tela.
    const lista = grupos.get(item.status) ?? [];
    grupos.set(item.status, lista);
    lista.push(item);
    // Sem responsável a ação é de quem coordena, mesmo que a etapa espere terceiro.
    if (item.principalNome == null && coordena) acoes.push(item);
    else if (item.comTerceiro) comTerceiros.push(item);
    else if (item.souPrincipal) acoes.push(item);
  }
  return {
    acoes: acoes.sort(porAntiguidade),
    comTerceiros: comTerceiros.sort(porAntiguidade),
    grupos: [...grupos].map(([status, lista]) => ({ status, rotulo: rotuloStatus(status), obras: lista.sort((a, b) => a.numero - b.numero) })),
  };
}

/** Dias corridos desde uma data (ISO), no horário de Brasília. Fato de calendário, não prazo. */
export function diasDesde(desde: string, agora = new Date()): number {
  const dia = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d));
  return Math.max(0, Math.round((dia(agora) - dia(new Date(desde))) / 86_400_000));
}
