import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { LinhaItem, NovoItem } from "./formularios";

export default async function ConfigListas() {
  const { atual } = await exigirPapel("admin");
  const { etiquetas, motivos } = await carregarConfiguracao(atual.empresaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Etiquetas e motivos de perda</h1>
      <Cartao titulo={`Etiquetas (${etiquetas.length})`}>
        <p className="mb-3 text-sm text-zinc-600">
          Marcações livres nos negócios, para filtrar o Kanban. Ex.: cliente quente, empresa, rural, financiamento.
        </p>
        {etiquetas.map((e) => (
          <LinhaItem key={e.id} tipo="etiqueta" item={{ id: e.id, nome: e.nome, cor: e.cor, ativo: e.ativa }} />
        ))}
        <div className="mt-3">
          <NovoItem tipo="etiqueta" />
        </div>
      </Cartao>
      <Cartao titulo={`Motivos de perda (${motivos.length})`}>
        <p className="mb-3 text-sm text-zinc-600">
          O vendedor escolhe um deles ao marcar um negócio como perdido. Motivo desativado some das opções, mas os negócios
          antigos continuam com ele.
        </p>
        {motivos.map((m) => (
          <LinhaItem key={m.id} tipo="motivo" item={m} />
        ))}
        <div className="mt-3">
          <NovoItem tipo="motivo" />
        </div>
      </Cartao>
    </div>
  );
}
