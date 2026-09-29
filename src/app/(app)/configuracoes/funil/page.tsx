import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { DiasConsideradoParado, HorasConsideradoSemContato, ListaFunis, NovoFunil } from "./formularios";

export default async function ConfigFunil() {
  const { atual } = await exigirPapel("admin");
  const { funis, etapas, diasConsideradoParado, horasConsideradoSemContato } = await carregarConfiguracao(atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Funis e etapas</h1>
      <ListaFunis funis={funis} etapas={etapas} />
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
