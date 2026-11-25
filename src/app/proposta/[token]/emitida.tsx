import { LogoRaion } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { formatarDataHora, formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { secoesCondicoesEmitidas } from "@/lib/condicoes-pagamento-exibicao";
import type { CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import {
  coberturaDoConsumo,
  dataBr,
  economiaDaEmissao,
  linkWhatsappDaProposta,
  mensalDaEmissao,
  temConteudoV6,
  textoCondicoesComerciais,
  textoPremissaGeracao,
  type DadosEmissaoSimples,
  type Institucional,
} from "@/lib/propostas/proposta-simples";
import { ROTULO_TIPO_COMPONENTE_KIT } from "@/lib/tipos";
import { EconomiaDaProposta } from "./economia";
import { GeracaoMensalDaProposta } from "./geracao-mensal";

/** Proposta emitida (simples): renderizada SÓ a partir dos dados congelados na emissão. */
export function PropostaEmitida({ token, dados }: { token: string; dados: DadosEmissaoSimples }) {
  const vencida = dados.comercial.validadeAte < hojeEmSaoPaulo();
  const cobertura = coberturaDoConsumo(dados);
  const institucional = temConteudoV6(dados) ? dados.institucional : null;
  const posVenda = temConteudoV6(dados) ? dados.comercial.posVenda : null;
  const whatsapp = temConteudoV6(dados) ? linkWhatsappDaProposta(dados) : null;
  const economia = economiaDaEmissao(dados);
  const mensal = mensalDaEmissao(dados);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <LogoRaion altura={32} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.3em] text-zinc-500 uppercase">Proposta de energia solar</p>
          <h1 className="mt-1 text-2xl font-semibold text-carvao">{dados.cliente.nome}</h1>
          {dados.cliente.endereco && <p className="text-sm text-zinc-600">{dados.cliente.endereco}</p>}
          <p className="mt-1 text-xs text-zinc-500">
            Versão {dados.emissao.versao} · emitida em {formatarDataHora(dados.emissao.emitidaEm)}
          </p>
        </div>
        <a
          href={`/proposta/${token}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-carvao hover:border-dourado"
        >
          Baixar PDF
        </a>
      </div>

      {vencida && (
        <div role="status" data-testid="proposta-vencida" className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Esta proposta venceu em {dataBr(dados.comercial.validadeAte)}. Fale com o seu vendedor para solicitar uma nova.
        </div>
      )}

      {institucional && <SobreAEmpresa inst={institucional} />}

      <Cartao titulo="O sistema">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-500">Potência</dt>
            <dd className="font-medium text-zinc-900">{dados.sistema.potenciaKwp.toLocaleString("pt-BR")} kWp</dd>
          </div>
          {dados.sistema.modulos && (
            <div>
              <dt className="text-zinc-500">Módulos</dt>
              <dd className="font-medium text-zinc-900">
                {dados.sistema.modulos.quantidade}
                {dados.sistema.modulos.potenciaW ? ` de ${dados.sistema.modulos.potenciaW.toLocaleString("pt-BR")} W` : ""}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-zinc-500">Consumo informado</dt>
            <dd>{dados.sistema.consumoMedioKwh.toLocaleString("pt-BR")} kWh/mês</dd>
          </div>
          {dados.sistema.geracao && (
            <div>
              <dt className="text-zinc-500">Geração estimada</dt>
              <dd className="font-medium text-zinc-900">{dados.sistema.geracao.kwhMes.toLocaleString("pt-BR")} kWh/mês</dd>
            </div>
          )}
          {cobertura != null && (
            <div>
              <dt className="text-zinc-500">Cobertura do consumo</dt>
              <dd className="font-medium text-zinc-900">{cobertura.toLocaleString("pt-BR")}%</dd>
            </div>
          )}
        </dl>
        {dados.sistema.geracao && <p className="mt-3 text-xs text-zinc-500">{textoPremissaGeracao(dados)}</p>}
        {mensal && <GeracaoMensalDaProposta mensal={mensal} />}
      </Cartao>

      <Cartao titulo="Equipamentos">
        <ul className="flex flex-col gap-1 text-sm text-zinc-800">
          {dados.sistema.componentes.map((c, i) => (
            <li key={i}>
              {c.quantidade}x {ROTULO_TIPO_COMPONENTE_KIT[c.tipo]} — {c.descricao}
              {c.potenciaW != null ? ` (${c.potenciaW} W)` : ""}
            </li>
          ))}
        </ul>
      </Cartao>

      {economia && <EconomiaDaProposta economia={economia} />}

      {(dados.comercial.incluso || dados.comercial.exclusos) && (
        <Cartao titulo="O que está incluso">
          <div className="grid gap-4 text-sm text-zinc-800 sm:grid-cols-2">
            {dados.comercial.incluso && (
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-green-700 uppercase">Incluso</p>
                <ul className="list-disc pl-5">
                  {dados.comercial.incluso.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            {dados.comercial.exclusos && (
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-red-700 uppercase">Não incluso</p>
                <ul className="list-disc pl-5">
                  {dados.comercial.exclusos.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Cartao>
      )}

      {dados.comercial.garantias && (
        <Cartao titulo="Garantias">
          <ul className="list-disc pl-5 text-sm text-zinc-800">
            {dados.comercial.garantias.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Investimento">
        <p data-testid="preco-proposta" className="text-2xl font-semibold text-carvao tabular-nums">{formatarMoeda(dados.preco.valor)}</p>
        {dados.esquema !== 4 ? (
          <CondicoesPagamento condicoes={dados.comercial.condicoesPagamento} validadeAte={dados.comercial.validadeAte} />
        ) : (
          <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-700">{textoCondicoesComerciais(dados)}</p>
        )}
      </Cartao>

      {dados.comercial.etapas && (
        <Cartao titulo="Do contrato à energia ligada">
          <ol className="flex flex-col gap-3 text-sm">
            {dados.comercial.etapas.map((et, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dourado text-xs font-semibold text-dourado-texto">{i + 1}</span>
                <div>
                  <p className="font-medium text-zinc-900">
                    {et.titulo}
                    {et.prazo && <span className="font-normal text-dourado-texto"> · {et.prazo}</span>}
                  </p>
                  {et.descricao && <p className="text-zinc-600">{et.descricao}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Cartao>
      )}

      {posVenda && (
        <Cartao titulo="Depois da instalação">
          <ul className="list-disc pl-5 text-sm text-zinc-800">
            {posVenda.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </Cartao>
      )}

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Falar com o consultor no WhatsApp
        </a>
      )}

      <p className="text-xs text-zinc-500">{dados.rodape}</p>
    </main>
  );
}

/** "Sobre a empresa": só o que a empresa escreveu nos blocos institucionais, como no PDF. */
function SobreAEmpresa({ inst }: { inst: Institucional }) {
  return (
    <Cartao titulo="Sobre a empresa">
      <div className="flex flex-col gap-4 text-sm text-zinc-800">
        {inst.sobre && <p className="whitespace-pre-line">{inst.sobre}</p>}
        {inst.numeros && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {inst.numeros.map((n, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-3">
                <dd className="text-lg font-semibold text-carvao">{n.valor}</dd>
                <dt className="text-xs text-zinc-500">{n.rotulo}</dt>
              </div>
            ))}
          </dl>
        )}
        {inst.projetos && (
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-dourado-texto uppercase">Projetos que já entregamos</p>
            <ul className="flex flex-col gap-1">
              {inst.projetos.map((pr, i) => (
                <li key={i}>
                  <span className="font-medium text-zinc-900">{pr.titulo}</span>
                  {pr.descricao && <span className="text-zinc-600"> · {pr.descricao}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {inst.depoimentos && (
          <div className="grid gap-3 sm:grid-cols-2">
            {inst.depoimentos.map((d, i) => (
              <figure key={i} className="rounded-lg border border-zinc-200 p-3">
                <blockquote className="text-zinc-800">“{d.texto}”</blockquote>
                <figcaption className="mt-2 text-xs font-medium text-dourado-texto">{d.nome}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {inst.equipe && (
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-dourado-texto uppercase">Nossa equipe</p>
            <ul className="flex flex-col gap-1">
              {inst.equipe.map((m, i) => (
                <li key={i}>
                  <span className="font-medium text-zinc-900">{m.nome}</span>
                  {m.registro && <span className="text-zinc-600"> · {m.registro}</span>}
                  {m.texto && <span className="block text-zinc-600">{m.texto}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Cartao>
  );
}

/** Condições por modalidade (esquema 5), no mesmo arranjo do PDF: à vista e parcelado lado a lado; financiamento e
 * Personalizado em largura total; no celular, um embaixo do outro. */
function CondicoesPagamento({ condicoes, validadeAte }: { condicoes: CondicoesEmitidas; validadeAte: string }) {
  return (
    <div className="mt-4 flex flex-col gap-3" data-testid="condicoes-pagamento">
      <p className="text-xs font-medium tracking-wide text-dourado-texto uppercase">Condições de pagamento</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {secoesCondicoesEmitidas(condicoes).map((s) => (
          <div
            key={s.modalidade}
            className={`flex min-w-0 flex-col gap-1.5 rounded-lg border border-zinc-200 p-3 ${s.modalidade === "financiamento" || s.modalidade === "personalizado" ? "sm:col-span-2" : ""}`}
          >
            <p className="text-xs font-medium tracking-wide text-dourado-texto uppercase">{s.titulo}</p>
            {s.subtitulo && <p className="text-xs text-zinc-500">{s.subtitulo}</p>}
            {s.modalidade === "aVista" ? (
              <p className="text-xl font-semibold text-carvao tabular-nums">{s.itens[0]!.valor}</p>
            ) : s.modalidade === "parcelado" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-0.5 text-sm text-zinc-800 tabular-nums">
                {s.itens.map((it) => (
                  <li key={it.valor}>{it.valor}</li>
                ))}
              </ul>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-4 gap-y-2 text-sm">
                {s.itens.map((it, i) => (
                  <li key={i}>
                    <span className="font-medium text-zinc-900 tabular-nums">{it.valor}</span>
                    {it.detalhe && <span className="block text-xs text-zinc-500">{it.detalhe}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {condicoes.observacao && <p className="text-sm text-zinc-600">{condicoes.observacao}</p>}
      <p className="text-xs text-zinc-500">Proposta válida até {dataBr(validadeAte)}.</p>
    </div>
  );
}
