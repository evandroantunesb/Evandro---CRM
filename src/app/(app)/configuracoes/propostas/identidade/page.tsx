import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormIdentidade } from "./form-identidade";

const EXPIRA_SEGUNDOS = 3600;

export default async function ConfigIdentidadeProposta() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: identidade } = await supabase.from("proposta_identidades").select("*").eq("empresa_id", atual.empresaId).maybeSingle();

  async function assinar(caminho: string | null) {
    if (!caminho) return null;
    const { data } = await supabase.storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS);
    return data?.signedUrl ?? null;
  }

  const [logoUrl, logoEscuroUrl, fotoCapaUrl] = await Promise.all([
    assinar(identidade?.logo_url ?? null),
    assinar(identidade?.logo_escuro_url ?? null),
    assinar(identidade?.foto_capa_url ?? null),
  ]);

  return (
    <div className="pt-4">
      <FormIdentidade
        empresaId={atual.empresaId}
        identidade={{
          nomeExibicao: identidade?.nome_exibicao ?? "",
          corPrimaria: identidade?.cor_primaria ?? "",
          corDestaque: identidade?.cor_destaque ?? "",
          whatsapp: identidade?.whatsapp ?? "",
          rodapeTexto: identidade?.rodape_texto ?? "",
          logoCaminho: identidade?.logo_url ?? null,
          logoEscuroCaminho: identidade?.logo_escuro_url ?? null,
          fotoCapaCaminho: identidade?.foto_capa_url ?? null,
        }}
        preview={{ logoUrl, logoEscuroUrl, fotoCapaUrl }}
      />
    </div>
  );
}
