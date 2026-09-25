import Link from "next/link";
import { redirect } from "next/navigation";
import { Cartao } from "@/components/ui";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL } from "@/lib/tipos";

export default async function Inicio() {
  const sessao = await obterSessao();
  if (!sessao.atual) redirect(sessao.superAdmin ? "/super-admin" : "/sem-acesso");
  const { atrasadas, hoje } = await contarMinhasTarefas(sessao.atual.empresaId, sessao.atual.membroId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Olá, {sessao.nome.split(" ")[0]}</h1>
      <Cartao>
        <p className="text-sm text-zinc-700">
          Você está em <strong>{sessao.atual.empresaNome}</strong> como{" "}
          <strong>{ROTULO_PAPEL[sessao.atual.papel]}</strong>. 
        </p>
        <Link href="/negocios" className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline">
          Ir para os negócios →
        </Link>
      </Cartao>
      <Cartao titulo="Suas tarefas">
        <div className="flex gap-6">
          <p className="text-sm text-zinc-700">
            <span className={`block text-2xl font-semibold ${atrasadas ? "text-red-700" : "text-zinc-900"}`}>{atrasadas}</span>
            atrasadas
          </p>
          <p className="text-sm text-zinc-700">
            <span className="block text-2xl font-semibold text-zinc-900">{hoje}</span>
            para hoje
          </p>
        </div>
        <Link href="/tarefas" className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline">
          Ver tarefas →
        </Link>
      </Cartao>
    </div>
  );
}

async function contarMinhasTarefas(empresaId: string, membroId: string) {
  const agora = new Date();
  // Fim do dia no horário de Brasília (UTC-3).
  const fimDoDia = new Date(`${agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T23:59:59.999-03:00`);
  const supabase = await criarClienteServidor();
  const base = () =>
    supabase
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("responsavel_id", membroId)
      .is("concluida_em", null);
  const [{ count: atrasadas }, { count: hoje }] = await Promise.all([
    base().lt("vence_em", agora.toISOString()),
    base().gte("vence_em", agora.toISOString()).lte("vence_em", fimDoDia.toISOString()),
  ]);
  return { atrasadas: atrasadas ?? 0, hoje: hoje ?? 0 };
}
