"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import {
  apagarEquipamento,
  cadastrarEquipamentoManual,
  editarEquipamento,
  obterUrlDatasheet,
} from "@/lib/acoes/equipamentos";

export type EquipamentoAtivoLinha = {
  id: string;
  tipo: "modulo" | "inversor";
  fabricante: string;
  modelo: string;
  potenciaW: number;
  ativo: boolean;
  prioridade: number;
  precoReferenciaBRL: number | null;
  datasheetNome: string | null;
  // Módulo.
  vocV: number | null;
  iscA: number | null;
  vmpV: number | null;
  impA: number | null;
  coefTempVocPctC: number | null;
  // Inversor.
  tipoInversor: "on_grid" | "hibrido" | null;
  tensaoMaxDcV: number | null;
  tensaoPartidaV: number | null;
  mpptMinV: number | null;
  mpptMaxV: number | null;
  correnteMaxEntradaA: number | null;
  quantidadeMppt: number | null;
  entradasPorMppt: number | null;
  potenciaDcMaximaEntradaW: number | null;
  iscMaximoEntradaA: number | null;
  tensaoAcV: number | null;
  fasesCa: "monofasico" | "trifasico" | null;
  correnteMaxAcA: number | null;
  eficienciaPct: number | null;
  tensaoFasesAc: string | null;
};

/**
 * Cadastro manual de módulos e inversores (a busca automática via catálogo
 * externo — OpenSolar — foi removida em 2026-09-30 por não retornar resultado
 * de forma confiável). Só os equipamentos ativados aqui entram na recomendação
 * automática de kit em "Adicionar negócio" — ver `src/lib/dimensionamento.ts`.
 * Sem nenhum ativo, o vendedor cai de volta no kit personalizado manual.
 */
export function Equipamentos({ itens }: { itens: EquipamentoAtivoLinha[] }) {
  const modulos = itens.filter((i) => i.tipo === "modulo");
  const inversores = itens.filter((i) => i.tipo === "inversor");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        Só os equipamentos ativados aqui entram na recomendação automática de kit em &quot;Adicionar negócio&quot;.
        Prioridade maior aparece primeiro entre as opções tecnicamente válidas.
      </p>

      <FormularioCadastroManual />

      <ListaEquipamentos titulo="Módulos ativos" itens={modulos} />
      <ListaEquipamentos titulo="Inversores ativos" itens={inversores} />
    </div>
  );
}

function FormularioCadastroManual() {
  const [tipo, setTipo] = useState<"modulo" | "inversor">("modulo");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [resultado, acao, pendente] = useActionState(cadastrarEquipamentoManual, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resultado?.ok) form.current?.reset();
  }, [resultado]);

  return (
    <form ref={form} action={acao} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
      <p className="text-sm font-medium text-zinc-700">+ Cadastrar equipamento manualmente</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Selecao rotulo="Tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "modulo" | "inversor")}>
          <option value="modulo">Módulo</option>
          <option value="inversor">Inversor</option>
        </Selecao>
        <Campo rotulo="Fabricante" name="fabricante" placeholder="Ex.: Canadian Solar" required />
        <Campo rotulo="Modelo" name="modelo" placeholder="Ex.: CS7L-620MS" required />
        <Campo
          rotulo={tipo === "modulo" ? "Potência (W)" : "Potência nominal AC (W)"}
          name="potenciaW"
          inputMode="decimal"
          placeholder="Ex.: 620"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Campo rotulo="Preço/custo de referência (R$)" name="precoReferenciaBRL" inputMode="decimal" placeholder="Opcional" />
        <div>
          <Campo rotulo="Prioridade comercial" name="prioridade" inputMode="numeric" defaultValue="0" />
        </div>
        <label className="flex items-center gap-1 self-end pb-2 text-sm text-zinc-700">
          <input type="checkbox" name="ativo" defaultChecked /> Ativo
        </label>
      </div>
      <button
        type="button"
        onClick={() => setDetalhesAbertos((v) => !v)}
        className="self-start text-xs font-medium text-amber-700 hover:underline"
      >
        {detalhesAbertos ? "Ocultar detalhes técnicos" : "Detalhes técnicos"}
      </button>
      {detalhesAbertos && (
        <div className="flex flex-col gap-2 rounded-md bg-zinc-50 p-2">
          <p className="text-xs text-zinc-500">
            Opcional — sem esses dados o equipamento continua disponível pro kit automático, só fica marcado como
            &quot;não verificado&quot; (o motor não confere string/MPPT nesse caso).
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tipo === "modulo" ? (
              <>
                <Campo rotulo="Voc (V)" name="vocV" inputMode="decimal" placeholder="41,5" />
                <Campo rotulo="Vmp (V)" name="vmpV" inputMode="decimal" placeholder="34,8" />
                <Campo rotulo="Isc (A)" name="iscA" inputMode="decimal" placeholder="18,5" />
                <Campo rotulo="Imp (A)" name="impA" inputMode="decimal" placeholder="17,8" />
                <Campo rotulo="Coef. temp. Voc (%/°C)" name="coefTempVocPctC" inputMode="decimal" placeholder="-0,26" />
              </>
            ) : (
              <>
                <Selecao rotulo="Tipo de inversor" name="tipoInversor" defaultValue="">
                  <option value="">Não informado</option>
                  <option value="on_grid">On-grid</option>
                  <option value="hibrido">Híbrido</option>
                </Selecao>
                <Campo
                  rotulo="Potência FV/DC máxima recomendada (W)"
                  name="potenciaDcMaximaEntradaW"
                  inputMode="decimal"
                  placeholder="Opcional"
                />
                <Campo rotulo="Tensão máx. DC (V)" name="tensaoMaxDcV" inputMode="decimal" placeholder="600" />
                <Campo rotulo="Tensão de partida (V)" name="tensaoPartidaV" inputMode="decimal" placeholder="120" />
                <Campo rotulo="MPPT mín. (V)" name="mpptMinV" inputMode="decimal" placeholder="80" />
                <Campo rotulo="MPPT máx. (V)" name="mpptMaxV" inputMode="decimal" placeholder="550" />
                <Campo rotulo="Quantidade de MPPTs" name="quantidadeMppt" inputMode="numeric" placeholder="2" />
                <Campo rotulo="Entradas por MPPT" name="entradasPorMppt" inputMode="numeric" placeholder="2" />
                <Campo
                  rotulo="Corrente máx. por MPPT (A)"
                  name="correnteMaxEntradaA"
                  inputMode="decimal"
                  placeholder="20"
                />
                <Campo
                  rotulo="Isc máximo por MPPT (A)"
                  name="iscMaximoEntradaA"
                  inputMode="decimal"
                  placeholder="Opcional"
                />
                <Campo rotulo="Tensão AC (V)" name="tensaoAcV" inputMode="decimal" placeholder="220" />
                <Selecao rotulo="Fases" name="fasesCa" defaultValue="">
                  <option value="">Não informado</option>
                  <option value="monofasico">Monofásico</option>
                  <option value="trifasico">Trifásico</option>
                </Selecao>
                <Campo rotulo="Corrente AC máxima (A)" name="correnteMaxAcA" inputMode="decimal" placeholder="25" />
                <Campo rotulo="Eficiência (%)" name="eficienciaPct" inputMode="decimal" placeholder="97,5" />
              </>
            )}
          </div>
          <CampoArquivo rotulo="Datasheet (opcional)" name="datasheet" accept=".pdf,image/*" />
        </div>
      )}
      <Botao type="submit" disabled={pendente} className="self-start">
        {pendente ? "Cadastrando..." : "Cadastrar equipamento"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function ListaEquipamentos({ titulo, itens }: { titulo: string; itens: EquipamentoAtivoLinha[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-zinc-700">
        {titulo} ({itens.filter((i) => i.ativo).length})
      </p>
      {itens.length === 0 && <p className="text-xs text-zinc-400">Nenhum equipamento cadastrado ainda.</p>}
      {itens.map((item) => (
        <LinhaEquipamento key={item.id} item={item} />
      ))}
    </div>
  );
}

function LinhaEquipamento({ item }: { item: EquipamentoAtivoLinha }) {
  const [resultado, acao, pendente] = useActionState(editarEquipamento, null);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [abrindoDatasheet, iniciarAbrirDatasheet] = useTransition();
  const temDadosEletricos =
    item.tipo === "modulo"
      ? item.vocV != null && item.vmpV != null && item.coefTempVocPctC != null
      : item.tensaoMaxDcV != null && item.mpptMinV != null && item.mpptMaxV != null;

  function abrirDatasheet() {
    iniciarAbrirDatasheet(async () => {
      const url = await obterUrlDatasheet(item.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 py-2 first:border-t-0">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="tipo" value={item.tipo} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
          {item.fabricante} {item.modelo} <span className="text-zinc-400">· {item.potenciaW} W</span>
        </span>
        {!temDadosEletricos && (
          <span className="text-xs text-amber-600" title="Sem string/MPPT validado — kit automático não confere tensão">
            Não verificado
          </span>
        )}
        <div className="w-32">
          <Campo rotulo="Preço/custo (R$)" name="precoReferenciaBRL" inputMode="decimal" defaultValue={item.precoReferenciaBRL ?? ""} />
        </div>
        <div className="w-24">
          <Campo rotulo="Prioridade" name="prioridade" inputMode="numeric" defaultValue={String(item.prioridade)} />
        </div>
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input type="checkbox" name="ativo" defaultChecked={item.ativo} /> Ativo
        </label>
        <button
          type="button"
          onClick={() => setDetalhesAbertos((v) => !v)}
          className="text-xs text-zinc-500 hover:underline"
        >
          {detalhesAbertos ? "Ocultar detalhes técnicos" : "Detalhes técnicos"}
        </button>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("id", item.id);
            apagarEquipamento(fd);
          }}
          className="text-xs text-red-600 hover:underline"
        >
          Remover
        </button>
      </div>
      {detalhesAbertos && (
        <div className="flex flex-col gap-2 rounded-md bg-zinc-50 p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {item.tipo === "modulo" ? (
              <>
                <Campo rotulo="Voc (V)" name="vocV" inputMode="decimal" defaultValue={item.vocV ?? ""} placeholder="41,5" />
                <Campo rotulo="Vmp (V)" name="vmpV" inputMode="decimal" defaultValue={item.vmpV ?? ""} placeholder="34,8" />
                <Campo rotulo="Isc (A)" name="iscA" inputMode="decimal" defaultValue={item.iscA ?? ""} placeholder="18,5" />
                <Campo rotulo="Imp (A)" name="impA" inputMode="decimal" defaultValue={item.impA ?? ""} placeholder="17,8" />
                <Campo
                  rotulo="Coef. temp. Voc (%/°C)"
                  name="coefTempVocPctC"
                  inputMode="decimal"
                  defaultValue={item.coefTempVocPctC ?? ""}
                  placeholder="-0,26"
                />
              </>
            ) : (
              <>
                <Selecao rotulo="Tipo de inversor" name="tipoInversor" defaultValue={item.tipoInversor ?? ""}>
                  <option value="">Não informado</option>
                  <option value="on_grid">On-grid</option>
                  <option value="hibrido">Híbrido</option>
                </Selecao>
                <Campo
                  rotulo="Potência FV/DC máxima recomendada (W)"
                  name="potenciaDcMaximaEntradaW"
                  inputMode="decimal"
                  defaultValue={item.potenciaDcMaximaEntradaW ?? ""}
                  placeholder="Opcional"
                />
                <Campo
                  rotulo="Tensão máx. DC (V)"
                  name="tensaoMaxDcV"
                  inputMode="decimal"
                  defaultValue={item.tensaoMaxDcV ?? ""}
                  placeholder="600"
                />
                <Campo
                  rotulo="Tensão de partida (V)"
                  name="tensaoPartidaV"
                  inputMode="decimal"
                  defaultValue={item.tensaoPartidaV ?? ""}
                  placeholder="120"
                />
                <Campo
                  rotulo="MPPT mín. (V)"
                  name="mpptMinV"
                  inputMode="decimal"
                  defaultValue={item.mpptMinV ?? ""}
                  placeholder="80"
                />
                <Campo
                  rotulo="MPPT máx. (V)"
                  name="mpptMaxV"
                  inputMode="decimal"
                  defaultValue={item.mpptMaxV ?? ""}
                  placeholder="550"
                />
                <Campo
                  rotulo="Quantidade de MPPTs"
                  name="quantidadeMppt"
                  inputMode="numeric"
                  defaultValue={item.quantidadeMppt ?? ""}
                  placeholder="2"
                />
                <Campo
                  rotulo="Entradas por MPPT"
                  name="entradasPorMppt"
                  inputMode="numeric"
                  defaultValue={item.entradasPorMppt ?? ""}
                  placeholder="2"
                />
                <Campo
                  rotulo="Corrente máx. por MPPT (A)"
                  name="correnteMaxEntradaA"
                  inputMode="decimal"
                  defaultValue={item.correnteMaxEntradaA ?? ""}
                  placeholder="20"
                />
                <Campo
                  rotulo="Isc máximo por MPPT (A)"
                  name="iscMaximoEntradaA"
                  inputMode="decimal"
                  defaultValue={item.iscMaximoEntradaA ?? ""}
                  placeholder="Opcional"
                />
                <Campo
                  rotulo="Tensão AC (V)"
                  name="tensaoAcV"
                  inputMode="decimal"
                  defaultValue={item.tensaoAcV ?? ""}
                  placeholder="220"
                />
                <Selecao rotulo="Fases" name="fasesCa" defaultValue={item.fasesCa ?? ""}>
                  <option value="">Não informado</option>
                  <option value="monofasico">Monofásico</option>
                  <option value="trifasico">Trifásico</option>
                </Selecao>
                <Campo
                  rotulo="Corrente AC máxima (A)"
                  name="correnteMaxAcA"
                  inputMode="decimal"
                  defaultValue={item.correnteMaxAcA ?? ""}
                  placeholder="25"
                />
                <Campo
                  rotulo="Eficiência (%)"
                  name="eficienciaPct"
                  inputMode="decimal"
                  defaultValue={item.eficienciaPct != null ? item.eficienciaPct * 100 : ""}
                  placeholder="97,5"
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="max-w-xs flex-1">
              <CampoArquivo rotulo={item.datasheetNome ? "Trocar datasheet" : "Datasheet (opcional)"} name="datasheet" accept=".pdf,image/*" />
            </div>
            {item.datasheetNome && (
              <>
                <button
                  type="button"
                  onClick={abrirDatasheet}
                  disabled={abrindoDatasheet}
                  className="text-xs font-medium text-amber-700 hover:underline"
                >
                  {abrindoDatasheet ? "Abrindo..." : `Abrir "${item.datasheetNome}"`}
                </button>
                <label className="flex items-center gap-1 text-xs text-red-600">
                  <input type="checkbox" name="remover_datasheet" /> Remover datasheet
                </label>
              </>
            )}
          </div>
        </div>
      )}
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
