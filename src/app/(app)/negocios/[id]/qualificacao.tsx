"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao, Selo } from "@/components/ui";
import { atualizarQualificacao } from "@/lib/acoes/negocios";
import { PRAZOS_INSTALACAO_QUALIF, ROTULO_PRAZO_INSTALACAO_QUALIF, ROTULO_TIPO_CLIENTE_QUALIF, TIPOS_CLIENTE_QUALIF } from "@/lib/tipos";

type Bool = boolean | null;

function SelecaoSimNao({ rotulo, name, defaultValue }: { rotulo: string; name: string; defaultValue: Bool }) {
  return (
    <Selecao rotulo={rotulo} name={name} defaultValue={defaultValue === true ? "sim" : defaultValue === false ? "nao" : ""}>
      <option value="">Não informado</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </Selecao>
  );
}

/**
 * Status calculado a partir de 3 critérios fixos (telefone válido, interesse confirmado,
 * decisor identificado). "Conta acima de X" e "imóvel compatível" ficam de fora até o gestor
 * poder configurar critérios (spec §18 — fase futura, não implementada ainda).
 */
function calcularStatus(telefoneValido: boolean, objetivo: string | null, eDecisor: Bool) {
  const criterios = [telefoneValido, !!objetivo, eDecisor !== null];
  const atendidos = criterios.filter(Boolean).length;
  const tom = atendidos === criterios.length ? "positivo" : atendidos === 0 ? "neutro" : "atencao";
  const rotulo = atendidos === criterios.length ? "Qualificado" : atendidos === 0 ? "Não qualificado" : "Parcialmente qualificado";
  return { rotulo, tom: tom as "positivo" | "neutro" | "atencao", atendidos, total: criterios.length };
}

export function Qualificacao({
  negocio,
  telefoneContato,
}: {
  negocio: {
    id: string;
    qualifTipoCliente: string | null;
    qualifPossuiContaEnergia: Bool;
    qualifDistribuidora: string | null;
    qualifImovelProprio: Bool;
    qualifObjetivo: string | null;
    qualifPrazoInstalacao: string | null;
    qualifBuscaFinanciamento: Bool;
    qualifOrcamentoOutraEmpresa: Bool;
    qualifEDecisor: Bool;
    qualifOutroDecisor: Bool;
    qualifParticipantesDecisao: string | null;
    qualifObservacoes: string | null;
  };
  telefoneContato: string | null;
}) {
  const [resultado, acao, pendente] = useActionState(atualizarQualificacao, null);
  const status = calcularStatus(!!telefoneContato, negocio.qualifObjetivo, negocio.qualifEDecisor);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="negocioId" value={negocio.id} />
      <div className="flex items-center gap-2">
        <Selo tom={status.tom}>{status.rotulo}</Selo>
        <span className="text-xs text-zinc-500">
          {status.atendidos} de {status.total} critérios atendidos
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Selecao rotulo="Tipo de cliente" name="qualif_tipo_cliente" defaultValue={negocio.qualifTipoCliente ?? ""}>
          <option value="">Não informado</option>
          {TIPOS_CLIENTE_QUALIF.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CLIENTE_QUALIF[t]}
            </option>
          ))}
        </Selecao>
        <SelecaoSimNao rotulo="Possui conta de energia?" name="qualif_possui_conta_energia" defaultValue={negocio.qualifPossuiContaEnergia} />
        <Campo rotulo="Distribuidora" name="qualif_distribuidora" defaultValue={negocio.qualifDistribuidora ?? ""} />
        <SelecaoSimNao rotulo="Imóvel próprio?" name="qualif_imovel_proprio" defaultValue={negocio.qualifImovelProprio} />
        <Campo
          rotulo="Objetivo principal"
          name="qualif_objetivo"
          placeholder="Ex.: reduzir a conta de luz"
          defaultValue={negocio.qualifObjetivo ?? ""}
        />
        <Selecao rotulo="Pretende instalar em quanto tempo?" name="qualif_prazo_instalacao" defaultValue={negocio.qualifPrazoInstalacao ?? ""}>
          <option value="">Não informado</option>
          {PRAZOS_INSTALACAO_QUALIF.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PRAZO_INSTALACAO_QUALIF[p]}
            </option>
          ))}
        </Selecao>
        <SelecaoSimNao rotulo="Busca financiamento?" name="qualif_busca_financiamento" defaultValue={negocio.qualifBuscaFinanciamento} />
        <SelecaoSimNao
          rotulo="Já possui orçamento de outra empresa?"
          name="qualif_orcamento_outra_empresa"
          defaultValue={negocio.qualifOrcamentoOutraEmpresa}
        />
        <SelecaoSimNao rotulo="É o decisor?" name="qualif_e_decisor" defaultValue={negocio.qualifEDecisor} />
        <SelecaoSimNao rotulo="Existe outro decisor?" name="qualif_outro_decisor" defaultValue={negocio.qualifOutroDecisor} />
        <Campo
          rotulo="Quem participa da decisão?"
          name="qualif_participantes_decisao"
          defaultValue={negocio.qualifParticipantesDecisao ?? ""}
        />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Observações comerciais</span>
        <textarea
          name="qualif_observacoes"
          rows={3}
          defaultValue={negocio.qualifObservacoes ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar qualificação
        </Botao>
        {resultado && <Mensagem resultado={resultado} />}
      </div>
    </form>
  );
}
