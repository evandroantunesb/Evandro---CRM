import { Cartao } from "@/components/ui";
import { PADROES_DIMENSIONAMENTO } from "@/lib/calculadora";
import { paraEquipamentoAtivo } from "@/lib/dimensionamento";
import { participaDoMotor } from "@/lib/equipamentos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { SimuladorDimensionamento } from "./simulador";

/** Número vindo do banco, ou o padrão quando a coluna ainda não existe/está vazia. */
function numeroOu(valor: unknown, padrao: number) {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : padrao;
}

/** Aba "Calculadora": simulação administrativa do motor de dimensionamento (não grava nada). */
export default async function SimulacaoCalculadora() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: parametros }, { data: equipamentos }] = await Promise.all([
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
    // Mesmo recorte de "Adicionar negócio": ativos e com status técnico que participa do motor.
    supabase
      .from("equipamentos_empresa")
      .select("*")
      .eq("empresa_id", atual.empresaId)
      .eq("ativo", true)
      .order("tipo")
      .order("prioridade", { ascending: false }),
  ]);
  const catalogoMotor = (equipamentos ?? []).filter((e) => participaDoMotor(e.status_tecnico));

  return (
    <Cartao titulo="Simular dimensionamento">
      <p className="mb-3 text-sm text-zinc-600">
        Teste o motor com um consumo hipotético e veja o kit que ele recomendaria com o Catálogo e os Parâmetros de
        hoje. Nada é salvo e nenhum negócio é criado.
      </p>
      <SimuladorDimensionamento
        parametros={{
          produtividadeKwhKwpMes: parametros ? numeroOu(parametros.produtividade_kwh_kwp_mes, 0) || null : null,
          margemDimensionamentoPct: numeroOu(
            parametros?.margem_dimensionamento_pct,
            PADROES_DIMENSIONAMENTO.margemDimensionamentoPct,
          ),
          overloadMaximoPct: numeroOu(parametros?.overload_maximo_pct, PADROES_DIMENSIONAMENTO.overloadMaximoPct),
          overloadCriticoPct: numeroOu(parametros?.overload_critico_pct, PADROES_DIMENSIONAMENTO.overloadCriticoPct),
          temperaturaMinimaProjetoC: numeroOu(
            parametros?.temperatura_minima_projeto_c,
            PADROES_DIMENSIONAMENTO.temperaturaMinimaProjetoC,
          ),
        }}
        modulos={catalogoMotor.filter((e) => e.tipo === "modulo").map(paraEquipamentoAtivo)}
        inversores={catalogoMotor.filter((e) => e.tipo === "inversor").map(paraEquipamentoAtivo)}
      />
    </Cartao>
  );
}
