"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarConfigBlocoModelo } from "@/lib/acoes/proposta-modelos";
import { HORIZONTES_PROPOSTA, horizonteDoBloco } from "@/lib/propostas/economia-emissao";

function itensDoConfig(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const itens = (config as { itens?: unknown }).itens;
  return Array.isArray(itens) ? itens.filter((i): i is string => typeof i === "string") : [];
}

function campoDoConfig(config: unknown, chave: string): string {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const v = cfg[chave];
  return typeof v === "string" ? v : "";
}

const CLASSE_CAMPO = "rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-carvao outline-none focus:border-dourado";

function CampoFormulario({
  modeloId,
  blocoId,
  configJson,
  children,
}: {
  modeloId: string;
  blocoId: string;
  configJson: string;
  children: React.ReactNode;
}) {
  const [resultado, acao, salvando] = useActionState(salvarConfigBlocoModelo, null);
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <input type="hidden" name="id" value={blocoId} />
      <input type="hidden" name="config" value={configJson} />
      {children}
      <Botao type="submit" variante="secundario" disabled={salvando} className="self-start px-3 py-1 text-xs">
        {salvando ? "Salvando..." : "Salvar conteúdo"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

/** Lista de itens, um por linha — usada tanto pra listas simples quanto pra listas com vários campos ("a | b | c" por linha). */
function EditorLista({ modeloId, blocoId, config, rotulo, dica }: { modeloId: string; blocoId: string; config: unknown; rotulo: string; dica: string }) {
  const [texto, setTexto] = useState(itensDoConfig(config).join("\n"));
  const configJson = JSON.stringify({
    itens: texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  });
  return (
    <CampoFormulario modeloId={modeloId} blocoId={blocoId} configJson={configJson}>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">
          {rotulo} ({dica})
        </span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(8, Math.max(3, texto.split("\n").length))} className={CLASSE_CAMPO} />
      </label>
    </CampoFormulario>
  );
}

/** Duas listas simples lado a lado (ex.: incluso / não incluso). */
function EditorListaDupla({
  modeloId,
  blocoId,
  config,
  rotuloA,
  chaveA,
  rotuloB,
  chaveB,
}: {
  modeloId: string;
  blocoId: string;
  config: unknown;
  rotuloA: string;
  chaveA: string;
  rotuloB: string;
  chaveB: string;
}) {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const listaInicial = (chave: string) => (Array.isArray(cfg[chave]) ? (cfg[chave] as unknown[]).filter((i): i is string => typeof i === "string") : []);
  const [a, setA] = useState(listaInicial(chaveA).join("\n"));
  const [b, setB] = useState(listaInicial(chaveB).join("\n"));
  const linhas = (t: string) =>
    t
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const configJson = JSON.stringify({ [chaveA]: linhas(a), [chaveB]: linhas(b) });
  return (
    <CampoFormulario modeloId={modeloId} blocoId={blocoId} configJson={configJson}>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">{rotuloA}</span>
        <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} className={CLASSE_CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">{rotuloB}</span>
        <textarea value={b} onChange={(e) => setB(e.target.value)} rows={3} className={CLASSE_CAMPO} />
      </label>
    </CampoFormulario>
  );
}

/** Campos de texto nomeados (curtos ou multilinha). */
function EditorCampos({
  modeloId,
  blocoId,
  config,
  campos,
}: {
  modeloId: string;
  blocoId: string;
  config: unknown;
  campos: { chave: string; rotulo: string; multilinha?: boolean }[];
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(campos.map((c) => [c.chave, campoDoConfig(config, c.chave)])));
  const configJson = JSON.stringify(valores);
  return (
    <CampoFormulario modeloId={modeloId} blocoId={blocoId} configJson={configJson}>
      {campos.map((c) =>
        c.multilinha ? (
          <label key={c.chave} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-600">{c.rotulo}</span>
            <textarea
              value={valores[c.chave] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
              rows={3}
              className={CLASSE_CAMPO}
            />
          </label>
        ) : (
          <label key={c.chave} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-600">{c.rotulo}</span>
            <input value={valores[c.chave] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))} className={CLASSE_CAMPO} />
          </label>
        ),
      )}
    </CampoFormulario>
  );
}

/** 12 números (jan–dez) separados por vírgula, num único campo — pra gráficos mensais sem histórico automático no sistema. */
function EditorDozeMeses({ modeloId, blocoId, config, chave, rotulo }: { modeloId: string; blocoId: string; config: unknown; chave: string; rotulo: string }) {
  const [texto, setTexto] = useState(campoDoConfig(config, chave));
  const configJson = JSON.stringify({ [chave]: texto });
  return (
    <CampoFormulario modeloId={modeloId} blocoId={blocoId} configJson={configJson}>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">{rotulo}</span>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Jan, Fev, Mar, ..." className={CLASSE_CAMPO} />
      </label>
    </CampoFormulario>
  );
}

/**
 * Bloco "Retorno/fluxo de caixa": quantos anos a proposta mostra ao cliente (5 a 25; decisão do Evandro em 25/11/2026)
 * e o texto opcional. O cálculo continua com 25 anos; a emissão guarda os anos escolhidos.
 */
function EditorRetorno({ modeloId, blocoId, config }: { modeloId: string; blocoId: string; config: unknown }) {
  const [anos, setAnos] = useState<number>(() => horizonteDoBloco(config));
  const [texto, setTexto] = useState(campoDoConfig(config, "texto"));
  const configJson = JSON.stringify({ anos, texto });
  return (
    <CampoFormulario modeloId={modeloId} blocoId={blocoId} configJson={configJson}>
      <fieldset className="flex flex-col gap-1 text-xs">
        <legend className="mb-1 font-medium text-zinc-600">Anos mostrados ao cliente</legend>
        <div className="flex flex-wrap gap-1.5">
          {HORIZONTES_PROPOSTA.map((n) => (
            <label key={n} className="relative">
              <input type="radio" name={`anos-${blocoId}`} value={n} checked={anos === n} onChange={() => setAnos(n)} className="peer sr-only" />
              <span className="inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300 peer-checked:bg-carvao peer-checked:text-dourado peer-checked:ring-carvao peer-focus-visible:outline-2 peer-focus-visible:outline-dourado">
                {n}
              </span>
            </label>
          ))}
        </div>
        <span className="mt-1 text-zinc-500">
          Vale para o gráfico do retorno e o total &quot;Em N anos&quot; da proposta e da página on-line. O cálculo continua com 25 anos, o
          retorno aparece mesmo quando passa desse prazo e a ficha do negócio mostra sempre os 25 anos. Propostas já emitidas não mudam.
        </span>
      </fieldset>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-600">Texto sobre o retorno (opcional)</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} className={CLASSE_CAMPO} />
      </label>
    </CampoFormulario>
  );
}

type CampoSpec = { chave: string; rotulo: string; multilinha?: boolean };
type EspecificacaoBloco =
  | { tipo: "lista"; rotulo: string; dica: string }
  | { tipo: "lista-dupla"; rotuloA: string; chaveA: string; rotuloB: string; chaveB: string }
  | { tipo: "doze"; chave: string; rotulo: string }
  | { tipo: "campos"; campos: CampoSpec[] }
  | { tipo: "retorno" };

/** Só entram aqui os tipos cujo renderer (src/lib/propostas/pdf.tsx) de fato lê `config`. */
const ESPECIFICACAO: Record<string, EspecificacaoBloco> = {
  proposal_identity: {
    tipo: "campos",
    campos: [
      { chave: "numero", rotulo: "Número da proposta" },
      { chave: "validadeDias", rotulo: "Validade (dias)" },
      { chave: "vendedorNome", rotulo: "Nome do vendedor" },
      { chave: "tipoImovel", rotulo: "Tipo de imóvel" },
    ],
  },
  cover_benefits: { tipo: "lista", rotulo: "Benefícios da capa", dica: 'um por linha, "título | texto"; vazio usa os padrões' },
  about_company: { tipo: "campos", campos: [{ chave: "texto", rotulo: "Texto sobre a empresa", multilinha: true }] },
  company_highlights: { tipo: "lista", rotulo: "Diferenciais", dica: 'um por linha, "título | texto"' },
  company_numbers: { tipo: "lista", rotulo: "Números institucionais", dica: 'um por linha, "rótulo | valor"' },
  team_and_certifications: { tipo: "lista", rotulo: "Equipe e qualificações", dica: 'um por linha, "nome | cargo ou registro | texto"' },
  portfolio: { tipo: "lista", rotulo: "Projetos", dica: 'um por linha, "título | descrição"' },
  testimonials: { tipo: "lista", rotulo: "Depoimentos", dica: 'um por linha, "nome do cliente | depoimento"' },
  solar_benefits: { tipo: "lista", rotulo: "Benefícios da energia solar", dica: "um por linha; vazio usa os padrões" },
  day_night: { tipo: "campos", campos: [{ chave: "texto", rotulo: "Texto (vazio usa o padrão)", multilinha: true }] },
  solar_faq: { tipo: "lista", rotulo: "Perguntas frequentes", dica: 'um por linha, "pergunta | resposta"' },
  customer_profile: { tipo: "campos", campos: [{ chave: "objetivo", rotulo: "Objetivo do projeto", multilinha: true }] },
  consumption_chart: { tipo: "doze", chave: "valores", rotulo: "Consumo mensal (kWh), 12 valores separados por vírgula (Jan a Dez)" },
  installation_layout: {
    tipo: "campos",
    campos: [
      { chave: "imagemUrl", rotulo: "URL da imagem do layout" },
      { chave: "texto", rotulo: "Descrição", multilinha: true },
    ],
  },
  generation_vs_consumption: { tipo: "doze", chave: "valoresConsumo", rotulo: "Consumo mensal (kWh), 12 valores separados por vírgula (Jan a Dez)" },
  simulation_assumptions: { tipo: "campos", campos: [{ chave: "texto", rotulo: "Premissas técnicas", multilinha: true }] },
  long_term_generation: { tipo: "campos", campos: [{ chave: "texto", rotulo: "Projeção de longo prazo", multilinha: true }] },
  cashflow_payback: { tipo: "retorno" },
  extra_costs: { tipo: "lista", rotulo: "Itens e serviços adicionais", dica: 'um por linha, "nome | valor"' },
  validity_timeline: { tipo: "lista", rotulo: "Validade e prazo", dica: 'um por linha, "rótulo | valor"' },
  project_steps: { tipo: "lista", rotulo: "Etapas da instalação", dica: 'um por linha, "título | prazo | descrição"' },
  warranties: { tipo: "lista", rotulo: "Garantias", dica: 'um por linha, "título | texto"; vazio usa os padrões' },
  support_maintenance: { tipo: "lista", rotulo: "Suporte e manutenção", dica: "um por linha" },
  scope_inclusions_exclusions: {
    tipo: "lista-dupla",
    rotuloA: "Incluso (um por linha)",
    chaveA: "incluido",
    rotuloB: "Não incluso (um por linha)",
    chaveB: "excluido",
  },
  commercial_conditions: { tipo: "campos", campos: [{ chave: "texto", rotulo: "Condições comerciais", multilinha: true }] },
  company_contacts: {
    tipo: "campos",
    campos: [
      { chave: "email", rotulo: "E-mail" },
      { chave: "telefone", rotulo: "Telefone" },
      { chave: "endereco", rotulo: "Endereço" },
    ],
  },
  custom_content: {
    tipo: "campos",
    campos: [
      { chave: "titulo", rotulo: "Título do bloco" },
      { chave: "texto", rotulo: "Texto", multilinha: true },
    ],
  },
  pdf_attachment: { tipo: "lista", rotulo: "Anexos", dica: 'um por linha, "nome | URL"' },
  included_services: { tipo: "lista", rotulo: "Itens inclusos", dica: "um por linha; vazio usa a lista padrão" },
  next_steps: {
    tipo: "campos",
    campos: [
      { chave: "texto", rotulo: "Texto de fechamento (vazio usa o padrão)", multilinha: true },
      { chave: "ctaTexto", rotulo: "Chamada para ação (vazio usa o WhatsApp da identidade)" },
    ],
  },
};

/** Editor de conteúdo do bloco, só pros tipos que de fato lêem `config` no PDF (os demais usam só dado do negócio/cálculo). */
export function ConfiguracaoBloco({ modeloId, blocoId, tipo, config }: { modeloId: string; blocoId: string; tipo: string; config: unknown }) {
  const [aberto, setAberto] = useState(false);
  const espec = ESPECIFICACAO[tipo];
  if (!espec) return null;

  return (
    <div>
      <button type="button" onClick={() => setAberto((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-carvao">
        Personalizar conteúdo
        <ChevronDown size={12} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto &&
        (espec.tipo === "lista" ? (
          <EditorLista modeloId={modeloId} blocoId={blocoId} config={config} rotulo={espec.rotulo} dica={espec.dica} />
        ) : espec.tipo === "lista-dupla" ? (
          <EditorListaDupla modeloId={modeloId} blocoId={blocoId} config={config} rotuloA={espec.rotuloA} chaveA={espec.chaveA} rotuloB={espec.rotuloB} chaveB={espec.chaveB} />
        ) : espec.tipo === "retorno" ? (
          <EditorRetorno modeloId={modeloId} blocoId={blocoId} config={config} />
        ) : espec.tipo === "doze" ? (
          <EditorDozeMeses modeloId={modeloId} blocoId={blocoId} config={config} chave={espec.chave} rotulo={espec.rotulo} />
        ) : (
          <EditorCampos modeloId={modeloId} blocoId={blocoId} config={config} campos={espec.campos} />
        ))}
    </div>
  );
}
