import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { carregarConfiguracao, formatarDataHora } from "@/lib/crm";
import { REGRAS_TEMPERATURA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { SinalTemperatura } from "@/lib/temperatura";
import { EditorRegras, type RegraEditavel } from "./editor";

/** Regras de temperatura: admin e gestor montam a lista; vale na hora para todos os negócios abertos da empresa. */
export default async function RegrasTemperatura() {
  const { atual } = await exigirPapel(...REGRAS_TEMPERATURA);
  const supabase = await criarClienteServidor();
  const [{ data: linhas }, config] = await Promise.all([
    supabase
      .from("regras_temperatura")
      .select("id, sinal, parametros, temperatura, ordem, ativa, atualizado_por, updated_at")
      .eq("empresa_id", atual.empresaId)
      .order("ordem"),
    carregarConfiguracao(atual.empresaId),
  ]);

  const regras: RegraEditavel[] = (linhas ?? []).map((r) => ({
    id: r.id,
    sinal: r.sinal as SinalTemperatura,
    ativa: r.ativa,
    temperatura: r.temperatura as "quente" | "frio",
    parametros: (r.parametros ?? {}) as RegraEditavel["parametros"],
  }));

  // Última alteração feita por alguém (as regras nascem sem autor; o histórico completo fica na auditoria).
  const ultima = (linhas ?? [])
    .filter((r) => r.atualizado_por)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const autor = ultima ? (config.membros.find((m) => m.id === ultima.atualizado_por)?.nome ?? "usuário removido") : null;

  const nomeFunil = new Map(config.funis.map((f) => [f.id, f.nome]));
  const etapas = config.etapas
    .filter((e) => e.ativa)
    .map((e) => ({ id: e.id, nome: config.funis.length > 1 ? `${nomeFunil.get(e.funilId) ?? ""} · ${e.nome}` : e.nome }));

  return (
    <div className="mx-auto flex max-w-3xl animate-entrar flex-col gap-6">
      {/* O gestor chega pela tela de Negócios (o hub de Configurações é só do admin). */}
      <CabecalhoPagina
        detalhe
        voltar={atual.papel === "admin" ? { href: "/configuracoes", rotulo: "Configurações" } : { href: "/negocios", rotulo: "Negócios" }}
        sobretitulo="Configurações · Comercial"
        titulo="Temperatura dos negócios"
        descricao="Regras que deixam um negócio Quente ou Frio."
      />
      <p className="text-sm text-texto-2">
        O sistema confere as regras ligadas de cima para baixo: a primeira que se aplica define se o negócio está Quente ou Frio, e o nome
        dela aparece no card como o motivo. Se nenhuma se aplica, o negócio fica Morno. Vale para todos os negócios abertos da empresa.
      </p>
      {ultima && autor && (
        <p className="text-xs text-texto-2">
          Última alteração por {autor} em {formatarDataHora(ultima.updated_at)}.
        </p>
      )}
      {regras.length ? (
        <EditorRegras regras={regras} etapas={etapas} />
      ) : (
        <p className="text-sm text-texto-2">As regras desta empresa ainda não foram criadas.</p>
      )}
    </div>
  );
}
