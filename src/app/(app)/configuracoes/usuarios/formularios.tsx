"use client";

import { HardHat, Phone, ShieldCheck, Handshake, UserCog, type LucideIcon } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { ROTULO_SETOR, SETORES_OBRA } from "@/lib/obras/rotulos";
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
import { atualizarMembro, carregarCarteiraAberta, convidarMembro, desligarComTransferencia, salvarSetoresMembro, type CarteiraAberta } from "./actions";

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
      <Selecao rotulo="Perfil de gamificação (opcional)" name="perfil_gamificacao" defaultValue="" disabled={papel === "operacao"}>
        <option value="">Sem perfil (fora do ranking)</option>
        {PERFIS_GAMIFICACAO.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PERFIL_GAMIFICACAO[p]}
          </option>
        ))}
      </Selecao>
      {papel === "operacao" && (
        <fieldset className="rounded-xl bg-superficie-2 p-4 md:col-span-2">
          <legend className="px-1 text-sm font-medium text-texto">Setores desta pessoa</legend>
          <p className="mb-3 text-xs text-texto-2">Escolha em quais setores esta pessoa poderá executar ou coordenar. A configuração será salva junto com o cadastro.</p>
          <CamposSetores setores={[]} />
        </fieldset>
      )}
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
  setores: { setor: string; capacidade: string }[] | null;
};

const PAPEIS_CONVERTIVEIS_EM_OPERACAO: readonly Papel[] = ["admin", "gestor", "vendedor", "sdr"];

/** Ícone discreto por papel, ao lado do nome — sem cor nova, só para orientação visual rápida na lista. */
const ICONE_PAPEL: Record<Papel, LucideIcon> = {
  admin: ShieldCheck,
  gestor: UserCog,
  vendedor: Handshake,
  sdr: Phone,
  operacao: HardHat,
};

/**
 * Degradê bem sutil por papel, só com os tons já aprovados (dourado/carvão/cinza): papéis comerciais em
 * dourado, decrescente por hierarquia; Operação (módulo de obras, fora do comercial) em cinza.
 */
const DEGRADE_PAPEL: Record<Papel, string> = {
  admin: "from-dourado/14 via-dourado/4",
  gestor: "from-dourado/9 via-dourado/2",
  vendedor: "from-dourado/5 via-transparent",
  sdr: "from-cinza/10 via-transparent",
  operacao: "from-cinza/14 via-cinza/3",
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

  const IconePapel = ICONE_PAPEL[papel];
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-linha bg-superficie-2 bg-gradient-to-br ${DEGRADE_PAPEL[papel]} p-4 md:p-5`}
    >
      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="membroId" value={membro.id} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <IconePapel size={18} aria-hidden className="mt-0.5 shrink-0 text-texto-2" />
            <div className="min-w-0">
              <p className="truncate font-medium text-texto">{membro.nome || "(sem nome)"}</p>
              <p className="truncate text-sm text-texto-2">{membro.email}</p>
            </div>
          </div>
          <Botao type="submit" disabled={pendente || carregandoCarteira} className="shrink-0">
            {carregandoCarteira ? "Verificando carteira..." : "Salvar"}
          </Botao>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Selecao rotulo="Perfil" name="papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {PAPEIS_CADASTRAVEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo="Tipo de vendedor"
            name="tipo_vendedor"
            defaultValue={membro.tipoVendedor ?? "interno"}
            disabled={papel !== "vendedor"}
          >
            {TIPOS_VENDEDOR.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_VENDEDOR[t]}
              </option>
            ))}
          </Selecao>
          {papel !== "vendedor" && <input type="hidden" name="tipo_vendedor" value="interno" />}
          <Selecao
            rotulo="Perfil de gamificação"
            name="perfil_gamificacao"
            defaultValue={membro.perfilGamificacao ?? ""}
            disabled={papel === "operacao"}
          >
            <option value="">Sem perfil (fora do ranking)</option>
            {PERFIS_GAMIFICACAO.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL_GAMIFICACAO[p]}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Status" name="status" value={status} onChange={(e) => onStatusChange(e.target.value as StatusMembro)}>
            {STATUS_MEMBRO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_MEMBRO[s]}
              </option>
            ))}
          </Selecao>
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" name="recebe_leads" defaultChecked={membro.recebeLeads} disabled={papel === "operacao"} /> Recebe leads
        </label>
        {papel === "operacao" && status === "ativo" && PAPEIS_CONVERTIVEIS_EM_OPERACAO.includes(membro.papel) && (
          <fieldset className="rounded-xl border border-linha bg-superficie p-4">
            <legend className="px-1 text-sm font-medium text-texto">Setores de {membro.nome || membro.email}</legend>
            <p className="mb-3 text-xs text-texto-2">Ao salvar o novo perfil, estes setores serão atribuídos somente a esta pessoa.</p>
            <CamposSetores setores={[]} />
          </fieldset>
        )}
        {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
      </form>
      {papel === "operacao" && !(membro.papel === "operacao") && (
        <p className="text-sm text-texto-2">Ao salvar, a pessoa deixará de acessar o comercial e a gamificação. Confira sua carteira antes de alterar o perfil.</p>
      )}
      {membro.papel === "operacao" && membro.status === "ativo" && papel === "operacao" && status === "ativo" && membro.setores && (
        <SetoresMembro key={membro.id} membroId={membro.id} nome={membro.nome || membro.email} setores={membro.setores} />
      )}
      {membro.papel === "operacao" && (!(papel === "operacao") || status !== "ativo") && (
        <p className="text-sm text-texto-2">Ao salvar esta alteração, os setores e as participações operacionais serão removidos.</p>
      )}
      {membro.papel === "operacao" && membro.status !== "ativo" && (
        <p className="text-sm text-texto-2">Para configurar setores, ative este usuário e salve. A desativação remove os setores e participações nas obras.</p>
      )}
    </div>
  );
}

function CamposSetores({ setores }: { setores: NonNullable<MembroLinha["setores"]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {SETORES_OBRA.map((setor) => (
        <Selecao key={setor} rotulo={ROTULO_SETOR[setor]} name={setor} defaultValue={setores.find((s) => s.setor === setor)?.capacidade ?? "sem_acesso"}>
          <option value="sem_acesso">Não atua no setor</option>
          <option value="executar">Executar</option>
          <option value="coordenar">Coordenar</option>
        </Selecao>
      ))}
    </div>
  );
}

function SetoresMembro({ membroId, nome, setores }: { membroId: string; nome: string; setores: NonNullable<MembroLinha["setores"]> }) {
  const [resultado, acao, pendente] = useActionState(salvarSetoresMembro, null);
  return (
    <form action={acao} className="rounded-xl border border-linha bg-superficie p-4">
      <input type="hidden" name="membroId" value={membroId} />
      <p className="text-sm font-medium text-texto">Setores de {nome}</p>
      <p className="mt-1 text-xs text-texto-2">Quem executa altera o próprio setor nas obras em que participa. Quem coordena vê todas as obras e pode gerir participantes do setor. A pessoa pode consultar o andamento de outros setores na mesma obra, sem poder alterá-los.</p>
      <div className="mt-3"><CamposSetores setores={setores} /></div>
      <p className="mt-2 text-xs text-texto-2">Ao remover um setor, as participações da pessoa nesse setor são encerradas.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="secundario" disabled={pendente}>{pendente ? "Salvando..." : "Salvar setores"}</Botao>
        <Mensagem resultado={resultado} />
      </div>
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
    <form action={acao} className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:p-5">
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
