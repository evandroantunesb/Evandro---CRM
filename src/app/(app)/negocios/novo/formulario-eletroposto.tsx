"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao, Campo, GrupoOpcoes, Mensagem, Selecao } from "@/components/ui";
import { criarNegocioEletroposto } from "@/lib/acoes/eletroposto";
import { buscarContatos, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import { CATALOGO_ELETROPOSTO, MODELOS_ELETROPOSTO, mascararWhatsapp, whatsappValido, type ModeloEletroposto } from "@/lib/eletroposto";
import { formatarMoeda } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";

type Opcao = { id: string; nome: string };
type ContatoEncontrado = { id: string; nome: string; telefone: string | null; email: string | null; endereco?: string | null };
type SimNao = "sim" | "nao";

const OPCOES_SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
] as const;

function Bloco({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-linha pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-titulo text-lg font-semibold tracking-tight text-texto">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm text-texto-2">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Cadastro do negócio de eletroposto: modelos da proposta (um ou mais, preços fixos do catálogo), cliente
 * (nome, WhatsApp e endereço) e o que o vendedor precisa saber (local próprio e usina FV). Cria o negócio e a
 * proposta juntos e abre a ficha na aba do eletroposto. O SDR cria sem modelos (sem proposta).
 */
export function FormularioEletroposto({
  funilId,
  etapaId,
  origens,
  origemSugerida,
  responsaveis,
  meuMembroId,
  escolheModelos,
  contatoInicial = null,
}: {
  funilId: string;
  etapaId?: string;
  origens: Opcao[];
  origemSugerida: string | null;
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  /** Falso para o SDR: ele cadastra o lead sem modelos; quem gera proposta escolhe depois, na ficha. */
  escolheModelos: boolean;
  /** Cliente já escolhido ("Novo negócio para este cliente", na ficha de outro negócio). */
  contatoInicial?: ContatoEncontrado | null;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciarEnvio] = useTransition();
  const [, iniciar] = useTransition();

  const [modelos, setModelos] = useState<ModeloEletroposto[]>([]);
  const [modo, setModo] = useState<"novo" | "existente">(contatoInicial ? "existente" : "novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(contatoInicial);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [tipoContato, setTipoContato] = useState<"pj" | "pf">("pj");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [localProprio, setLocalProprio] = useState<SimNao | null>(null);
  const [usinaFv, setUsinaFv] = useState<SimNao | null>(null);
  const [origemId, setOrigemId] = useState<string | null>(origemSugerida);

  function alternarModelo(m: ModeloEletroposto) {
    setModelos((atuais) => (atuais.includes(m) ? atuais.filter((x) => x !== m) : MODELOS_ELETROPOSTO.filter((x) => x === m || atuais.includes(x))));
  }

  function pesquisar(termo: string) {
    setBusca(termo);
    iniciar(async () => setEncontrados(await buscarContatos(termo)));
  }

  function conferirDuplicado() {
    if (telefone.replace(/\D/g, "").length < 10) return setDuplicados([]);
    iniciar(async () => setDuplicados(await verificarDuplicado(telefone, "")));
  }

  const enderecoExistente = modo === "existente" ? (contato?.endereco ?? null) : null;

  function problema(): string | null {
    if (escolheModelos && !modelos.length) return "Escolha pelo menos um modelo de eletroposto.";
    if (modo === "existente" && !contato) return "Selecione o cliente existente.";
    if (modo === "novo") {
      if (nome.trim().length < 2) return "Informe o nome do cliente.";
      if (!whatsappValido(telefone)) return "WhatsApp inválido. Informe DDD e celular no formato (45) 99999-9999.";
    }
    if (!enderecoExistente && !endereco.trim()) return "Informe o endereço do cliente.";
    if (!localProprio) return "Informe se o cliente tem local próprio para a instalação.";
    if (!usinaFv) return "Informe se o cliente tem usina fotovoltaica para fornecer a energia.";
    if (!origemId) return "Escolha a origem do cliente.";
    return null;
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const falta = problema();
    if (falta) return setResultado({ ok: false, mensagem: falta });
    const dados = new FormData(evento.currentTarget);
    setResultado(null);
    iniciarEnvio(async () => {
      let r: Awaited<ReturnType<typeof criarNegocioEletroposto>>;
      try {
        r = await criarNegocioEletroposto(dados);
      } catch {
        setResultado({ ok: false, mensagem: "Não foi possível salvar agora (falha de conexão ou do servidor). Seus dados continuam na tela; tente de novo." });
        return;
      }
      if (!r.ok) {
        setResultado({ ok: false, mensagem: r.mensagem });
        // O contato novo foi gravado mas o negócio não: segue com ele como "existente" (o reenvio não duplica).
        if (r.contatoId) {
          setContato({ id: r.contatoId, nome, telefone, email: null, endereco });
          setModo("existente");
        }
        return;
      }
      const avisos = r.avisos.length ? `&avisos=${r.avisos.join(",")}` : "";
      router.push(`/negocios/${r.negocioId}?aba=proposta${avisos}`);
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex max-w-3xl flex-col gap-8">
      <input type="hidden" name="funil_id" value={funilId} />
      {etapaId && <input type="hidden" name="etapa_id" value={etapaId} />}
      <input type="hidden" name="origem_id" value={origemId ?? ""} />
      {modelos.map((m) => (
        <input key={m} type="hidden" name="modelos" value={m} />
      ))}
      {modo === "existente" && contato ? (
        <input type="hidden" name="contato_id" value={contato.id} />
      ) : (
        <>
          <input type="hidden" name="contato_tipo" value={tipoContato} />
          <input type="hidden" name="contato_nome" value={nome} />
          <input type="hidden" name="contato_telefone" value={telefone} />
        </>
      )}
      <input type="hidden" name="contato_endereco" value={endereco} />

      {escolheModelos && (
      <Bloco titulo="Modelos na proposta" descricao="Carregador DC de 80 kW com duas saídas. Escolha um ou mais: cada modelo é uma alternativa, os preços não se somam.">
        <div role="group" aria-label="Modelos de eletroposto" className="grid gap-3 md:grid-cols-3">
          {MODELOS_ELETROPOSTO.map((m) => {
            const item = CATALOGO_ELETROPOSTO[m];
            const marcado = modelos.includes(m);
            return (
              <button
                key={m}
                type="button"
                role="checkbox"
                aria-checked={marcado}
                aria-label={`${item.nome}, ${formatarMoeda(item.preco)}`}
                onClick={() => alternarModelo(m)}
                className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-[border-color,background-color] duration-200 ease-raion outline-none focus-visible:ring-2 focus-visible:ring-dourado/60 ${
                  marcado ? "border-dourado bg-dourado/10" : "border-linha bg-superficie hover:border-texto-2"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-texto-2 uppercase">{item.tag}</span>
                  <span
                    aria-hidden
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${marcado ? "border-dourado bg-dourado text-carvao" : "border-linha"}`}
                  >
                    {marcado && <Check size={14} strokeWidth={3} />}
                  </span>
                </span>
                <span className="font-titulo text-lg font-semibold text-texto">{item.nome}</span>
                <span className="font-titulo text-xl font-light text-texto tabular-nums">{formatarMoeda(item.preco)}</span>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-texto-2">
                  {item.itens.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-texto-2" aria-live="polite">
          {modelos.length
            ? `${modelos.length} modelo${modelos.length > 1 ? "s" : ""} na proposta: ${modelos.map((m) => formatarMoeda(CATALOGO_ELETROPOSTO[m].preco)).join(" · ")}`
            : "Nenhum modelo escolhido."}
        </p>
      </Bloco>
      )}

      <Bloco titulo="Cliente">
        <GrupoOpcoes
          rotulo="Cliente"
          opcoes={[
            { valor: "novo", rotulo: "Novo cliente" },
            { valor: "existente", rotulo: "Cliente existente" },
          ]}
          valor={modo}
          aoEscolher={setModo}
        />
        {modo === "existente" ? (
          contato ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-dourado/10 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">
                <strong>{contato.nome}</strong> <span className="text-texto-2">{contato.telefone ?? contato.email}</span>
              </span>
              <button type="button" className="min-h-11 font-semibold text-dourado-texto md:min-h-0" onClick={() => setContato(null)}>
                Trocar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Campo rotulo="Buscar por nome, telefone ou e-mail" value={busca} onChange={(e) => pesquisar(e.target.value)} />
              <ul className="flex flex-col">
                {encontrados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setContato(c)} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-superficie-2">
                      <strong>{c.nome}</strong> <span className="text-texto-2">{c.telefone ?? c.email}</span>
                    </button>
                  </li>
                ))}
                {busca.length >= 2 && !encontrados.length && <li className="px-3 py-2 text-sm text-texto-2">Nenhum contato encontrado.</li>}
              </ul>
            </div>
          )
        ) : (
          <>
            <GrupoOpcoes
              rotulo="Tipo de cliente"
              opcoes={[
                { valor: "pj", rotulo: "Empresa" },
                { valor: "pf", rotulo: "Pessoa física" },
              ]}
              valor={tipoContato}
              aoEscolher={setTipoContato}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Campo
                rotulo={tipoContato === "pj" ? "Razão social" : "Nome"}
                autoComplete={tipoContato === "pj" ? "organization" : "name"}
                maxLength={100}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
              <Campo
                rotulo="WhatsApp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(45) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(mascararWhatsapp(e.target.value))}
                onBlur={conferirDuplicado}
                required
              />
            </div>
            {duplicados.map((d) => (
              <div key={d.contatoId} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {d.visivel ? (
                  <>
                    Já existe o contato <strong>{d.nome}</strong> com esse telefone.{" "}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => {
                        setContato({ id: d.contatoId, nome: d.nome, telefone: null, email: null });
                        setModo("existente");
                      }}
                    >
                      Usar este contato
                    </button>
                  </>
                ) : (
                  <>
                    Esse telefone já é de um cliente{d.responsavel ? <> de <strong>{d.responsavel}</strong></> : null}. Fale com o seu gestor antes de seguir.
                  </>
                )}
              </div>
            ))}
          </>
        )}
        {enderecoExistente ? (
          <p className="text-sm text-texto-2">
            Endereço já cadastrado: <strong>{enderecoExistente}</strong>.
          </p>
        ) : (
          <Campo
            rotulo="Endereço completo"
            autoComplete="street-address"
            placeholder="Rua, número, bairro, cidade e UF"
            maxLength={240}
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            required
          />
        )}
      </Bloco>

      <Bloco titulo="Sobre o ponto" descricao="Só para você saber: não muda a proposta.">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-texto-2">Tem local próprio para a instalação?</span>
          <GrupoOpcoes rotulo="Tem local próprio para a instalação?" opcoes={OPCOES_SIM_NAO} valor={localProprio} aoEscolher={setLocalProprio} name="local_proprio" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-texto-2">Tem usina fotovoltaica para fornecer a energia?</span>
          <GrupoOpcoes rotulo="Tem usina fotovoltaica para fornecer a energia?" opcoes={OPCOES_SIM_NAO} valor={usinaFv} aoEscolher={setUsinaFv} name="usina_fv" />
        </div>
      </Bloco>

      <Bloco titulo="Negócio">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-texto-2">Origem</span>
          {origens.length <= 5 ? (
            <GrupoOpcoes rotulo="Origem" opcoes={origens.map((o) => ({ valor: o.id, rotulo: o.nome }))} valor={origemId} aoEscolher={setOrigemId} />
          ) : (
            <Selecao aria-label="Origem" value={origemId ?? ""} onChange={(e) => setOrigemId(e.target.value || null)}>
              <option value="">Escolha a origem</option>
              {origens.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Selecao>
          )}
        </div>
        {responsaveis.length > 0 && (
          <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={meuMembroId}>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Bloco>

      <div className="flex flex-col gap-3">
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={pendente} className="self-start">
          {pendente ? "Criando..." : "Criar negócio e proposta"}
        </Botao>
      </div>
    </form>
  );
}
