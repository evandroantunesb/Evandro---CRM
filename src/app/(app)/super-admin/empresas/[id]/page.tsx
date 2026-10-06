import Link from "next/link";
import { notFound } from "next/navigation";
import { Botao, Cartao, Selo } from "@/components/ui";
import { trocarEmpresa } from "@/lib/acoes/empresa-atual";
import { exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL, ROTULO_TIPO_VENDEDOR, type Papel, type TipoVendedor } from "@/lib/tipos";
import { alterarSituacao } from "../../actions";
import { FormularioAdmin, FormularioEdicaoEmpresa, FormularioPlano } from "../../formularios";
import { SeloSituacao } from "../../situacao";

export default async function Empresa({ params }: PageProps<"/super-admin/empresas/[id]">) {
  const sessao = await exigirSuperAdmin();
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: empresa }, { data: plano }] = await Promise.all([
    supabase
      .from("empresas")
      .select("id, nome, cnpj, situacao, created_at, empresa_membros(id, papel, tipo_vendedor, ativo, perfis(nome, email))")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("planos_empresa")
      .select("tipo, modelo_cobranca, valor_fixo, valor_por_usuario, dia_vencimento, limite_usuarios")
      .eq("empresa_id", id)
      .maybeSingle(),
  ]);
  if (!empresa) notFound();

  const outrasSituacoes = (["ativa", "suspensa", "cancelada"] as const).filter((s) => s !== empresa.situacao);
  // Só entra quem já tem vínculo ativo com a empresa (e a empresa está ativa) — os mesmos
  // `vinculos` que o seletor lateral usa; trocarEmpresa() confere de novo no servidor.
  const vinculo = sessao.vinculos.find((v) => v.empresaId === empresa.id);
  const ehAtual = sessao.atual?.empresaId === empresa.id;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href="/super-admin" className="text-sm text-zinc-600 hover:underline">
        ← Empresas
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{empresa.nome}</h1>
        <SeloSituacao situacao={empresa.situacao} />
        {ehAtual && <Selo>Empresa atual</Selo>}
        {vinculo && (
          <form action={trocarEmpresa} className="ml-auto">
            <input type="hidden" name="empresaId" value={empresa.id} />
            <Botao>Entrar na empresa</Botao>
          </form>
        )}
      </div>
      {!vinculo && (
        <p className="text-sm text-zinc-500">Para entrar nesta empresa, você precisa ser membro ativo dela e ela precisa estar ativa.</p>
      )}
      <Cartao titulo="Dados da empresa">
        <FormularioEdicaoEmpresa empresa={{ id: empresa.id, nome: empresa.nome, cnpj: empresa.cnpj }} />
      </Cartao>
      <Cartao titulo="Situação">
        <p className="mb-3 text-sm text-zinc-600">
          Empresa suspensa ou cancelada perde o acesso na hora. Os dados continuam guardados.
        </p>
        <div className="flex gap-2">
          {outrasSituacoes.map((s) => (
            <form key={s} action={alterarSituacao}>
              <input type="hidden" name="empresaId" value={empresa.id} />
              <input type="hidden" name="situacao" value={s} />
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
                {{ ativa: "Reativar", suspensa: "Suspender", cancelada: "Cancelar" }[s]}
              </button>
            </form>
          ))}
        </div>
      </Cartao>
      <Cartao titulo="Plano e cobrança">
        <FormularioPlano empresaId={empresa.id} plano={plano ?? null} />
      </Cartao>
      <Cartao titulo="Adicionar admin">
        <FormularioAdmin empresaId={empresa.id} />
      </Cartao>
      <Cartao titulo={`Usuários (${empresa.empresa_membros.length})`}>
        <ul>
          {empresa.empresa_membros.map((m) => {
            const perfil = m.perfis as unknown as { nome: string; email: string } | null;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{perfil?.nome || "(sem nome)"}</span>{" "}
                  <span className="text-zinc-500">{perfil?.email}</span>
                </span>
                <Selo>{ROTULO_PAPEL[m.papel as Papel]}</Selo>
                {m.tipo_vendedor && <Selo>{ROTULO_TIPO_VENDEDOR[m.tipo_vendedor as TipoVendedor]}</Selo>}
                {!m.ativo && <Selo tom="negativo">Inativo</Selo>}
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}
