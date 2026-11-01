import Link from "next/link";
import { MoverEtapa } from "@/components/mover-etapa";
import { Plus } from "lucide-react";
import { NovoNegocio } from "@/components/novo-negocio";
import { Selo } from "@/components/ui";
import { formatarDataHora, formatarMoeda } from "@/lib/crm";
import { formatarMesAno } from "@/lib/formatacao";
import { SeloTemperatura } from "@/components/selo-temperatura";
import type { Ficha } from "./dados-ficha";

/** Cabeçalho da ficha: cliente, valor, etapa e selos, atalhos, outros negócios do mesmo cliente e a obra da venda. */
export function Cabecalho({ ficha }: { ficha: Ficha }) {
  const { negocio, contato, nomes, config, arquivado, temperatura, etiquetasMarcadas, eletropostoNaEmpresa, outrosNegocios, obraDoNegocio } =
    ficha;
  return (
  <header className="flex flex-col gap-3">
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
      <div className="min-w-0">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">{contato.nome}</h1>
        <p className="mt-1 text-sm text-texto-2">
          #{negocio.numero} · {negocio.titulo}
          {negocio.origem_id && <> · {nomes.origem(negocio.origem_id)}</>}
        </p>
      </div>
      {negocio.valor != null && (
        <p className="font-titulo text-2xl font-light tracking-tight text-texto tabular-nums md:text-3xl">{formatarMoeda(negocio.valor)}</p>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Selo tom="atencao">{nomes.etapa(negocio.etapa_id)}</Selo>
      {negocio.status !== "aberto" && (
        <Selo tom={negocio.status === "ganho" ? "positivo" : "negativo"}>
          {negocio.status === "ganho" ? "Ganho" : "Perdido"}
        </Selo>
      )}
      {arquivado && <Selo>Arquivado</Selo>}
      {temperatura && <SeloTemperatura valor={temperatura} detalhado />}
      {negocio.fechamento_previsto && negocio.status === "aberto" && (
        <Selo>Previsto para {formatarMesAno(negocio.fechamento_previsto)}</Selo>
      )}
      {config.etiquetas
        .filter((e) => etiquetasMarcadas.has(e.id))
        .map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-texto">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.cor ?? "#8a8a92" }} aria-hidden />
            {e.nome}
          </span>
        ))}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Outro produto para o mesmo cliente (ex.: usina além do eletroposto): um negócio novo, já com o cliente. */}
        <NovoNegocio
          href={`/negocios/novo?${new URLSearchParams({ funil: negocio.funil_id, contato: contato.id })}`}
          eletroposto={eletropostoNaEmpresa}
          aria-label="Adicionar produto: novo negócio para este cliente"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-acao px-3 text-sm font-medium text-sobre-acao transition-colors hover:bg-acao-forte md:min-h-9"
        >
          <Plus size={16} aria-hidden />
          Adicionar produto
        </NovoNegocio>
        {negocio.status === "aberto" && !arquivado && (
          <MoverEtapa
            negocioId={negocio.id}
            etapaAtualId={negocio.etapa_id}
            etapas={config.etapas.filter((e) => e.funilId === negocio.funil_id && e.ativa)}
            motivos={config.motivos}
          />
        )}
      </div>
    </div>
    {outrosNegocios && outrosNegocios.length > 0 && (
      <nav aria-label="Outros negócios deste cliente" className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-texto-2">Outros negócios deste cliente:</span>
        {outrosNegocios.map((n) => (
          <Link
            key={n.id}
            href={`/negocios/${n.id}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-linha bg-superficie px-2.5 font-medium text-texto transition-colors hover:border-dourado"
          >
            {n.tipo === "eletroposto" ? "Eletroposto" : "Energia solar"} #{n.numero}
            <span className="font-normal text-texto-2">
              · {n.arquivado_em ? "arquivado" : n.status === "ganho" ? "ganho" : n.status === "perdido" ? "perdido" : "em andamento"}
            </span>
          </Link>
        ))}
      </nav>
    )}
    <p className="text-xs text-texto-2">
      Responsável: {negocio.responsavel_id ? nomes.membro(negocio.responsavel_id) : "ninguém"} · Criado em{" "}
      {formatarDataHora(negocio.created_at)}
      {negocio.fechado_em && <> · Fechado em {formatarDataHora(negocio.fechado_em)}</>}
      {obraDoNegocio && (
        <>
          {" · "}
          <Link href={`/obras/${obraDoNegocio.id}`} className="font-medium text-dourado-texto underline-offset-2 hover:underline">
            Ver obra nº {obraDoNegocio.numero}
          </Link>
        </>
      )}
    </p>
  </header>
  );
}
