import { formatarDataHora } from "@/lib/crm";
import {
  ROTULO_PRAZO_INSTALACAO_QUALIF,
  ROTULO_TIPO_CLIENTE_QUALIF,
  type PrazoInstalacaoQualif,
  type TipoClienteQualif,
} from "@/lib/tipos";

type Valor = string | boolean | null | undefined;

/** Campos da cópia que o handoff grava (`handoffs.qualificacao_snapshot`), na ordem do formulário. */
const CAMPOS: { chave: string; rotulo: string; formatar?: (v: string) => string }[] = [
  { chave: "tipo_cliente", rotulo: "Tipo de cliente", formatar: (v) => ROTULO_TIPO_CLIENTE_QUALIF[v as TipoClienteQualif] ?? v },
  { chave: "possui_conta_energia", rotulo: "Possui conta de energia" },
  { chave: "distribuidora", rotulo: "Distribuidora" },
  { chave: "imovel_proprio", rotulo: "Imóvel próprio" },
  { chave: "objetivo", rotulo: "Objetivo principal" },
  { chave: "prazo_instalacao", rotulo: "Prazo para instalar", formatar: (v) => ROTULO_PRAZO_INSTALACAO_QUALIF[v as PrazoInstalacaoQualif] ?? v },
  { chave: "busca_financiamento", rotulo: "Busca financiamento" },
  { chave: "orcamento_outra_empresa", rotulo: "Orçamento de outra empresa" },
  { chave: "e_decisor", rotulo: "É o decisor" },
  { chave: "outro_decisor", rotulo: "Existe outro decisor" },
  { chave: "participantes_decisao", rotulo: "Quem participa da decisão" },
];

function texto(v: Valor, formatar?: (v: string) => string): string | null {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  if (v == null || v === "") return null;
  return formatar ? formatar(v) : v;
}

/**
 * O que o SDR entregou no envio para vendas (cópia gravada no handoff), só leitura. A qualificação continua
 * editável por quem é responsável pelo negócio; aqui fica visível o que mudou depois da entrega.
 */
export function QualificacaoEntregue({
  snapshot,
  atual,
  enviadoEm,
  deNome,
}: {
  snapshot: Record<string, Valor>;
  /** Valores atuais do negócio, com as mesmas chaves da cópia. */
  atual: Record<string, Valor>;
  enviadoEm: string;
  deNome: string;
}) {
  const linhas = CAMPOS.map((c) => ({
    ...c,
    entregue: texto(snapshot[c.chave], c.formatar),
    agora: texto(atual[c.chave], c.formatar),
  })).filter((l) => l.entregue != null || l.agora != null);
  if (!linhas.length) return null;
  const alterados = linhas.filter((l) => l.entregue !== l.agora).length;

  return (
    <details className="group rounded-lg border border-linha bg-superficie-2/40 px-3 py-2 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 md:min-h-9">
        <span className="font-medium text-texto">Qualificação entregue por {deNome}</span>
        <span className="text-xs text-texto-2">
          {alterados ? `${alterados} ${alterados === 1 ? "campo alterado" : "campos alterados"} depois` : "Sem alterações"}
        </span>
      </summary>
      <p className="mt-1 text-xs text-texto-2">Enviada para vendas em {formatarDataHora(enviadoEm)}. Só leitura.</p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {linhas.map((l) => (
          <div key={l.chave} className="min-w-0">
            <dt className="text-xs text-texto-2">{l.rotulo}</dt>
            <dd className="[overflow-wrap:anywhere] text-texto">
              {l.entregue ?? "Não informado"}
              {l.entregue !== l.agora && (
                <span className="block text-xs text-amber-800">Alterado depois · agora: {l.agora ?? "não informado"}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
