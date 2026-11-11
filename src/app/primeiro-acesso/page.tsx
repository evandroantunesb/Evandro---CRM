import { redirect } from "next/navigation";
import { avancarAssistente, concluirAssistente } from "@/lib/acoes/assistente";
import { estadoDoPasso, passoAnterior, passoDoEstado, passosDoPlano, type ChavePasso } from "@/lib/assistente";
import { lerOnboarding } from "@/lib/assistente-servidor";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";
import { MolduraAssistente } from "./moldura";
import { ConteudoDoPasso } from "./passos";

/**
 * Assistente de primeiro acesso (Onboarding, subprojeto 3): só o admin. Sem `?passo`, abre onde parou. Revendo
 * (`?rever=1`, ou já concluído), só navega; o último passo volta a Configurações.
 */
export default async function PrimeiroAcesso({ searchParams }: { searchParams: Promise<{ passo?: string; rever?: string }> }) {
  const { atual, vinculos } = await exigirPapel("admin");
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const [onboarding, telas, { data: identidade }] = await Promise.all([
    lerOnboarding(supabase, atual.empresaId),
    obterTelasEmpresa(),
    supabase.from("proposta_identidades").select("nome_exibicao").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  const rever = params.rever === "1" || !!onboarding?.concluido_em;
  // Sem assistente para a empresa e sem pedido para rever: nada a fazer aqui.
  if (!onboarding && !rever) redirect("/inicio");

  const passos = passosDoPlano(telas.solo);
  const estado = onboarding ?? { passo_atual: passos.length, pulados: [] };
  const chave: ChavePasso = passos.includes(params.passo as ChavePasso) ? (params.passo as ChavePasso) : passoDoEstado(estado, passos);
  const anterior = passoAnterior(passos, chave);
  const sufixo = rever ? "&rever=1" : "";
  const estados = Object.fromEntries(passos.map((p) => [p, estadoDoPasso(estado, passos, p)])) as Record<ChavePasso, "feito" | "pulado" | "pendente">;

  return (
    <MolduraAssistente
      solo={telas.solo}
      nomeEmpresa={identidade?.nome_exibicao || atual.empresaNome}
      passos={passos}
      atual={chave}
      estados={estados}
      anteriorHref={anterior ? `/primeiro-acesso?passo=${anterior}${sufixo}` : null}
      pular={chave === "revisar" ? null : avancarAssistente.bind(null, chave, true, rever)}
      outrasEmpresas={vinculos.filter((v) => v.empresaId !== atual.empresaId).map((v) => ({ id: v.empresaId, nome: v.empresaNome }))}
    >
      <ConteudoDoPasso
        chave={chave}
        empresaId={atual.empresaId}
        nomeEmpresa={identidade?.nome_exibicao || atual.empresaNome}
        rever={rever}
        passos={passos}
        estados={estados}
        continuar={avancarAssistente.bind(null, chave, false, rever)}
        concluir={concluirAssistente.bind(null, rever)}
      />
    </MolduraAssistente>
  );
}
