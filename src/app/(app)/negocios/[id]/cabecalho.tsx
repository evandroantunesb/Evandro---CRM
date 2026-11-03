import Link from "next/link";
import { MoverEtapa } from "@/components/mover-etapa";
import { Plus } from "lucide-react";
import { NovoNegocio } from "@/components/novo-negocio";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO, SeloCabecalho } from "@/components/cabecalho-pagina";
import { formatarDataHora, formatarMoeda } from "@/lib/crm";
import { formatarMesAno } from "@/lib/formatacao";
import { SeloTemperatura } from "@/components/selo-temperatura";
import type { Ficha } from "./dados-ficha";

/**
 * Cabeçalho da ficha (faixa "detalhe" do desenho aprovado): cliente, valor, etapa e selos, opções e "Adicionar
 * produto"; embaixo, responsável, datas, outros negócios do mesmo cliente e a obra da venda.
 */
export function Cabecalho({ ficha }: { ficha: Ficha }) {
  const { negocio, contato, nomes, config, arquivado, temperatura, etiquetasMarcadas, eletropostoNaEmpresa, outrosNegocios, obraDoNegocio } =
    ficha;
  const podeMover = negocio.status === "aberto" && !arquivado;
  return (
    <header className="flex flex-col gap-3">
      <CabecalhoPagina
        detalhe
        voltar={{ href: `/negocios?funil=${negocio.funil_id}`, rotulo: "Negócios" }}
        sobretitulo={
          <>
            #{negocio.numero} · {negocio.titulo}
            {negocio.origem_id && <> · {nomes.origem(negocio.origem_id)}</>}
          </>
        }
        titulo={contato.nome}
        selos={
          <>
            <SeloCabecalho tom="destaque">{nomes.etapa(negocio.etapa_id)}</SeloCabecalho>
            {negocio.status !== "aberto" && (
              <SeloCabecalho tom={negocio.status === "ganho" ? "positivo" : "negativo"}>{negocio.status === "ganho" ? "Ganho" : "Perdido"}</SeloCabecalho>
            )}
            {arquivado && <SeloCabecalho>Arquivado</SeloCabecalho>}
            {temperatura && <SeloTemperatura valor={temperatura} detalhado naFaixa />}
            {negocio.fechamento_previsto && negocio.status === "aberto" && (
              <SeloCabecalho>Previsto para {formatarMesAno(negocio.fechamento_previsto)}</SeloCabecalho>
            )}
            {config.etiquetas
              .filter((e) => etiquetasMarcadas.has(e.id))
              .map((e) => (
                <SeloCabecalho key={e.id}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.cor ?? "#8a8a92" }} aria-hidden />
                  {e.nome}
                </SeloCabecalho>
              ))}
          </>
        }
        acoes={
          <>
            {podeMover && (
              <MoverEtapa
                negocioId={negocio.id}
                etapaAtualId={negocio.etapa_id}
                etapas={config.etapas.filter((e) => e.funilId === negocio.funil_id && e.ativa)}
                motivos={config.motivos}
                naFaixa
              />
            )}
            {/* Outro produto para o mesmo cliente (ex.: usina além do eletroposto): um negócio novo, já com o cliente. */}
            <NovoNegocio
              href={`/negocios/novo?${new URLSearchParams({ funil: negocio.funil_id, contato: contato.id })}`}
              eletroposto={eletropostoNaEmpresa}
              aria-label="Adicionar produto: novo negócio para este cliente"
              className={CLASSE_ACAO_CABECALHO}
            >
              <Plus size={16} aria-hidden />
              Adicionar produto
            </NovoNegocio>
          </>
        }
        valor={negocio.valor != null ? formatarMoeda(negocio.valor) : undefined}
      />
      <p className="text-sm text-texto-2">
        Responsável: <strong className="font-medium text-texto">{negocio.responsavel_id ? nomes.membro(negocio.responsavel_id) : "ninguém"}</strong>
        {" · "}Criado em {formatarDataHora(negocio.created_at)}
        {negocio.fechado_em && <> · Fechado em {formatarDataHora(negocio.fechado_em)}</>}
        {outrosNegocios && outrosNegocios.length > 0 && (
          <>
            {" · "}Outros negócios deste cliente:{" "}
            {outrosNegocios.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ", "}
                <Link href={`/negocios/${n.id}`} className="font-medium text-dourado-texto underline-offset-2 hover:underline">
                  {n.tipo === "eletroposto" ? "Eletroposto" : "Energia solar"} #{n.numero}
                </Link>{" "}
                ({n.arquivado_em ? "arquivado" : n.status === "ganho" ? "ganho" : n.status === "perdido" ? "perdido" : "em andamento"})
              </span>
            ))}
          </>
        )}
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
