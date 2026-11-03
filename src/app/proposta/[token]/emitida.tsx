import { LogoRaion } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { formatarDataHora, formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { dataBr, textoCondicoesComerciais, textoPremissaGeracao, type DadosEmissaoSimples } from "@/lib/propostas/proposta-simples";
import { ROTULO_TIPO_COMPONENTE_KIT } from "@/lib/tipos";

/** Proposta emitida (simples): renderizada SÓ a partir dos dados congelados na emissão. */
export function PropostaEmitida({ token, dados }: { token: string; dados: DadosEmissaoSimples }) {
  const vencida = dados.comercial.validadeAte < hojeEmSaoPaulo();
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
        </dl>
        {dados.sistema.geracao && <p className="mt-3 text-xs text-zinc-500">{textoPremissaGeracao(dados)}</p>}
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
        <p className="text-2xl font-semibold text-carvao">{formatarMoeda(dados.preco.valor)}</p>
        <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-700">{textoCondicoesComerciais(dados)}</p>
      </Cartao>

      <p className="text-xs text-zinc-500">{dados.rodape}</p>
    </main>
  );
}
