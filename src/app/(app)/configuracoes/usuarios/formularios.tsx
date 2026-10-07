"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import {
  PAPEIS_CADASTRAVEIS,
  PERFIS_GAMIFICACAO,
  ROTULO_PAPEL,
  ROTULO_PERFIL_GAMIFICACAO,
  ROTULO_STATUS_MEMBRO,
  ROTULO_TIPO_VENDEDOR,
  STATUS_MEMBRO,
  TIPOS_VENDEDOR,
  type Papel,
  type PerfilGamificacao,
  type StatusMembro,
  type TipoVendedor,
} from "@/lib/tipos";
import { atualizarMembro, carregarCarteiraAberta, convidarMembro, desligarComTransferencia, type CarteiraAberta } from "./actions";

export function FormularioConvite() {
  const [resultado, acao, pendente] = useActionState(convidarMembro, null);
  const [papel, setPapel] = useState<Papel>("vendedor");
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Nome" name="nome" required />
      <Campo rotulo="E-mail" name="email" type="email" required />
      <Selecao rotulo="Perfil" name="papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
        {PAPEIS_CADASTRAVEIS.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Tipo de vendedor" name="tipo_vendedor" disabled={papel !== "vendedor"} defaultValue="interno">
        {TIPOS_VENDEDOR.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_VENDEDOR[t]}
          </option>
        ))}
      </Selecao>
      {papel !== "vendedor" && <input type="hidden" name="tipo_vendedor" value="interno" />}
      <Selecao rotulo="Perfil de gamificação (opcional)" name="perfil_gamificacao" defaultValue="">
        <option value="">Sem perfil (fora do ranking)</option>
        {PERFIS_GAMIFICACAO.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PERFIL_GAMIFICACAO[p]}
          </option>
        ))}
      </Selecao>
      <Campo
        rotulo="Senha (opcional)"
        name="senha"
        type="text"
        placeholder="Deixe em branco para gerar automática"
      />
      <div className="flex flex-col gap-2 md:col-span-2">
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={pendente} className="self-start">
          {pendente ? "Criando..." : "Criar usuário"}
        </Botao>
      </div>
    </form>
  );
}

export type MembroLinha = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  tipoVendedor: TipoVendedor | null;
  perfilGamificacao: PerfilGamificacao | null;
  recebeLeads: boolean;
  status: StatusMembro;
};

export function LinhaMembro({ membro }: { membro: MembroLinha }) {
  const [resultado, acao, pendente] = useActionState(atualizarMembro, null);
  const [papel, setPapel] = useState<Papel>(membro.papel);
  const [status, setStatus] = useState<StatusMembro>(membro.status);
  const [carteira, setCarteira] = useState<CarteiraAberta | null>(null);
  const [carregandoCarteira, iniciarCarregamentoCarteira] = useTransition();

  function onStatusChange(novo: StatusMembro) {
    setStatus(novo);
    if (novo === "desligado" && membro.status !== "desligado") {
      iniciarCarregamentoCarteira(async () => {
        setCarteira(await carregarCarteiraAberta(membro.id));
      });
    } else {
      setCarteira(null);
    }
  }

  if (carteira) {
    return (
      <PainelDesligamento
        membro={membro}
        carteira={carteira}
        onCancelar={() => {
          setCarteira(null);
          setStatus(membro.status);
        }}
      />
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 py-3 md:flex-row md:items-center">
      <input type="hidden" name="membroId" value={membro.id} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">{membro.nome || "(sem nome)"}</p>
        <p className="truncate text-sm text-zinc-500">{membro.email}</p>
      </div>
      <Selecao name="papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} aria-label="Perfil">
        {PAPEIS_CADASTRAVEIS.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </Selecao>
      <Selecao
        name="tipo_vendedor"
        defaultValue={membro.tipoVendedor ?? "interno"}
        disabled={papel !== "vendedor"}
        aria-label="Tipo de vendedor"
      >
        {TIPOS_VENDEDOR.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_VENDEDOR[t]}
          </option>
        ))}
      </Selecao>
      {papel !== "vendedor" && <input type="hidden" name="tipo_vendedor" value="interno" />}
      <Selecao name="perfil_gamificacao" defaultValue={membro.perfilGamificacao ?? ""} aria-label="Perfil de gamificação">
        <option value="">Sem perfil (fora do ranking)</option>
        {PERFIS_GAMIFICACAO.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PERFIL_GAMIFICACAO[p]}
          </option>
        ))}
      </Selecao>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="recebe_leads" defaultChecked={membro.recebeLeads} /> Recebe leads
      </label>
      <Selecao name="status" value={status} onChange={(e) => onStatusChange(e.target.value as StatusMembro)} aria-label="Status">
        {STATUS_MEMBRO.map((s) => (
          <option key={s} value={s}>
            {ROTULO_STATUS_MEMBRO[s]}
          </option>
        ))}
      </Selecao>
      <Botao type="submit" variante="secundario" disabled={pendente || carregandoCarteira}>
        {carregandoCarteira ? "Verificando carteira..." : "Salvar"}
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

/** Aparece no lugar da linha quando o gestor tenta desligar alguém com negócios em aberto na carteira. */
function PainelDesligamento({
  membro,
  carteira,
  onCancelar,
}: {
  membro: MembroLinha;
  carteira: CarteiraAberta;
  onCancelar: () => void;
}) {
  const [resultado, acao, pendente] = useActionState(desligarComTransferencia, null);
  const [modo, setModo] = useState<"aleatorio" | "manual">("aleatorio");
  const [destinos, setDestinos] = useState<string[]>(carteira.vendedores.map((v) => v.id));
  const temNegocios = carteira.negocios.length > 0;
  const semDestino = temNegocios && carteira.vendedores.length === 0;

  useEffect(() => {
    if (resultado?.ok) onCancelar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);

  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 bg-amber-50/60 py-3">
      <input type="hidden" name="membroId" value={membro.id} />
      <p className="text-sm font-medium text-zinc-900">
        Desligar {membro.nome || membro.email}
        {temNegocios ? ` — ${carteira.negocios.length} negócio(s) em aberto na carteira` : " — sem negócios em aberto na carteira"}
      </p>

      {semDestino && (
        <p className="text-sm text-red-700">
          Não há outro vendedor ativo pra receber a carteira. Ative alguém antes de desligar {membro.nome || "essa pessoa"}.
        </p>
      )}

      {temNegocios && !semDestino && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="radio" name="modo" value="aleatorio" checked={modo === "aleatorio"} onChange={() => setModo("aleatorio")} />
            Distribuir aleatoriamente entre:
          </label>
          {modo === "aleatorio" && (
            <div className="ml-6 flex flex-wrap gap-3">
              {carteira.vendedores.map((v) => (
                <label key={v.id} className="flex items-center gap-1 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    name="destinos"
                    value={v.id}
                    checked={destinos.includes(v.id)}
                    onChange={(e) =>
                      setDestinos((atual) => (e.target.checked ? [...atual, v.id] : atual.filter((id) => id !== v.id)))
                    }
                  />
                  {v.nome}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="radio" name="modo" value="manual" checked={modo === "manual"} onChange={() => setModo("manual")} />
            Escolher manualmente por negócio
          </label>
          {modo === "manual" && (
            <div className="ml-6 flex flex-col gap-1">
              {carteira.negocios.map((n) => (
                <label key={n.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <span className="w-56 truncate">
                    #{n.numero} — {n.contatoNome}
                  </span>
                  <Selecao name={`destino_${n.id}`} defaultValue={carteira.vendedores[0]?.id}>
                    {carteira.vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nome}
                      </option>
                    ))}
                  </Selecao>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {!temNegocios && <input type="hidden" name="modo" value="aleatorio" />}

      <div className="flex items-center gap-2">
        <Botao type="submit" variante="perigo" disabled={pendente || semDestino}>
          {pendente ? "Desligando..." : "Confirmar e desligar"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onCancelar} disabled={pendente}>
          Cancelar
        </Botao>
      </div>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
