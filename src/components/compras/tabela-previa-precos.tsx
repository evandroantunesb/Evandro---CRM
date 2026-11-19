"use client";

import { CLASSE_ENTRADA, Selo } from "@/components/ui";
import {
  CATEGORIAS_MATERIAL,
  ROTULO_CATEGORIA_MATERIAL,
  normalizarUnidade,
  
  
  variacao,
  type CategoriaMaterial,
  type DecisaoNovo,
  type LinhaPrevia,
  type MaterialVM,
} from "@/lib/compras/precos";
import { palpiteCategoria, situacaoPotencia } from "@/lib/compras/potencia";
import { formatarMoeda } from "@/lib/formatacao";

/** Linhas mostradas por aba da prévia (a importação leva todas). */
const MOSTRAR = 200;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Tabela da prévia da importação: material na planilha, no Raion (com a escolha das linhas novas), preço e situação. */
export function TabelaPrevia({
  linhas: daAba,
  materiais,
  decisaoDe,
  aoMudar: mudar,
  comPotencia = false,
}: {
  linhas: LinhaPrevia[];
  materiais: MaterialVM[];
  decisaoDe: (l: LinhaPrevia) => DecisaoNovo;
  aoMudar: (l: LinhaPrevia, d: DecisaoNovo) => void;
  /** Mostra a coluna Potência (quando a planilha tem a coluna mapeada). */
  comPotencia?: boolean;
}) {
  const nomeMaterial = new Map(materiais.map((m) => [m.id, m.nome]));
  const porId = new Map(materiais.map((m) => [m.id, m]));
  // Material de destino da linha: o escolhido na prévia (linha nova) ou o reconhecido.
  const destino = (l: LinhaPrevia) => {
    if (l.situacao === "problema") return undefined;
    if (l.situacao === "novo") {
      const d = decisaoDe(l);
      return d.tipo === "ligar" ? porId.get(d.materialId) : undefined;
    }
    return l.materialId ? porId.get(l.materialId) : undefined;
  };
  return (
    <>
          {daAba.length === 0 ? (
            <p className="border-t border-linha px-4 py-4 text-sm text-texto-2 md:px-6">Nenhuma linha aqui.</p>
          ) : (
            <div className="overflow-x-auto border-t border-linha">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-linha text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium md:px-6">Linha</th>
                    <th className="px-2 py-2 font-medium">Material na planilha</th>
                    <th className="px-2 py-2 font-medium">No Raion</th>
                    <th className="px-2 py-2 text-right font-medium">Preço</th>
                    {comPotencia && <th className="px-2 py-2 font-medium">Potência</th>}
                    <th className="px-4 py-2 font-medium md:px-6">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {daAba.slice(0, MOSTRAR).map((l) => (
                    <tr key={l.numero} className="border-b border-linha align-top last:border-b-0">
                      <td className="px-4 py-2 tabular-nums md:px-6">{l.numero}</td>
                      <td className="px-2 py-2">
                        <span className="text-texto">{l.descricao || "—"}</span>
                        {(l.codigo || l.unidade) && (
                          <span className="block text-xs text-texto-2">{[l.codigo && `Cód. ${l.codigo}`, l.unidade].filter(Boolean).join(" · ")}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {l.situacao === "novo" ? (
                          <DecisaoLinha linha={l} decisao={decisaoDe(l)} materiais={materiais} aoMudar={(d) => mudar(l, d)} />
                        ) : l.materialId ? (
                          nomeMaterial.get(l.materialId)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                        {l.precoAnterior != null && l.precoAnterior !== l.preco && (
                          <span className="mr-1.5 text-xs text-texto-2 line-through">{formatarMoeda(l.precoAnterior)}</span>
                        )}
                        {l.preco != null ? formatarMoeda(l.preco) : "—"}
                      </td>
                      {comPotencia && (
                        <td className="px-2 py-2">
                          <PotenciaPrevia lida={l.potencia} material={destino(l)} />
                        </td>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap md:px-6">
                        {l.situacao === "subiu" && <Selo tom="atencao">Subiu {pct(variacao(l.precoAnterior!, l.preco!))}</Selo>}
                        {l.situacao === "baixou" && <Selo>Baixou {pct(-variacao(l.precoAnterior!, l.preco!))}</Selo>}
                        {l.situacao === "novo" && <Selo>Novo</Selo>}
                        {l.situacao === "igual" && <span className="text-texto-2">Igual</span>}
                        {l.situacao === "problema" && <Selo tom="negativo">{l.problema}</Selo>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {daAba.length > MOSTRAR && (
                <p className="border-t border-linha px-4 py-2 text-xs text-texto-2 md:px-6">
                  Mostrando {MOSTRAR} de {daAba.length.toLocaleString("pt-BR")} linhas. A importação leva todas.
                </p>
              )}
            </div>
          )}
    </>
  );
}

/** Linha nova: criar material (nome e categoria) ou ligar a um já cadastrado. Também usada na lista de equipamentos. */
export function DecisaoLinha({
  linha,
  decisao,
  materiais,
  aoMudar,
}: {
  linha: Pick<LinhaPrevia, "numero" | "descricao" | "unidade">;
  decisao: DecisaoNovo;
  materiais: MaterialVM[];
  aoMudar: (d: DecisaoNovo) => void;
}) {
  const criar = () =>
    aoMudar({ tipo: "criar", nome: linha.descricao.slice(0, 120), categoria: palpiteCategoria(linha.descricao), unidade: normalizarUnidade(linha.unidade) });
  return (
    <div className="flex min-w-56 flex-col gap-1.5">
      <select
        aria-label={`Material da linha ${linha.numero}`}
        value={decisao.tipo === "ligar" ? decisao.materialId : ""}
        onChange={(e) => (e.target.value ? aoMudar({ tipo: "ligar", materialId: e.target.value }) : criar())}
        className={`${CLASSE_ENTRADA} text-sm`}
      >
        <option value="">Criar material novo</option>
        {materiais.map((m) => (
          <option key={m.id} value={m.id}>
            Ligar a: {m.nome}
          </option>
        ))}
      </select>
      {decisao.tipo === "criar" && (
        <div className="flex gap-1.5">
          <input
            aria-label={`Nome do material novo da linha ${linha.numero}`}
            value={decisao.nome}
            maxLength={120}
            onChange={(e) => aoMudar({ ...decisao, nome: e.target.value })}
            className={`${CLASSE_ENTRADA} min-w-0 flex-1 text-sm`}
          />
          <select
            aria-label={`Categoria do material novo da linha ${linha.numero}`}
            value={decisao.categoria}
            onChange={(e) => aoMudar({ ...decisao, categoria: e.target.value as CategoriaMaterial })}
            className={`${CLASSE_ENTRADA} text-sm`}
          >
            {CATEGORIAS_MATERIAL.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_MATERIAL[c]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

const formatarW = (w: number) => `${w.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} W`;

/**
 * Potência da linha e o que acontece com ela (decisão de 18/11/2026: a potência cadastrada nunca é trocada pela
 * planilha; só material sem potência é completado).
 */
export function PotenciaPrevia({ lida, material }: { lida: number | null; material: { potenciaW: number | null } | undefined }) {
  const s = situacaoPotencia(lida, material);
  if (s === "sem") return <span className="text-texto-2">—</span>;
  if (s === "ilegivel") return <Selo tom="negativo">Não lida, segue sem potência</Selo>;
  return (
    <span className="flex flex-col items-start gap-1 whitespace-nowrap">
      <span className="tabular-nums">{formatarW(lida!)}</span>
      {s === "nova" && <Selo tom="atencao">Entra no cadastro</Selo>}
      {s === "preenche" && <Selo tom="atencao">Completa o cadastro</Selo>}
      {s === "ja" && <span className="text-xs text-texto-2">Já cadastrada</span>}
      {s === "diferente" && <Selo>Diferente: fica {formatarW(material!.potenciaW!)}</Selo>}
    </span>
  );
}
