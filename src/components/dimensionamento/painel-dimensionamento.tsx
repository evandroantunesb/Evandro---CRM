"use client";

import { useEffect, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Botao, Selecao } from "@/components/ui";
import { CamposOcultosDimensionamento } from "@/components/dimensionamento/campos-ocultos-dimensionamento";
import {
  useDimensionamento,
  type CamposFormularioDimensionamento,
  type UsarDimensionamentoParams,
} from "@/components/dimensionamento/usar-dimensionamento";
import { camposTecnicosFaltantes, type CodigoRejeicaoCandidato, type OpcaoSistemaAutomatico, type RejeicaoAgrupada } from "@/lib/dimensionamento";

/** Rótulo curto em português pra cada código de rejeição — usado só pro resumo agrupado
 * ("4 combinações acima do limite de overload"), nunca pra listar equipamento por equipamento
 * (Evandro, 2026-10-01, ponto 1 das correções: "não precisa despejar dezenas... a UI agrupar"). */
const ROTULO_REJEICAO: Record<CodigoRejeicaoCandidato, string> = {
  OVERLOAD_LIMIT: "acima do limite de overload",
  VOC_LIMIT: "tensão Voc a frio acima do limite do inversor",
  MPPT_MIN: "tensão da string abaixo da faixa de MPPT do inversor",
  MPPT_MAX: "tensão da string acima da faixa de MPPT do inversor",
  INPUT_CURRENT: "corrente de entrada do MPPT excedida",
  SHORT_CIRCUIT_CURRENT: "corrente de curto-circuito acima do limite",
  GRID_INCOMPATIBLE: "incompatível com a rede elétrica informada",
  EQUIPMENT_DATA_INCOMPLETE: "com dados técnicos incompletos no catálogo",
};

/**
 * Painel único de dimensionamento — apresentação pura: toda a lógica (motor, seleção
 * automática/manual, quantidade, gate de rede elétrica) mora em `useDimensionamento`
 * (`src/components/dimensionamento/usar-dimensionamento.ts`, Fase 3 da reconciliação, Evandro,
 * 2026-10-01). Este componente só decide o que mostrar a partir do resultado do hook, seguindo a
 * linguagem visual do wizard novo (ícones `lucide-react`, os 3 estados de alerta técnico dos PRs
 * #97/#98: sucesso/aviso/erro) — mas sem usar verde fora do WhatsApp nem vermelho fora de
 * erro/perda (CLAUDE.md): "sucesso" aqui usa o dourado da marca, não verde.
 *
 * Mesmo componente serve pra criação do negócio e, quando a Etapa B da unificação estiver pronta,
 * pra "Editar sistema" — quem chama é que decide onde montar o `<form>` em volta.
 */
export function PainelDimensionamento({
  onAlteracao,
  ...paramsHook
}: UsarDimensionamentoParams & {
  /** Opcional: avisa quem usa este componente sempre que a seleção/quantidade mudar — útil pra
   * mostrar um resumo fora deste painel (ex.: card de "kit recomendado" na Etapa 2). O próprio
   * painel já renderiza os campos ocultos internamente; isso é só pra leitura. */
  onAlteracao?: (campos: CamposFormularioDimensionamento | null) => void;
}) {
  const dimensionamento = useDimensionamento(paramsHook);
  const {
    prontoPraCalcular,
    opcoesAutomaticas,
    potenciaBaseKwp,
    potenciaAlvoKwp,
    rejeicoes,
    semModuloDisponivel,
    semInversorDisponivel,
    origem,
    par,
    quantidade,
    opcaoAtual,
    camposFormulario,
  } = dimensionamento;

  useEffect(() => {
    onAlteracao?.(camposFormulario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camposFormulario]);

  if (!prontoPraCalcular) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Potência necessária/alvo sempre aparece, mesmo sem combinação automática — nunca só "—"
          (Evandro, 2026-10-01, ponto 1 das correções pós-diagnóstico do caso Cascavel/PR). NUNCA
          chamar isso de "potência instalada": só vira isso dentro de uma opção com módulo definido. */}
      <p className="text-sm text-zinc-700">
        Potência necessária: <span className="font-medium text-zinc-900">{potenciaAlvoKwp.toLocaleString("pt-BR")} kWp</span>{" "}
        <span className="text-xs text-zinc-400">
          ({potenciaBaseKwp.toLocaleString("pt-BR")} kWp de base × margem de {Math.round(paramsHook.margemDimensionamentoPct * 100)}%)
        </span>
      </p>

      {opcoesAutomaticas.length > 0 ? (
        <>
          <p className="text-sm font-medium text-zinc-700">Kit sugerido automaticamente</p>
          <p className="-mt-1 text-xs text-zinc-500">
            Calculado a partir do consumo informado e dos equipamentos ativos em Configurações → Calculadora. Escolha
            uma opção e ajuste a quantidade se precisar — a validação elétrica roda de novo a cada ajuste.
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {opcoesAutomaticas.map((opcao) => (
              <CartaoOpcaoAutomatica
                key={`${opcao.modulo.id}-${opcao.inversor.id}`}
                opcao={opcao}
                ativa={origem === "automatico" && par?.modulo.id === opcao.modulo.id && par?.inversor.id === opcao.inversor.id}
                onEscolher={() => dimensionamento.selecionarAutomatico(opcao)}
              />
            ))}
          </div>
          {rejeicoes.length > 0 && <ResumoRejeicoes rejeicoes={rejeicoes} />}
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg bg-cinza-claro/40 px-3 py-2 text-sm text-zinc-700">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cinza" />
            Nenhuma combinação automática compatível encontrada no catálogo atual.
          </p>
          {semModuloDisponivel ? (
            <p className="pl-6 text-xs text-zinc-500">Catálogo sem módulo compatível — nenhum módulo ativo em Configurações → Calculadora.</p>
          ) : semInversorDisponivel ? (
            <p className="pl-6 text-xs text-zinc-500">Catálogo sem inversor compatível — nenhum inversor ativo em Configurações → Calculadora.</p>
          ) : (
            rejeicoes.length > 0 && (
              <div className="pl-6">
                <ResumoRejeicoes rejeicoes={rejeicoes} />
              </div>
            )
          )}
        </div>
      )}

      <SeletorManual
        aberto={origem === "manual"}
        modulos={paramsHook.modulos}
        inversores={paramsHook.inversores}
        moduloSelecionadoId={origem === "manual" ? (par?.modulo.id ?? "") : ""}
        inversorSelecionadoId={origem === "manual" ? (par?.inversor.id ?? "") : ""}
        onAbrir={() => dimensionamento.selecionarManual("", "")}
        onEscolherModulo={(moduloId) => dimensionamento.selecionarManual(moduloId, par?.inversor.id ?? "")}
        onEscolherInversor={(inversorId) => dimensionamento.selecionarManual(par?.modulo.id ?? "", inversorId)}
      />

      {par && (
        <PainelResultado
          par={par}
          quantidade={quantidade}
          setQuantidade={dimensionamento.ajustarQuantidade}
          opcaoAtual={opcaoAtual}
        />
      )}

      <CamposOcultosDimensionamento campos={camposFormulario} />
    </div>
  );
}

/** Resumo agrupado do diagnóstico ("4 combinações acima do limite de overload") — nunca lista
 * equipamento por equipamento (Evandro, 2026-10-01, ponto 1 das correções). */
function ResumoRejeicoes({ rejeicoes }: { rejeicoes: RejeicaoAgrupada[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-zinc-500">
      {rejeicoes.map(({ codigo, quantidade }) => (
        <li key={codigo}>
          {quantidade} {quantidade === 1 ? "combinação" : "combinações"} {ROTULO_REJEICAO[codigo]}
        </li>
      ))}
    </ul>
  );
}

function CartaoOpcaoAutomatica({
  opcao,
  ativa,
  onEscolher,
}: {
  opcao: OpcaoSistemaAutomatico;
  ativa: boolean;
  onEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEscolher}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left text-sm transition-colors ${
        ativa ? "border-dourado bg-dourado/10" : "border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <span className="font-medium text-zinc-900">
        {opcao.quantidadeModulos}x {opcao.modulo.fabricante} {opcao.modulo.modelo}
      </span>
      <span className="text-zinc-600">
        + {opcao.inversor.fabricante} {opcao.inversor.modelo}
      </span>
      <span className="text-zinc-500">
        {opcao.potenciaDcKwp.toLocaleString("pt-BR")} kWp · overload{" "}
        {(opcao.overloadPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
      </span>
      {opcao.validacaoEletrica === "nao_verificado" && (
        <span className="text-xs text-zinc-400">
          Não verificado — falta no datasheet: {camposTecnicosFaltantes(opcao.modulo, opcao.inversor).join(", ")}
        </span>
      )}
      {opcao.validacaoRede === "pendente_confirmacao_rede" && (
        <span className="text-xs text-zinc-400">Inversor a confirmar — falta o tipo de ligação da rede</span>
      )}
    </button>
  );
}

function SeletorManual({
  aberto,
  modulos,
  inversores,
  moduloSelecionadoId,
  inversorSelecionadoId,
  onAbrir,
  onEscolherModulo,
  onEscolherInversor,
}: {
  aberto: boolean;
  modulos: OpcaoSistemaAutomatico["modulo"][];
  inversores: OpcaoSistemaAutomatico["inversor"][];
  moduloSelecionadoId: string;
  inversorSelecionadoId: string;
  onAbrir: () => void;
  onEscolherModulo: (id: string) => void;
  onEscolherInversor: (id: string) => void;
}) {
  if (!aberto) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3">
        <Botao type="button" variante="secundario" onClick={onAbrir} className="self-start">
          Selecionar manualmente (permite overload acima do limite)
        </Botao>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3">
      <p className="text-xs text-zinc-500">
        Escolha qualquer módulo e inversor do catálogo ativo. Overload acima do limite fica disponível aqui, mas é
        registrado na linha do tempo do negócio como override manual.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Selecao rotulo="Módulo" value={moduloSelecionadoId} onChange={(e) => onEscolherModulo(e.target.value)}>
          <option value="">Selecione</option>
          {modulos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fabricante} {m.modelo}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Inversor" value={inversorSelecionadoId} onChange={(e) => onEscolherInversor(e.target.value)}>
          <option value="">Selecione</option>
          {inversores.map((i) => (
            <option key={i.id} value={i.id}>
              {i.fabricante} {i.modelo}
            </option>
          ))}
        </Selecao>
      </div>
    </div>
  );
}

type TomAlerta = "sucesso" | "aviso" | "erro" | "neutro";

function AlertaTecnico({ tom, children }: { tom: TomAlerta; children: ReactNode }) {
  const estilos: Record<TomAlerta, string> = {
    // "Sucesso" usa o dourado da marca, não verde — CLAUDE.md: verde só no WhatsApp.
    sucesso: "bg-dourado/10 text-carvao",
    aviso: "bg-amber-50 text-amber-800",
    // Único tom que usa vermelho — reservado pra erro/incompatibilidade (CLAUDE.md).
    erro: "bg-red-50 text-red-800",
    neutro: "bg-cinza-claro/40 text-zinc-700",
  };
  const Icone = { sucesso: CheckCircle2, aviso: AlertTriangle, erro: XCircle, neutro: Info }[tom];
  const corIcone = { sucesso: "text-dourado", aviso: "text-amber-600", erro: "text-red-600", neutro: "text-cinza" }[tom];
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${estilos[tom]}`}>
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${corIcone}`} />
      <span>{children}</span>
    </div>
  );
}

function PainelResultado({
  par,
  quantidade,
  setQuantidade,
  opcaoAtual,
}: {
  par: { modulo: OpcaoSistemaAutomatico["modulo"]; inversor: OpcaoSistemaAutomatico["inversor"] };
  quantidade: string;
  setQuantidade: (v: string) => void;
  opcaoAtual: OpcaoSistemaAutomatico | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
      <p className="text-sm text-zinc-700">
        {par.modulo.fabricante} {par.modulo.modelo} + {par.inversor.fabricante} {par.inversor.modelo}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-700">Quantidade de módulos</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          className="w-24 rounded-md border border-zinc-300 px-2 py-1"
        />
      </label>

      {!opcaoAtual ? (
        <AlertaTecnico tom="erro">Essa quantidade não forma um arranjo eletricamente seguro com esse inversor.</AlertaTecnico>
      ) : (
        <>
          <p className="text-sm text-zinc-700">
            {opcaoAtual.potenciaDcKwp.toLocaleString("pt-BR")} kWp · overload{" "}
            {(opcaoAtual.overloadPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
          </p>

          {opcaoAtual.validacao === "critico" && (
            <AlertaTecnico tom="erro">
              Overload muito acima do recomendado — não deveria ser usado, mas a escolha fica registrada como override
              manual.
            </AlertaTecnico>
          )}
          {opcaoAtual.validacao === "alerta" && (
            <AlertaTecnico tom="aviso">Overload acima do limite automático — override manual, registrado na linha do tempo.</AlertaTecnico>
          )}
          {opcaoAtual.validacao === "valido" && <AlertaTecnico tom="sucesso">Overload dentro do limite automático.</AlertaTecnico>}

          {opcaoAtual.validacaoEletrica === "incompativel" && (
            <AlertaTecnico tom="erro">Combinação incompatível — {opcaoAtual.motivoIncompatibilidade}</AlertaTecnico>
          )}
          {opcaoAtual.validacaoEletrica === "nao_verificado" && (
            <p className="text-xs text-zinc-400">
              String não verificada — falta no datasheet: {camposTecnicosFaltantes(opcaoAtual.modulo, opcaoAtual.inversor).join(", ")}
            </p>
          )}
          {opcaoAtual.validacaoEletrica === "valido" && (
            <AlertaTecnico tom="sucesso">Combinação compatível · MPPT validado · Voc validado</AlertaTecnico>
          )}

          {opcaoAtual.validacaoRede === "pendente_confirmacao_rede" && (
            <AlertaTecnico tom="neutro">
              Confirme o tipo de ligação (monofásico/bifásico/trifásico) e a tensão da rede do cliente pra validar o
              inversor.
            </AlertaTecnico>
          )}
          {opcaoAtual.validacaoRede === "nao_verificado" && (
            <p className="text-xs text-zinc-400">Rede elétrica não verificada — falta cadastrar as fases do inversor no catálogo.</p>
          )}
          {opcaoAtual.validacaoRede === "incompativel" && (
            <AlertaTecnico tom="erro">Rede incompatível — {opcaoAtual.motivoIncompatibilidadeRede}</AlertaTecnico>
          )}
          {opcaoAtual.validacaoRede === "valido" && (
            <AlertaTecnico tom="sucesso">Inversor compatível com a ligação informada.</AlertaTecnico>
          )}
        </>
      )}
    </div>
  );
}
