"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { CabecalhoItemGf, StatusAtivoGf } from "../../_compartilhado/formulario-ui";
import { BadgeGf, formatarNumeroGf } from "../../_compartilhado/ui";
import { EVENTOS_TETO_OBRIGATORIO, MARCOS_CONQUISTA, ROTULO_MARCO_CONQUISTA, type MarcoConquista } from "@/lib/gamificacao";
import {
  OPERADORES_CONDICAO,
  PERFIS_GAMIFICACAO,
  PERIODOS_LIMITE_REGRA,
  ROTULO_OPERADOR_CONDICAO,
  ROTULO_PERFIL_GAMIFICACAO,
  ROTULO_PERIODO_LIMITE_REGRA,
  type OperadorCondicao,
  type PerfilGamificacao,
  type PeriodoLimiteRegra,
} from "@/lib/tipos";
import {
  apagarConquista,
  apagarNivel,
  apagarRecompensa,
  apagarRegra,
  criarConquista,
  criarNivel,
  criarRecompensa,
  criarRegra,
  editarConquista,
  editarNivel,
  editarRecompensa,
  editarRegra,
} from "./actions";
import { ImagemRecompensaAdmin } from "./imagem-recompensa-admin";

type EventoOpcao = { tipo: string; rotulo: string; campos: readonly string[] };

export type RegraSalva = {
  id: string;
  nome: string;
  eventoTipo: string;
  condicao: { campo: string; operador: OperadorCondicao; valor: string } | null;
  xp: number;
  moedas: number;
  perfilAplicavel: PerfilGamificacao | null;
  limitePeriodo: PeriodoLimiteRegra | null;
  limiteQuantidade: number | null;
  unicaPorNegocio: boolean;
  ativa: boolean;
};

function SeletorPerfil({ defaultValue }: { defaultValue: PerfilGamificacao | "" }) {
  return (
    <Selecao rotulo="Perfil (opcional)" name="perfilAplicavel" defaultValue={defaultValue}>
      <option value="">Qualquer perfil</option>
      {PERFIS_GAMIFICACAO.map((p) => (
        <option key={p} value={p}>
          {ROTULO_PERFIL_GAMIFICACAO[p]}
        </option>
      ))}
    </Selecao>
  );
}

export function NovaRegra({ eventos }: { eventos: readonly EventoOpcao[] }) {
  const [resultado, acao, pendente] = useActionState(criarRegra, null);
  const [eventoTipo, setEventoTipo] = useState(eventos[0]?.tipo ?? "");
  const campos = eventos.find((e) => e.tipo === eventoTipo)?.campos ?? [];

  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <Campo rotulo="Nome da regra" name="nome" placeholder="Ex.: Negócio ganho acima de R$ 5 mil" required />
        <Selecao rotulo="Evento" name="eventoTipo" value={eventoTipo} onChange={(e) => setEventoTipo(e.target.value)}>
          {eventos.map((ev) => (
            <option key={ev.tipo} value={ev.tipo}>
              {ev.rotulo}
            </option>
          ))}
        </Selecao>
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Campo rotulo="XP" name="xp" type="number" step={1} defaultValue={10} required />
        <Campo rotulo="Moedas" name="moedas" type="number" step={1} defaultValue={10} required />
        <SeletorPerfil defaultValue="" />
      </div>
      <CondicaoTeto campos={campos} tetoObrigatorio={(EVENTOS_TETO_OBRIGATORIO as readonly string[]).includes(eventoTipo)} />
      <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
        <input type="checkbox" name="unicaPorNegocio" /> Pontua só a primeira vez por negócio (evita pontuar de novo se o card sair e voltar)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={pendente} className="self-start">
          Criar regra
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaRegra({ regra, eventos }: { regra: RegraSalva; eventos: readonly EventoOpcao[] }) {
  const [resultado, acao, pendente] = useActionState(editarRegra, null);
  const [eventoTipo, setEventoTipo] = useState(regra.eventoTipo);
  const campos = eventos.find((e) => e.tipo === eventoTipo)?.campos ?? [];

  return (
    <form action={acao} className="gf-item-edicao flex flex-col gap-4">
      <input type="hidden" name="id" value={regra.id} />
      <CabecalhoItemGf titulo={regra.nome}>
        {regra.xp !== 0 && (
          <BadgeGf tom="positivo">
            {regra.xp > 0 ? "+" : "−"}
            {formatarNumeroGf(Math.abs(regra.xp))} XP
          </BadgeGf>
        )}
        {regra.moedas !== 0 && (
          <BadgeGf tom="atencao">
            {regra.moedas > 0 ? "+" : "−"}
            {formatarNumeroGf(Math.abs(regra.moedas))} moedas
          </BadgeGf>
        )}
        <StatusAtivoGf ativa={regra.ativa} />
      </CabecalhoItemGf>
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <Campo rotulo="Nome" name="nome" defaultValue={regra.nome} required />
        <Selecao rotulo="Evento" name="eventoTipo" value={eventoTipo} onChange={(e) => setEventoTipo(e.target.value)}>
          {eventos.map((ev) => (
            <option key={ev.tipo} value={ev.tipo}>
              {ev.rotulo}
            </option>
          ))}
        </Selecao>
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Campo rotulo="XP" name="xp" type="number" step={1} defaultValue={regra.xp} required />
        <Campo rotulo="Moedas" name="moedas" type="number" step={1} defaultValue={regra.moedas} required />
        <SeletorPerfil defaultValue={regra.perfilAplicavel ?? ""} />
      </div>
      <CondicaoTeto
        campos={campos}
        condicaoInicial={regra.condicao}
        limitePeriodoInicial={regra.limitePeriodo}
        limiteQuantidadeInicial={regra.limiteQuantidade}
        tetoObrigatorio={(EVENTOS_TETO_OBRIGATORIO as readonly string[]).includes(eventoTipo)}
      />
      <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
        <input type="checkbox" name="unicaPorNegocio" defaultChecked={regra.unicaPorNegocio} /> Pontua só a primeira vez por negócio (evita pontuar de novo se o card sair e voltar)
      </label>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
        <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
          <input type="checkbox" name="ativa" defaultChecked={regra.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarRegra} className="gf-botao-texto sm:ml-auto">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function CondicaoTeto({
  campos,
  condicaoInicial,
  limitePeriodoInicial,
  limiteQuantidadeInicial,
  tetoObrigatorio,
}: {
  campos: readonly string[];
  condicaoInicial?: { campo: string; operador: OperadorCondicao; valor: string } | null;
  limitePeriodoInicial?: PeriodoLimiteRegra | null;
  limiteQuantidadeInicial?: number | null;
  tetoObrigatorio: boolean;
}) {
  return (
    <div className="grid gap-3 @min-[560px]:grid-cols-2">
      <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
        <legend className="px-1.5">Condição (opcional)</legend>
        <Selecao rotulo="Campo" name="condicaoCampo" defaultValue={condicaoInicial?.campo ?? ""}>
          <option value="">Sem condição</option>
          {campos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Operador" name="condicaoOperador" defaultValue={condicaoInicial?.operador ?? ""}>
          <option value=""></option>
          {OPERADORES_CONDICAO.map((op) => (
            <option key={op} value={op}>
              {ROTULO_OPERADOR_CONDICAO[op]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Valor" name="condicaoValor" placeholder="Ex.: 5000" defaultValue={condicaoInicial?.valor ?? ""} />
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
        <legend className="px-1.5">{tetoObrigatorio ? "Teto (obrigatório)" : "Teto (opcional)"}</legend>
        {tetoObrigatorio && (
          <p className="gf-t-aux">
            Essa é uma atividade repetível — sem período e quantidade definidos, a regra não pontua.
          </p>
        )}
        <Selecao rotulo="Período" name="limitePeriodo" defaultValue={limitePeriodoInicial ?? ""} required={tetoObrigatorio}>
          <option value="" disabled={tetoObrigatorio}>
            Sem teto
          </option>
          {PERIODOS_LIMITE_REGRA.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERIODO_LIMITE_REGRA[p]}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Quantidade máxima"
          name="limiteQuantidade"
          type="number"
          min={1}
          step={1}
          defaultValue={limiteQuantidadeInicial ?? undefined}
          required={tetoObrigatorio}
        />
      </fieldset>
    </div>
  );
}

export type NivelSalvo = { nivel: number; nome: string | null; xpMinimo: number; ativa: boolean };

export function NovoNivel() {
  const [resultado, acao, pendente] = useActionState(criarNivel, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-3 @min-[620px]:grid-cols-[7rem_minmax(0,1fr)_11rem]">
        <Campo rotulo="Nível" name="nivel" type="number" min={1} step={1} required />
        <Campo rotulo="Nome (opcional)" name="nome" placeholder="Ex.: Veterano" />
        <Campo rotulo="XP mínimo" name="xpMinimo" type="number" min={0} step={1} required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={pendente} className="self-start">
          Salvar nível
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaNivel({ nivel }: { nivel: NivelSalvo }) {
  const [resultado, acao, pendente] = useActionState(editarNivel, null);
  return (
    <form action={acao} className="gf-item-edicao flex flex-col gap-4">
      <CabecalhoItemGf titulo={`Nível ${nivel.nivel}${nivel.nome ? ` · ${nivel.nome}` : ""}`}>
        <BadgeGf>{formatarNumeroGf(nivel.xpMinimo)} XP mínimo</BadgeGf>
        <StatusAtivoGf ativa={nivel.ativa} ativo="Ativo" inativo="Inativo" />
      </CabecalhoItemGf>
      <div className="grid gap-3 @min-[620px]:grid-cols-[7rem_minmax(0,1fr)_11rem]">
        <Campo rotulo="Nível" name="nivel" type="number" defaultValue={nivel.nivel} readOnly />
        <Campo rotulo="Nome" name="nome" defaultValue={nivel.nome ?? ""} placeholder="Ex.: Veterano" />
        <Campo rotulo="XP mínimo" name="xpMinimo" type="number" min={0} step={1} defaultValue={nivel.xpMinimo} required />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
        <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
          <input type="checkbox" name="ativa" defaultChecked={nivel.ativa} /> Ativo
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarNivel} className="gf-botao-texto sm:ml-auto">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export type ConquistaSalva = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  metrica: "xp_acumulado" | "marco_contagem";
  marco: MarcoConquista | null;
  valor: number;
  xpBonus: number;
  perfilAplicavel: PerfilGamificacao | null;
  ativa: boolean;
};

function SeletorMetricaConquista({
  metrica,
  setMetrica,
  marco,
}: {
  metrica: "xp_acumulado" | "marco_contagem";
  setMetrica: (m: "xp_acumulado" | "marco_contagem") => void;
  marco: MarcoConquista | "";
}) {
  return (
    <>
      <Selecao
        rotulo="Critério"
        name="metrica"
        value={metrica}
        onChange={(e) => setMetrica(e.target.value as "xp_acumulado" | "marco_contagem")}
      >
        <option value="xp_acumulado">XP acumulado</option>
        <option value="marco_contagem">Quantidade de um marco (independente de XP)</option>
      </Selecao>
      {metrica === "marco_contagem" && (
        <Selecao rotulo="Marco" name="marco" defaultValue={marco}>
          <option value="">Escolha o marco</option>
          {MARCOS_CONQUISTA.map((m) => (
            <option key={m} value={m}>
              {ROTULO_MARCO_CONQUISTA[m]}
            </option>
          ))}
        </Selecao>
      )}
    </>
  );
}

export function NovaConquista() {
  const [resultado, acao, pendente] = useActionState(criarConquista, null);
  const [metrica, setMetrica] = useState<"xp_acumulado" | "marco_contagem">("xp_acumulado");
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 @min-[480px]:grid-cols-[5.5rem_1fr]">
        <Campo rotulo="Ícone" name="icone" defaultValue="🏆" maxLength={8} />
        <Campo rotulo="Nome" name="nome" placeholder="Ex.: Veterano" required />
      </div>
      <Campo rotulo="Descrição (opcional)" name="descricao" placeholder="Ex.: Acumule 5.000 XP" />
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <SeletorMetricaConquista metrica={metrica} setMetrica={setMetrica} marco="" />
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Campo rotulo={metrica === "marco_contagem" ? "Quantidade necessária" : "XP necessário"} name="valor" type="number" min={1} step={1} required />
        <Campo rotulo="XP bônus ao desbloquear" name="xpBonus" type="number" min={0} step={1} defaultValue={0} />
        <SeletorPerfil defaultValue="" />
      </div>
      <Botao type="submit" disabled={pendente} className="self-start">
        Criar conquista
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaConquista({ conquista }: { conquista: ConquistaSalva }) {
  const [resultado, acao, pendente] = useActionState(editarConquista, null);
  const [metrica, setMetrica] = useState<"xp_acumulado" | "marco_contagem">(conquista.metrica);
  return (
    <form action={acao} className="gf-item-edicao flex flex-col gap-4">
      <input type="hidden" name="id" value={conquista.id} />
      <CabecalhoItemGf titulo={`${conquista.icone} ${conquista.nome}`}>
        {conquista.xpBonus > 0 && <BadgeGf tom="positivo">+{formatarNumeroGf(conquista.xpBonus)} XP bônus</BadgeGf>}
        <StatusAtivoGf ativa={conquista.ativa} />
      </CabecalhoItemGf>
      <div className="grid gap-3 @min-[480px]:grid-cols-[5.5rem_1fr]">
        <Campo rotulo="Ícone" name="icone" defaultValue={conquista.icone} maxLength={8} />
        <Campo rotulo="Nome" name="nome" defaultValue={conquista.nome} required />
      </div>
      <Campo rotulo="Descrição" name="descricao" defaultValue={conquista.descricao} />
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <SeletorMetricaConquista metrica={metrica} setMetrica={setMetrica} marco={conquista.marco ?? ""} />
      </div>
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Campo
          rotulo={metrica === "marco_contagem" ? "Quantidade necessária" : "XP necessário"}
          name="valor"
          type="number"
          min={1}
          step={1}
          defaultValue={conquista.valor}
          required
        />
        <Campo rotulo="XP bônus ao desbloquear" name="xpBonus" type="number" min={0} step={1} defaultValue={conquista.xpBonus} />
        <SeletorPerfil defaultValue={conquista.perfilAplicavel ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
        <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
          <input type="checkbox" name="ativa" defaultChecked={conquista.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarConquista} className="gf-botao-texto sm:ml-auto">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export type RecompensaSalva = {
  id: string;
  nome: string;
  descricao: string;
  custoMoedas: number;
  estoque: number | null;
  limitePorMembro: number | null;
  validadeAte: string | null;
  ativa: boolean;
  imagemCaminho: string | null;
  /** URL assinada (1 h) da imagem, gerada no servidor; nula sem imagem ou se a assinatura falhar. */
  imagemUrl: string | null;
};

export function NovaRecompensa() {
  const [resultado, acao, pendente] = useActionState(criarRecompensa, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo rotulo="Nome" name="nome" placeholder="Ex.: Vale-presente R$ 100" required />
      <Campo rotulo="Descrição (opcional)" name="descricao" />
      <div className="grid gap-3 @min-[620px]:grid-cols-3">
        <Campo rotulo="Custo em moedas" name="custoMoedas" type="number" min={1} step={1} required />
        <Campo rotulo="Estoque (opcional)" name="estoque" type="number" min={0} step={1} placeholder="Ilimitado" />
        <Campo rotulo="Limite por colaborador (opcional)" name="limitePorMembro" type="number" min={1} step={1} placeholder="Sem limite" />
      </div>
      <Campo rotulo="Validade (opcional)" name="validadeAte" type="date" />
      <p className="gf-t-micro">Depois de criar, você poderá adicionar uma imagem à recompensa.</p>
      <Botao type="submit" disabled={pendente} className="self-start">
        Criar recompensa
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function LinhaRecompensa({ empresaId, recompensa }: { empresaId: string; recompensa: RecompensaSalva }) {
  const [resultado, acao, pendente] = useActionState(editarRecompensa, null);
  return (
    <div className="gf-item-edicao flex flex-col gap-4">
      <CabecalhoItemGf titulo={recompensa.nome}>
        <BadgeGf tom="atencao">{formatarNumeroGf(recompensa.custoMoedas)} moedas</BadgeGf>
        <StatusAtivoGf ativa={recompensa.ativa} />
      </CabecalhoItemGf>
      {/* Fora do <form>: o envio da imagem é direto ao Storage e tem ações próprias. */}
      <ImagemRecompensaAdmin
        empresaId={empresaId}
        recompensaId={recompensa.id}
        nome={recompensa.nome}
        imagemUrl={recompensa.imagemUrl}
        temImagem={!!recompensa.imagemCaminho}
      />
      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={recompensa.id} />
        <Campo rotulo="Nome" name="nome" defaultValue={recompensa.nome} required />
        <Campo rotulo="Descrição" name="descricao" defaultValue={recompensa.descricao} />
        <div className="grid gap-3 @min-[620px]:grid-cols-3">
          <Campo rotulo="Custo em moedas" name="custoMoedas" type="number" min={1} step={1} defaultValue={recompensa.custoMoedas} required />
          <Campo rotulo="Estoque" name="estoque" type="number" min={0} step={1} defaultValue={recompensa.estoque ?? undefined} placeholder="Ilimitado" />
          <Campo
            rotulo="Limite por colaborador"
            name="limitePorMembro"
            type="number"
            min={1}
            step={1}
            defaultValue={recompensa.limitePorMembro ?? undefined}
            placeholder="Sem limite"
          />
        </div>
        <Campo rotulo="Validade" name="validadeAte" type="date" defaultValue={recompensa.validadeAte ?? ""} />
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gf-borda)] pt-4">
          <label className="flex items-center gap-2 text-sm text-[var(--gf-texto)]">
            <input type="checkbox" name="ativa" defaultChecked={recompensa.ativa} /> Ativa
          </label>
          <Botao type="submit" variante="secundario" disabled={pendente}>
            Salvar
          </Botao>
          <button type="submit" formAction={apagarRecompensa} className="gf-botao-texto sm:ml-auto">
            Apagar
          </button>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </div>
  );
}
