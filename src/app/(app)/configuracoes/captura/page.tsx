import QRCode from "qrcode";
import { Voltar } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { env } from "@/lib/env";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { NovoFormularioColapsavel } from "./formularios";
import { PainelFormularios } from "./painel-formularios";

export default async function ConfigCaptura() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ funis, origens }, { data: formularios }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase
      .from("formularios")
      .select("id, nome, token, ativo, visualizacoes, preenchimentos, funis(nome), origens(nome)")
      .eq("empresa_id", atual.empresaId)
      .order("created_at", { ascending: false }),
  ]);

  const lista = await Promise.all(
    (formularios ?? []).map(async (f) => {
      const funil = f.funis as unknown as { nome: string } | null;
      const origem = f.origens as unknown as { nome: string } | null;
      const link = `${env.siteUrl}/captura/${f.token}`;
      let qrCode: string | null = null;
      try {
        qrCode = await QRCode.toDataURL(link, { margin: 4, width: 224, errorCorrectionLevel: "M" });
      } catch (erro) {
        // O link funciona sem o QR Code — não vale derrubar a página inteira por isso.
        console.error("Falha ao gerar QR Code do formulário", f.id, erro);
      }
      return {
        formulario: {
          id: f.id,
          nome: f.nome,
          ativo: f.ativo,
          visualizacoes: f.visualizacoes,
          preenchimentos: f.preenchimentos,
          funil: funil?.nome ?? "—",
          origem: origem?.nome ?? "—",
        },
        link,
        qrCode,
      };
    }),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Voltar href="/configuracoes">Configurações</Voltar>
      <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">Captura de leads</h1>
      <p className="text-sm text-texto-2">
        Crie um link (e QR Code) para divulgar. Quem preencher o formulário vira um lead novo, já distribuído
        automaticamente entre os vendedores marcados para receber leads.
      </p>
      <NovoFormularioColapsavel funis={funis.filter((f) => f.ativo)} origens={origens.filter((o) => o.ativa)} />
      <h2 className="text-sm font-semibold tracking-wide text-texto-2 uppercase">Formulários ({lista.length})</h2>
      <PainelFormularios itens={lista} />
    </div>
  );
}
