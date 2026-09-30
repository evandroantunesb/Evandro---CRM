import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { alternarFunil, definirInicial, reordenarEtapa } from "./actions";
import {
  AlternarEtapa,
  CamposObrigatorios,
  CorEtapa,
  DiasConsideradoParado,
  FechaComoEtapa,
  HorasConsideradoSemContato,
  NovaEtapa,
  NovoFunil,
  Renomear,
} from "./formularios";

export default async function ConfigFunil() {
  const { atual } = await exigirPapel("admin");
  const { funis, etapas, diasConsideradoParado, horasConsideradoSemContato } = await carregarConfiguracao(atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Funis e etapas</h1>
      <p className="text-sm text-zinc-600">
        A etapa inicial é onde os negócios novos entram. Ganho e perdido ficam como status do negócio, separado da
        etapa — mas se quiser, pode marcar uma etapa pra fechar o negócio sozinha ao entrar nela (ganho direto, ou
        perdido pedindo o motivo no popup de mover). Em cada etapa você pode exigir campos preenchidos (ex.: valor
        antes de &quot;Proposta enviada&quot;).
      </p>
      {funis.map((funil) => {
        const doFunil = etapas.filter((e) => e.funilId === funil.id);
        return (
          <Cartao
            key={funil.id}
            acao={
              <form action={alternarFunil}>
                <input type="hidden" name="funilId" value={funil.id} />
                <input type="hidden" name="ativo" value={String(!funil.ativo)} />
                <button className="text-sm text-zinc-600 hover:underline">{funil.ativo ? "Desativar funil" : "Reativar funil"}</button>
              </form>
            }
          >
            <div className="mb-3 flex items-center gap-2">
              <Renomear tabela="funis" id={funil.id} nome={funil.nome} />
              {!funil.ativo && <Selo tom="negativo">Inativo</Selo>}
            </div>
            <ol className="mb-3 flex flex-col">
              {doFunil.map((etapa, i) => (
                <li key={etapa.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2">
                  <span className="w-5 text-sm text-zinc-400">{i + 1}</span>
                  <CorEtapa etapaId={etapa.id} cor={etapa.cor} />
                  <Renomear tabela="etapas" id={etapa.id} nome={etapa.nome} />
                  {etapa.inicial ? (
                    <Selo tom="atencao">Inicial</Selo>
                  ) : (
                    etapa.ativa && (
                      <form action={definirInicial}>
                        <input type="hidden" name="etapaId" value={etapa.id} />
                        <button className="text-sm text-zinc-600 hover:underline">Tornar inicial</button>
                      </form>
                    )
                  )}
                  {!etapa.ativa && <Selo tom="negativo">Inativa</Selo>}
                  {(["cima", "baixo"] as const).map((direcao) => (
                    <form key={direcao} action={reordenarEtapa}>
                      <input type="hidden" name="etapaId" value={etapa.id} />
                      <input type="hidden" name="direcao" value={direcao} />
                      <button
                        disabled={direcao === "cima" ? i === 0 : i === doFunil.length - 1}
                        aria-label={direcao === "cima" ? "Subir" : "Descer"}
                        className="rounded border border-zinc-300 px-2 text-sm disabled:opacity-30"
                      >
                        {direcao === "cima" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                  <AlternarEtapa etapaId={etapa.id} ativa={etapa.ativa} />
                  <FechaComoEtapa etapaId={etapa.id} fechaComo={etapa.fechaComo} />
                  <CamposObrigatorios etapaId={etapa.id} campos={etapa.camposObrigatorios} />
                </li>
              ))}
            </ol>
            <NovaEtapa funilId={funil.id} />
          </Cartao>
        );
      })}
      <Cartao titulo="Novo funil">
        <NovoFunil />
      </Cartao>
      <Cartao titulo="Alertas de inatividade">
        <div className="flex flex-col gap-3">
          <DiasConsideradoParado dias={diasConsideradoParado} />
          <HorasConsideradoSemContato horas={horasConsideradoSemContato} />
        </div>
      </Cartao>
    </div>
  );
}
