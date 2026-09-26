import QRCode from "qrcode";
import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { env } from "@/lib/env";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinkFormulario } from "./link-formulario";
import { NovoFormulario } from "./formularios";

export default async function ConfigCaptura() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ funis, origens }, { data: formularios }] = await Promise.all([
    carregarConfiguracao(atual.empresaId),
    supabase
      .from("formularios")
      .select("id, nome, token, ativo, funis(nome), origens(nome)")
      .eq("empresa_id", atual.empresaId)
      .order("created_at", { ascending: false }),
  ]);

  const lista = await Promise.all(
    (formularios ?? []).map(async (f) => {
      const funil = f.funis as unknown as { nome: string } | null;
      const origem = f.origens as unknown as { nome: string } | null;
      const link = `${env.siteUrl}/captura/${f.token}`;
      return {
        formulario: { id: f.id, nome: f.nome, ativo: f.ativo, funil: funil?.nome ?? "—", origem: origem?.nome ?? "—" },
        link,
        qrCode: await QRCode.toDataURL(link, { margin: 1, width: 224 }),
      };
    }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Captura de leads</h1>
      <p className="text-sm text-zinc-600">
        Crie um link (e QR Code) para divulgar. Quem preencher o formulário vira um lead novo, já distribuído
        automaticamente entre os vendedores marcados para receber leads.
      </p>
      <Cartao titulo="Novo formulário">
        <NovoFormulario funis={funis.filter((f) => f.ativo)} origens={origens.filter((o) => o.ativa)} />
      </Cartao>
      <Cartao titulo={`Formulários (${lista.length})`}>
        {lista.length === 0 && <p className="text-sm text-zinc-500">Nenhum formulário criado ainda.</p>}
        {lista.map(({ formulario, link, qrCode }) => (
          <LinkFormulario key={formulario.id} formulario={formulario} link={link} qrCode={qrCode} />
        ))}
      </Cartao>
    </div>
  );
}
