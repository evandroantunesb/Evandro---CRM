import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioParametros, LinhaKit, NovoKit } from "./formularios";

export default async function ConfigCalculadora() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ kits }, { data: parametros }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).single(),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Kits e calculadora</h1>
      <Cartao titulo={`Kits (${kits.length})`}>
        <p className="mb-3 text-sm text-zinc-600">
          Kits prontos do catálogo, com potência e preço. O vendedor escolhe um deles na calculadora do negócio.
        </p>
        {kits.map((k) => (
          <LinhaKit key={k.id} item={k} />
        ))}
        <div className="mt-3">
          <NovoKit />
        </div>
      </Cartao>
      <Cartao titulo="Parâmetros da calculadora">
        <p className="mb-3 text-sm text-zinc-600">
          Usados na estimativa de economia (modo comercial, sem simulação de engenharia). Valide estes números com o
          engenheiro responsável antes de usar com clientes.
        </p>
        {parametros && (
          <FormularioParametros
            parametros={{
              produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
              percentualFioB: parametros.percentual_fio_b,
              disponibilidadeMonoKwh: parametros.disponibilidade_mono_kwh,
              disponibilidadeBiKwh: parametros.disponibilidade_bi_kwh,
              disponibilidadeTriKwh: parametros.disponibilidade_tri_kwh,
            }}
          />
        )}
      </Cartao>
    </div>
  );
}
