import "server-only";
import { andamentoChecklist, ehEtapaChecklist, type EtapaChecklist } from "@/lib/obras/checklist";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteAnonimo } from "@/lib/supabase/anonimo";

/*
 * Página do cliente `/obra/<token>` (subprojeto 4b, 20261207100000_obra_solo.sql). Os dados vêm de
 * `acompanhamento_obra`, chamada como `anon`: o banco garante o que sai (nada de anotação, motivo, valor ou telefone)
 * mesmo que este código erre. A chave de serviço só assina as fotos e a logo, por 1 hora.
 */

const EXPIRA_SEGUNDOS = 60 * 60;

export type EmpresaAcompanhamento = {
  nome: string;
  logoUrl: string | null;
  corPrimaria: string | null;
  corDestaque: string | null;
  whatsapp: string | null;
};

export type EtapaAcompanhamento = {
  etapa: EtapaChecklist;
  feitaEm: string | null;
  previstaPara: string | null;
  naoSeAplica: boolean;
  fotos: string[];
};

export type Acompanhamento =
  | { tipo: "invalido" }
  | { tipo: "encerrada"; empresa: EmpresaAcompanhamento }
  | {
      tipo: "ativa";
      clientePrimeiroNome: string;
      empresa: EmpresaAcompanhamento;
      etapas: EtapaAcompanhamento[];
      andamento: ReturnType<typeof andamentoChecklist>;
      atualizadoEm: string;
    };

type EmpresaBanco = { nome: string; logo_escura: string | null; cor_primaria: string | null; cor_destaque: string | null; whatsapp: string | null };
type RespostaBanco = {
  situacao: "ativa" | "encerrada";
  empresa: EmpresaBanco;
  cliente_primeiro_nome?: string;
  etapas?: { etapa: string; feita_em: string | null; prevista_para: string | null; nao_se_aplica: boolean; fotos: string[] }[];
  atualizado_em?: string;
};

async function empresaDe(e: EmpresaBanco): Promise<EmpresaAcompanhamento> {
  let logoUrl: string | null = null;
  if (e.logo_escura) {
    const { data } = await criarClienteAdmin().storage.from("proposta-marca").createSignedUrl(e.logo_escura, EXPIRA_SEGUNDOS);
    logoUrl = data?.signedUrl ?? null;
  }
  return { nome: e.nome, logoUrl, corPrimaria: e.cor_primaria, corDestaque: e.cor_destaque, whatsapp: e.whatsapp };
}

/** Lê o acompanhamento pelo token. Token vazio, inexistente ou trocado (e falha na leitura) = "invalido". */
export async function carregarAcompanhamento(token: string): Promise<Acompanhamento> {
  if (!token.trim()) return { tipo: "invalido" };
  const { data, error } = await criarClienteAnonimo().rpc("acompanhamento_obra", { p_token: token });
  if (error || !data) return { tipo: "invalido" };
  const r = data as unknown as RespostaBanco;
  const empresa = await empresaDe(r.empresa);
  if (r.situacao === "encerrada") return { tipo: "encerrada", empresa };

  const etapasBanco = (r.etapas ?? []).filter((e): e is typeof e & { etapa: EtapaChecklist } => ehEtapaChecklist(e.etapa));
  const caminhos = etapasBanco.flatMap((e) => e.fotos);
  const assinadas = caminhos.length ? ((await criarClienteAdmin().storage.from("obra-fotos").createSignedUrls(caminhos, EXPIRA_SEGUNDOS)).data ?? []) : [];
  const urlDe = new Map(assinadas.map((a) => [a.path, a.signedUrl]));

  const etapas: EtapaAcompanhamento[] = etapasBanco.map((e) => ({
    etapa: e.etapa,
    feitaEm: e.feita_em,
    previstaPara: e.prevista_para,
    naoSeAplica: e.nao_se_aplica,
    fotos: e.fotos.flatMap((c) => (urlDe.get(c) ? [urlDe.get(c)!] : [])),
  }));
  return {
    tipo: "ativa",
    clientePrimeiroNome: r.cliente_primeiro_nome ?? "",
    empresa,
    etapas,
    andamento: andamentoChecklist(etapas),
    atualizadoEm: r.atualizado_em ?? "",
  };
}
