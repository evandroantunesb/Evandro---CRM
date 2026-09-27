import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formatacao";
import { definicaoDoBloco } from "@/lib/propostas/blocos";
import { blocoTemConteudo, campoTexto, itensDoConfig, numerosDoConfig, partes } from "@/lib/propostas/conteudo";
import type { BlocoRenderizavel, DadosSistemaProposta, IdentidadeProposta } from "@/lib/propostas/pdf-tipos";
import { ROTULO_TIPO_COMPONENTE_KIT, ROTULO_TIPO_LIGACAO } from "@/lib/tipos";

// Renderizadores HTML por tipo de bloco, pra página pública da proposta
// (`/proposta/[token]`) mostrar o mesmo conteúdo configurado no modelo que
// o PDF gerado (`src/lib/propostas/pdf.tsx`). Mesma convenção de config,
// componentes próprios porque o PDF usa primitivas do @react-pdf/renderer
// (View/Text/Svg) e aqui é HTML/Tailwind normal.

const CINZA = "#6B7280";

function SemDados({ texto }: { texto: string }) {
  return <p className="text-sm text-zinc-400 italic">{texto}</p>;
}

function Dl({ itens }: { itens: { rotulo: string; valor: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm">
      {itens.map((item) => (
        <div key={item.rotulo}>
          <dt className="text-zinc-500">{item.rotulo}</dt>
          <dd className="font-medium text-zinc-900">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function ComoFunciona() {
  const passos = [
    { titulo: "Instalação do sistema", texto: "Os módulos fotovoltaicos são instalados no telhado ou solo, na posição de melhor captação de luz solar." },
    { titulo: "Geração de energia", texto: "Os módulos convertem a luz do sol em energia elétrica contínua (CC)." },
    { titulo: "Conversão pelo inversor", texto: "O inversor transforma a energia contínua em energia alternada (CA), pronta pro uso." },
    { titulo: "Compensação na conta", texto: "A energia gerada vira créditos que abatem sua conta de luz junto à distribuidora." },
  ];
  return (
    <Cartao titulo="Como funciona a energia solar">
      <div className="flex flex-col gap-3">
        {passos.map((p, i) => (
          <div key={p.titulo} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{p.titulo}</p>
              <p className="text-sm text-zinc-600">{p.texto}</p>
            </div>
          </div>
        ))}
      </div>
    </Cartao>
  );
}

function ResumoSistema({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Seu sistema fotovoltaico">
      <Dl
        itens={[
          { rotulo: "Kit", valor: dados.kitNome },
          { rotulo: "Potência", valor: `${dados.kitPotenciaKwp.toLocaleString("pt-BR")} kWp` },
          { rotulo: "Ligação", valor: ROTULO_TIPO_LIGACAO[dados.tipoLigacao] },
          { rotulo: "Geração média estimada", valor: `${dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês` },
        ]}
      />
    </Cartao>
  );
}

function ResumoEquipamentos({ dados }: { dados: DadosSistemaProposta }) {
  const itens = dados.componentes.length > 0 ? dados.componentes : [{ tipo: "outro" as const, descricao: `Kit ${dados.kitNome}`, quantidade: 1, potenciaW: null }];
  return (
    <Cartao titulo="Principais equipamentos">
      <ul className="divide-y divide-zinc-100 text-sm">
        {itens.map((item, i) => (
          <li key={i} className="flex items-center gap-3 py-2">
            <span className="w-20 shrink-0 text-zinc-500">{ROTULO_TIPO_COMPONENTE_KIT[item.tipo]}</span>
            <span className="flex-1">{item.descricao}</span>
            <span className="text-zinc-600">{item.quantidade}x</span>
            {item.potenciaW != null && <span className="text-zinc-600">{item.potenciaW} W</span>}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function BarrasMensais({ valores, cor, max }: { valores: number[]; cor: string; max: number }) {
  return (
    <div className="flex h-24 items-end gap-1">
      {valores.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{ height: `${Math.max((v / max) * 100, 2)}%`, backgroundColor: cor }} />
          <span className="text-[9px] text-zinc-400">{MESES[i]}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoGeracaoMensal({ dados, destaque }: { dados: DadosSistemaProposta; destaque: string }) {
  const valores = Array(12).fill(dados.geracaoEstimadaKwhMes);
  return (
    <Cartao titulo="Geração estimada por mês">
      <BarrasMensais valores={valores} cor={destaque} max={Math.max(...valores, 1)} />
      <p className="mt-2 text-xs text-zinc-500">
        Média estimada: {dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês (estimativa constante, sem simulação de sazonalidade).
      </p>
    </Cartao>
  );
}

function ContaAntesDepois({ dados, primaria, destaque }: { dados: DadosSistemaProposta; primaria: string; destaque: string }) {
  const max = Math.max(dados.contaSemSolar, dados.contaComSolar, 1);
  return (
    <Cartao titulo="Conta de energia: antes e depois">
      <div className="flex items-end gap-8">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-24 w-16 items-end">
            <div className="w-full rounded-t bg-zinc-300" style={{ height: `${(dados.contaSemSolar / max) * 100}%` }} />
          </div>
          <span className="text-xs text-zinc-500">Hoje</span>
          <span className="text-sm font-semibold text-zinc-900">{formatarMoeda(dados.contaSemSolar)}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-24 w-16 items-end">
            <div className="w-full rounded-t" style={{ height: `${(dados.contaComSolar / max) * 100}%`, backgroundColor: destaque }} />
          </div>
          <span className="text-xs text-zinc-500">Com o sistema</span>
          <span className="text-sm font-semibold" style={{ color: primaria }}>
            {formatarMoeda(dados.contaComSolar)}
          </span>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Economia estimada</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(dados.economiaMensal)}/mês</p>
        </div>
      </div>
    </Cartao>
  );
}

function ValorProposta({ dados, primaria }: { dados: DadosSistemaProposta; primaria: string }) {
  return (
    <Cartao titulo="Valor da proposta">
      <p className="text-3xl font-semibold" style={{ color: primaria }}>
        {formatarMoeda(dados.kitPreco)}
      </p>
      {dados.paybackMeses != null && (
        <p className="mt-1 text-sm text-zinc-500">Retorno estimado do investimento: {dados.paybackMeses.toLocaleString("pt-BR")} meses</p>
      )}
    </Cartao>
  );
}

function CondicoesPagamento({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Condições de pagamento">
      <Dl
        itens={[
          ...(dados.modoPreco === "avista" || dados.modoPreco === "completo" ? [{ rotulo: "À vista", valor: formatarMoeda(dados.kitPreco) }] : []),
          ...(dados.modoPreco === "parcelado" || dados.modoPreco === "completo"
            ? [{ rotulo: "Parcelado", valor: "Consulte condições com o vendedor" }]
            : []),
        ]}
      />
    </Cartao>
  );
}

const SERVICOS_PADRAO = [
  "Projeto e homologação junto à distribuidora",
  "Instalação e comissionamento do sistema",
  "Documentação técnica completa",
  "Suporte no período de garantia",
];

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-zinc-700">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-zinc-400">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ItensInclusos({ config }: { config: unknown }) {
  return (
    <Cartao titulo="O que está incluso">
      <Lista itens={itensDoConfig(config) ?? SERVICOS_PADRAO} />
    </Cartao>
  );
}

function ProximosPassos({ identidade, config, primaria, destaque }: { identidade: IdentidadeProposta; config: unknown; primaria: string; destaque: string }) {
  const texto = campoTexto(config, "texto") || "Fale com seu vendedor pra tirar dúvidas e avançar com a instalação do seu sistema.";
  const ctaTexto = campoTexto(config, "ctaTexto") || (identidade.whatsapp ? `WhatsApp: ${identidade.whatsapp}` : null);
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: primaria }}>
      <p className="text-base font-semibold text-white">Próximos passos</p>
      <p className="mt-1.5 text-sm text-zinc-200">{texto}</p>
      {ctaTexto && (
        <p className="mt-2 text-sm font-semibold" style={{ color: destaque }}>
          {ctaTexto}
        </p>
      )}
    </div>
  );
}

function DadosDocumento({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const numero = campoTexto(config, "numero");
  const validade = campoTexto(config, "validadeDias");
  const vendedor = campoTexto(config, "vendedorNome");
  const tipoImovel = campoTexto(config, "tipoImovel");
  return (
    <Cartao titulo="Dados da proposta">
      <Dl
        itens={[
          { rotulo: "Cliente", valor: dados.clienteNome },
          ...(numero ? [{ rotulo: "Número", valor: numero }] : []),
          ...(validade ? [{ rotulo: "Validade", valor: `${validade} dias` }] : []),
          ...(vendedor ? [{ rotulo: "Vendedor", valor: vendedor }] : []),
          ...(tipoImovel ? [{ rotulo: "Tipo de imóvel", valor: tipoImovel }] : []),
        ]}
      />
    </Cartao>
  );
}

function BlocoLista({ titulo, config, duasColunas, padrao }: { titulo: string; config: unknown; duasColunas: boolean; padrao?: string[] }) {
  const linhas = itensDoConfig(config) ?? padrao ?? null;
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <ul className="flex flex-col gap-2.5 text-sm">
        {linhas.map((linha, i) => {
          const p = partes(linha);
          return (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-400">•</span>
              <div className="flex-1">
                {duasColunas && p[0] ? (
                  <>
                    <p className="font-semibold text-zinc-900">{p[0]}</p>
                    {p[1] && <p className="text-zinc-600">{p[1]}</p>}
                  </>
                ) : (
                  <p className="text-zinc-700">{p[0]}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

function BlocoPares({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <div className="flex flex-col gap-3">
        {linhas.map((linha, i) => {
          const [a, b] = partes(linha);
          return (
            <div key={i}>
              <p className="text-sm font-semibold text-zinc-900">{a}</p>
              {b && <p className="text-sm text-zinc-600">{b}</p>}
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

function BlocoIndicadores({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <div className="flex flex-wrap gap-6">
        {linhas.map((linha, i) => {
          const [rotulo, valor] = partes(linha);
          return (
            <div key={i} className="min-w-[100px]">
              <p className="text-xs text-zinc-500">{rotulo}</p>
              <p className="text-sm font-semibold text-zinc-900">{valor}</p>
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

function BlocoPessoas({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <div className="flex flex-col gap-3">
        {linhas.map((linha, i) => {
          const [nome, subtitulo, texto] = partes(linha);
          return (
            <div key={i}>
              <p className="text-sm font-semibold text-zinc-900">{nome}</p>
              {subtitulo && <p className="text-xs text-zinc-500">{subtitulo}</p>}
              {texto && <p className="mt-0.5 text-sm text-zinc-600">{texto}</p>}
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

function BlocoEtapas({ config }: { config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem etapas cadastradas ainda." />;
  return (
    <Cartao titulo="Etapas da instalação">
      <div className="flex flex-col gap-3">
        {linhas.map((linha, i) => {
          const [titulo, prazo, descricao] = partes(linha);
          return (
            <div key={i} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {titulo}
                  {prazo && <span className="ml-1.5 text-xs font-normal text-zinc-500">· {prazo}</span>}
                </p>
                {descricao && <p className="text-sm text-zinc-600">{descricao}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

function BlocoAnexos({ config }: { config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Nenhum anexo cadastrado." />;
  return (
    <Cartao titulo="Anexos">
      <ul className="flex flex-col gap-1.5 text-sm">
        {linhas.map((linha, i) => {
          const [nome, url] = partes(linha);
          return (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-400">•</span>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                  {nome || url}
                </a>
              ) : (
                <span>{nome}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

function BlocoEscopo({ config }: { config: unknown }) {
  const incluido = itensDoConfig(config && typeof config === "object" ? { itens: (config as Record<string, unknown>).incluido } : null);
  const excluido = itensDoConfig(config && typeof config === "object" ? { itens: (config as Record<string, unknown>).excluido } : null);
  if (!incluido && !excluido) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo="Inclusões e exclusões">
      <div className="grid grid-cols-2 gap-4">
        {incluido && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-green-700">Incluso</p>
            <Lista itens={incluido} />
          </div>
        )}
        {excluido && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-red-700">Não incluso</p>
            <Lista itens={excluido} />
          </div>
        )}
      </div>
    </Cartao>
  );
}

function BlocoTexto({ titulo, config, tituloConfiguravel, padrao }: { titulo: string; config: unknown; tituloConfiguravel?: boolean; padrao?: string }) {
  const texto = campoTexto(config, "texto") || padrao;
  const tituloFinal = (tituloConfiguravel && campoTexto(config, "titulo")) || titulo;
  if (!texto) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={tituloFinal}>
      <p className="text-sm whitespace-pre-wrap text-zinc-700">{texto}</p>
    </Cartao>
  );
}

function PerfilCliente({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const objetivo = campoTexto(config, "objetivo");
  return (
    <Cartao titulo="Perfil do projeto">
      <Dl itens={[{ rotulo: "Cliente", valor: dados.clienteNome }, ...(dados.clienteEndereco ? [{ rotulo: "Local", valor: dados.clienteEndereco }] : [])]} />
      {objetivo && <p className="mt-2 text-sm text-zinc-700">{objetivo}</p>}
    </Cartao>
  );
}

function ConsumoAtual({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Consumo atual">
      <Dl
        itens={[
          { rotulo: "Consumo médio", valor: `${dados.consumoMedioKwh.toLocaleString("pt-BR")} kWh/mês` },
          { rotulo: "Valor médio da conta", valor: formatarMoeda(dados.contaSemSolar) },
          { rotulo: "Ligação", valor: ROTULO_TIPO_LIGACAO[dados.tipoLigacao] },
        ]}
      />
    </Cartao>
  );
}

function TabelaEquipamentos({ dados }: { dados: DadosSistemaProposta }) {
  if (dados.componentes.length === 0) return <SemDados texto="Sem componentes cadastrados no kit deste negócio." />;
  return (
    <Cartao titulo="Relação técnica dos equipamentos">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-500">
            <th className="py-1.5 font-medium">Tipo</th>
            <th className="py-1.5 font-medium">Descrição</th>
            <th className="py-1.5 text-right font-medium">Qtd.</th>
            <th className="py-1.5 text-right font-medium">Potência</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {dados.componentes.map((item, i) => (
            <tr key={i}>
              <td className="py-1.5">{ROTULO_TIPO_COMPONENTE_KIT[item.tipo]}</td>
              <td className="py-1.5">{item.descricao}</td>
              <td className="py-1.5 text-right">{item.quantidade}x</td>
              <td className="py-1.5 text-right">{item.potenciaW != null ? `${item.potenciaW} W` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  );
}

function BlocoImagem({ config }: { config: unknown }) {
  const imagemUrl = campoTexto(config, "imagemUrl");
  const texto = campoTexto(config, "texto");
  if (!imagemUrl && !texto) return <SemDados texto="Sem imagem ou descrição cadastrada pra este bloco ainda." />;
  return (
    <Cartao titulo="Layout da instalação">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL externa arbitrária cadastrada pela empresa, sem domínio fixo pro next/image */}
      {imagemUrl && <img src={imagemUrl} alt="Layout da instalação" className="mb-2 max-h-72 w-full rounded-lg object-contain" />}
      {texto && <p className="text-sm text-zinc-700">{texto}</p>}
    </Cartao>
  );
}

function ResumoEnergetico({ dados }: { dados: DadosSistemaProposta }) {
  const anual = dados.geracaoEstimadaKwhMes * 12;
  const cobertura = dados.consumoMedioKwh > 0 ? Math.round((dados.geracaoEstimadaKwhMes / dados.consumoMedioKwh) * 100) : null;
  return (
    <Cartao titulo="Resumo energético">
      <div className="flex flex-wrap gap-6">
        <div className="min-w-[100px]">
          <p className="text-xs text-zinc-500">Média mensal</p>
          <p className="text-sm font-semibold text-zinc-900">{dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh</p>
        </div>
        <div className="min-w-[100px]">
          <p className="text-xs text-zinc-500">Total estimado no ano</p>
          <p className="text-sm font-semibold text-zinc-900">{anual.toLocaleString("pt-BR")} kWh</p>
        </div>
        {cobertura != null && (
          <div className="min-w-[100px]">
            <p className="text-xs text-zinc-500">Cobertura estimada do consumo</p>
            <p className="text-sm font-semibold text-zinc-900">{cobertura}%</p>
          </div>
        )}
      </div>
    </Cartao>
  );
}

function GraficoConsumoVsGeracao({ config, dados, destaque }: { config: unknown; dados: DadosSistemaProposta; destaque: string }) {
  const consumo = numerosDoConfig(config, "valoresConsumo");
  if (!consumo) return <SemDados texto="Cadastre os 12 valores mensais de consumo pra ativar este gráfico." />;
  const max = Math.max(...consumo, dados.geracaoEstimadaKwhMes, 1);
  return (
    <Cartao titulo="Consumo × geração">
      <div className="flex h-24 items-end gap-1">
        {MESES.map((m, i) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end gap-px" style={{ height: 88 }}>
              <div className="flex-1 rounded-t bg-zinc-300" style={{ height: `${Math.max((consumo[i]! / max) * 100, 2)}%` }} />
              <div className="flex-1 rounded-t" style={{ height: `${Math.max((dados.geracaoEstimadaKwhMes / max) * 100, 2)}%`, backgroundColor: destaque }} />
            </div>
            <span className="text-[9px] text-zinc-400">{m}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Cinza: consumo mensal cadastrado. Dourado: geração média estimada do sistema.</p>
    </Cartao>
  );
}

function GraficoConsumoMensal({ config }: { config: unknown }) {
  const consumo = numerosDoConfig(config, "valores");
  if (!consumo) return <SemDados texto="Cadastre os 12 valores mensais de consumo pra ativar este gráfico." />;
  return (
    <Cartao titulo="Histórico de consumo">
      <BarrasMensais valores={consumo} cor={CINZA} max={Math.max(...consumo, 1)} />
    </Cartao>
  );
}

function EconomiaEstimada({ dados }: { dados: DadosSistemaProposta }) {
  const anual = dados.economiaMensal * 12;
  return (
    <Cartao titulo="Economia estimada">
      <div className="flex flex-wrap gap-6">
        <div className="min-w-[100px]">
          <p className="text-xs text-zinc-500">Economia mensal</p>
          <p className="text-sm font-semibold text-green-700">{formatarMoeda(dados.economiaMensal)}</p>
        </div>
        <div className="min-w-[100px]">
          <p className="text-xs text-zinc-500">Economia anual</p>
          <p className="text-sm font-semibold text-green-700">{formatarMoeda(anual)}</p>
        </div>
        {dados.paybackMeses != null && (
          <div className="min-w-[100px]">
            <p className="text-xs text-zinc-500">Retorno estimado</p>
            <p className="text-sm font-semibold text-zinc-900">{dados.paybackMeses.toLocaleString("pt-BR")} meses</p>
          </div>
        )}
      </div>
    </Cartao>
  );
}

function RetornoInvestimento({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const texto = campoTexto(config, "texto");
  return (
    <Cartao titulo="Retorno do investimento">
      {dados.paybackMeses != null && (
        <p className="text-base font-semibold text-zinc-900">Retorno estimado em {dados.paybackMeses.toLocaleString("pt-BR")} meses</p>
      )}
      {texto ? (
        <p className="mt-1 text-sm text-zinc-700">{texto}</p>
      ) : (
        dados.paybackMeses == null && <SemDados texto="Sem cálculo de retorno disponível pra este negócio." />
      )}
    </Cartao>
  );
}

function ContatosFinais({ identidade, config }: { identidade: IdentidadeProposta; config: unknown }) {
  const email = campoTexto(config, "email");
  const telefone = campoTexto(config, "telefone");
  const enderecoExtra = campoTexto(config, "endereco");
  return (
    <Cartao titulo="Contatos">
      <div className="flex flex-col gap-1 text-sm text-zinc-700">
        {identidade.nomeExibicao && <p className="font-semibold text-zinc-900">{identidade.nomeExibicao}</p>}
        {identidade.whatsapp && <p>WhatsApp: {identidade.whatsapp}</p>}
        {telefone && <p>Telefone: {telefone}</p>}
        {email && <p>E-mail: {email}</p>}
        {enderecoExtra && <p>{enderecoExtra}</p>}
      </div>
    </Cartao>
  );
}

type ContextoBloco = { dados: DadosSistemaProposta; identidade: IdentidadeProposta; primaria: string; destaque: string };

function renderizarBloco(bloco: BlocoRenderizavel, ctx: ContextoBloco) {
  switch (bloco.tipo) {
    case "how_it_works":
      return <ComoFunciona />;
    case "system_summary":
      return <ResumoSistema dados={ctx.dados} />;
    case "equipment_summary":
      return <ResumoEquipamentos dados={ctx.dados} />;
    case "generation_monthly_chart":
      return <GraficoGeracaoMensal dados={ctx.dados} destaque={ctx.destaque} />;
    case "before_after_bill":
      return <ContaAntesDepois dados={ctx.dados} primaria={ctx.primaria} destaque={ctx.destaque} />;
    case "investment_main":
      return <ValorProposta dados={ctx.dados} primaria={ctx.primaria} />;
    case "payment_options":
      return <CondicoesPagamento dados={ctx.dados} />;
    case "included_services":
      return <ItensInclusos config={bloco.config} />;
    case "next_steps":
      return <ProximosPassos identidade={ctx.identidade} config={bloco.config} primaria={ctx.primaria} destaque={ctx.destaque} />;
    case "proposal_identity":
      return <DadosDocumento config={bloco.config} dados={ctx.dados} />;
    case "cover_benefits":
      return (
        <BlocoLista
          titulo="Benefícios"
          config={bloco.config}
          duasColunas
          padrao={["Economia na conta de energia", "Energia limpa e renovável", "Mais valorização para o imóvel", "Sistema com garantia"]}
        />
      );
    case "about_company":
      return <BlocoTexto titulo="Quem somos" config={bloco.config} />;
    case "company_highlights":
      return <BlocoLista titulo="Diferenciais" config={bloco.config} duasColunas />;
    case "company_numbers":
      return <BlocoIndicadores titulo="Nossos números" config={bloco.config} />;
    case "team_and_certifications":
      return <BlocoPessoas titulo="Equipe e qualificações" config={bloco.config} />;
    case "portfolio":
      return <BlocoPessoas titulo="Nossos projetos" config={bloco.config} />;
    case "testimonials":
      return <BlocoPares titulo="Depoimentos" config={bloco.config} />;
    case "solar_benefits":
      return (
        <BlocoLista
          titulo="Benefícios da energia solar"
          config={bloco.config}
          duasColunas={false}
          padrao={["Redução na conta de energia", "Energia limpa e renovável", "Valorização do imóvel", "Proteção contra aumentos na tarifa"]}
        />
      );
    case "day_night":
      return (
        <BlocoTexto
          titulo="Geração dia e noite"
          config={bloco.config}
          padrao="Durante o dia, o sistema gera energia e abastece o imóvel; o excedente vira crédito com a distribuidora. À noite, sem geração própria, o imóvel usa esses créditos acumulados pra compensar o consumo da rede."
        />
      );
    case "solar_faq":
      return <BlocoPares titulo="Perguntas frequentes" config={bloco.config} />;
    case "customer_profile":
      return <PerfilCliente config={bloco.config} dados={ctx.dados} />;
    case "current_consumption":
      return <ConsumoAtual dados={ctx.dados} />;
    case "consumption_chart":
      return <GraficoConsumoMensal config={bloco.config} />;
    case "equipment_table":
      return <TabelaEquipamentos dados={ctx.dados} />;
    case "installation_layout":
      return <BlocoImagem config={bloco.config} />;
    case "generation_vs_consumption":
      return <GraficoConsumoVsGeracao config={bloco.config} dados={ctx.dados} destaque={ctx.destaque} />;
    case "generation_summary":
      return <ResumoEnergetico dados={ctx.dados} />;
    case "simulation_assumptions":
      return <BlocoTexto titulo="Premissas técnicas" config={bloco.config} />;
    case "long_term_generation":
      return <BlocoTexto titulo="Projeção de longo prazo" config={bloco.config} />;
    case "savings_summary":
      return <EconomiaEstimada dados={ctx.dados} />;
    case "cashflow_payback":
      return <RetornoInvestimento config={bloco.config} dados={ctx.dados} />;
    case "extra_costs":
      return <BlocoPares titulo="Itens e serviços adicionais" config={bloco.config} />;
    case "validity_timeline":
      return <BlocoIndicadores titulo="Validade e prazo" config={bloco.config} />;
    case "project_steps":
      return <BlocoEtapas config={bloco.config} />;
    case "warranties":
      return (
        <BlocoLista
          titulo="Garantias"
          config={bloco.config}
          duasColunas
          padrao={["Garantia dos equipamentos conforme fabricante", "Garantia de instalação conforme contrato"]}
        />
      );
    case "support_maintenance":
      return <BlocoLista titulo="Suporte e manutenção" config={bloco.config} duasColunas={false} />;
    case "scope_inclusions_exclusions":
      return <BlocoEscopo config={bloco.config} />;
    case "commercial_conditions":
      return <BlocoTexto titulo="Condições comerciais" config={bloco.config} />;
    case "company_contacts":
      return <ContatosFinais identidade={ctx.identidade} config={bloco.config} />;
    case "custom_content":
      return <BlocoTexto titulo="Observações" config={bloco.config} tituloConfiguravel />;
    case "pdf_attachment":
      return <BlocoAnexos config={bloco.config} />;
    default:
      return null;
  }
}

/**
 * Monta a lista de blocos de conteúdo (sem a capa, que a página pública
 * mostra no próprio cabeçalho) já filtrada e ordenada, prontos pra renderizar
 * — mesma regra de conteúdo do PDF (`blocoTemConteudo`), só desenhado em HTML.
 */
export function ModeloPaginaBlocos({
  blocos,
  identidade,
  dados,
}: {
  blocos: BlocoRenderizavel[];
  identidade: IdentidadeProposta;
  dados: DadosSistemaProposta;
}) {
  const primaria = identidade.corPrimaria || "#0F0F10";
  const destaque = identidade.corDestaque || "#D4AF37";
  const conteudo = blocos
    .filter((b) => b.ativo && b.tipo !== "cover" && definicaoDoBloco(b.tipo)?.implementado && blocoTemConteudo(b.tipo, dados, b.config))
    .sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="flex flex-col gap-4">
      {conteudo.map((bloco) => (
        <div key={bloco.tipo}>{renderizarBloco(bloco, { dados, identidade, primaria, destaque })}</div>
      ))}
    </div>
  );
}
