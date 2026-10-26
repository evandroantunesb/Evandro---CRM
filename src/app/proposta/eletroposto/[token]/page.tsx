import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizarModelos, numeroPropostaEletroposto, type ModeloEletroposto } from "@/lib/eletroposto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { DocumentoEletroposto, type DadosPropostaEletroposto } from "./documento";
import { BotaoImprimir } from "./imprimir";
import "./proposta-eletroposto.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proposta de eletroposto", robots: { index: false, follow: false } };

/** Lê a proposta pelo token do link (chave de serviço: o token é a autorização de leitura, como na proposta solar). */
async function carregar(token: string): Promise<DadosPropostaEletroposto | null> {
  const admin = criarClienteAdmin();
  const { data: registro } = await admin
    .from("negocios_eletroposto")
    .select("empresa_id, modelos, precos, emitida_em, negocios(numero, responsavel_id, contatos(nome, endereco, telefone))")
    .eq("token", token)
    .maybeSingle();
  if (!registro) return null;
  const negocio = registro.negocios as unknown as {
    numero: number;
    responsavel_id: string | null;
    contatos: { nome: string; endereco: string | null; telefone: string | null } | null;
  } | null;
  if (!negocio?.contatos) return null;

  const [{ data: empresa }, { data: identidade }, { data: responsavel }] = await Promise.all([
    admin.from("empresas").select("nome").eq("id", registro.empresa_id).maybeSingle(),
    admin.from("proposta_identidades").select("nome_exibicao").eq("empresa_id", registro.empresa_id).maybeSingle(),
    negocio.responsavel_id
      ? admin.from("empresa_membros").select("perfis(nome, telefone)").eq("id", negocio.responsavel_id).eq("empresa_id", registro.empresa_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const perfil = (responsavel as { perfis: { nome: string; telefone: string | null } | null } | null)?.perfis ?? null;

  const modelos = normalizarModelos(registro.modelos);
  if (!modelos.length) return null;
  return {
    numero: numeroPropostaEletroposto(negocio.numero),
    emitidaEm: registro.emitida_em,
    modelos,
    precos: registro.precos as Partial<Record<ModeloEletroposto, number>>,
    cliente: negocio.contatos,
    // Identidade visual do Raion por enquanto (decisão do Evandro): o nome da empresa vai em texto, sem logo.
    empresa: { nome: identidade?.nome_exibicao?.trim() || empresa?.nome || "" },
    consultor: { nome: perfil?.nome?.trim() || null, whatsapp: perfil?.telefone?.trim() || null },
  };
}

/** Página pública da proposta de eletroposto: o cliente abre pelo link, sem login, e imprime ou salva em PDF. */
export default async function PropostaEletroposto({ params }: PageProps<"/proposta/eletroposto/[token]">) {
  const { token } = await params;
  const dados = await carregar(token);
  if (!dados) notFound();

  return (
    <main className="pev">
      <div className="barra">
        <span>
          <strong>Proposta de eletroposto</strong> · {dados.cliente.nome}
        </span>
        <BotaoImprimir />
      </div>
      <DocumentoEletroposto dados={dados} />
    </main>
  );
}
