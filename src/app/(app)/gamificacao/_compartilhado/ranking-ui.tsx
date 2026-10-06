import { Crown } from "lucide-react";
import { BadgeGf, BarraProgressoGf, formatarNumeroGf, IniciaisAvatarGf } from "./ui";

/** Uma posição do ranking. `detalhe` (ex.: "Nível 3 · Veterano") é opcional. */
export type ItemRankingGf = {
  posicao: number;
  membroId: string;
  nome: string;
  total: number;
  detalhe?: string;
  /** URL assinada da foto de perfil; sem ela, aparecem as iniciais. */
  avatarUrl?: string;
};

/** Selo textual que identifica o usuário logado (não depende só de cor). */
export function SeloVoceGf() {
  return <BadgeGf tom="positivo">Você</BadgeGf>;
}

const ALTURA_PEDESTAL: Record<number, number> = { 1: 64, 2: 44, 3: 32 };

/**
 * Pódio dos 3 primeiros em ordem 2º–1º–3º (o 1º no centro, maior e dourado = prestígio).
 * `itens` deve vir ordenado por posição (1º primeiro). Aceita 1 ou 2 itens (colunas vazias
 * ficam em branco). Nomes quebram em até 2 linhas — sem truncar cedo.
 * `variante="grande"` (página de Ranking) adiciona pedestais; `"compacto"` serve ao cartão da
 * Visão geral, que tem pouca largura.
 */
export function PodioGf({
  itens,
  membroAtualId,
  variante = "compacto",
}: {
  itens: ItemRankingGf[];
  membroAtualId?: string;
  variante?: "compacto" | "grande";
}) {
  const grande = variante === "grande";
  // 2º–1º–3º; com menos de 3 pessoas só as colunas necessárias (sem coluna vazia ocupando espaço).
  const ordem = [itens[1], itens[0], itens[2]].filter((it): it is ItemRankingGf => Boolean(it));
  const colunas = ordem.length >= 3 ? "grid-cols-3" : ordem.length === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <ol aria-label="Pódio" className={`grid ${colunas} items-end ${grande ? "gap-2 sm:gap-4" : "gap-2"} ${grande && ordem.length < 3 ? "mx-auto max-w-xl" : ""}`}>
      {ordem.map((it) => {
        const primeiro = it.posicao === 1;
        const voce = it.membroId === membroAtualId;
        const tamanhoAvatar = primeiro ? (grande ? 76 : 52) : grande ? 56 : 40;
        return (
          <li key={it.membroId} className="flex min-w-0 flex-col items-center text-center">
            {primeiro && (
              <Crown
                size={grande ? 26 : 18}
                className="mb-1 text-[var(--gf-dourado)]"
                aria-hidden
                fill="currentColor"
                fillOpacity={0.15}
              />
            )}
            <IniciaisAvatarGf
              nome={it.nome}
              tamanho={tamanhoAvatar}
              tom={primeiro ? "dourado" : voce ? "verde" : "neutro"}
              src={it.avatarUrl}
            />
            <p
              className={`mt-2 w-full leading-tight font-semibold break-words text-[var(--gf-texto)] ${
                grande ? "line-clamp-2 text-base" : "line-clamp-3 text-sm"
              }`}
              title={it.nome}
            >
              {it.nome}
            </p>
            {voce && (
              <span className="mt-1">
                <SeloVoceGf />
              </span>
            )}
            {it.detalhe && <p className="gf-t-micro mt-0.5 w-full break-words">{it.detalhe}</p>}
            <p
              className={`gf-num mt-1 font-bold ${primeiro ? "text-[var(--gf-dourado)]" : "text-[var(--gf-texto)]"} ${
                grande ? "text-xl" : "text-sm"
              }`}
            >
              {formatarNumeroGf(it.total)}{" "}
              <span className="text-xs font-medium text-[var(--gf-texto-sec)]">XP</span>
            </p>
            {grande ? (
              <div
                className={`mt-3 flex w-full items-center justify-center rounded-t-lg border-t-2 font-titulo text-2xl font-bold ${
                  primeiro
                    ? "border-[var(--gf-dourado)] bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]"
                    : "border-[var(--gf-neutro-barra)] bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)]"
                }`}
                style={{ height: ALTURA_PEDESTAL[it.posicao] ?? 32 }}
              >
                {it.posicao}º
              </div>
            ) : (
              <span
                className={`mt-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ring-1 ring-inset ${
                  primeiro
                    ? "bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)] ring-[var(--gf-dourado-borda)]"
                    : "bg-[var(--gf-surface-alta)] text-[var(--gf-texto-sec)] ring-[var(--gf-borda)]"
                }`}
              >
                {it.posicao}º
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Linha da classificação. Sempre: posição, nome completo (trunca só se faltar espaço; `title`
 * traz o nome inteiro), selo "Você" para o usuário logado e XP. `avatar` adiciona as iniciais;
 * `maximo` (maior total da lista) adiciona a barra de XP; `larga` usa a grade horizontal
 * (posição · avatar · nome · barra · XP) quando o container tem >= 640 px.
 */
export function LinhaRankingGf({
  item,
  membroAtualId,
  maximo,
  avatar = false,
  larga = false,
}: {
  item: ItemRankingGf;
  membroAtualId?: string;
  maximo?: number;
  avatar?: boolean;
  larga?: boolean;
}) {
  const voce = item.membroId === membroAtualId;
  const primeiro = item.posicao === 1;
  const comBarra = maximo !== undefined;
  const tomBarra = primeiro ? "dourado" : voce ? "verde" : "neutro";

  return (
    <li
      aria-current={voce ? "true" : undefined}
      className={`gf-linha-rank ${avatar || larga ? "gf-linha-rank--avatar" : ""} ${larga ? "gf-linha-rank--larga" : ""} rounded-lg px-3 py-2.5 ${
        voce ? "bg-[var(--gf-verde-10)] ring-1 ring-[var(--gf-verde-borda)] ring-inset" : ""
      }`}
    >
      <span
        className={`gf-num text-center font-titulo text-base font-bold ${
          primeiro ? "text-[var(--gf-dourado)]" : item.posicao <= 3 ? "text-[var(--gf-texto)]" : "text-[var(--gf-texto-sec)]"
        }`}
      >
        {item.posicao}º
      </span>
      {(avatar || larga) && (
        <IniciaisAvatarGf
          nome={item.nome}
          tamanho={36}
          tom={primeiro ? "dourado" : voce ? "verde" : "neutro"}
          src={item.avatarUrl}
        />
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 line-clamp-2 text-sm leading-snug font-semibold break-words text-[var(--gf-texto)]" title={item.nome}>
            {item.nome}
          </span>
          {voce && <SeloVoceGf />}
        </div>
        {item.detalhe && <p className="gf-t-micro truncate">{item.detalhe}</p>}
      </div>
      <span className="gf-linha-rank-xp gf-num text-right text-sm font-bold whitespace-nowrap text-[var(--gf-texto)]">
        {formatarNumeroGf(item.total)}{" "}
        <span className="text-xs font-medium text-[var(--gf-texto-sec)]">XP</span>
      </span>
      {comBarra && (
        <div className="gf-linha-rank-barra">
          <BarraProgressoGf
            valor={Math.max(4, maximo > 0 ? (item.total / maximo) * 100 : 0)}
            rotulo={`XP de ${item.nome} em relação ao 1º lugar`}
            tom={tomBarra}
            tamanho="md"
          />
        </div>
      )}
    </li>
  );
}
