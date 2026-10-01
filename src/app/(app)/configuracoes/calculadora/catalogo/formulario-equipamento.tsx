"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import {
  apagarEquipamento,
  cadastrarEquipamentoManual,
  editarEquipamento,
  obterUrlDatasheet,
} from "@/lib/acoes/equipamentos";
import { STATUS_TECNICO_MANUAIS, type StatusTecnicoManual } from "@/lib/equipamentos";
import { numeroParaCampo } from "@/lib/formatacao";
import type { Database } from "@/lib/supabase/database.types";

export type EquipamentoCatalogo = Database["public"]["Tables"]["equipamentos_empresa"]["Row"];

const ROTULO_STATUS_MANUAL: Record<StatusTecnicoManual, string> = {
  em_revisao: "Em revisão",
  verificado: "Verificado",
  descontinuado: "Descontinuado",
};

/** Texto pra `defaultValue` — nunca "undefined"/"null". */
const texto = (v: string | null | undefined) => v ?? "";

/**
 * Seção recolhível do formulário. Usa `<details>` (e não renderização condicional) de propósito:
 * campos de uma seção fechada continuam no formulário e são enviados, então salvar sem abrir
 * "Dados técnicos" não apaga os valores que já estavam gravados.
 */
function Secao({
  titulo,
  descricao,
  abertaPorPadrao,
  children,
}: {
  titulo: string;
  descricao: string;
  abertaPorPadrao?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={abertaPorPadrao} className="group rounded-lg border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-zinc-800">
        {titulo}
        <span className="text-xs font-normal text-zinc-500 group-open:hidden">Mostrar</span>
        <span className="hidden text-xs font-normal text-zinc-500 group-open:inline">Ocultar</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-zinc-100 px-3 py-3">
        <p className="text-xs text-zinc-500">{descricao}</p>
        {children}
      </div>
    </details>
  );
}

const grade = "grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3";

/**
 * Cadastro ("+ Novo equipamento") e edição de um item do Catálogo, separados em Informações
 * principais / Dados técnicos (o que o motor usa pra validar string/MPPT) / Dados avançados e
 * internos (recolhidos por padrão).
 */
export function FormularioEquipamento({
  item,
  onConcluido,
}: {
  /** Ausente = cadastro novo. */
  item?: EquipamentoCatalogo;
  onConcluido?: () => void;
}) {
  const novo = !item;
  const [tipo, setTipo] = useState<"modulo" | "inversor">(item?.tipo === "inversor" ? "inversor" : "modulo");
  const [resultado, acao, pendente] = useActionState(novo ? cadastrarEquipamentoManual : editarEquipamento, null);
  const [abrindoDatasheet, iniciarAbrirDatasheet] = useTransition();
  const [removendo, iniciarRemocao] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resultado?.ok && novo) form.current?.reset();
  }, [resultado, novo]);

  const statusAtual = item?.status_tecnico;
  const statusManualAtual = STATUS_TECNICO_MANUAIS.find((s) => s === statusAtual) ?? "automatico";

  function abrirDatasheet() {
    if (!item) return;
    iniciarAbrirDatasheet(async () => {
      const url = await obterUrlDatasheet(item.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  function remover() {
    if (!item || !window.confirm(`Remover ${item.fabricante} ${item.modelo} do catálogo?`)) return;
    iniciarRemocao(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      await apagarEquipamento(fd);
      onConcluido?.();
    });
  }

  return (
    <form ref={form} action={acao} className="flex flex-col gap-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      {!novo && <input type="hidden" name="tipo" value={tipo} />}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-800">Informações principais</p>
        <div className={grade}>
          {novo && (
            <Selecao
              rotulo="Tipo"
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "modulo" | "inversor")}
            >
              <option value="modulo">Módulo</option>
              <option value="inversor">Inversor</option>
            </Selecao>
          )}
          <Campo
            rotulo="Fabricante"
            name="fabricante"
            defaultValue={texto(item?.fabricante)}
            placeholder="Ex.: Canadian Solar"
            required
          />
          <Campo rotulo="Modelo" name="modelo" defaultValue={texto(item?.modelo)} placeholder="Ex.: CS7L-620MS" required />
          <Campo
            rotulo={tipo === "modulo" ? "Potência (Wp)" : "Potência nominal AC (W)"}
            name="potenciaW"
            inputMode="decimal"
            defaultValue={numeroParaCampo(item?.potencia_w)}
            placeholder="Ex.: 620"
            required
          />
          <Campo
            rotulo="Custo/preço de referência (R$)"
            name="precoReferenciaBRL"
            inputMode="decimal"
            defaultValue={numeroParaCampo(item?.preco_referencia_brl)}
            placeholder="Não configurado"
          />
          <Campo
            rotulo="Prioridade comercial"
            name="prioridade"
            inputMode="numeric"
            defaultValue={numeroParaCampo(item?.prioridade, { padrao: 0 })}
          />
          <Selecao rotulo="Status técnico" name="statusTecnico" defaultValue={statusManualAtual}>
            <option value="automatico">Automático (Completo/Incompleto pelos dados)</option>
            {STATUS_TECNICO_MANUAIS.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_MANUAL[s]}
              </option>
            ))}
          </Selecao>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="ativo" defaultChecked={item ? item.ativo : true} /> Ativo
        </label>
        <p className="text-xs text-zinc-500">
          Prioridade maior aparece primeiro entre as opções tecnicamente válidas. Só equipamentos ativos e com status
          Completo, Verificado ou Em revisão entram no dimensionamento automático; Verificado e Em revisão exigem os
          dados técnicos completos.
        </p>
      </section>

      <Secao
        titulo="Dados técnicos"
        descricao="Usados pelo motor pra validar string, MPPT e tensão. Sem os principais (marcados no datasheet), o equipamento fica Incompleto e não entra no dimensionamento automático."
        abertaPorPadrao
      >
        <div className={grade}>
          {tipo === "modulo" ? (
            <>
              <Campo rotulo="Voc (V)" name="vocV" inputMode="decimal" defaultValue={numeroParaCampo(item?.voc_v)} placeholder="41,5" />
              <Campo rotulo="Vmp (V)" name="vmpV" inputMode="decimal" defaultValue={numeroParaCampo(item?.vmp_v)} placeholder="34,8" />
              <Campo rotulo="Isc (A)" name="iscA" inputMode="decimal" defaultValue={numeroParaCampo(item?.isc_a)} placeholder="18,5" />
              <Campo rotulo="Imp (A)" name="impA" inputMode="decimal" defaultValue={numeroParaCampo(item?.imp_a)} placeholder="17,8" />
              <Campo
                rotulo="Coef. temp. Voc (%/°C)"
                name="coefTempVocPctC"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.coef_temp_voc_pct_c)}
                placeholder="-0,26"
              />
            </>
          ) : (
            <>
              <Campo
                rotulo="Tensão máx. DC (V)"
                name="tensaoMaxDcV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.tensao_max_dc_v)}
                placeholder="600"
              />
              <Campo
                rotulo="MPPT mín. (V)"
                name="mpptMinV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.mppt_min_v)}
                placeholder="80"
              />
              <Campo
                rotulo="MPPT máx. (V)"
                name="mpptMaxV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.mppt_max_v)}
                placeholder="550"
              />
              <Campo
                rotulo="Corrente máx. por MPPT (A)"
                name="correnteMaxEntradaA"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.corrente_max_entrada_a)}
                placeholder="20"
              />
              <Campo
                rotulo="Quantidade de MPPTs"
                name="quantidadeMppt"
                inputMode="numeric"
                defaultValue={numeroParaCampo(item?.quantidade_mppt)}
                placeholder="2"
              />
              <Campo
                rotulo="Entradas por MPPT"
                name="entradasPorMppt"
                inputMode="numeric"
                defaultValue={numeroParaCampo(item?.entradas_por_mppt)}
                placeholder="2"
              />
              <Campo
                rotulo="Tensão de partida (V)"
                name="tensaoPartidaV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.tensao_partida_v)}
                placeholder="120"
              />
              <Campo
                rotulo="Isc máximo por MPPT (A)"
                name="iscMaximoEntradaA"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.isc_maximo_entrada_a)}
                placeholder="Opcional"
              />
              <Campo
                rotulo="Potência FV/DC máxima recomendada (W)"
                name="potenciaDcMaximaEntradaW"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.potencia_dc_maxima_entrada_w)}
                placeholder="Opcional"
              />
              <Selecao rotulo="Tipo de inversor" name="tipoInversor" defaultValue={texto(item?.tipo_inversor)}>
                <option value="">Não informado</option>
                <option value="on_grid">On-grid</option>
                <option value="hibrido">Híbrido</option>
              </Selecao>
              <Selecao rotulo="Fases" name="fasesCa" defaultValue={texto(item?.fases_ca)}>
                <option value="">Não informado</option>
                <option value="monofasico">Monofásico</option>
                <option value="trifasico">Trifásico</option>
              </Selecao>
              <Campo
                rotulo="Tensão AC (V)"
                name="tensaoAcV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.tensao_ac_v)}
                placeholder="220"
              />
              <Campo
                rotulo="Corrente AC máxima (A)"
                name="correnteMaxAcA"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.corrente_max_ac_a)}
                placeholder="25"
              />
              <Campo
                rotulo="Eficiência (%)"
                name="eficienciaPct"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.eficiencia_pct, { escala: 100 })}
                placeholder="97,5"
              />
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Obrigatórios pro status Completo:{" "}
          {tipo === "modulo"
            ? "Voc, Vmp, Isc, Imp e coeficiente de temperatura do Voc."
            : "tensão máx. DC, MPPT mín./máx., corrente máx. por MPPT e quantidade de MPPTs."}
        </p>
      </Secao>

      <Secao
        titulo="Dados avançados e internos"
        descricao="Procedência, datasheet, coeficientes extras e dados físicos. Ficam guardados e consultáveis, mas não entram em nenhum cálculo do motor."
      >
        <div className={grade}>
          {tipo === "modulo" ? (
            <>
              <Campo
                rotulo="Coef. temp. Pmax (%/°C)"
                name="coefTempPmaxPctC"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.coef_temp_pmax_pct_c)}
                placeholder="-0,29"
              />
              <Campo
                rotulo="Coef. temp. Isc (%/°C)"
                name="coefTempIscPctC"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.coef_temp_isc_pct_c)}
                placeholder="0,045"
              />
              <Campo rotulo="NMOT (°C)" name="nmotC" inputMode="decimal" defaultValue={numeroParaCampo(item?.nmot_c)} />
              <Selecao
                rotulo="Bifacial"
                name="bifacial"
                defaultValue={item?.bifacial == null ? "" : item.bifacial ? "sim" : "nao"}
              >
                <option value="">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </Selecao>
              <Campo
                rotulo="Bifacialidade (%)"
                name="bifacialidadePct"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.bifacialidade_pct)}
              />
              <Campo
                rotulo="Eficiência do módulo (%)"
                name="eficienciaModuloPct"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.eficiencia_modulo_pct, { escala: 100 })}
              />
              <Campo
                rotulo="Tensão máx. do sistema (V)"
                name="tensaoMaxSistemaV"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.tensao_max_sistema_v)}
              />
              <Campo
                rotulo="Fusível máx. em série (A)"
                name="fusivelMaxSerieA"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.fusivel_max_serie_a)}
              />
              <Campo
                rotulo="Comprimento (mm)"
                name="comprimentoMm"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.comprimento_mm)}
              />
              <Campo rotulo="Largura (mm)" name="larguraMm" inputMode="decimal" defaultValue={numeroParaCampo(item?.largura_mm)} />
              <Campo
                rotulo="Espessura (mm)"
                name="espessuraMm"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.espessura_mm)}
              />
              <Campo rotulo="Peso (kg)" name="pesoKg" inputMode="decimal" defaultValue={numeroParaCampo(item?.peso_kg)} />
            </>
          ) : (
            <>
              <Campo
                rotulo="Potência aparente máx. (VA)"
                name="potenciaAparenteMaxVa"
                inputMode="decimal"
                defaultValue={numeroParaCampo(item?.potencia_aparente_max_va)}
              />
              <Campo
                rotulo="Tensões AC (texto do datasheet)"
                name="tensaoFasesAc"
                defaultValue={texto(item?.tensao_fases_ac)}
                placeholder="Ex.: 220/380|230/400"
              />
              <Campo rotulo="Grau de proteção" name="grauProtecao" defaultValue={texto(item?.grau_protecao)} placeholder="IP65" />
            </>
          )}
          <Campo rotulo="Categoria" name="categoria" defaultValue={texto(item?.categoria)} />
          <Campo rotulo="Tecnologia" name="tecnologia" defaultValue={texto(item?.tecnologia)} />
          <Campo
            rotulo="Revisão do datasheet"
            name="statusValidacao"
            defaultValue={texto(item?.status_validacao)}
            placeholder="Ex.: VALIDADO_DATASHEET"
          />
          <Campo rotulo="Fonte primária" name="fontePrimaria" defaultValue={texto(item?.fonte_primaria)} placeholder="URL ou referência" />
          <Campo rotulo="Fonte secundária" name="fonteSecundaria" defaultValue={texto(item?.fonte_secundaria)} />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Observações</span>
          <textarea
            name="observacoes"
            rows={2}
            defaultValue={texto(item?.observacoes)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-carvao outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1">
            <CampoArquivo
              rotulo={item?.datasheet_nome ? "Trocar datasheet" : "Datasheet (opcional)"}
              name="datasheet"
              accept=".pdf,image/*"
            />
          </div>
          {item?.datasheet_nome && (
            <>
              <button
                type="button"
                onClick={abrirDatasheet}
                disabled={abrindoDatasheet}
                className="pb-2 text-xs font-medium text-carvao underline decoration-dourado underline-offset-2"
              >
                {abrindoDatasheet ? "Abrindo..." : `Abrir "${item.datasheet_nome}"`}
              </button>
              <label className="flex items-center gap-1 pb-2 text-xs text-zinc-600">
                <input type="checkbox" name="remover_datasheet" /> Remover datasheet
              </label>
            </>
          )}
        </div>
      </Secao>

      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : novo ? "Cadastrar equipamento" : "Salvar"}
        </Botao>
        {onConcluido && (
          <Botao type="button" variante="secundario" onClick={onConcluido}>
            Fechar
          </Botao>
        )}
        {item && (
          <Botao type="button" variante="perigo" onClick={remover} disabled={removendo} className="sm:ml-auto">
            {removendo ? "Removendo..." : "Remover do catálogo"}
          </Botao>
        )}
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
