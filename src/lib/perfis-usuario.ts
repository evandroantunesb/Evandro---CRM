/**
 * Perfil único da tela de Usuários (desenho "Usuários com perfil único", aprovado em 05/11/2026). O banco continua com
 * papel + setores: o perfil é só a forma de escolher e mostrar. Comercial e Gestão são papéis; os perfis da Operação
 * são setores (papel `operacao` + o setor marcado como principal em `membro_setores_obra`).
 */
import { SETORES_OBRA, type SetorObra } from "@/lib/obras/rotulos";
import type { Papel } from "@/lib/tipos";

export const PERFIS_USUARIO = ["vendedor", "sdr", ...SETORES_OBRA, "gestor", "admin"] as const;
export type PerfilUsuario = (typeof PERFIS_USUARIO)[number];

export const CAPACIDADES = ["executar", "coordenar"] as const;
export type Capacidade = (typeof CAPACIDADES)[number];
export const ATUACOES = ["sem_acesso", ...CAPACIDADES] as const;
export type Atuacao = (typeof ATUACOES)[number];

export const GRUPOS_PERFIL: readonly { titulo: string; perfis: readonly PerfilUsuario[] }[] = [
  { titulo: "Comercial", perfis: ["vendedor", "sdr"] },
  { titulo: "Operação", perfis: SETORES_OBRA },
  { titulo: "Gestão", perfis: ["gestor", "admin"] },
];

export const PERFIL: Record<PerfilUsuario, { rotulo: string; descricao: string }> = {
  vendedor: { rotulo: "Vendedor", descricao: "Recebe leads direto ou do SDR, cuida dos negócios, propostas e contratos." },
  sdr: { rotulo: "SDR", descricao: "Recebe e qualifica leads e passa ao vendedor. Não fecha negócio." },
  compras: { rotulo: "Compras", descricao: "Cotação, pedido de material e previsão de entrega." },
  engenharia: { rotulo: "Engenharia", descricao: "Projeto, ART, protocolo e vistoria. Antes da obra, só por pedido." },
  operacional: { rotulo: "Operacional", descricao: "Obra e instalação, contato com o cliente, prazos e confirmação de pagamento." },
  administrativo: { rotulo: "Administrativo", descricao: "Confirma pagamentos do cliente, paga fornecedores e anexa notas fiscais." },
  gestor: { rotulo: "Gestor", descricao: "Vê e atua em todas as áreas. Tudo o que fizer fica no histórico." },
  admin: { rotulo: "Admin", descricao: "Tudo do gestor, mais Configurações, usuários e assinatura." },
};

export const ROTULO_CAPACIDADE: Record<Capacidade, string> = { executar: "executa", coordenar: "coordena" };

export const ehPerfilSetor = (perfil: PerfilUsuario): perfil is SetorObra => (SETORES_OBRA as readonly string[]).includes(perfil);

export const papelDoPerfil = (perfil: PerfilUsuario): Papel => (ehPerfilSetor(perfil) ? "operacao" : perfil);

export type SetorDoMembro = { setor: string; capacidade: string; principal: boolean };

const ehSetor = (s: string): s is SetorObra => (SETORES_OBRA as readonly string[]).includes(s);

/**
 * Perfil exibido: o papel, ou, para a Operação, o setor principal (sem marca, o mesmo critério do banco: o que coordena
 * e depois a ordem dos setores). Operação sem nenhum setor devolve null ("sem setor").
 */
export function perfilDoMembro(papel: Papel, setores: readonly SetorDoMembro[]): PerfilUsuario | null {
  if (papel === "operacao") {
    const validos = setores.filter((s) => ehSetor(s.setor));
    const ordem = (s: SetorDoMembro) => SETORES_OBRA.indexOf(s.setor as SetorObra);
    const [principal] = [...validos].sort(
      (a, b) => Number(b.principal) - Number(a.principal) || Number(b.capacidade === "coordenar") - Number(a.capacidade === "coordenar") || ordem(a) - ordem(b),
    );
    return principal ? (principal.setor as SetorObra) : null;
  }
  return papel;
}

/** Outros setores em que a pessoa atua, na ordem dos setores, sem o do perfil. */
export function outrosSetores(perfil: PerfilUsuario | null, setores: readonly SetorDoMembro[]): { setor: SetorObra; capacidade: Capacidade }[] {
  return SETORES_OBRA.flatMap((setor) => {
    const s = setores.find((x) => x.setor === setor);
    if (!s || setor === perfil || (s.capacidade !== "executar" && s.capacidade !== "coordenar")) return [];
    return [{ setor, capacidade: s.capacidade }];
  });
}

/** Lista enviada a `definir_setores_membro`: o setor do perfil (principal) e os outros em que a pessoa atua. */
export function setoresParaSalvar(
  perfil: SetorObra,
  capacidade: Capacidade,
  outros: Partial<Record<SetorObra, Atuacao>>,
): { setor: SetorObra; capacidade: Capacidade; principal?: true }[] {
  return SETORES_OBRA.flatMap((setor) => {
    if (setor === perfil) return [{ setor, capacidade, principal: true as const }];
    const atuacao = outros[setor];
    return atuacao === "executar" || atuacao === "coordenar" ? [{ setor, capacidade: atuacao }] : [];
  });
}
