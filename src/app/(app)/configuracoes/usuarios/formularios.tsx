"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, Campo, FOCO, Mensagem, Selecao } from "@/components/ui";
import { ROTULO_SETOR, SETORES_OBRA } from "@/lib/obras/rotulos";
import {
  GRUPOS_PERFIL,
  PERFIL,
  ehPerfilSetor,
  papelDoPerfil,
  setoresOferecidos,
  type Atuacao,
  type Capacidade,
  type PerfilUsuario,
} from "@/lib/perfis-usuario";
import {
  PERFIS_GAMIFICACAO,
  ROTULO_PERFIL_GAMIFICACAO,
  ROTULO_TIPO_VENDEDOR,
  TIPOS_VENDEDOR,
  type Papel,
  type PerfilGamificacao,
  type StatusMembro,
  type TipoVendedor,
} from "@/lib/tipos";
import { atualizarMembro, carregarCarteiraAberta, convidarMembro, type CarteiraAberta } from "./actions";
import { PainelDesligamento } from "./desligamento";

export type MembroLinha = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /** Perfil exibido (papel, ou o setor principal da Operação); null = Operação sem setor. */
  perfil: PerfilUsuario | null;
  tipoVendedor: TipoVendedor | null;
  perfilGamificacao: PerfilGamificacao | null;
  recebeLeads: boolean;
  status: StatusMembro;
  /** Null quando os setores não puderam ser carregados. */
  setores: { setor: string; capacidade: string; principal: boolean }[] | null;
};

const ROTULO_ATUACAO: Record<Atuacao, string> = { sem_acesso: "Não atua", executar: "Executa", coordenar: "Coordena" };

/** Botões de escolha única em pílula (rádio nativo por baixo: teclado e leitor de tela funcionam como sempre). */
function Pilulas<T extends string>({ name, opcoes, valor, onChange, rotulo }: { name: string; opcoes: readonly T[]; valor: T; onChange: (v: T) => void; rotulo: (v: T) => string }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {opcoes.map((op) => (
        <label
          key={op}
          className={`grid min-h-9 cursor-pointer place-items-center rounded-full px-1 text-xs whitespace-nowrap ring-1 ring-linha transition-colors duration-200 ease-raion has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-dourado/60 ${
            valor === op ? "bg-carvao font-semibold text-offwhite ring-carvao" : "text-texto-2 hover:text-texto"
          }`}
        >
          <input type="radio" name={name} value={op} checked={valor === op} onChange={() => onChange(op)} className="sr-only" />
          {rotulo(op)}
        </label>
      ))}
    </div>
  );
}

/**
 * Painel à direita da lista (no celular, a tela toda): cria (`membro` nulo) ou edita uma pessoa, pelo desenho
 * "Usuários com perfil único". O perfil define papel e setores; o banco confere tudo de novo.
 */
export function PainelPessoa({
  membro,
  fecharHref,
  setoresDesligados,
}: {
  membro: MembroLinha | null;
  fecharHref: string;
  /** Setores da obra que a empresa desligou: não são oferecidos, salvo os que a pessoa já tem. */
  setoresDesligados: readonly string[];
}) {
  const novo = membro === null;
  const [resultado, acao, pendente] = useActionState(novo ? convidarMembro : atualizarMembro, null);
  // Sem o reset do React 19: os campos voltariam ao valor inicial com o estado em outro.
  const enviar = useEnvioSemReset(acao);

  const capacidadeAtual = (setor: string) => membro?.setores?.find((s) => s.setor === setor)?.capacidade as Capacidade | undefined;
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(membro ? membro.perfil : "vendedor");
  const [capacidade, setCapacidade] = useState<Capacidade>((membro?.perfil && capacidadeAtual(membro.perfil)) || "executar");
  const [outros, setOutros] = useState<Record<string, Atuacao>>(() =>
    Object.fromEntries(SETORES_OBRA.map((s) => [s, s === membro?.perfil ? "sem_acesso" : (capacidadeAtual(s) ?? "sem_acesso")])),
  );
  const [status, setStatus] = useState<StatusMembro>(membro?.status ?? "ativo");
  const [carteira, setCarteira] = useState<CarteiraAberta | null>(null);
  const [verificando, iniciarVerificacao] = useTransition();

  if (carteira && membro) {
    return (
      <aside className="painel p-5" aria-label={`Desligar ${membro.nome || membro.email}`}>
        <PainelDesligamento membro={membro} carteira={carteira} onCancelar={() => setCarteira(null)} />
      </aside>
    );
  }

  const papel = perfil ? papelDoPerfil(perfil) : null;
  const setorDoPerfil = perfil && ehPerfilSetor(perfil) ? perfil : null;
  // Comercial e Gestão: ranking (e, no comercial, tipo e leads). Só ajusta campos do cadastro, não dá acesso.
  const camposComerciais = papel === "vendedor" || papel === "sdr" || papel === "gestor" || papel === "admin";
  const oferecidos = setoresOferecidos(new Set(setoresDesligados), [...(membro?.setores ?? []).map((s) => s.setor), ...(membro?.perfil ? [membro.perfil] : [])]);
  const outrosAtivos = SETORES_OBRA.filter((s) => s !== setorDoPerfil && outros[s] !== "sem_acesso").length;
  const eraOperacao = membro?.papel === "operacao";
  const nomeExibido = membro ? membro.nome || membro.email : "Nova pessoa";

  return (
    <aside className="painel p-5" aria-label={novo ? "Convidar pessoa" : `Editar ${nomeExibido}`}>
      <div className="mb-2 flex items-center gap-3">
        {membro ? <Avatar nome={membro.nome || membro.email} tamanho={44} /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-titulo text-lg font-semibold tracking-tight text-texto">{nomeExibido}</p>
          {membro && <p className="text-xs break-all text-texto-2">{membro.email}</p>}
        </div>
        <Link href={fecharHref} className={`rounded-lg text-sm text-texto-2 hover:text-texto ${FOCO}`}>
          Fechar
        </Link>
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-4">
        {membro && <input type="hidden" name="membroId" value={membro.id} />}
        {novo && (
          <div className="grid gap-3">
            <Campo rotulo="Nome" name="nome" required autoComplete="off" />
            <Campo rotulo="E-mail" name="email" type="email" required autoComplete="off" />
            <Campo rotulo="Senha (opcional)" name="senha" type="text" placeholder="Em branco: gera uma automática" autoComplete="off" />
          </div>
        )}

        <fieldset>
          <legend className="text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">Perfil</legend>
          {membro?.perfil === null && (
            <p className="mt-2 rounded-xl bg-dourado/10 p-3 text-xs text-texto">Esta pessoa é da Operação, mas ainda não tem setor. Escolha o perfil dela.</p>
          )}
          {GRUPOS_PERFIL.map((g) => (
            <div key={g.titulo}>
              <p className="mt-3.5 mb-1.5 text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">{g.titulo}</p>
              {g.perfis.filter((p) => !ehPerfilSetor(p) || oferecidos.includes(p)).map((p) => (
                <label
                  key={p}
                  className={`mt-1.5 flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 ring-1 ring-linha transition-colors duration-200 ease-raion has-[:focus-visible]:ring-dourado/60 ${
                    perfil === p ? "bg-dourado/10 ring-2 ring-carvao" : "hover:bg-superficie-2"
                  }`}
                >
                  <input type="radio" name="perfil" value={p} checked={perfil === p} onChange={() => setPerfil(p)} required className="mt-0.5 accent-carvao" />
                  <span>
                    <b className="block text-sm text-texto">{PERFIL[p].rotulo}</b>
                    <span className="block text-xs leading-snug text-texto-2">{PERFIL[p].descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>

        {setorDoPerfil && (
          <>
            <fieldset>
              <legend className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">No {ROTULO_SETOR[setorDoPerfil]}, esta pessoa</legend>
              <Pilulas name="capacidade" opcoes={["executar", "coordenar"] as const} valor={capacidade} onChange={setCapacidade} rotulo={(v) => ROTULO_ATUACAO[v]} />
              <p className="mt-2 text-xs leading-relaxed text-texto-2">
                Executa: atua nas obras em que foi colocada. Coordena: vê todas as obras do setor e distribui o trabalho.
              </p>
            </fieldset>
            <details className="border-t border-linha pt-3.5" open={outrosAtivos > 0}>
              <summary className={`cursor-pointer rounded-lg text-sm font-semibold text-texto ${FOCO}`}>Também atua em outros setores ({outrosAtivos})</summary>
              <div className="mt-2">
                {oferecidos.filter((s) => s !== setorDoPerfil).map((s) => (
                  <fieldset key={s} className="grid gap-1.5 md:grid-cols-[100px_minmax(0,1fr)] md:items-center md:gap-2 border-t border-linha py-2 first:border-0">
                    <legend className="sr-only">{ROTULO_SETOR[s]}</legend>
                    <span aria-hidden className="text-sm font-semibold text-texto">
                      {ROTULO_SETOR[s]}
                    </span>
                    <Pilulas
                      name={`outro_${s}`}
                      opcoes={["sem_acesso", "executar", "coordenar"] as const}
                      valor={outros[s]}
                      onChange={(v) => setOutros((o) => ({ ...o, [s]: v }))}
                      rotulo={(v) => ROTULO_ATUACAO[v]}
                    />
                  </fieldset>
                ))}
              </div>
            </details>
          </>
        )}

        {camposComerciais && (
          <div className="grid gap-3">
            {papel === "vendedor" && (
              <Selecao rotulo="Tipo de vendedor" name="tipo_vendedor" defaultValue={membro?.tipoVendedor ?? "interno"}>
                {TIPOS_VENDEDOR.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_VENDEDOR[t]}
                  </option>
                ))}
              </Selecao>
            )}
            <Selecao
              rotulo={papel === "vendedor" || papel === "sdr" ? "Perfil no ranking" : "Perfil no ranking (opcional)"}
              name="perfil_gamificacao"
              defaultValue={membro?.perfilGamificacao ?? (novo && papel === "vendedor" ? "closer" : novo && papel === "sdr" ? "sdr" : "")}
              key={papel}
            >
              <option value="">Fora do ranking</option>
              {PERFIS_GAMIFICACAO.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERFIL_GAMIFICACAO[p]}
                </option>
              ))}
            </Selecao>
            {(papel === "vendedor" || papel === "sdr") && (
              <label className="flex items-center gap-2 text-sm text-texto">
                <input type="checkbox" name="recebe_leads" defaultChecked={membro ? membro.recebeLeads : true} className="accent-carvao" />
                Recebe leads
              </label>
            )}
          </div>
        )}

        <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
          Perfis da Operação ficam fora do ranking da Gamificação. Vendedor e SDR escolhem o perfil do ranking aqui mesmo.
        </p>
        {membro && !eraOperacao && papel === "operacao" && (
          <p className="text-xs text-texto-2">Ao salvar, a pessoa deixa de acessar o comercial e a gamificação. Confira a carteira dela antes.</p>
        )}
        {membro && eraOperacao && camposComerciais && (
          <p className="text-xs text-texto-2">Ao salvar, os setores e as participações nas obras desta pessoa são removidos.</p>
        )}
        {membro && papel === "operacao" && status !== "ativo" && (
          <p className="text-xs text-texto-2">Fora de Ativo, a pessoa perde os setores e as participações nas obras. Ao reativar, salve o perfil de novo.</p>
        )}

        <Mensagem resultado={resultado} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4">
          {membro && membro.status !== "desligado" ? (
            <button
              type="button"
              disabled={verificando}
              onClick={() => iniciarVerificacao(async () => setCarteira(await carregarCarteiraAberta(membro.id)))}
              className={`rounded-lg text-sm font-medium text-erro hover:underline disabled:opacity-60 ${FOCO}`}
            >
              {verificando ? "Verificando carteira..." : "Desligar"}
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-3">
            {membro && (
              <Selecao name="status" value={status} onChange={(e) => setStatus(e.target.value as StatusMembro)} aria-label="Status">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                {membro.status === "desligado" && <option value="desligado">Desligado</option>}
              </Selecao>
            )}
            <Botao type="submit" disabled={pendente || perfil === null}>
              {pendente ? "Salvando..." : novo ? "Criar usuário" : "Salvar"}
            </Botao>
          </span>
        </div>
      </form>
    </aside>
  );
}
