import Link from "next/link";
import { Cartao, Voltar } from "@/components/ui";
import { AVISOS_CRIACAO, avisosDaUrl } from "@/lib/negocio-dados";
import { formatarDataHora } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { ARQUIVAR_NEGOCIO, NEGOCIOS, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";
import { type Marco } from "@/lib/venda";
import { Arquivamento } from "./arquivamento";
import { Fechamento } from "./fechamento";
import { MarcosVenda, proximoPassoDaVenda } from "./marcos-venda";
import { AbaArquivos } from "./aba-arquivos";
import { AbaAtividades } from "./aba-atividades";
import { AbaProposta } from "./aba-proposta";
import { AbaSistema } from "./aba-sistema";
import { AbaVisao } from "./aba-visao";
import { Cabecalho } from "./cabecalho";
import { carregarFicha } from "./dados-ficha";

export default async function DetalheNegocio({ params, searchParams }: PageProps<"/negocios/[id]">) {
  const { atual } = await exigirPapel(...NEGOCIOS);
  const { id } = await params;
  // Gravação parcial na criação (códigos fixos; ver `criarNegocioComCliente`).
  const { avisos: avisosParam, aba: abaParam } = await searchParams;
  const avisos = avisosDaUrl(avisosParam);
  const ficha = await carregarFicha(atual, id, abaParam);
  const {
    negocio,
    config,
    cartao,
    nomes,
    arquivado,
    ehEletroposto,
    emissoes,
    proposta,
    propostaEletroposto,
    aberturas,
    obraDoNegocio,
    responsavelInativo,
    conferencia,
    semArquivo,
    abas,
    aba,
  } = ficha;

  // Proposta na jornada da venda (fora dos marcos do fechamento): emitida, link gerado ou ainda não gerada.
  // `emissoes` vem da versão mais recente para a mais antiga.
  const aberturasProposta = aberturas?.length ?? 0;
  const marcoProposta: Marco = {
    titulo: "Proposta",
    estado: emissoes.length > 0 || proposta || propostaEletroposto ? "cumprido" : "pendente",
    rotulo: ehEletroposto
      ? propostaEletroposto
        ? "Proposta de eletroposto gerada"
        : "Ainda não gerada"
      : emissoes.length > 0
        ? `v${emissoes[0].versao} emitida`
        : proposta
          ? aberturasProposta > 0
            ? `Link aberto ${aberturasProposta}x`
            : "Link gerado, ainda não aberto"
          : "Ainda não gerada",
    ancora: "#proposta",
  };
  // Única ação de escrita do cartão (ganho/perdido/reabrir). Com um próximo passo em destaque na barra,
  // "Marcar como ganho" vai para o menu: nunca há dois botões principais.
  const fechamento = (
    <Fechamento
      negocioId={negocio.id}
      status={negocio.status}
      motivos={config.motivos.filter((m) => m.ativo || m.id === negocio.motivo_perda_id)}
      somenteLeitura={atual.papel === "sdr" || arquivado}
      principal={cartao.tipo !== "marcos" || !proximoPassoDaVenda(cartao.marcos, marcoProposta, ehEletroposto)}
    />
  );

  // Uma única instância (tem ações de escrita); a página a põe no topo ou no fim da Visão geral.
  const arquivamento = (
    <Arquivamento
      negocioId={negocio.id}
      arquivamento={
        arquivado
          ? {
              quando: formatarDataHora(negocio.arquivado_em!),
              autor: negocio.arquivado_por ? nomes.membro(negocio.arquivado_por) : null,
              motivo: negocio.motivo_arquivamento ?? "",
            }
          : null
      }
      podeArquivar={pode(atual.papel, ARQUIVAR_NEGOCIO)}
      responsavelInativo={responsavelInativo}
      responsaveis={config.membros.filter((m) => m.ativo && pode(m.papel, RESPONSAVEL_COMERCIAL))}
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl animate-entrar flex-col gap-5">
      <Voltar href={`/negocios?funil=${negocio.funil_id}`}>Negócios</Voltar>
      <Cabecalho ficha={ficha} />
      {negocio.status === "perdido" && negocio.motivo_perda_id && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Motivo da perda: {nomes.motivo(negocio.motivo_perda_id)}
          {negocio.motivo_perda_detalhe && <> · {negocio.motivo_perda_detalhe}</>}
        </p>
      )}

      {/* Arquivado: o aviso (e o desarquivar) fica no topo, em todas as abas. Senão, o botão vai ao fim da Visão geral. */}
      {arquivado && arquivamento}

      {avisos.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">O negócio foi criado, mas nem tudo foi salvo:</p>
          <ul className="list-disc pl-5">
            {avisos.map((a) => (
              <li key={a}>{AVISOS_CRIACAO[a]}</li>
            ))}
          </ul>
          <Link href={`/negocios/${negocio.id}`} className="self-start text-xs font-medium underline">
            Entendi
          </Link>
        </div>
      )}
      {!conferencia.conferido && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Não foi possível conferir os arquivos deste negócio agora. Pode haver arquivo enviado pela metade; recarregue a
          página para conferir de novo.
        </p>
      )}
      {conferencia.conferido && (conferencia.semRegistro.length > 0 || semArquivo.size > 0) && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Há arquivos com envio incompleto. Veja em Arquivos.
        </p>
      )}

      {/* Jornada da venda: logo após o cabeçalho e fora das abas (no celular e no computador), com a
          única instância da ação de fechamento. Os links levam à aba onde ficam proposta, contrato e pagamento. */}
      <Cartao titulo={cartao.titulo}>
        {cartao.tipo === "marcos" ? (
          <MarcosVenda
            marcos={cartao.marcos}
            obra={obraDoNegocio}
            proposta={marcoProposta}
            hrefBase={`/negocios/${negocio.id}?aba=proposta`}
            soVenda={ehEletroposto}
          >
            {fechamento}
          </MarcosVenda>
        ) : (
          fechamento
        )}
      </Cartao>

      <nav aria-label="Seções do negócio" className="-mx-4 flex gap-1 overflow-x-auto border-b border-linha px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {abas.map((a) => (
          <Link
            key={a.id}
            href={`/negocios/${negocio.id}?aba=${a.id}`}
            scroll={false}
            aria-current={aba === a.id ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200 ease-raion ${
              aba === a.id ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
            }`}
          >
            {a.rotulo}
            {a.contador ? <span className="rounded-full bg-superficie-2 px-1.5 text-xs text-texto-2 tabular-nums">{a.contador}</span> : null}
          </Link>
        ))}
      </nav>

      {/* Cada aba renderiza só o seu conteúdo. */}
      {aba === "visao" && <AbaVisao ficha={ficha} arquivamento={!arquivado && arquivamento} />}
      {aba === "sistema" && <AbaSistema ficha={ficha} />}
      {/* Eletroposto: a aba mostra só o eletroposto (proposta própria; contrato e pagamento ficam de fora). */}
      {aba === "proposta" && <AbaProposta ficha={ficha} />}
      {aba === "atividades" && <AbaAtividades ficha={ficha} />}
      {aba === "arquivos" && <AbaArquivos ficha={ficha} />}
    </div>
  );
}
