import { Award, Briefcase, CheckSquare, KanbanSquare, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { obterSessao } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL } from "@/lib/tipos";

export default async function Inicio() {
  const sessao = await obterSessao();
  const atual = sessao.atual;
  if (!atual) redirect(sessao.superAdmin ? "/super-admin" : "/sem-acesso");

  const { atrasadas, hoje } = await contarMinhasTarefas(atual.empresaId, atual.membroId);
  const { quantidade: negociosAbertos, valor: valorEmAberto } = await contarMeusNegocios(atual.empresaId, atual.membroId);

  const atalhos = [
    { href: "/negocios", rotulo: "Negócios", Icone: KanbanSquare },
    { href: "/tarefas", rotulo: "Tarefas", Icone: CheckSquare },
    { href: "/contatos", rotulo: "Contatos", Icone: Users },
    { href: "/gamificacao", rotulo: "Gamificação", Icone: Award },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Olá, {sessao.nome.split(" ")[0]}</h1>
        <p className="text-sm text-zinc-500">
          Você está em <strong className="font-medium text-zinc-700">{atual.empresaNome}</strong> como{" "}
          {ROTULO_PAPEL[atual.papel]}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador Icone={Briefcase} valor={String(negociosAbertos)} legenda="Negócios em andamento" />
        <Indicador Icone={Wallet} valor={formatarMoeda(valorEmAberto)} legenda="Valor em aberto" />
        <Indicador Icone={CheckSquare} valor={String(atrasadas)} legenda="Tarefas atrasadas" tom={atrasadas ? "negativo" : undefined} />
        <Indicador Icone={CheckSquare} valor={String(hoje)} legenda="Tarefas para hoje" />
      </div>

      <Cartao titulo="Atalhos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {atalhos.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-zinc-200 p-4 text-center text-sm font-medium text-zinc-700 transition-colors hover:border-dourado hover:text-carvao"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dourado/10 text-dourado">
                <a.Icone size={18} />
              </span>
              {a.rotulo}
            </Link>
          ))}
        </div>
      </Cartao>
    </div>
  );
}

function Indicador({
  Icone,
  valor,
  legenda,
  tom,
}: {
  Icone: ComponentType<{ size?: number }>;
  valor: string;
  legenda: string;
  tom?: "negativo";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dourado/10 text-dourado">
        <Icone size={16} />
      </span>
      <p className={`truncate text-xl font-semibold ${tom === "negativo" ? "text-red-700" : "text-zinc-900"}`}>{valor}</p>
      <p className="text-xs text-zinc-500">{legenda}</p>
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

async function contarMeusNegocios(empresaId: string, membroId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("negocios")
    .select("valor")
    .eq("empresa_id", empresaId)
    .eq("responsavel_id", membroId)
    .eq("status", "aberto")
    .limit(10000);
  return { quantidade: data?.length ?? 0, valor: (data ?? []).reduce((soma, n) => soma + (n.valor ?? 0), 0) };
}
